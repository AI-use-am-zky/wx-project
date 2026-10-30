# 宠途空运

微信原生小程序 + Node 后端：宠物空运门到门下单、询价、支付、订单履约与顺丰开放平台对接。

| | |
| --- | --- |
| **代码仓库** | https://github.com/AI-use-am-zky/wx-project |
| **UI 演示（高保真原型）** | https://ai-use-am-zky.github.io/wx-project/ |
| **技术栈** | 微信小程序 · Node.js / Express · SQLite · 微信登录/支付 · 顺丰开放平台 |

### 简历可写要点

- 独立完成小程序端与 Node 后端：登录态、地址簿、询价下单、支付与订单状态机
- 对接微信 `code2Session` 登录与支付能力；顺丰 T11 询价/下单（可沙箱/生产切换）
- 按用户隔离 SQLite 业务库；管理端支持运单与联调
- 提供可点击的高保真 HTML 原型（`2-design/`）便于演示交互

产品共识与实现规格见 `docs/`（副本）及 AI-DOC 仓库中的 `wx_appmake.md` / `wx_appmake.spec.md`。

小程序根目录就是本仓库根目录（微信开发者工具直接打开本目录）。后端与管理端在子目录，已写入 `packOptions.ignore`，不会打进小程序包。

---

## Git 排除项（不进仓库）

规则文件：仓库根目录 [`.gitignore`](.gitignore)。下列路径**不会被 git 跟踪/提交**，换电脑需自行拷贝或重新生成。

| 路径 | 原因 | 新电脑怎么处理 |
| --- | --- | --- |
| `server/.env` | 含顺丰/微信等密钥 | 从旧机拷贝，或 `copy server\.env.example server\.env` 后填写 |
| `server/data/` | 本地 SQLite（用户库、订单、演示库等） | 一般不迁；空跑会自动建库。要保留业务数据再整目录拷贝 |
| `node_modules/` | 根目录依赖（若有） | 不拷贝 |
| `server/node_modules/` | 后端 npm 依赖 | 在 `server` 下重新 `npm install` |
| `project.private.config.json` | 微信开发者工具本机私有配置 | 不拷贝；工具会按本机重新生成 |

当前 `.gitignore` 原文：

```gitignore
node_modules/
server/node_modules/
server/data/
server/.env
project.private.config.json
```

**会进仓库的配置模板：** `server/.env.example`（无真实密钥）。  
**不要把填好密钥的 `.env` 强制 `git add -f` 提交。**

另：`project.config.json` → `packOptions.ignore` 只影响**小程序打包**（排除 `server/`、`admin/`、`docs/` 等），与 git 无关。

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

真机预览：改 `utils/config.js` 里的 `LAN_HOST` 为这台电脑当前局域网 IP（`ipconfig` 看无线局域网 IPv4），手机与电脑同一 WiFi。调试器显示「已连接」只表示开发者工具连上了手机，保存地址、估价仍要访问 `http://LAN_HOST:8787`。出现 `request:fail -109 net::ERR_ADDRESS_UNREACHABLE` 时，先核对 IP 是否已变、后端是否在跑、Windows 防火墙是否放行 8787。服务监听 `0.0.0.0`。

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

真机预览：`utils/config.js` 的 `LAN_HOST` 必须是电脑当前 IP；手机与电脑同一 WiFi，防火墙放行 8787。开发者工具勾选「不校验合法域名」（或已设 `project.config.json` → `urlCheck: false`）。`ERR_ADDRESS_UNREACHABLE` 表示手机到不了这台电脑的接口。

## 小程序主路径

只保留「寄快递」一条下单路径。首页「去下单」进入寄快递 Tab。已删除旧向导：`pages/book/cities`、`pages/book/addresses`、`pages/book/pet-quote`、`pages/book/quote-result`。

1. 寄快递：寄收地址、上门时间、空运时效、保价、备注
2. 物品信息：宠物名称、重量、航空箱、检疫（自备上传，或代办 ¥200）
3. 资料：自备时上传检疫证明；代办时填代办人
4. 确认并支付

支付成功后会调顺丰下单（`SF_MOCK=false` 时走真实/沙箱开放平台；`true` 时用本地假运单）。

### 地址

- 点寄件人/收件人整行打开填写页。「地址簿」只是快捷入口；簿里没有地址时直接进入填写页。
- 填写页可粘贴整段地址，解析在 `utils/address-parse.js`。姓名超过 4 个字时保留前 4 字，其余写成 `*`。手机号必须是完整 11 位，不能从旁边的数字里截一段。市名保留「市」，例如南京市。区的标签是「区/县」。
- 点「保存」才写入服务器 `addresses`。没保存就返回，寄快递页仍是上一次已保存的地址。

### 草稿存在哪里

未下单的填写内容在**这台手机**的小程序本地存储里，键名 `book`（`utils/book.js`）。返回再进寄快递，会保留地址、上门时间、时效、物品、检疫、航空箱、保价和备注。换手机或清掉小程序缓存就没了。

