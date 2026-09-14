// config.local.example.ts
//
// 把本文件复制为 config.local.ts，填入你自己的腾讯位置服务 Key。
// config.local.ts 已在 .gitignore 中，不会被提交 —— 本仓库是公开的。
//
//   cp miniprogram/config.local.example.ts miniprogram/config.local.ts
//
// ⚠️ 不要直接把 Key 写在本文件里。本文件是被 git 跟踪的模板，写在这里等于公开。
// 申请步骤见 docs/setup/tencent-map-setup.md
export const QQMAP_KEY = '在这里填你的腾讯位置服务 Key'

/**
 * 云开发环境 ID。从微信开发者工具「云开发」控制台复制，
 * 形如 `cloud1-xxxxxxxxxxxx` 或你建环境时自定义的短名。
 * 未配置时服务层会给出明确报错，不会静默兜底
 */
export const CLOUD_ENV = ''
