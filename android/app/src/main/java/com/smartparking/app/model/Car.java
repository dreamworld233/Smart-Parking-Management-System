package com.smartparking.app.model;

/**
 * 车辆实体：用户绑定的车牌。
 */
public class Car {

    private long id;
    private long userId;
    private String carNo;

    public Car() {
    }

    public long getId() {
        return id;
    }

    public void setId(long id) {
        this.id = id;
    }

    public long getUserId() {
        return userId;
    }

    public void setUserId(long userId) {
        this.userId = userId;
    }

    public String getCarNo() {
        return carNo;
    }

    public void setCarNo(String carNo) {
        this.carNo = carNo;
    }
}