服务器 SQLite 只在这些动作之后才有数据：地址点保存、估价成功（`quotes`）、下单（`orders`）。

### 客服

首页右下角圆形按钮使用 `open-type="contact"`，打开的是微信「小程序客服」会话，不是本仓库的接口。

| 要改的 | 位置 |
| --- | --- |
| 耳机图标 | `images/kefu-icon.png`（透明底、白色、正方形）。页面引用在 `pages/home/index.wxml` |
| 拖动、贴边、2 秒收成圆角条 | `pages/home/index.js`、`pages/home/index.wxss` |

按钮可拖动，松手贴左缘或右缘，停约 2 秒后收成圆角长条；点长条展开，再点圆形按钮进入客服会话。拖动时不会误开聊天。

消息不进本仓库，也不出现在公众平台「功能 → 客服」的人员名单上。用绑定的微信号打开「客服小助手」，选中本小程序，状态设为在线，到「待接入」里点进会话再回复。也可使用网页版客服工具 https://mpkf.weixin.qq.com 。「客服小助手」的服务通知经常不弹，这是微信侧限制，小程序代码改不了。

若「开发管理 → 开发设置 → 消息推送」已开启，用户消息会转走，客服小助手会收不到。没有自己的接收服务时把消息推送关掉。

「微信客服」（企业微信）是另一套。需要公司主体的小程序、已验证的企业微信，且两者是同一家公司。绑定企业 ID 后，把按钮改成点击时调用 `wx.openCustomerServiceChat`。消息在企业微信里接收，提醒比客服小助手可靠。个人小程序不能绑定。说明页：https://work.weixin.qq.com/nl/act/p/a733314375294bdd

### 首页文案和四张卡片

绿色介绍卡片的文字在 `pages/home/index.wxml` 的 `.hero`。四张卖点卡片样式在 `pages/home/index.wxss`：`.promo-cell` 宽 `48%`，两列；不要再用 `gap` 加 `calc(50% - 8rpx)`，真机上会挤成一列。

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

**关于 `.env` 与 git：** `server/.env` 已在根目录 `.gitignore` 中忽略，**不会也不应提交**。仓库只保留无密钥的 `server/.env.example`。换电脑请自行拷贝 `.env` 或按下面清单重新填写。

---

### 真实顺丰生产环境（必读）

宠物主路径下单产品：**专享即日**（开放平台 `productCode=T11`，下单字段 `expressTypeId=303`）。  
适配器：`server/src/adapters/sf-open.js`。生产网关：`https://bspgw.sf-express.com/std/service`。

#### 1. 向顺丰侧先确认（配置前）

在开放平台 / 销售侧确认下列能力已开通，否则会出现「能签名成功但业务拒单」：

| 需求 | 说明 |
| --- | --- |
| 开放平台应用已审过并开通生产 | 有独立的**生产校验码**（与沙箱校验码不同） |
| 顾客编码（partnerID） | 即 `SF_PARTNER_ID`，与校验码成对 |
| 月结卡已绑定该顾客编码 | 且为**可发货**月结号（结算卡 ≠ 发货卡时需问清） |
| 月结卡支持专享即日（303） | 未开通对应产品会下单失败 |
| 活体/宠物寄递资质（若寄宠物） | 未开通时常见报错：「根据相关法规或我司有关限制条款，该物品禁止收寄」 |
| 路由推送（可选） | 在开放平台登记回调 URL，才能自动更新揽收/在途/签收 |

#### 2. `server/.env` 生产参数（必填）

```env
# 关闭本地假数据，走开放平台
SF_MOCK=false
SF_QUOTE_FAIL=false

# 生产环境（不要写 sbox）
SF_ENV=prod

# 顾客编码（开放平台应用详情 / CustomerCode）
SF_PARTNER_ID=

# 生产校验码（开放平台「生产校验码」；沙箱码在 prod 会报 A1006 数字签名无效）
SF_CHECKWORD=

# 真实可发货月结卡号（寄方付 payMethod=1 必填；禁止再用沙箱演示卡 7551234567）
SF_MONTHLY_CARD=

# 宠物默认产品：专享即日
SF_PREFERRED_PRODUCT_CODES=T11
SF_EXPRESS_TYPE_ID=303

# 顺丰→你方推送用的公网根（不是下单 API 地址）
SF_PUBLIC_BASE_URL=https://你的公网HTTPS域名
SF_WAYBILL_CALLBACK_PATH=/sfexpress/waybills/back
```

改完后**必须重启**后端（`npm run dev`），启动日志应类似：

```text
[sf] mock=false env=prod partner=…… monthlyCard=set callback=https://……/sfexpress/waybills/back
```

#### 3. 参数对照与获取处

