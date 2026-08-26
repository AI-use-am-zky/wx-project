# 宠物空运微信小程序 — 第一期实现规格（给写代码的 AI）

配套产品共识：同目录 `wx_appmake.md`。两份冲突时以 `wx_appmake.md` 的决策表为准，以本文件的状态机、接口和页面为准。

## 0. 给实现 AI 的硬约束

开工前先读完本文件全文和 `wx_appmake.md`。写代码时遵守：

1. **只做第一期范围。** 禁止铁路、专车、一单多宠、租箱、跳转顺丰小程序付款、社区、商城、短信、多员工权限、App、uni-app。
2. **微信原生小程序**（WXML / WXSS / JS 或 TS）+ **自建 HTTP 后端**。不要用 uni-app / Taro。业务逻辑放后端，小程序只做展示、表单、调接口、调微信 API。
3. **不要抄「派到宠物出行」的商标、插画、文案、配色。** 只复刻信息架构和交互节奏（先地址再估价、卡片拆行、表单分页、密时间轴）。品牌名、主题色用配置项，占位即可。
4. **顺丰、微信支付、电子发票、订阅消息用适配层。** 真实字段以官方文档为准；文档未到时用接口桩（mock），不要把猜测的顺丰字段写死在页面里。
5. **金额单位一律整数「分」。** 展示时再换成元。加价比例、最低服务费、退款手续费用配置，不要写死业务数字（可用明显占位默认值并在配置注释「后定」）。
6. **一单一只宠物、仅空运、仅门到门。** UI 不要出现自送/自取开关。
7. 未登录可逛非下单页；**进入选城市或下单表单必须登录**；**寄收件详细地址齐全后才调用估价**。
8. 不要提交密钥。`.env` 示例即可。

建议实现顺序：后端领域模型与状态机 → 估价与订单 API（mock 顺丰）→ 小程序主路径 → 微信支付沙箱 → 管理端 → 再换真顺丰。

---

## 1. 系统边界

```
[微信小程序 C 端] ──JSON/HTTPS──► [自建后端]
                                      ├── 微信：登录、支付、订阅消息、电子发票
                                      ├── 顺丰适配器：询价、下单、预约揽收、路由、保价、取消
                                      └── [管理端 Web，第一期可同域简单页]
[服务商微信] ◄──模板/订阅或企业微信？ 第一期：后端在新单/失败时给管理员发「微信通知」
```

管理员通知第一期允许：微信公众号模板 / 小程序订阅（管理员自己点一次）/ 企业微信机器人 Webhook。实现时做成 `NotifyAdmin` 适配器，先接一种（建议 **Webhook URL 配置**，最快），不要绑死一种渠道。

---

## 2. 技术选型

| 层 | 选择 | 说明 |
| --- | --- | --- |
| 小程序 | 微信原生，基础库按当前稳定版 | `app.json` 底部 tab：首页、订单、我的 |
| 小程序语言 | TypeScript 优先，否则 JS | 目录清晰即可 |
| 后端 | 任选 **Node（推荐）或 Python**，REST + JSON | 选一种写完，不要两种混 |
| 数据 | PostgreSQL 或 MySQL | 必须有迁移 |
| 对象存储 | 宠主上传的照片 | 微信临时文件 → 后端转存；URL 带过期或鉴权 |
| 管理端 | 第一期：后端同仓库一个简单 Web（或小程序里藏管理入口，**不推荐**） | 账号密码或固定管理员 OpenID 白名单 |

后端建议分层：`api` / `domain`（订单状态机、计价） / `adapters/sf` / `adapters/wechat`。以后换 uni-app 只换客户端。

---

## 3. 配置项（环境变量 + 运营配置表）

环境变量（示例名）：`WX_APP_ID` `WX_APP_SECRET` `WX_MCH_ID` `WX_PAY_KEY` `SF_*` `ADMIN_NOTIFY_WEBHOOK` `OSS_*`。

运营配置表 `app_settings`（管理端可改，缺省用占位）：

| key | 含义 | 第一期占位 |
| --- | --- | --- |
| `markup_rate` | 加价比例，如 0.15 | 后定 |
| `min_service_fee_cents` | 最低服务费（分） | 后定 |
| `cancel_fee_before_collect_cents` | 已下顺丰未揽收取消手续费（分） | 后定 |
| `reweigh_ignore_kg` | 复秤忽略阈值 | **1** |
| `customer_service_phone` | 客服电话 | 占位 |
| `transport_agreement_version` | 协议版本号 | `v1` |

