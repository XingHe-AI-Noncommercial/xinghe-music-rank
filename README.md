# 星河音浪榜 · 精简版（Cloudflare Pages + Functions + D1）

一个**每周一清空**、**投稿需开发者审核**、**可一键复制全部 BV 号**的 B 站视频榜单。不依赖第三方前端库，**不使用 R2、不上传任何音频**。静态资源在 `public/`，后端 API 在 `functions/`，数据库建表脚本在 `migrations/0001_init.sql`。暗黑星河主题 UI，适配电脑与手机。

## 核心规则（务必遵守）

1. **绝对不使用 R2，不使用付费服务，不允许上传音频文件。** 播放完全依赖 B 站视频。
2. **每周一清空**：每周一北京时间 00:00，全部作品清空，重新开始新的一周（后台用 `settings.week_key` 记录本周一日期实现，幂等）。
3. **每天每 IP 最多投稿 1 个**：同一 IP 每天限投 1 个作品；被拒绝（rejected）后当天可重新提交。
4. **投稿需开发者审核**：用户投稿先进 `pending`，开发者**通过**后才上架（approved）并显示、才被复制；**拒绝**则不显示、不复制。
5. **开发者上架不限次数**：开发者在后台可直接上架（= 已同意审核，直接 approved），不受每天 1 个限制。
6. **开发者一键复制**：开发者模式可复制**全部已审核通过**作品的 BV 号，中间用逗号分隔；待审核 / 已拒绝的不包含。
7. **开发者密码只在 Cloudflare 后台**：密码通过 Secret（`ADMIN_PASSWORD`）在服务端校验，前端代码与网址里不出现任何密码。
8. **API 限流**：每个 IP 每 10 秒最多 10 次（D1 `rate_limits` 表实现 + 建议配置 WAF 同规则）。

## 目前包含的功能

- 投稿表单：**BV 号 / 作者名 / 视频名** 三个字段手动填写（BV 号支持粘贴 B 站链接，自动提取）。
- 本周榜单：仅显示审核通过（上架）的作品，点击卡片跳转 B 站播放。
- 顶部指标：本周上架数、待审核数、已拒绝数、今日可投（每天每 IP 1 个）。
- 开发者模式（密码在 Cloudflare Secret）：总览、**投稿审核**（通过 / 拒绝）、**一键复制全部 BV 号**（逗号分隔，只含已上架）、**快速上架**（不限次数）、作品管理（删除）。
- 每个 API 都做了 10 秒 / 10 次的 IP 限流，超限返回 HTTP 429。

## 免费部署前提

项目不使用 R2、不要求添加信用卡。Cloudflare 免费额度仍有每日请求、D1 读写行数等限制；达到免费限额后数据库请求可能暂时失败，额度重置后恢复。请以官方页面为准：

- Pages Functions 价格与免费请求额度：<https://developers.cloudflare.com/pages/functions/pricing/>
- D1 价格与免费额度：<https://developers.cloudflare.com/d1/platform/pricing/>

注意：Cloudflare Pages 的网页控制台 **Direct Upload 当前不支持带 Functions 的项目**。请使用 Git 连接部署，或用 Wrangler CLI；不能只把 `public/` 单独上传当成完整项目。

---

## 部署步骤（全部在 Cloudflare 网页后台完成）

> 以下 4 步（建表、环境变量、WAF 限流、重新部署）都不属于网站代码，**必须**手动去 Cloudflare 控制台操作。

### 1. 上传项目到 GitHub

1. 解压本项目 ZIP，将整个 `xinghe-music-rank` 目录内的文件上传到你自己的 GitHub 仓库，确保 `public/`、`functions/`、`migrations/` 三个目录都在仓库根目录。
2. 上传的是解压后的项目文件，不要只上传 ZIP 文件本身。
3. 仓库不需要安装前端依赖，也不需要运行打包命令（框架预设选 **None / 无**）。

### 2. 创建 D1 数据库并建表（控制台执行 SQL）

