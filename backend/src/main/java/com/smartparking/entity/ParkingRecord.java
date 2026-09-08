package com.smartparking.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

/**
 * t_parking_record 实体。
 */
@TableName("t_parking_record")
public class ParkingRecord {

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    private Long userId;
    private String carNo;
    private Long spaceId;
    private String orderNo;
    private java.time.LocalDateTime enterTime;
    private java.time.LocalDateTime exitTime;
    private Integer durationMin;
    private java.math.BigDecimal fee;
    private String payStatus;
    private java.time.LocalDateTime createTime;

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getCarNo() {
        return carNo;
    }

    public void setCarNo(String carNo) {
        this.carNo = carNo;
    }

    public Long getSpaceId() {
        return spaceId;
    }

    public void setSpaceId(Long spaceId) {
        this.spaceId = spaceId;
    }

    public String getOrderNo() {
        return orderNo;
    }

    public void setOrderNo(String orderNo) {
        this.orderNo = orderNo;
    }

    public java.time.LocalDateTime getEnterTime() {
        return enterTime;
    }

    public void setEnterTime(java.time.LocalDateTime enterTime) {
        this.enterTime = enterTime;
    }

    public java.time.LocalDateTime getExitTime() {
        return exitTime;
    }

    public void setExitTime(java.time.LocalDateTime exitTime) {
        this.exitTime = exitTime;
    }

    public Integer getDurationMin() {
        return durationMin;
    }

    public void setDurationMin(Integer durationMin) {
        this.durationMin = durationMin;
    }

    public java.math.BigDecimal getFee() {
        return fee;
    }

    public void setFee(java.math.BigDecimal fee) {
        this.fee = fee;
    }

    public String getPayStatus() {
        return payStatus;
    }

    public void setPayStatus(String payStatus) {
        this.payStatus = payStatus;
    }

    public java.time.LocalDateTime getCreateTime() {
        return createTime;
    }

    public void setCreateTime(java.time.LocalDateTime createTime) {
        this.createTime = createTime;
    }

}