城市列表：第一期 **以顺丰适配器返回的可寄城市为准**；适配器 mock 时可写死一批城市。

兜底价表 `rate_cards`：至少能按「寄件城市、收件城市、体重 kg」给出卖价（分）。询价失败时用。

---

## 4. 身份与登录

### 4.1 C 端

- `POST /auth/wx-login`：`code` → `openid`（及可选 `unionid`），签发自有 session（header `Authorization: Bearer`）。
- 手机号：小程序 `getPhoneNumber` 把 `code` 交给 `POST /auth/wx-phone` 绑定到用户。
- **必须登录才能访问的前端页：** 城市选择、地址编辑（寄/收）、宠物估价表单、补资料、确认支付。
- **可不登录：** 首页营销展示（若有）、协议页、客服说明、未登录订单 tab 空态（按钮去登录）。

用户表字段最少：`id, openid, phone, created_at`。订单 `user_id` 绑定该用户。

### 4.2 管理端

第一期单管理员：环境变量 `ADMIN_PASSWORD` 或 `ADMIN_OPENIDS`。不要做 RBAC。

---

## 5. 页面与路由（小程序）

Tab：

| tab | 路径 | 登录 |
| --- | --- | --- |
| 首页 | `pages/home/index` | 否（点「去寄宠」进入下单栈则是） |
| 订单 | `pages/orders/list` | 列表接口需登录；未登录展示空态 |
| 我的 | `pages/me/index` | 否；头像手机、协议、客服、发票入口 |

下单栈（非 tab，需登录）：

| 路径 | 职责 |
| --- | --- |
| `pages/book/cities` | 选出发城市、到达城市（数据来自后端 / 顺丰城市） |
| `pages/book/addresses` | 寄件人、收件人：姓名、手机、省市区、详细门牌；可保存地址簿 |
| `pages/book/pet-quote` | 品种、体重、取件日 → 点估价 |
| `pages/book/quote-result` | 价格卡片拆行：运费成本转卖价、服务费、取送（门到门含在售价里可一行「门到门空运」）、加购勾选 |
| `pages/book/fulfill` | 支付前：宠物近照；自备箱照 **或** 勾选买箱（选箱型）；检疫上传 **或** 代办表单；保价勾选与声明价值 |
| `pages/book/pay` | 协议勾选、创建订单、调起支付、申请订阅消息 |

订单：

| 路径 | 职责 |
| --- | --- |
| `pages/orders/detail` | 合并时间轴、运单号复制、补差支付、申请取消、填发票抬头（未开具时） |
| `pages/orders/surcharge-pay` | 超重补差支付 |

我的：

| 路径 | 职责 |
| --- | --- |
| `pages/me/addresses` | 地址簿 |
| `pages/me/invoice` | 按订单填抬头（仅已签收可申请开具） |
| `pages/legal/agreement` | 运输协议 |

交互节奏（学派到、不抄皮）：

- 估价页未出价格前不展示支付。
- 报价卡片分行，不要只一个总数（总数也要有）。
- 下单分步：城市 → 地址 → 估价要素 → 报价/加购 → 补资料 → 支付。
- 订单详情时间轴密、新在上或按时间正序，全文统一一种。

客服：订单详情和「我的」提供 `button open-type="contact"` + 拨打电话。

---

## 6. 领域模型

### 6.1 User / Address

`Address`：`user_id, role_hint(sender|receiver), name, phone, province, city, district, detail, lat, lng(可选)`。

### 6.2 Quote（估价会话，可不过期太长）

估价 **不落正式订单**。`quotes` 表：

- 寄收地址快照、宠物 `species/breed/weight_kg`、`pickup_date`
- `sf_cost_cents` 可空（询价失败）
- `sell_freight_cents`（给宠主看的运费行，已含加价逻辑）
- `service_fee_cents`
- `quote_source`: `sf` | `rate_card`
- `expires_at`（建议 15–30 分钟，过期须重新估价）
- `raw_sf_json` 仅后端存

**计价（必须在后端算，小程序只展示）：**

