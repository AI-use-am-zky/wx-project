# 宠途空运

微信原生小程序 + Node 后端。产品共识与实现规格见 `docs/`（副本）及 AI-DOC 仓库中的 `wx_appmake.md` / `wx_appmake.spec.md`。

小程序根目录就是本仓库根目录（微信开发者工具直接打开本目录）。后端与管理端在子目录，已写入 `packOptions.ignore`，不会打进小程序包。

---

## 新电脑移植（第一次要做）

### 1. 安装环境

- [Node.js](https://nodejs.org/) **18+**（建议 LTS；`node -v` / `npm -v` 能跑即可）
- [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
- Git（从 GitHub 拉代码时需要）

### 2. 拿代码

```powershell
git clone https://github.com/AI-use-am-zky/wx-project.git
cd wx-project
```

若旧电脑用代理才能访问 GitHub，新电脑同样可临时加代理，例如：

```powershell
git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 clone https://github.com/AI-use-am-zky/wx-project.git
```

### 3. 配置后端密钥（必做，`.env` 不进 git）

```powershell
cd server
copy .env.example .env
```

用编辑器打开 `server/.env`，按旧电脑或开放平台补全（至少沙箱联调）：

| 项 | 沙箱联调示例 |
| --- | --- |
| `SF_MOCK` | `false` |
| `SF_ENV` | `sbox` |
| `SF_PARTNER_ID` | 顾客编码 |
| `SF_CHECKWORD` | **沙箱**校验码（不要用生产码） |
| `SF_MONTHLY_CARD` | `7551234567` |
| `WX_MOCK_LOGIN` / `PAY_MOCK` | `true`（本地仿真登录/支付） |

详细沙箱 vs 生产见下文「环境与配置」。

### 4. 安装依赖并启动后端

在 **`server` 目录**执行：

```powershell
cd server
npm install
npm run dev
```

日常每次开发（依赖装过之后）只要：

```powershell
cd server
npm run dev
```

其它命令：

```powershell
npm start    # 不 watch，前台跑一次
npm test     # 跑服务端单测
```

成功标志：

- 浏览器打开 http://127.0.0.1:8787/health 有返回
- 终端有：`pet-air API http://127.0.0.1:8787`
- 管理端：http://127.0.0.1:8787/admin/

**关掉这个终端或电脑休眠后，小程序会 `request:fail`，需要重新 `npm run dev`。**

### 5. 打开小程序

1. 微信开发者工具 → 导入项目 → 选仓库**根目录**（不是 `server`）
2. AppID 用项目里的测试号 / 你的小程序 AppID
3. **详情 → 本地设置** → 勾选「不校验合法域名、web-view…」
4. 编译；开发者工具默认请求 `http://127.0.0.1:8787`

真机预览：改 `utils/config.js` 里的 `LAN_HOST` 为新电脑局域网 IP（`ipconfig` 查看），手机与电脑同一 WiFi。

### 6. 从旧电脑迁什么

| 要迁 | 路径 | 说明 |
| --- | --- | --- |
| 密钥 | `server/.env` | **必须**；仓库里没有 |
| 可选本地库 | `server/data/*.sqlite` | 不要可省略，会重新生成空库 |
| 不要迁 | `server/node_modules` | 新电脑重新 `npm install` |

---

## 启动后端（速查）

```powershell
cd server
npm install          # 仅首次或 package.json 变更后
npm run dev          # 开发：热重载，保持运行
```

- API：http://127.0.0.1:8787  
- 健康检查：http://127.0.0.1:8787/health  
- 管理端：http://127.0.0.1:8787/admin/ （密码见 `.env` 的 `ADMIN_PASSWORD`）  
- 启动日志：`[sf] mock=… env=sbox|prod …`、`[wx] mockLogin=…`

没有 `server/.env` 时先：

```powershell
cd server
copy .env.example .env
# 再编辑 .env 填入顺丰/微信等配置
```

真机预览：`utils/config.js` 的 `LAN_HOST`；开发者工具勾选「不校验合法域名」（或已设 `project.config.json` → `urlCheck: false`）。

## 小程序主路径

寄快递 Tab → 寄收地址 → 物品信息 →（自动估价）→ 资料（照片）→ 确认并支付。

支付成功后会调顺丰下单（`SF_MOCK=false` 时走真实/沙箱开放平台；`true` 时用本地假运单）。

---

## 环境与配置（沙箱 / 仿真 vs 生产）

**所有密钥只放服务端 `server/.env`，不要写进小程序、不要提交 git。**  
模板：`server/.env.example` → 复制为 `server/.env` 后填写。读取入口：`server/src/config.js`。

### 当前默认在用什么（联调现状）

| 能力 | 当前常用状态 | 说明 |
| --- | --- | --- |
| 顺丰询价 / 下单 / 撤单 / 路由 | **沙箱开放平台**（非本地假数据） | `SF_MOCK=false` + `SF_ENV=sbox` + 沙箱校验码 + 演示月结 `7551234567`。会打 `sfapi-sbox.sf-express.com`，可出沙箱运单号。宠物单默认产品 **专享即日** `expressTypeId=303`（`T11`）。 |
| 顺丰本地 mock | 可选 | `SF_MOCK=true` 时走 `server/src/adapters/sf-mock.js`，不访问顺丰。 |
| 微信登录 / 手机号 | **仿真** | `WX_MOCK_LOGIN=true`：假 openid；支付页可用寄件人号自动绑演示手机号。 |
| 微信支付 | **仿真** | `PAY_MOCK=true`：`POST /orders/:id/mock-pay`，不拉起真实收银台。 |
| 顺丰运单推送回调 | 可选隧道 | `SF_PUBLIC_BASE_URL`（如 cloudflared）；不影响出单，只影响轨迹推送。 |
| 电子发票 | 占位 | 仅标记待线下开。 |
| 订单列表演示单 | 仿真 | `session.sqlite` 种子单，与真实 `orders` 合并展示。 |
| 照片（开发者工具） | 本地短路 | 示例图可不上传；真机走 `/uploads`。 |
| 加价 / 最低服务费 | 可配 | `.env` 种子 + 管理端 / `app_settings`。 |

> 注意：沙箱 ≠ 本地 mock。沙箱是顺丰官方测试环境；mock 是本仓库假适配器。

### 配置写在哪里

| 配置项 | 文件 | 谁读取 |
| --- | --- | --- |
| 顺丰 / 微信 / 支付 / 管理端开关与密钥 | `server/.env`（由 `.env.example` 复制） | `server/src/config.js` → `createSf` / `createWechat` |
| 小程序 API 根地址 | `utils/config.js` | `utils/request.js` |
| 开发者工具不校域名 | `project.config.json` → `setting.urlCheck` | 微信开发者工具 |
| 业务加价等运行时参数 | 管理端或库表 `app_settings` | `getSetting(...)` |

### 切到顺丰生产（真实下单）

编辑 **`server/.env`** 后重启 `npm run dev` / 进程：

```env
SF_MOCK=false
SF_ENV=prod
SF_PARTNER_ID=你的顾客编码
SF_CHECKWORD=生产校验码          # 与沙箱校验码不同，在开放平台应用详情分别查看
SF_MONTHLY_CARD=真实月结卡号      # 寄方付通常必填；勿用 7551234567
SF_PREFERRED_PRODUCT_CODES=T11
SF_EXPRESS_TYPE_ID=303
SF_PUBLIC_BASE_URL=https://你的公网HTTPS域名
SF_WAYBILL_CALLBACK_PATH=/sfexpress/waybills/back
```

同时在 [顺丰开放平台](https://open.sf-express.com) 登记推送地址：  
`{SF_PUBLIC_BASE_URL}{SF_WAYBILL_CALLBACK_PATH}`。

代码已接生产 API 网关（`bspgw.sf-express.com`），适配器：`server/src/adapters/sf-open.js`。  
**生产会生成真实运单并可能计费，测完及时撤单。**

### 切到真实微信登录 + 支付

仍在 **`server/.env`**：

```env
WX_MOCK_LOGIN=false
PAY_MOCK=false
WX_APP_ID=小程序AppID
WX_APP_SECRET=小程序AppSecret
WX_MCH_ID=商户号
WX_PAY_KEY=APIv2密钥
WX_PAY_NOTIFY_URL=https://你的域名/pay/wx-notify
WX_PAY_CLIENT_IP=服务器出口IP
# 可选订阅消息模板
WX_SUBSCRIBE_TPL_PICKUP=
WX_SUBSCRIBE_TPL_ALERT=
WX_SUBSCRIBE_TPL_SIGNED=
```

小程序侧：

- `utils/config.js` 的 `baseUrl` 改为正式 HTTPS API 域名（勿再用 `127.0.0.1`）。
- 微信公众平台配置 request / upload 合法域名。
- 支付成功走微信异步通知 `POST /pay/wx-notify`，再 `markPaidAndSubmitSf` 调顺丰下单。

适配器：`server/src/adapters/wechat.js`。

### 生产导入清单（复制到 `.env` 时逐项填）

| 变量 | 沙箱/仿真示例 | 生产要填 |
| --- | --- | --- |
| `SF_MOCK` | `false`（打沙箱）或 `true`（纯本地假） | `false` |
| `SF_ENV` | `sbox` | `prod` |
| `SF_PARTNER_ID` | 顾客编码 | 同或按合同 |
| `SF_CHECKWORD` | **沙箱**校验码 | **生产**校验码 |
| `SF_MONTHLY_CARD` | `7551234567` | 真实月结卡 |
| `SF_EXPRESS_TYPE_ID` | `303` | `303`（专享即日，可改） |
| `SF_PUBLIC_BASE_URL` | 隧道域名 | 正式 HTTPS |
| `WX_MOCK_LOGIN` | `true` | `false` |
| `PAY_MOCK` | `true` | `false` |
| `WX_APP_ID` / `WX_APP_SECRET` | 可空 | 必填 |
| `WX_MCH_ID` / `WX_PAY_KEY` / `WX_PAY_NOTIFY_URL` | 可空 | 必填 |
| `ADMIN_PASSWORD` | `change-me` | 强密码 |

签名说明：当前开放平台数字签名为 `Base64(MD5(msgData + timestamp + checkword))`（**不做** URLEncode），见 `server/src/adapters/sf-open.js`。

---

## 当前已跑通的结果

本地演示闭环可用，数据落在本机 SQLite，文件不进仓库目录。

**寄宠主流程**

- 寄收地址 → 物品信息（名称映射品种，如「金毛」→ dog）→ 自动估价 → 资料 → 模拟支付 → 顺丰下单（沙箱或 mock）。
- 未支付草稿在本机：`utils/book.js` / 首页可续填。

**订单与「我的」**

- 真实下单走 `orders` 表；演示单走 `session.sqlite`，列表合并展示。
- 「我的」红点按 Tab 已读。

**照片（开发者工具）**

- 可写本地示例 PNG，避免触发重新编译；真机 `POST /uploads`。

**仍是占位、未接真实能力**

- 电子发票：只打标「待线下开」（`adapters/invoice.js`）。
- 「优惠券」「消息」页面无接口。
- 存储仍为 SQLite + 临时目录，上线需换正式库与对象存储。

---

## 正式产品要对上的库与存储

上线时把本机 SQLite + 临时目录换成正式数据库和对象存储。小程序继续走同一套 HTTP 路径即可，优先改后端实现，不要散改页面里的 URL。

| 职责 | 文件 | 现状 | 正式环境 |
| --- | --- | --- | --- |
| API 根地址 | `utils/config.js` | `127.0.0.1` / 局域网 IP | HTTPS 正式域名 |
| 请求 / 上传 | `utils/request.js` | 开发工具上传可短路 | 正式包必须上传 |
| 登录 token | `utils/auth.js` | mock 或真实 code2session | 关 `WX_MOCK_LOGIN` |
| 顺丰 | `adapters/sf-open.js` | 沙箱或 mock | `SF_ENV=prod` + 生产校验码/月结 |
| 支付 | `adapters/wechat.js` + `mock-pay` | 模拟支付 | 关 `PAY_MOCK` + 商户号与回调 |

### 1. 业务数据库

表结构：`server/src/db.js`（现 `server/data/app.sqlite`）。业务：`server/src/service.js`。

### 2. 对象存储

现状：`os.tmpdir()/pet-air-uploads`。上线改为 COS/OSS 等，小程序去掉开发工具上传短路。

### 3. 演示库（不要进正式产品）

`server/src/session-db.js` → `session.sqlite`。上线去掉 `ensureDemoOrders`。

### 4. 外部适配器

| 文件 | 现状 | 正式 |
| --- | --- | --- |
| `adapters/wechat.js` | 可 mock 登录/支付 | 真登录、JSAPI 支付、退款 |
| `adapters/sf-open.js` | 沙箱或生产开放平台 | `SF_ENV=prod` |
| `adapters/sf-mock.js` | 仅 `SF_MOCK=true` | 关闭 mock |
| `adapters/invoice.js` | 占位 | 发票服务商 |
| `adapters/notify.js` | 日志 / webhook | 运营通知 |

### 5. 还没有后端、上线时要新建的

| 页面 | 说明 |
| --- | --- |
| `pages/me/coupons.js` | 优惠券 |
| `pages/me/messages.js` | 消息中心 |

---

## 加价数字

在管理端或 `app_settings` 修改；`.env` 里的 `MARKUP_RATE` / `MIN_SERVICE_FEE_CENTS` 等是首次种子占位。