1. 打开 Cloudflare 控制台，进入 **Workers & Pages → D1**，新建数据库，名称可用 `xinghe-music-rank-db`。
2. 打开该数据库的 **Console / SQL Editor**。
3. 打开本项目 `migrations/0001_init.sql`，**把文件全部内容复制粘贴到 SQL 编辑器并执行（Run）**。
   - 脚本会先 `DROP` 掉旧的投票、互动、用户、投稿、VocaDB 缓存表，再重建 `songs` 表，并新建 `settings`、`rate_limits` 表。
   - 在**已有数据库**上执行会清空旧数据，请先确认无需保留；全新数据库则直接建好。
4. 执行成功后应能看到 3 张表：`songs`、`settings`、`rate_limits`。确认无误后，不要删除数据库。

### 3. 创建 Pages 项目并绑定 D1

1. Cloudflare 控制台进入 **Workers & Pages → Create → Pages → Connect to Git**，选择刚上传的 GitHub 仓库。
2. 框架预设选 **None / 无框架**；Build command 留空；**Build output directory 填 `public`**。
3. 保存并部署。第一次部署时，即使数据库还没连上，页面也会显示本地预览数据（顶部状态为“预览模式”）。
4. 进入刚创建的 Pages 项目，打开 **Settings → Bindings**，添加一个 **D1 database** 类型绑定：
   - **变量名称 / Binding name：`DB`**（必须严格为 `DB`）
   - 数据库：选择第 2 步创建的 `xinghe-music-rank-db`
   - 保存设置。

### 4. 配置环境变量 / Secrets（Settings → Variables and Secrets）

进入 **Settings → Variables and Secrets**，在 **Production** 环境添加以下两个 **Secret（加密变量）**：

| 变量名 | 用途 | 说明 |
|---|---|---|
| `ADMIN_PASSWORD` | 开发者模式登录密码 | 你自己设置，例如一串强密码 |
| `ADMIN_SESSION_SECRET` | 后台会话签名密钥 | 建议 ≥ 32 个随机字符，用于给登录 Cookie 签名 |

- **不要添加与限流相关的变量**，代码里已固定为 **10 秒 / 10 次**。
- **不要把这两个值写进 `public/app.js`、HTML、GitHub 仓库、网址或提交到代码里。** 它们只通过 HTTPS 的登录请求提交到 Function，由服务端环境变量验证。
- 登录成功后使用 HttpOnly、Secure、SameSite Cookie 保存会话。

### 5. 配置 Cloudflare WAF 速率限制（重要，双保险）

代码层已经用 `rate_limits` 表做了“每 IP 每 10 秒 10 次”的限流，但建议你在 Cloudflare **WAF** 再加一条同规则：

1. 进入 Pages 项目 → **安全性（Security）→ WAF → 速率限制规则（Rate limiting rules）**。
2. 点击 **Create rule / 创建规则**，填写：
   - **规则名称**：`星河 API 限流`（可自定义）。
   - **匹配条件（Expression）**：`http.request.uri.path contains "/api/"`。
   - **速率（Rate / 计数特征）**：请求数 `10`，周期 `10 秒`；**计数特征选择 `IP 地址`**。
   - **操作（Action）**：`Block`（拦截），拦截时长建议 `10 秒`。
3. **保存并部署（Deploy）** 该规则。
4. 说明：WAF 免费版通常允许少量速率限制规则，若提示配额不足，至少保留代码层限流（本项目的 `_lib.js` 已内置）。

### 6. 重新部署（必须“重试部署”才生效）

**修改环境变量、绑定或 WAF 规则后，必须让改动生效：**

1. 进入 Pages 项目 → **Deployments（部署）**。
2. 点击最近一次部署右侧的 **⋯ → Retry deployment（重试部署）**，或点击 **Create deployment / 触发新部署**。
3. 等待新部署状态变为 **Active（成功）**。

### 7. 首次验证

