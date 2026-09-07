package com.smartparking.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * 登录请求体。
 */
public class LoginRequest {

    @NotBlank(message = "手机号不能为空")
    @Pattern(regexp = "\\d{11}", message = "手机号需为 11 位数字")
    private String phone;

    @NotBlank(message = "密码不能为空")
    private String password;

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }
}
