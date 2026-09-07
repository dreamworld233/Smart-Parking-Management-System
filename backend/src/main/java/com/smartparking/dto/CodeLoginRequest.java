package com.smartparking.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * 验证码登录请求体。
 */
public class CodeLoginRequest {

    @NotBlank(message = "手机号不能为空")
    @Pattern(regexp = "\\d{11}", message = "手机号需为 11 位数字")
    private String phone;

    @NotBlank(message = "验证码不能为空")
    private String code;

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }
}