```
service_fee = max(sf_cost * markup_rate, min_service_fee)   // 询价成功
若询价失败：sell = rate_card_price；service_fee 可折进卖价或仍拆行，但合计 = 价表卖价（实现时选「价表已是卖价，服务费行为 0 或内含」二选一，推荐价表为含服务费的卖价，卡片一行「空运门到门」+ 加购）
应付合计 = 运费售价 + 加购（买箱 + 代办检疫 + 保价）
```

加购价格：`crate_skus`、`addon_quarantine_cents`、保价按顺丰规则或配置档位。文档未到时 mock 固定档。

### 6.3 Order

一单一宠。状态见第 7 节。

必填快照（下单时刻冻结）：地址、宠物、报价拆行、加购、`quote_id`、`weight_kg_declared`。

支付后补：`sf_waybill_no`、`sf_order_id`、`sf_error`、`actual_weight_kg`、`timeline[]`。

资料：`photos[]`（宠物、箱、检疫），`quarantine_mode`: `self` | `agency`，`crate_mode`: `own` | `buy`。

### 6.4 Invoice

按订单：`title, tax_no, email`，`status`: `draft | issued`。仅 `signed` 且无进行中退款可 `issue`。

---

## 7. 订单状态机

```
draft                 已创建未支付（可省略，支付中单也可 created）
pending_pay           待支付
paid                  已支付，正在/即将调顺丰
sf_submitting         调用顺丰中
sf_failed             顺丰失败，待人工（不自动退款）
booked                顺丰已下单，待揽收
collected             已揽收
in_transit            运输中（可由路由推进）
signed                已签收
cancel_requested      宠主申请取消
cancelled             已取消
refunding / refunded  退款中 / 完成
surcharge_pending     复秤超差，待补差
```

允许的主要迁移：

- `pending_pay` → 支付成功 `paid` → 自动 `sf_submitting`
- `sf_submitting` → `booked` | `sf_failed`
- `sf_failed` → 管理端重试 `sf_submitting` 或 管理端退款
- `booked` → `collected` → `in_transit` → `signed`
- `booked`（未揽收）取消：扣 `cancel_fee_before_collect`，尝试调顺丰取消；失败保持 `cancel_requested` 给人工
- **未向顺丰下单成功**（`paid`/`sf_failed` 且无运单）：取消可全额退（与共识「取件前」对齐时：无运单全退；有运单未揽收扣手续费）
- `collected` 及之后：宠主不可在小程序直接退款；改期仅工单/客服，第一期管理端备注即可
- `booked|collected|...` + 复秤：`|Δw| ≤ 1kg` 忽略；超出 → `surcharge_pending`，补差支付成功后回到原运输状态

时间轴事件（存 `order_events`）：`paid`, `sf_ok`, `sf_fail`, `pickup_scheduled`, `collected`, `in_transit`, `signed`, `surcharge`, `cancel_*`, 以及顺丰路由原文映射的节点。合并展示：业务事件 + `sf_routes[]`。

---

## 8. 后端 HTTP API（C 端）

统一 `{ code, message, data }`。鉴权 Bearer。金额分。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/auth/wx-login` | 登录 |
| POST | `/auth/wx-phone` | 绑手机 |
| GET | `/meta/cities` | 可寄城市 |
| GET | `/meta/breeds` | 宠物品类/品种（顺丰允许集，mock 先猫狗+常见品种） |
| GET | `/meta/pickup-dates` | 某地址下可选取件日（顺丰可约，mock 未来 14 天） |
| GET/POST | `/addresses` | 地址簿 |
| POST | `/quotes` | body：寄收地址、品种、体重、取件日 → 报价 |
| GET | `/quotes/:id` | 报价详情 |
| GET | `/addons/crates` | 可买箱型 |
| POST | `/orders` | 用 quote_id + 资料 + 加购创建，返回支付参数 |
| POST | `/orders/:id/pay/notify` | 微信支付回调（验签） |
| GET | `/orders` | 当前用户订单列表 |
| GET | `/orders/:id` | 详情 + timeline + waybill |
| POST | `/orders/:id/cancel` | 申请取消 |
| POST | `/orders/:id/surcharge/pay` | 补差支付 |
| PUT | `/orders/:id/invoice-title` | 保存抬头 |
| POST | `/orders/:id/invoice/issue` | 仅签收后，后端调发票接口 |
| POST | `/uploads` | 上传图片，返回 file_id |

支付：`/orders` 在已登录、报价未过期、资料按规则齐全、已同意协议版本后创建；返回 `wx.requestPayment` 字段。支付成功回调里 **异步** 调顺丰，失败则 `sf_failed` + `NotifyAdmin`，**不要自动退款**。

订阅消息：小程序支付成功页 `requestSubscribeMessage`，模板 ID 配置化；后端在 `booked`（上门）、`sf_failed`/`surcharge_pending`、`signed` 时发。

---

## 9. 管理端 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/admin/login` | |
| GET | `/admin/orders` | 筛选 status=`sf_failed` 等 |
| GET | `/admin/orders/:id` | 含顺丰原始错误 |
| POST | `/admin/orders/:id/sf-retry` | 重试下单 |
| POST | `/admin/orders/:id/waybill` | 人工补单号 |
| POST | `/admin/orders/:id/reweigh` | 录入实际重量，触发差价逻辑 |
| POST | `/admin/orders/:id/refund` | 退款（调微信退款） |
| POST | `/admin/orders/:id/surcharge` | 生成补差（若未自动生成） |
| GET/PUT | `/admin/settings` | 加价等 |

