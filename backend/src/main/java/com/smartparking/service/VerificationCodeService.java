package com.smartparking.service;

import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 验证码生成 / 存储 / 校验。
 * 单机用内存 Map 存（key=手机号），生产多实例需换 Redis。
 * 规则：5 分钟过期、60 秒内不能重发、验证码一次性（用完即删）。
 *
 * 注意：频率限制时间戳（lastSendAt）与验证码存储（store）分开，
 * 避免验证码校验成功后删除条目导致频率限制失效。
 */
@Service
public class VerificationCodeService {

    private static final long EXPIRE_MILLIS = 5 * 60 * 1000L; // 5 分钟过期
    private static final long RESEND_MILLIS = 60 * 1000L;     // 60 秒内不能重发

    private final Map<String, CodeEntry> store = new ConcurrentHashMap<>();
    private final Map<String, Long> lastSendAt = new ConcurrentHashMap<>();
    private final SmsService smsService;

    public VerificationCodeService(SmsService smsService) {
        this.smsService = smsService;
    }

    /**
     * 生成并发送验证码。
     * @return null 表示成功，否则返回错误信息。
     */
    public String send(String phone) {
        long now = System.currentTimeMillis();
        Long last = lastSendAt.get(phone);
        if (last != null && now - last < RESEND_MILLIS) {
            return "发送太频繁，请稍后再试";
        }
        String code = String.format("%06d", new SecureRandom().nextInt(1_000_000));
        store.put(phone, new CodeEntry(code, now));
        lastSendAt.put(phone, now);
        smsService.sendCode(phone, code);
        return null;
    }

    /**
     * 校验验证码。验证码一次性，校验通过后即删除。
     */
    public boolean verify(String phone, String code) {
        if (phone == null || code == null) {
            return false;
        }
        CodeEntry entry = store.get(phone);
        if (entry == null) {
            return false;
        }
        if (System.currentTimeMillis() - entry.sendAt > EXPIRE_MILLIS) {
            store.remove(phone);
            return false;
        }
        boolean ok = entry.code.equals(code);
        if (ok) {
            store.remove(phone);
        }
        return ok;
    }

    private static class CodeEntry {
        final String code;
        final long sendAt;

        CodeEntry(String code, long sendAt) {
            this.code = code;
            this.sendAt = sendAt;
        }
    }
}
