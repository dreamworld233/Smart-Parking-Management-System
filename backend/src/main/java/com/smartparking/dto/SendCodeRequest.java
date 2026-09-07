package com.smartparking.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * 发送验证码请求体。
 */
public class SendCodeRequest {

    @NotBlank(message = "手机号不能为空")
    @Pattern(regexp = "\\d{11}", message = "手机号需为 11 位数字")
    private String phone;

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }
}
