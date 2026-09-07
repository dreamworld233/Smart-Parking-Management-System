package com.smartparking.service;

/**
 * 短信发送抽象。
 * 现在 MockSmsService 把验证码打到日志，以后真接阿里云/腾讯云短信
 * 只需新增一个实现类，业务代码不动。
 */
public interface SmsService {

    /**
     * 发送验证码到指定手机号。
     */
    void sendCode(String phone, String code);
}
