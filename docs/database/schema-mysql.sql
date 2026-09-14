-- =====================================================================
-- 智慧停车预约系统 · 数据库表结构（MySQL 参考版）
-- 依据：docs/superpowers/specs/2026-09-14-smart-parking-data-model-design.md
-- 生成：2026-09-14
--
-- 用途说明：
--   运行时实际存储是【微信云开发云数据库（文档型）】，本文件是同一数据模型的
--   MySQL 关系型翻译，用于：(1) 课程进度检验展示；(2) 组员理解库表结构。
--   两边字段一一对应，映射规则：
--     - 云数据库文档 _id            → 自增主键 id
--     - 嵌套对象（pricing 等）      → 展平为前缀列（first_hour 等）
--     - 数组（facilities、tags 等） → JSON 列（MySQL 5.7+）
--     - 文档可为 null 的字段        → 对应列允许 NULL，语义同文档缺省
--     - GeoPoint 坐标              → 经纬度两列 + 注释说明云端为 2dsphere 索引
--
-- 不建的表（对应数据模型 §4「不建的表」，与云端一致，别补）：
--   lot_admins（users.role + lots.admin_user_id 足够）
--   t_wallet / t_bind_pay（无钱包、无免密代扣）
--   t_member（月卡年卡不在闭环内）
--   t_space（逐车位表 —— 拿不到车场内部车位级数据，做了就是编数据）
-- =====================================================================

CREATE DATABASE IF NOT EXISTS smart_parking
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE smart_parking;

-- ---------------------------------------------------------------------
-- users：用户（云端集合 users）
-- 身份即微信 _openid，不建密码列（密码仅运营/车场管理员 Web 登录用）
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  openid        VARCHAR(64)  NOT NULL COMMENT '微信 openid，云端由云开发自动写入 _openid',
  role          ENUM('driver', 'lot_admin', 'ops_admin') NOT NULL DEFAULT 'driver'
                COMMENT 'driver=车主 / lot_admin=车场端 / ops_admin=平台运营(Web)',
  nickname      VARCHAR(64)  NULL,
  avatar        VARCHAR(512) NULL COMMENT '头像 URL / 云存储 fileID',
  phone         VARCHAR(20)  NULL COMMENT '可选联系方式，不作登录凭证',
  web_username  VARCHAR(64)  NULL COMMENT '仅 lot_admin / ops_admin 有：Web 后台登录名',
  web_password  VARCHAR(128) NULL COMMENT 'scrypt 哈希 + salt（拼接存储），车主恒为 NULL',
  violation_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'BR-02：累计 3 次停用 30 天',
  banned_until  DATETIME     NULL COMMENT '停用截止时刻，未停用为 NULL',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_users_openid (openid)
) ENGINE=InnoDB COMMENT='用户：车主/车场端/平台运营三种角色';