| 环境变量 | 是否必填 | 从哪拿 | 作用 |
| --- | --- | --- | --- |
| `SF_MOCK` | 是 | 本地配置 | `false` 才访问顺丰 |
| `SF_ENV` | 是 | 本地配置 | `prod` → 生产网关；`sbox` → 沙箱 |
| `SF_PARTNER_ID` | 是 | 开放平台应用详情 | 请求头/表单 `partnerID` |
| `SF_CHECKWORD` | 是 | 开放平台**生产**校验码 | 计算 `msgDigest` 签名 |
| `SF_MONTHLY_CARD` | 是（寄方付） | 顺丰月结合同 / 丰桥绑定后的发货卡号 | 写入下单报文 `monthlyCard` |
| `SF_EXPRESS_TYPE_ID` | 建议 | 产品表：专享即日=`303` | 下单产品编码 |
| `SF_PREFERRED_PRODUCT_CODES` | 建议 | 产品推荐里的 `T11` | 估价时优先选该产品报价 |
| `SF_PUBLIC_BASE_URL` | 推送时必填 | 你的 HTTPS 域名或稳定隧道 | 拼回调完整 URL |
| `SF_WAYBILL_CALLBACK_PATH` | 建议保持默认 | 本地约定 | 默认 `/sfexpress/waybills/back` |

开放平台登记的推送地址必须是：

`{SF_PUBLIC_BASE_URL}{SF_WAYBILL_CALLBACK_PATH}`  
例：`https://api.example.com/sfexpress/waybills/back`

#### 4. 本系统会调哪些生产接口

| 业务 | serviceCode | 触发时机 |
| --- | --- | --- |
| 产品推荐 / 估价 | `EXP_RECE_PSDS_PRODUCT_RECOMMEND` | `POST /quotes` |
| 下订单 | `EXP_RECE_CREATE_ORDER` | 支付成功 / 管理端「重试顺丰」 |
| 取消订单 | `EXP_RECE_UPDATE_ORDER` | 小程序「申请取消」（已有运单且未揽收） |
| 路由查询 | `EXP_RECE_SEARCH_ROUTES` | 按需 |
| 运单/路由推送 | 顺丰 → 你方回调 | 需公网 URL |

下单托寄物当前按 **活体动物 + 品种** 组装；账号若无活体资质会被拒。

#### 5. 生产联调步骤

1. 填好上表 → 重启 `npm run dev`，确认日志 `env=prod monthlyCard=set`  
2. （可选）`POST /debug/sf/product-recommend` 看是否返回产品列表且平台码 `A1000`  
3. 小程序走完整下单 + 模拟支付（`PAY_MOCK` 仍可为 `true`，只测顺丰）  
4. 成功：订单 `booked` 且有 `sfWaybillNo`；失败：看管理端 `rawSfError` 或日志 `[order.sf_failed]` 后的顺丰原文  
5. 失败单可在 http://127.0.0.1:8787/admin/ 点 **「重试顺丰」**，不必重复付款  
6. **测完用小程序「申请取消」撤单**（有运单时会调顺丰取消接口）

#### 6. 常见生产报错

| 顺丰原文 / 现象 | 常见原因 |
| --- | --- |
| `A1006` 数字签名无效 | 用了沙箱校验码，或 `SF_ENV` 与校验码不匹配 |
| 传入了不可发货的月结卡号 | 月结未绑定顾客编码 / 非发货卡 / 未开通开放平台发货 |
| 该物品禁止收寄 | 无活体资质，或专享即日不收该托寄物 |
| 收方地址不可达 | 地址不详或该产品不可达此线路 |
| 小程序只显示「承运接口异常」 | 统一文案；真实原因在订单 `sf_error` / 管理端 / 服务日志 |

> **警告：** 生产会生成真实运单并可能计费；勿用沙箱演示月结 `7551234567` 打生产。

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

- 只走寄快递：地址（可粘贴识别）→ 物品信息（含检疫自备/代办）→ 自动估价 → 资料 → 模拟支付 → 顺丰下单（沙箱或 mock）。
- 未支付草稿只在本机 `book`，不进数据库。首页可续填。返回寄快递会保留已填项。

**订单与「我的」**

- 真实下单走 `orders` 表；演示单走 `session.sqlite`，列表合并展示。
- 「我的」红点按 Tab 已读。

**照片（开发者工具）**

- 可写本地示例 PNG，避免触发重新编译；真机 `POST /uploads`。

**仍是占位、未接真实能力**

- 电子发票：只打标「待线下开」（`adapters/invoice.js`）。
- 「优惠券」「消息」页面无接口。客服走微信官方会话，不走这两个页面。
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
| `pages/me/messages.js` | 消息中心。客服会话不在这里，见上文「客服」 |

---

## 加价数字

在管理端或 `app_settings` 修改；`.env` 里的 `MARKUP_RATE` / `MIN_SERVICE_FEE_CENTS` 等是首次种子占位。