管理端页面：登录、订单列表、订单详情（上述操作）、配置页。不要做报表。

---

## 10. 顺丰适配器（`SfClient`）

实现类必须可替换。方法（文档未到时 mock）：

```
listServiceCities()
quotePetAir(input) -> { costCents, raw }
listPickupSlots(address, date)
createOrder(input) -> { waybillNo, sfOrderId, raw }  // 寄收件人为真实联系人
cancelOrder(sfOrderId)
queryRoutes(waybillNo) -> [{ time, text, code }]
insure / declareValue   // 保价；不支持则 createOrder 带声明价值字段
```

`input` 与页面解耦：domain 对象映射到 SF DTO 只发生在 adapter。超时、5xx、业务失败 → 报价走价表，下单走 `sf_failed`。

轮询路由：已 `booked` 之后的订单定时任务拉路由，映射到 `in_transit`/`signed`/`collected`。

---

## 11. 资料校验规则

**创建报价：** 寄件地址、收件地址（到门牌）、品种、体重 `> 0`、取件日、已登录。

**创建订单（支付前）：**

- 有效 `quote_id`
- 宠物近照至少 1 张
- `crate_mode=own` → 箱照至少 1 张；`buy` → 选择 `crate_sku_id`
- `quarantine_mode=self` → 检疫证明图片；`agency` → 代办所需字段（姓名、证件号等，字段列表做成配置，mock 先：办理人姓名、电话、宠物名）
- 保价可选；勾选则 `declared_value_cents > 0`
- `agreement_version` 匹配当前配置

---

## 12. 微信支付与发票

- 商户为 **公司**；用户支付对象是本商户，不是顺丰。
- 支付回调幂等。退款调用微信退款 API，手续费从应退额扣除（未揽收有单）。
- 发票：保存抬头随时可（支付后）；`issue` 仅 `signed` 且无 `refunding`。对接微信电子发票或第三方，适配器化；未开通时管理端标记「待线下开」但 API 形状保留。

---

## 13. 管理端通知

事件：`order.paid`、`order.sf_failed`。内容含订单号、失败原因摘要、管理端链接（若有）。

---

## 14. 测试（实现时至少覆盖）

- 未登录调用 `/quotes` → 401
- 缺详细地址估价 → 4xx
- 询价成功 / 失败走价表 两条计价
- 支付成功触发下单成功 / 失败状态
- 复秤 0.9kg 不补差，1.1kg 进补差
- 无运单取消全额；有运单未揽收扣手续费；已揽收拒绝自助退
- 未签收不能开票

---

## 15. 目录建议

```
/miniprogram          原生小程序
/server               API、domain、adapters、jobs
/admin                第一期简单管理前端
/docs                 可链到本 spec
```

密钥 `.env.example`。顺丰 mock 用 `SF_MOCK=true`。

---

## 16. 第一期完成定义

- 宠主：登录门槛符合第 4 节；地址后估价；支付；订单时间轴；取消与补差主路径可用（可配 mock 顺丰）。
- 服务商：失败单可见、可重试、可退款、可录入复秤。
- 未做：真顺丰联调（可列为下一迭代，但适配器接口已稳定）、真实发票、真实保价档位。

真联调时只改 `adapters/sf` 与配置，不改状态机。