-- ---------------------------------------------------------------------
-- cars：车辆（云端集合 cars）
-- 组合唯一 (user_id, plate_no)：同一辆车可能被家人各建一条，不做全局唯一
-- ---------------------------------------------------------------------
CREATE TABLE cars (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT UNSIGNED NOT NULL,
  plate_no   VARCHAR(16) NOT NULL COMMENT '车牌号，如 皖A12345',
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_cars_user_plate (user_id, plate_no),
  CONSTRAINT fk_cars_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB COMMENT='车辆：按用户建卡';

-- ---------------------------------------------------------------------
-- lots：签约车场（云端集合 lots，替换旧 t_parking_area）
-- 只存「已签约、可预约」的车场 —— 签约是平台运营声明，避免全量入库编价格
-- 数据来源分级：poi(客观) / public(公示价) / ops(运营配置) / reported(上报) / reviews(评价聚合)
-- ---------------------------------------------------------------------
CREATE TABLE lots (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  poi_id         VARCHAR(64)  NOT NULL COMMENT '腾讯地图 POI id（回溯定位用）',
  name           VARCHAR(128) NOT NULL,
  address        VARCHAR(255) NOT NULL,
  lat            DECIMAL(10, 7) NOT NULL COMMENT '纬度（云端为 GeoPoint + 2dsphere 索引）',
  lng            DECIMAL(10, 7) NOT NULL COMMENT '经度',
  -- ── 收费（来源 public：公开渠道人工录入，留截图存证）──
  first_hour_price  DECIMAL(6, 2) NOT NULL COMMENT '首小时单价（元）',
  per_hour_after   DECIMAL(6, 2) NOT NULL COMMENT '后续每小时（元）',
  step_minutes     SMALLINT UNSIGNED NOT NULL DEFAULT 60 COMMENT '计费步长（分钟）',
  cap_per_day      DECIMAL(7, 2) NULL COMMENT '每日封顶（元），无封顶为 NULL',
  night_rate       DECIMAL(6, 2) NULL COMMENT '夜间费率（元），无则为 NULL',
  -- ── 运营（来源 ops：签约时平台录入）──
  facilities      JSON NULL COMMENT '设施标签数组，如 ["充电桩","室内"]',
  open_hours      VARCHAR(64) NULL COMMENT '营业时间，如 06:00-23:00',
  reservable_total INT UNSIGNED NOT NULL COMMENT '可预约额度总数',
  reserved_count   INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '已占额度（云端用 _.inc 原子 CAS 扣减）',
  admin_user_id   BIGINT UNSIGNED NULL COMMENT '车场端管理员 → users.id',
  -- ── 履约（来源 ops）──
  contract_status ENUM('signed', 'unsigned', 'terminated') NOT NULL DEFAULT 'signed',
  signed_at       DATETIME NULL,
  -- ── 实时余位（来源 reported：车场端上报；超期未报则降级 estimated）──
  free_spots     INT UNSIGNED NULL COMMENT '实时空余。NULL=未上报（界面显示「待上报」，绝不显示 0 或编造数）',
  total_spots    INT UNSIGNED NOT NULL COMMENT '总车位数（来源 public/ops）',
  reported_at    DATETIME NULL COMMENT '最近上报时刻',
  -- ── 口碑（来源 reviews：平台自有评价聚合）──
  rating_score   DECIMAL(2, 1) NULL COMMENT '评分 1.0-5.0。无评价时 NULL，界面显示「暂无评分」，不编',
  rating_count   INT UNSIGNED NULL COMMENT '评价条数',
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_lots_poi (poi_id),
  KEY idx_lots_admin (admin_user_id)
) ENGINE=InnoDB COMMENT='签约车场库：只存可预约车场';

-- ---------------------------------------------------------------------
-- availability_samples：余位历史采样（云端集合 availability_samples）
-- 预测的燃料：定时器每 15 分钟采一条 + 车场端每次上报顺带落一条
-- ---------------------------------------------------------------------
CREATE TABLE availability_samples (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lot_id         BIGINT UNSIGNED NOT NULL,
  sampled_at     DATETIME NOT NULL,
  free_spots     INT UNSIGNED NOT NULL,
  total_spots    INT UNSIGNED NOT NULL,
  occupancy_rate DECIMAL(5, 4) NULL COMMENT '占用率 = 1 - free/total，云端冗余存储',
  source         ENUM('reported', 'estimated') NOT NULL DEFAULT 'reported'
                 COMMENT 'reported=车场端上报 / estimated=降级估算',
  KEY idx_samples_lot_time (lot_id, sampled_at),
  CONSTRAINT fk_samples_lot FOREIGN KEY (lot_id) REFERENCES lots (id)
) ENGINE=InnoDB COMMENT='余位历史采样：预测与对账用';

-- ---------------------------------------------------------------------
-- reservations：预约单（云端集合 reservations）
-- 与订单分表：车场端对账要按订单聚合，预约语义与资金流水分开
-- 状态机：pending_entry →(核销) entered → completed
--         pending_entry →(用户取消) cancelled →(超时未核销) released
-- ---------------------------------------------------------------------
CREATE TABLE reservations (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_no       VARCHAR(32) NOT NULL COMMENT '业务单号，展示与检索用',
  user_id        BIGINT UNSIGNED NOT NULL,
  lot_id         BIGINT UNSIGNED NOT NULL,
  lot_name       VARCHAR(128) NOT NULL COMMENT '车场名快照：车场改名不影响历史单',
  plate_no       VARCHAR(16) NOT NULL,
  arrive_time    DATETIME NOT NULL COMMENT '预约到达时刻（限 [现在, 现在+2h]）',
  enter_deadline DATETIME NOT NULL COMMENT '最迟入场 = arrive_time + 15 分钟（BR-01）',
  status         ENUM('pending_entry', 'entered', 'completed',
                     'cancelled', 'released') NOT NULL DEFAULT 'pending_entry'
                 COMMENT '注意：violated 不是状态 —— 车位侧结果(released)与用户侧后果(violations)是两件事',
  verify_code    VARCHAR(8) NOT NULL COMMENT '核销码（扫/输码用）',
  -- ── 金额：锁位费 + 服务费，预约时一次收清 ──
  prepaid_parking_fee DECIMAL(7, 2) NOT NULL COMMENT '锁位费 = ceil(预约时长) × 首小时单价（代收转付车场）',
  service_fee         DECIMAL(5, 2) NOT NULL COMMENT '平台服务费 ¥2（平台唯一收入）',
  total_amount        DECIMAL(7, 2) NOT NULL,
  -- ── 退款（口径见数据模型 §5.8）──
  refund_parking DECIMAL(7, 2) NULL,
  refund_service DECIMAL(5, 2) NULL,
  refund_total   DECIMAL(7, 2) NULL,
  refund_at      DATETIME NULL,
  entry_method   ENUM('plate', 'code', 'manual') NULL COMMENT '实际生效的核销方式（完成后回填）',
  plate_source   ENUM('manual', 'ocr') NOT NULL DEFAULT 'manual' COMMENT '车牌录入方式',
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at         DATETIME NULL,
  entered_at      DATETIME NULL,
  cancelled_at    DATETIME NULL,
  released_at     DATETIME NULL,
  UNIQUE KEY uk_reservations_order_no (order_no),
  KEY idx_reservations_user_time (user_id, created_at),
  KEY idx_reservations_lot_status (lot_id, status),
  CONSTRAINT fk_reservations_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_reservations_lot FOREIGN KEY (lot_id) REFERENCES lots (id)
) ENGINE=InnoDB COMMENT='预约单：闭环主干';

-- ---------------------------------------------------------------------
-- orders：资金流水（云端集合 orders）
-- 退款也落一张 type='refund'、金额为负的单 —— 正负相抵，车场结算与平台
-- 收入按同一张流水聚合，不为退款开新集合
-- ---------------------------------------------------------------------
CREATE TABLE orders (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reservation_id BIGINT UNSIGNED NOT NULL,
  user_id        BIGINT UNSIGNED NOT NULL,
  lot_id         BIGINT UNSIGNED NOT NULL,
  type           ENUM('prepaid', 'service', 'refund') NOT NULL
                 COMMENT 'prepaid=预支停车费 / service=平台服务费 / refund=退款(金额为负)',
  amount         DECIMAL(7, 2) NOT NULL COMMENT '退款单为负数',
  status         ENUM('pending', 'paid', 'refunded', 'failed') NOT NULL DEFAULT 'pending',
  paid_at        DATETIME NULL,
  KEY idx_orders_lot_time (lot_id, paid_at) COMMENT '对账结算按车场聚合',
  KEY idx_orders_reservation (reservation_id),
  CONSTRAINT fk_orders_reservation FOREIGN KEY (reservation_id) REFERENCES reservations (id),
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_orders_lot FOREIGN KEY (lot_id) REFERENCES lots (id)
) ENGINE=InnoDB COMMENT='资金流水：预约收两笔，退款记负数';

-- ---------------------------------------------------------------------
-- payments：支付单（云端集合 payments）
-- 唯一必要模拟点：学生主体拿不到微信支付商户号，支付/退款回调均由
-- 云函数模拟。界面与文档必须写明「支付为模拟」
-- ---------------------------------------------------------------------
CREATE TABLE payments (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id   BIGINT UNSIGNED NOT NULL,
  channel    ENUM('wechat_mock') NOT NULL DEFAULT 'wechat_mock' COMMENT '模拟支付（无商户号）',
  amount     DECIMAL(7, 2) NOT NULL,
  status     ENUM('pending', 'success', 'refunded', 'failed') NOT NULL DEFAULT 'pending',
  trade_no   VARCHAR(64) NULL COMMENT '模拟交易号',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_payments_order (order_id),
  CONSTRAINT fk_payments_order FOREIGN KEY (order_id) REFERENCES orders (id)
) ENGINE=InnoDB COMMENT='支付单：全程模拟，需明示';

-- ---------------------------------------------------------------------
-- reviews：评价（云端集合 reviews）
-- 一单一评；写入时同步更新 lots.rating_score / rating_count
-- ---------------------------------------------------------------------
CREATE TABLE reviews (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reservation_id BIGINT UNSIGNED NOT NULL,
  user_id        BIGINT UNSIGNED NOT NULL,
  lot_id         BIGINT UNSIGNED NOT NULL,
  score          TINYINT UNSIGNED NOT NULL COMMENT '1-5 分',
  tags           JSON NULL COMMENT '评价标签数组',
  content        VARCHAR(500) NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_reviews_reservation (reservation_id),
  KEY idx_reviews_lot (lot_id),
  CONSTRAINT fk_reviews_reservation FOREIGN KEY (reservation_id) REFERENCES reservations (id),
  CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_reviews_lot FOREIGN KEY (lot_id) REFERENCES lots (id),
  CONSTRAINT ck_reviews_score CHECK (score BETWEEN 1 AND 5)
) ENGINE=InnoDB COMMENT='评价：聚合出车场评分';

-- ---------------------------------------------------------------------
-- lot_price_changes：收费变更留痕（云端集合 lot_price_changes）
-- public 来源要求「留截图存证」—— 每次收费改动留前后值与公示价照片。
-- 答辩被问「收费数据从哪来」直接翻这条链
-- ---------------------------------------------------------------------
CREATE TABLE lot_price_changes (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lot_id         BIGINT UNSIGNED NOT NULL,
  before_json    JSON NOT NULL COMMENT '改前 {firstHour, perHourAfter, stepMinutes, capPerDay, nightRate}',
  after_json     JSON NOT NULL COMMENT '改后同结构',
  evidence_url   VARCHAR(512) NULL COMMENT '公示价照片（云端为云存储 fileID）',
  operator_id    BIGINT UNSIGNED NOT NULL COMMENT '操作人 → users.id',
  note           VARCHAR(255) NULL,
  changed_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_price_changes_lot_time (lot_id, changed_at),
  CONSTRAINT fk_price_changes_lot FOREIGN KEY (lot_id) REFERENCES lots (id),
  CONSTRAINT fk_price_changes_operator FOREIGN KEY (operator_id) REFERENCES users (id)
) ENGINE=InnoDB COMMENT='收费变更留痕：公示价存证';

-- ---------------------------------------------------------------------
-- entry_logs：核销留痕（云端集合 entry_logs）
-- 独立成表：一次核销可能先识别失败再输码成功，留痕要能看见整条尝试链
-- ---------------------------------------------------------------------
CREATE TABLE entry_logs (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reservation_id BIGINT UNSIGNED NOT NULL,
  lot_id         BIGINT UNSIGNED NOT NULL,
  plate_no       VARCHAR(16) NOT NULL,
  method         ENUM('plate', 'code', 'manual') NOT NULL
                 COMMENT 'plate=车牌OCR / code=扫输核销码 / manual=车场端手动确认',
  operator_id    BIGINT UNSIGNED NULL COMMENT '车场端操作人；OCR 自动核销时为 NULL',
  confidence     DECIMAL(4, 3) NULL COMMENT 'OCR 置信度，非 OCR 为 NULL',
  image_url      VARCHAR(512) NULL COMMENT '识别原图（云端为云存储 fileID）',
  logged_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_entry_logs_lot_time (lot_id, logged_at),
  KEY idx_entry_logs_reservation (reservation_id),
  CONSTRAINT fk_entry_logs_reservation FOREIGN KEY (reservation_id) REFERENCES reservations (id),
  CONSTRAINT fk_entry_logs_lot FOREIGN KEY (lot_id) REFERENCES lots (id)
) ENGINE=InnoDB COMMENT='核销留痕：三级降级链的证据';

-- ---------------------------------------------------------------------
-- violations：违约记录（云端集合 violations）
-- 独立成表而非只累加计数：可审计、能算梯度
-- ---------------------------------------------------------------------
CREATE TABLE violations (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id        BIGINT UNSIGNED NOT NULL,
  reservation_id BIGINT UNSIGNED NOT NULL,
  type           ENUM('no_show', 'late_cancel') NOT NULL
                 COMMENT 'no_show=到达+15分钟后仍未核销 / late_cancel=晚于到达时刻才取消',
  penalty        VARCHAR(64) NULL COMMENT '处理结果说明（如 停用30天）',
  occurred_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_violations_user (user_id),
  CONSTRAINT fk_violations_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_violations_reservation FOREIGN KEY (reservation_id) REFERENCES reservations (id)
) ENGINE=InnoDB COMMENT='违约记录：BR-01 / BR-02';
