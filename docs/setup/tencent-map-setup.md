# 腾讯地图 / 定位 配置步骤

小程序 appid：`wx657c73ccec33ea8d`

本项目**不使用**腾讯官方的小程序 JS SDK（那个 `qqmap-wx-jssdk.min.js`）。我们走 `wx.request` 直调腾讯位置服务的 WebService REST 接口，代码在 `miniprogram/services/qqmap.ts`。好处是不用 vendor 一个第三方 JS 文件、接口可测、要换实现只动一个文件。

但**对 Key 的要求是一样的**：无论走 SDK 还是走 REST，Key 都必须具备 **WebServiceAPI** 权限。

全部四件事大约 15 分钟能办完 A、B 两步；C 需要等审核。

---

## A. 申请腾讯位置服务 Key（约 10 分钟）

1. 打开 <https://lbs.qq.com/>，注册/登录（腾讯系账号可直接登）。
2. 进入**控制台** → 左上角**应用管理** → **我的应用** → 右上角**创建应用**。应用名随便填，比如「公共停车场预约系统」。
3. 在该应用下点**添加 Key**：
   - **Key 名称**：`smart-parking-miniprogram`
   - **勾选 `WebServiceAPI`** ← 这一项是必须的，不勾则所有 REST 调用返回 `INVALID_KEY`
   - 若有「授权 IP」/「签名校验」选项，**留空 / 关闭**。小程序发起的请求出口 IP 不固定，绑 IP 会导致调用失败
4. 如果需要绑定小程序：在 Key 配置里填写**微信小程序 AppID** `wx657c73ccec33ea8d`。AppID 在微信小程序后台 → **设置** → **帐号信息** 里能看到。
5. 保存，复制生成的 Key。
6. 把 Key 填进 **`miniprogram/config.local.ts`**（⚠️ **不是** `config.ts`）：

   ```bash
   cp miniprogram/config.local.example.ts miniprogram/config.local.ts
   ```

   然后编辑 `miniprogram/config.local.ts`：

   ```ts
   export const QQMAP_KEY = 'TKSBZ-你的新Key'
   ```

> ⚠️ **本仓库是公开的**（`dreamworld233/Smart-Parking-Management-System`）。
> Key 一旦提交，爬虫几分钟内就能扫到；配额被刷爆后，线上地图会直接调不通。
> **永远不要把 Key 写进 `config.ts` 或任何被 git 跟踪的文件。**

`config.local.ts` 已在 `.gitignore` 中。`config.ts` 会自动读取它；文件不存在时回退到占位符 `REPLACE_WITH_YOUR_KEY`，所以新克隆的项目**仍然能编译通过**（只是地图接口会报 `INVALID_KEY`，直到你填上自己的 Key）。

**配额**：腾讯位置服务的 WebServiceAPI 个人开发者有每日免费额度（搜索、逆地址解析等各接口分别计数）。课程演示规模远够用，但压测或反复刷列表时留意别打爆。具体数值以控制台「配额」页为准，官方会调整。

---

## B. 配置 request 合法域名

微信要求：小程序里 `wx.request` 只能请求**已备案且已配置**的域名。

1. 登录微信小程序后台 <https://mp.weixin.qq.com/>
2. **开发** → **开发管理** → **开发设置** → 找到**服务器域名**
3. 在 **request 合法域名** 里添加：

   ```
   https://apis.map.qq.com
   ```

4. 保存（每月可修改次数有限，一次填对）

---

## C. 申请 `wx.getLocation` 接口权限 ⚠️ 最慢，尽早提交

**2022 年 7 月 14 日之后**发布的小程序，调用 `wx.getLocation` 等 8 个地理位置接口必须先开通权限，**否则代码提审会被直接拦截**。

### 申请步骤

1. 微信小程序后台 → **开发** → **开发管理** → **接口设置**
2. 找到「**获取当前的地理位置、速度**」（对应 `wx.getLocation`），点申请
3. 填写**使用场景说明**，并上传辅助材料
4. 提交，等待审核

### 审核材料怎么写（这步决定过不过）

驳回最常见理由是：**「因提供的申请原因/辅助图片/网页/视频内容无法确认使用场景」**。

要点：

- **上传你自己小程序里调用定位的那个页面的截图**，展示出地图和定位效果。**不要**用官方示例图凑数。
- 截图**不要打马赛克**，用箭头和文字标注「用户打开首页自动定位到当前位置」「按定位结果推荐周边停车场」。
- 有条件的录一段完整操作视频：打开小程序 → 弹出定位授权 → 地图定位成功 → 展示附近车场列表。
- 申请理由写具体业务必要性，例如：

  > 因当前业务为城市停车场预约服务，用户打开首页需基于当前位置查询并推荐周边停车场、计算步行距离与导航路线，需申请开通 wx.getLocation 接口以完善服务内容。

