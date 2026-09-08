package com.smartparking.app.model;

/**
 * 用户实体。
 * 手机号是唯一凭证（无用户名）。
 * 一个用户可绑定多辆车，多车见 Car 列表；carNo 为注册时可填的主车牌（兼容旧字段）。
 */
public class User {

    private long id;
    private String phone;      // 手机号（登录凭证，唯一）
    private String password;   // 密码（仅本地使用，后端不返回）
    private String nickname;   // 昵称
    private String avatar;     // 头像地址
    private String memberType; // 会员类型：MONTH 月 / YEAR 年 / null 非会员
    private String carNo;      // 绑定的车牌号（注册时可空）

    public User() {
    }

    public long getId() {
        return id;
    }

    public void setId(long id) {
        this.id = id;
    }

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

    public String getMemberType() {
        return memberType;
    }

    public void setMemberType(String memberType) {
        this.memberType = memberType;
    }

    public String getCarNo() {
        return carNo;
    }

    public void setCarNo(String carNo) {
        this.carNo = carNo;
    }
}
