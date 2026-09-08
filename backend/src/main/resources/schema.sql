-- ============================================================
-- 智慧停车管理系统 建表脚本（幂等：全部 IF NOT EXISTS）
-- 统一 utf8mb4，id 雪花算法（MyBatis-Plus ASSIGN_ID），时间 DATETIME
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

-- 停车场表：南 / 北区
CREATE TABLE IF NOT EXISTS t_parking_area (
    id          BIGINT PRIMARY KEY,
    name        VARCHAR(20) NOT NULL,
    code        VARCHAR(20),           -- 南=SOUTH / 北=NORTH
    create_time DATETIME
);

-- 车位表：属某停车场，type 固定/临时，status 空闲/预约/占用/停用
CREATE TABLE IF NOT EXISTS t_space (
    id          BIGINT PRIMARY KEY,
    area_id     BIGINT NOT NULL,
    space_no    VARCHAR(20) NOT NULL,
    space_type  VARCHAR(20),           -- FIXED 固定 / TEMP 临时
    status      VARCHAR(20) NOT NULL DEFAULT 'FREE',  -- FREE/OCCUPIED/RESERVED/DISABLED
    car_no      VARCHAR(20),           -- 当前占用/预约车牌（可为空）
    create_time DATETIME,
    UNIQUE KEY uk_space (area_id, space_no)
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

-- 钱包表：模拟余额扣款
CREATE TABLE IF NOT EXISTS t_wallet (
    id          BIGINT PRIMARY KEY,
    user_id     BIGINT NOT NULL UNIQUE,
    balance     DECIMAL(10,2) DEFAULT 0,
    update_time DATETIME
);

-- 会员表：月/年卡
CREATE TABLE IF NOT EXISTS t_member (
    id          BIGINT PRIMARY KEY,
    user_id     BIGINT NOT NULL,
    member_type VARCHAR(20),           -- MONTH 月 / YEAR 年
    car_no      VARCHAR(20),
    start_date  DATE,
    end_date    DATE,
    pay_status  VARCHAR(20) DEFAULT 'UNPAID',
    create_time DATETIME
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

-- 支付签约表：模拟微信/支付宝签约 + 免密额度
CREATE TABLE IF NOT EXISTS t_bind_pay (
    id          BIGINT PRIMARY KEY,
    user_id     BIGINT NOT NULL,
    pay_type    VARCHAR(20),           -- WECHAT/ALIPAY/WALLET
    status      VARCHAR(20) DEFAULT 'ACTIVE',   -- ACTIVE/UNBOUND
    auto_max    DECIMAL(10,2) DEFAULT 100,      -- 免密额度上限
    create_time DATETIME
);
