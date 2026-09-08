package com.smartparking.dto;

import com.smartparking.entity.User;

/**
 * 登录/注册成功返回体：JWT token + 用户信息（密码已抹掉）。
 */
public class AuthResponse {

    private String token;
    private User user;

    public AuthResponse() {
    }

    public AuthResponse(String token, User user) {
        this.token = token;
        this.user = user;
    }

    public String getToken() {
        return token;
    }

    public void setToken(String token) {
        this.token = token;
    }

    public User getUser() {
        return user;
    }

    public void setUser(User user) {
        this.user = user;
    }
}