1. 打开 Pages 提供的 `*.pages.dev` 地址，顶部状态应从“预览模式”变成 **“实时数据已连接”**。
2. 在“投稿”区填 BV 号 / 作者名 / 视频名并提交，应提示已提交、等待审核；再次提交应提示“今天已经投过 1 个”。
3. 进入“开发者模式”（用你设置的 `ADMIN_PASSWORD`），在“投稿审核”里点 **通过**，该作品应出现在本周榜单；点 **拒绝** 则不显示。
4. 在“总览面板”点 **一键复制全部 BV 号**，剪贴板应得到所有已上架作品的 BV 号（逗号分隔），且**不包含**待审核 / 已拒绝的。
5. 连续快速请求 `/api/state` 超过 10 次 / 10 秒，应返回 HTTP 429 与“请求过于频繁”提示（验证限流）。

---

## API 一览

| 方法 | 路径 | 说明 | 限流 |
|---|---|---|---|
| GET | `/api/state` | 本周上架作品 + 统计 + 今日投稿额度（自动周一清空） | 10s / 10 次 |
| POST | `/api/submit` | 投稿 `{ bvid, artist, title }`（每天每 IP 1 个 → 待审核） | 10s / 10 次 |
| POST | `/api/admin/login` | 开发者登录（密码在 Secret） | 10s / 10 次 |
| POST | `/api/admin/logout` | 退出登录 | 10s / 10 次 |
| GET | `/api/admin/state` | 全部作品 + 待审核 + 统计 + 已上架 BV 串（需登录） | 10s / 10 次 |
| POST | `/api/admin/submissions/:id` | 审核投稿 `{ action: 'approve' \| 'reject' }`（需登录） | 10s / 10 次 |
| POST | `/api/admin/songs` | 开发者快速上架（不限次数，直接通过，需登录） | 10s / 10 次 |
| DELETE | `/api/admin/songs/:id` | 删除作品（需登录） | 10s / 10 次 |

## 数据与说明

- 不需要用户注册，也**不保存任何音频**。页面只存文本元数据（BV 号、作者名、视频名、状态、投稿 IP、投稿日）到 D1。
- 同一 BV 号在 `songs` 表中只允许一条（含待审核与已上架；被拒后可重新提交）。
- “每天每 IP 1 个”按 `submitter_ip + day` 判定；`pending / approved` 占用当日额度，`rejected` 不占用（可重投）。
- “每周一清空”按北京时间周一判断，用 `settings.week_key` 记录，每个 API 入口幂等执行一次。
- 开发者会话用 HttpOnly Cookie（`xh_admin`）签名，密码只存在 Cloudflare Secret。
- API 限流基于 `CF-Connecting-IP`（Cloudflare 真实 IP），无该头时回退 `X-Forwarded-For` / `X-Real-IP`。
- 若后端尚未连接，主页显示明确标注的本地预览数据；预览数据不会写进数据库，也不能投稿或进入开发者模式。

## 项目结构

```text
xinghe-music-rank/
├── public/
│   ├── index.html         # 页面结构（投稿表单、本周榜单、开发者后台）
│   ├── styles.css         # 暗黑星河主题样式（精简版）
│   ├── app.js             # 前端逻辑（投稿、榜单、审核、一键复制）
│   ├── _headers
│   └── _routes.json       # 仅 /api/* 走 Functions
├── functions/
│   ├── _lib.js            # 工具：JSON、IP、10s/10 限流、周一清空、BV 规范化、审核插入、开发者会话
│   └── api/
│       ├── state.js       # GET  本周上架 + 统计 + 今日额度（自动周一清空）
│       ├── submit.js      # POST 投稿（每天每 IP 1 个 → 待审核）
│       └── admin/         # 登录 / 退出 / 列表+复制 / 审核 / 快速上架 / 删除
├── migrations/
│   └── 0001_init.sql      # 建表脚本（在 D1 控制台执行）
└── README.md
```
