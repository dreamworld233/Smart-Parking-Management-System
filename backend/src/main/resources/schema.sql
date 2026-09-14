-- ============================================================
-- 智慧停车管理系统 建表脚本（幂等：全部 IF NOT EXISTS）
-- 统一 utf8mb4，id 雪花算法（MyBatis-Plus ASSIGN_ID），时间 DATETIME
-- ============================================================
--
-- ⚠️ 本文件是 Spring Boot + MySQL 时代的留痕，**当前未接入**（移动端走微信云开发）。
-- 2026-09-14 已删除 5 张随架构作废的表：t_parking_area / t_space / t_wallet /
-- t_member / t_bind_pay —— 对应原因是没有会员卡、没有钱包余额、没有免密代扣，
-- 且车位粒度从「单个车位」改为「车场级可预约额度」。
--
-- 已知残留漂移，**留给 Plan 2 重写时处理**，不要在这里打补丁：
--   t_user.member_type      无会员业务
--   t_user.car_no           遗留单车牌字段，新业务用 t_car
--   t_reservation.space_id  车位级 → 应改车场级（lots._id）
--   t_parking_record.space_id  同上
-- 现行数据模型见 docs/superpowers/specs/2026-09-14-smart-parking-data-model-design.md
-- ============================================================

-- 用户表：手机号唯一凭证（无用户名）
CREATE TABLE IF NOT EXISTS t_user (
    id          BIGINT PRIMARY KEY,
    phone       VARCHAR(11)  NOT NULL UNIQUE,
    password    VARCHAR(100) NOT NULL,
    nickname    VARCHAR(50),
    avatar      VARCHAR(255),
    member_type VARCHAR(20),
    car_no      VARCHAR(20),           -- 遗留单车牌字段（历史数据），新业务用车表 t_car
    create_time DATETIME,
    update_time DATETIME
);

-- 车辆表：用户 1:N 车辆，车牌唯一
CREATE TABLE IF NOT EXISTS t_car (
    id          BIGINT PRIMARY KEY,
    user_id     BIGINT NOT NULL,
    car_no      VARCHAR(20) NOT NULL UNIQUE,
    create_time DATETIME,
    INDEX idx_car_user (user_id)
);

-- 预约表：状态 FREE→RESERVED(用户预约)→USED(入场核销)/CANCELED(取消)/TIMEOUT(超时释放)
CREATE TABLE IF NOT EXISTS t_reservation (
    id          BIGINT PRIMARY KEY,
    user_id     BIGINT NOT NULL,
    car_no      VARCHAR(20) NOT NULL,
    space_id    BIGINT NOT NULL,
    start_time  DATETIME,
    end_time    DATETIME,
    status      VARCHAR(20) NOT NULL DEFAULT 'RESERVED',  -- RESERVED/USED/CANCELED/TIMEOUT
    create_time DATETIME
);

-- 停车记录表：进出场 + 计费
CREATE TABLE IF NOT EXISTS t_parking_record (
    id          BIGINT PRIMARY KEY,
    user_id     BIGINT,                -- 固定/已绑用户可空（临时车为 null）
    car_no      VARCHAR(20) NOT NULL,
    space_id    BIGINT,
    order_no    VARCHAR(32),           -- 唯一流水号
    enter_time  DATETIME,
    exit_time   DATETIME,
    duration_min INT,
    fee         DECIMAL(10,2) DEFAULT 0,
    pay_status  VARCHAR(20) DEFAULT 'UNPAID',   -- UNPAID/PAID/FAILED
    create_time DATETIME,
    INDEX idx_record_car (car_no)
);

-- 支付流水表：订单级记录
CREATE TABLE IF NOT EXISTS t_payment (
    id          BIGINT PRIMARY KEY,
    user_id     BIGINT NOT NULL,
    order_no    VARCHAR(32),           -- 关联停车记录 order_no
    amount      DECIMAL(10,2) DEFAULT 0,
    biz_type    VARCHAR(20),           -- PARKING 停车费 / MEMBER 会员
    status      VARCHAR(20) DEFAULT 'PAID',    -- PAID/REFUNDED/FAILED
    create_time DATETIME
);
