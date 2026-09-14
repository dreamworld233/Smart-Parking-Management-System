# Smart Parking Management System

智慧停车管理系统 —— 微信小程序（车主端 + 车场端）+ Web 平台运营后台。

## 简介

解决「找车位难、车位利用率低」的问题。车主在小程序里查附近的签约车场、预约锁位；
车场主在小程序里上报余位、核销入场；平台运营方在 Web 后台管理车场与订单。

**平台只赚服务费。** 预约时收两笔 —— 锁位费（预支停车费，代收后转付车场）+
平台服务费 ¥2。入场后实际停放多久、闸机收多少，由车场自行计收，平台不参与。

## 功能模块

- **车主端（小程序）**：附近车场检索与智能推荐、车场详情、预约锁位与支付、预约凭证、
  订单中心、车牌管理、地图导航。
- **车场端（小程序）**：余位上报、预约核销（车牌识别 / 扫码 / 输码 / 手动）、车场与收费配置、
  代收结算看板。
- **平台运营后台（Web）**：车场审核与管理、订单与订单流水、车牌识别复核、打印。

> 不做：自动扣费 / 免密代扣、钱包余额、会员卡、道闸硬件。

## 技术栈

| 层 | 选型 |
|---|---|
| 车主端 / 车场端 | 原生微信小程序（TypeScript + Skyline 渲染器） |
| 后端 | 微信云开发 —— 云函数 + 云数据库 + 云存储 + 定时触发器 |
| 车牌识别 | 腾讯云 OCR `LicensePlateOCR`，由云函数调用（密钥托管在云函数环境变量） |
| 地图与 POI | 腾讯位置服务（小程序 SDK + WebService） |
| 平台运营后台 | Vue 3 + Element Plus，托管于云开发静态网站 |
| 测试 | Jest（domain 层纯函数） |

## 目录结构

```
miniprogram/         小程序源码（pages / components / domain / services / styles）
tests/               Jest 测试，与 miniprogram/domain 一一对应
backend/             旧 Spring Boot 后端，未接入，仅留痕
docs/
  superpowers/plans/ 实现计划（按任务拆分，含验收标准）
  superpowers/specs/ 设计与数据模型规格 —— **开发以这里为准**
  ui-mockups/        视觉稿
  setup/             第三方服务配置说明
```

## 本地运行

1. 微信开发者工具导入本仓库根目录（`project.config.json` 已配置）
2. 复制 `miniprogram/config.local.example.ts` 为 `miniprogram/config.local.ts`，
   填入腾讯位置服务 Key（**该文件已 gitignore，Key 不得提交**）
3. 跑测试：`npx jest`

## 协作流程

1. `git clone` 本仓库
2. **直接在 `main` 上开发提交**（不再开功能分支）
3. 提交后 `git push origin main`

## 文档入口

- 界面与流程规格：`docs/superpowers/specs/2026-09-11-smart-parking-miniprogram-ui-design.md`
- 数据模型与关键机制：`docs/superpowers/specs/2026-09-14-smart-parking-data-model-design.md`
- 实现计划：`docs/superpowers/plans/2026-09-11-free-tier-and-foundation.md`

> 课程 PM 文档自 2026-09-14 起**降为参考**，与上述 spec 冲突时以 spec 为准。
> Android 时代的 `docs/开发计划.md`、`docs/移动端需求.md` 与更早一版需求草稿
> 已于同日删除（内容仍在 git 历史里）。
