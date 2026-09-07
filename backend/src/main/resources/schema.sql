-- 用户表（t_user）
-- 手机号为唯一凭证，无用户名。id 由 MyBatis-Plus 雪花算法生成。
CREATE TABLE IF NOT EXISTS t_user (
    id          BIGINT PRIMARY KEY,
    phone       VARCHAR(11)  NOT NULL UNIQUE,
    password    VARCHAR(100) NOT NULL,
    nickname    VARCHAR(50),
    avatar      VARCHAR(255),
    member_type VARCHAR(20),
    car_no      VARCHAR(20),
    create_time DATETIME,
    update_time DATETIME
);
