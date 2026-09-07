package com.smartparking.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * 注册请求体。
 * 注：验证码功能暂时舍弃，注册暂用手机号 + 密码。
 */
public class RegisterRequest {

    @NotBlank(message = "手机号不能为空")
    @Pattern(regexp = "\\d{11}", message = "手机号需为 11 位数字")
    private String phone;

    @NotBlank(message = "密码不能为空")
    private String password;

    private String carNo; // 可选

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

    public String getCarNo() {
        return carNo;
    }

    public void setCarNo(String carNo) {
        this.carNo = carNo;
    }
}