- 被驳回**不要原样重复提交**，换个说法和材料再试。

**审核时长**：顺利的话一天内开通，节假日可能延迟。

### ⚠️ 类目限制

该接口**只对指定类目的小程序开放**，且必须同时满足「类目开放范畴」和「接口使用场景开放范畴」。停车场预约属于出行/工具类，通常落在开放范围内，但**个人主体小程序通过率明显低于企业主体**。

### 申请不下来怎么办

本项目**已经做了降级**，不会致命：

- 首页定位失败 → 显示「未获取到定位授权」空态 + 「去搜索」按钮（`miniprogram/pages/home/home.ts` 的 `state: 'no-location'` 分支）
- 搜索页不依赖定位，靠关键词搜目的地 → 照样能拉出周边车场

所以即使 `getLocation` 没批，**「搜索 → 智能推荐 → 车场详情 → 预约」整条链路依然可以完整演示**，只是首页少了「打开即自动定位」这一下。

---

## D. 完善隐私保护指引

不配这个，即使接口申请通过，调用也可能失败。

微信小程序后台 → **设置** → **基本设置** → **服务内容声明** → **用户隐私保护指引** → **去完善**，增加「**获取地理位置**」信息类型。

这一项同样需要审核。

---

## E. `app.json` 声明（代码侧，由开发负责）

`wx.getLocation` 除了后台开通，还必须在 `app.json` 里显式声明，否则接口直接 fail：

```json
{
  "requiredPrivateInfos": ["getLocation"],
  "permission": {
    "scope.userLocation": {
      "desc": "用于查询并推荐您当前位置周边的停车场"
    }
  }
}
```

`requiredPrivateInfos` 里只声明**实际用到的**接口。本项目只用 `wx.getLocation`；`wx.openLocation`（导航前往）不需要声明。

---

## F. 开发期可以绕过的部分

**域名白名单可以绕**：微信开发者工具 → 右上角**详情** → **本地设置** → 勾选「**不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书**」。

勾上之后，即使 B 步骤还没配好，开发者工具里也能调通 `apis.map.qq.com`。

**Key 绕不过**：没有有效 Key，接口一律返回 `INVALID_KEY`。这是腾讯位置服务侧的校验，与本地的域名设置无关。

**`getLocation` 权限在开发者工具里的行为**：声明了 `requiredPrivateInfos` 之后，开发者工具的模拟器通常能拿到坐标（模拟位置），但真机预览/体验版会按后台是否开通来决定成败。所以**不要只凭模拟器通过就以为没问题**，务必用真机预览验一次。

---

## 排查

| 现象 | 原因 |
|---|---|
| `INVALID_KEY` / `status: 111` | Key 没勾 WebServiceAPI，或 Key 填错 |
| `status: 110` | 请求来源未被授权——检查是否误设了「授权 IP」 |
| `request:fail url not in domain list` | request 合法域名没配；开发期可勾「不校验合法域名」绕过 |
| `getLocation:fail api scope is not declared in the privacy agreement` | `app.json` 没声明 `requiredPrivateInfos`，或隐私保护指引没配 |
| `getLocation:fail auth deny` | 用户主动拒绝了定位授权——本项目会走「未获取到定位授权」空态，属正常降级 |
| 提审被拦「未配置隐私接口」 | C 步骤的接口权限没开通 |

---

## 参考

- [wx.getLocation 官方文档](https://developers.weixin.qq.com/miniprogram/dev/api/location/wx.getLocation.html)
- [微信公告：小程序地理位置相关接口调整](https://mp.weixin.qq.com/s?__biz=Mzg4NDYwOTcyNA==&mid=2247492267&idx=1&sn=74cc57b101f62e124a71a80003652c7c)
- [腾讯云：代码中含有未配置隐私接口 wx.getLocation](https://cloud.tencent.com/developer/article/2398078)
- [地理位置接口配置说明](https://www.fkw.com/blog/1154314)
- [微信小程序 wx.getLocation 接口申请教程](https://blog.csdn.net/yxlyttyxlytt/article/details/145759184)
- [语雀：wx.getLocation 接口开通](https://www.yuque.com/mada/vc7cbg/gbfigittu8996tnf)
- [juejin：小程序接入腾讯位置服务](https://juejin.cn/post/7371985862982696986)
