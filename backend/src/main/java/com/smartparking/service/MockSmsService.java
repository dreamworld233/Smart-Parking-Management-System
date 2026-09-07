package com.smartparking.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * 模拟短信：把验证码打到控制台日志，开发阶段照着日志输入。
 * 真实实现应替换为阿里云/腾讯云短信 API 调用。
 */
@Service
public class MockSmsService implements SmsService {

    private static final Logger log = LoggerFactory.getLogger(MockSmsService.class);

    @Override
    public void sendCode(String phone, String code) {
        log.info("【模拟短信】code={} 已发送到 phone={}", code, phone);
    }
}
