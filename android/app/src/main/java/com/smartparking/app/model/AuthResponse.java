package com.smartparking.app.model;

/**
 * 后端登录/注册成功返回体：JWT token + 用户信息。
 * 与后端 AuthResponse 字段对齐。
 */
public class AuthResponse {

    private String token;
    private User user;

    public AuthResponse() {
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
