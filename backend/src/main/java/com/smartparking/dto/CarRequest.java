package com.smartparking.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 绑定车牌请求体。
 */
public class CarRequest {

    @NotBlank(message = "车牌号不能为空")
    private String carNo;

    public String getCarNo() {
        return carNo;
    }

    public void setCarNo(String carNo) {
        this.carNo = carNo;
    }
}
