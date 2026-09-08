package com.smartparking.dto;

/**
 * 修改资料请求体（昵称 / 头像，均可选）。
 */
public class UpdateProfileRequest {

    private String nickname;
    private String avatar;

    public String getNickname() {
        return nickname;
    }

    public void setNickname(String nickname) {
        this.nickname = nickname;
    }

    public String getAvatar() {
        return avatar;
    }

    public void setAvatar(String avatar) {
        this.avatar = avatar;
    }
}
