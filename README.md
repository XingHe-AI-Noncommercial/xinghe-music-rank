# 星河音浪榜（Cloudflare Pages + Functions + D1）

一个不依赖第三方前端库、**不使用 R2、不上传任何音频文件**的 B 站音乐收藏与投票榜单。静态资源在 `public/`，后端 API 在 `functions/`，数据库建表脚本在 `migrations/0001_init.sql`。暗黑星河主题 UI，适配电脑与手机。

## 核心限制（务必遵守）

1. **绝对不使用 R2，不使用付费服务，不允许上传音频文件。** 页面与后端都不会接收、保存或托管任何音频；播放完全依赖 B 站视频。
2. **播放源只依赖 B 站视频（BV 号 + 链接）。** 每首歌自动从 VocaDB 匹配一个 B 站 BV 号与链接，点击卡片即跳转原视频播放。
3. **所有 API 请求严格限流：每个 IP 每 10 秒最多 10 次。** 代码层用 D1 `rate_limits` 表实现；同时建议在 Cloudflare WAF 配置同规则的速率限制（见下文部署步骤 5）。

## 投票与审核规则

- **纯票数排名**：收藏列表按累计票数排序，无任何加权。
- **每人每天 30 票**：匿名访客（Cookie 识别）每天共有 30 票可分配，北京时间 00:00 重置。
- **单曲每日上限 15 票**：同一天对同一首歌最多投 15 票，防止单曲刷分。
- **提交需审核**：用户提交的歌曲先进 `pending`，管理员通过（`approved`）后才进入收藏列表并可投票；拒绝则不显示。
- **封面 / BV 自动拉取**：搜索选中 VocaDB 曲目后，封面图与 B 站 BV/链接由系统自动匹配，无需手动填写。若某曲目没有可用的 B 站视频源，则标记“无B站源”，不可收录。

## 目前包含的功能

- 首页展示已审核通过的收藏列表卡片：封面、歌名、歌手、累计票数，点击卡片跳转 B 站原视频播放；卡片右侧可直接投票。
- “提交歌曲”区域：输入关键词后 **500ms 防抖** 搜索 VocaDB 曲库，展示曲目卡片（自动标注 BV 号或“无B站源”）；选中后弹出确认框，封面与 BV/链接自动带出，点击“提交审核”即进入待审核队列。
- 顶部显示“今日剩余票数 / 30”；每张卡片显示“今日已投 X 票 / 单曲上限 15”，用完后自动禁用。
- 搜索先用 D1 `vocadb_cache` 缓存，未命中才请求 VocaDB 公开 API（带 User-Agent，`fields=PVs,MainPicture` 自动提取封面与 B 站 BV），并把结果写回缓存。
- 管理后台（`ADMIN_PASSWORD` 登录）：总览、**投稿审核**（通过/拒绝）、歌曲管理（删除）、**批量导入**（`.json` / `.txt`，TXT 每行 `歌名,歌手,封面URL,BV号,B站链接`，管理员导入直接通过）。
- 每个 API 都做了 10 秒 / 10 次的 IP 限流，超限返回 HTTP 429。

## 免费部署前提

项目不使用 R2、不要求添加信用卡。Cloudflare 免费额度仍有每日请求、D1 读写行数等限制；达到免费限额后数据库请求可能暂时失败，额度重置后恢复。官方当前列出的 Workers Free 限制包括每天 100,000 次 Pages Functions 请求；D1 Free 包含每天 500 万行读取、每天 10 万行写入和总计 5 GB 存储。请以官方页面为准：

- Pages Functions 价格与免费请求额度：<https://developers.cloudflare.com/pages/functions/pricing/>
- D1 价格与免费额度：<https://developers.cloudflare.com/d1/platform/pricing/>

注意：Cloudflare Pages 的网页控制台 **Direct Upload 当前不支持带 Functions 的项目**。请使用 Git 连接部署，或用 Wrangler CLI；不能只把 `public/` 单独上传当成完整项目。说明见 <https://developers.cloudflare.com/pages/functions/get-started/>。

---

## 部署步骤（全部在 Cloudflare 网页后台完成）

> 以下 4 步（建表、环境变量、WAF 限流、重新部署）都不属于网站代码，**必须**手动去 Cloudflare 控制台操作，代码里无法替你完成。

### 1. 上传项目到 GitHub

1. 解压本项目 ZIP，将整个 `xinghe-music-rank` 目录内的文件上传到你自己的 GitHub 仓库，确保 `public/`、`functions/`、`migrations/` 三个目录都在仓库根目录。
2. 上传的是解压后的项目文件，不要只上传 ZIP 文件本身。
3. 仓库不需要安装前端依赖，也不需要运行打包命令（框架预设选 **None / 无**）。

### 2. 创建 D1 数据库并建表（控制台执行 SQL）

1. 打开 Cloudflare 控制台，进入 **Workers & Pages → D1**，新建数据库，名称可用 `xinghe-music-rank-db`。
2. 打开该数据库的 **Console / SQL Editor**。
3. 打开本项目 `migrations/0001_init.sql`，**把文件全部内容复制粘贴到 SQL 编辑器并执行（Run）**。
   - 脚本会先 `DROP` 掉旧的投票、互动、用户、投稿表，再重建 `songs` 表，并新建 `vocadb_cache`、`votes`、`vote_usage`、`settings`、`rate_limits` 表。
   - 在**已有数据库**上执行会清空旧数据，请先确认无需保留；全新数据库则直接建好。
4. 执行成功后应能看到 6 张表：`songs`、`vocadb_cache`、`votes`、`vote_usage`、`settings`、`rate_limits`。确认无误后，不要删除数据库。

### 3. 创建 Pages 项目并绑定 D1

1. Cloudflare 控制台进入 **Workers & Pages → Create → Pages → Connect to Git**，选择刚上传的 GitHub 仓库。
2. 框架预设选 **None / 无框架**；Build command 留空；**Build output directory 填 `public`**。
3. 保存并部署。第一次部署时，即使数据库还没连上，页面也会显示本地预览数据（顶部状态为“预览模式”）。
4. 进入刚创建的 Pages 项目，打开 **Settings → Bindings**，添加一个 **D1 database** 类型绑定：
   - **变量名称 / Binding name：`DB`**（必须严格为 `DB`）
   - 数据库：选择第 2 步创建的 `xinghe-music-rank-db`
   - 保存设置。

### 4. 配置环境变量 / Secrets（Settings → Variables and Secrets）

进入 **Settings → Variables and Secrets**（部分界面叫 *Environment variables*），在 **Production** 环境添加以下两个 **Secret（加密变量）**：

| 变量名 | 用途 | 说明 |
|---|---|---|
| `ADMIN_PASSWORD` | 管理后台登录密码 | 你自己设置，例如一串强密码 |
| `ADMIN_SESSION_SECRET` | 后台会话签名密钥 | 建议 ≥ 32 个随机字符，用于给登录 Cookie 签名 |

- 不要添加与限流相关的变量，代码里已固定为 **10 秒 / 10 次**（可用 `enforceRateLimit(env, request, { limit, windowSeconds })` 覆盖，默认 10/10）。
- **不要把这两个值写进 `public/app.js`、HTML、GitHub 仓库、网址或提交到代码里。** 它们只通过 HTTPS 的登录请求提交到 Function，由服务端环境变量验证。
- 后台密码不是 URL 参数，也不会发送到网址；登录成功后使用 HttpOnly、Secure、SameSite Cookie 保存会话。

### 5. 配置 Cloudflare WAF 速率限制（重要，双保险）

代码层已经用 `rate_limits` 表做了“每 IP 每 10 秒 10 次”的限流，但建议你在 Cloudflare **WAF** 再加一条同规则，把超限请求直接在边缘拦截，进一步保护 Function 与 VocaDB：

1. 进入 Pages 项目 → **安全性（Security）→ WAF → 速率限制规则（Rate limiting rules）**。
2. 点击 **Create rule / 创建规则**，填写：
   - **规则名称**：`星河 API 限流`（可自定义）。
   - **匹配条件（Expression）**：`http.request.uri.path contains "/api/"`（即命中所有 `/api/*` 接口）。
   - **速率（Rate / 计数特征）**：请求数 `10`，周期 `10 秒`；**计数特征选择 `IP 地址`**（Cloudflare 默认按请求来源 IP 统计）。
   - **操作（Action）**：`Block`（拦截），拦截时长建议 `10 秒`（与周期一致）。
3. **保存并部署（Deploy）** 该规则。
4. 说明：WAF 免费版通常允许少量速率限制规则，若提示配额不足，至少保留代码层限流（本项目的 `_lib.js` 已内置）。规则表达式按你的站点域名生效，作用于 `/api/*` 下的所有接口。

### 6. 重新部署（必须“重试部署”才生效）

**修改环境变量、绑定或 WAF 规则后，必须让改动生效：**

1. 进入 Pages 项目 → **Deployments（部署）**。
2. 点击最近一次部署右侧的 **⋯ → Retry deployment（重试部署）**，或点击 **Create deployment / 触发新部署**。
3. 等待新部署状态变为 **Active（成功）**。
4. 说明：仅“保存设置”而**不重新部署**，Function 可能仍读不到新的环境变量或 D1 绑定；WAF 规则保存后一般即时生效，但保险起见也建议重新部署一次。

### 7. 首次验证

1. 打开 Pages 提供的 `*.pages.dev` 地址，顶部状态应从“预览模式”变成 **“实时数据已连接”**。
2. 在“提交歌曲”里搜索关键词（如 `初音`），应出现 VocaDB 曲目卡片，自动标注 BV 号或“无B站源”；选中带 BV 的曲目提交，后台“投稿审核”应出现待处理项。
3. 在管理后台“投稿审核”点 **通过**，该歌曲应出现在收藏列表，可投票；点 **拒绝** 则不显示。
4. 为某首歌投票，卡片票数与“今日剩余票数”应同步变化；投到 15 票后该卡片投票按钮应禁用。
5. 连续快速请求 `/api/state` 超过 10 次 / 10 秒，应返回 HTTP 429 与“请求过于频繁”提示（验证限流）。

---

## API 一览

| 方法 | 路径 | 说明 | 限流 |
|---|---|---|---|
| GET | `/api/state` | 已审核歌曲（按票数排序）+ 统计 + 今日投票额度 | 10s / 10 次 |
| GET | `/api/search?q=` | 搜索 VocaDB（先查 `vocadb_cache`，自动提取封面与 BV） | 10s / 10 次 |
| POST | `/api/submit` | 提交歌曲【待审核】，`title/artist/coverUrl/bvid/biliUrl` 由前端自动带出 | 10s / 10 次 |
| POST | `/api/vote` | 投票 `{ songId, amount }`（1~15），每人每日 30 票、单曲每日 15 票 | 10s / 10 次 |
| POST | `/api/admin/login` | 管理员登录 | 10s / 10 次 |
| POST | `/api/admin/logout` | 退出登录 | 10s / 10 次 |
| GET | `/api/admin/state` | 全部歌曲 + 待审核列表 + 统计（需登录） | 10s / 10 次 |
| POST | `/api/admin/submissions/:id` | 审核投稿 `{ action: 'approve' \| 'reject' }`（需登录） | 10s / 10 次 |
| POST | `/api/admin/songs` | 后台单条添加（直接通过，需登录） | 10s / 10 次 |
| DELETE | `/api/admin/songs/:id` | 删除歌曲（需登录） | 10s / 10 次 |
| POST | `/api/admin/import` | 批量导入 `.json` / `.txt`（直接通过，需登录，单次最多 200 条） | 10s / 10 次 |

### 批量导入格式

**JSON**（数组，或 `{ "songs": [...] }`）：

```json
[
  { "title": "歌名", "artist": "歌手", "coverUrl": "https://…", "bvid": "BV1xx411c7mD", "biliUrl": "https://www.bilibili.com/video/BV1xx411c7mD" }
]
```

**TXT**（每行 `歌名,歌手,封面URL,BV号,B站链接`，歌名可含逗号，`#` 开头为注释）：

```text
歌名,歌手,封面URL,BV号,B站链接
玻璃海的来信,Luna / 虚构企划,,BV1xx411c7mD,https://www.bilibili.com/video/BV1xx411c7mD
```

## 数据与说明

- 不需要用户注册，也**不保存任何音频**。页面只存文本元数据（歌名、歌手、封面 URL、BV 号、B 站链接、状态、票数）到 D1。
- 封面图 URL、BV 号、B 站链接来自 VocaDB 自动匹配；若封面为空或加载失败，前端显示星河渐变占位图。
- 同一 BV 号在 `songs` 表中只允许一条（去重，含待审核）；删除歌曲会连同其投票记录一起清除。
- 投票限制：匿名访客用 HttpOnly Cookie（`xh_vid`）识别；每日总额（30 票）用 `vote_usage` 表原子扣减，单曲每日（15 票）用 `votes` 表汇总校验；按北京时间 00:00 重置。
- API 限流基于 `CF-Connecting-IP`（Cloudflare 真实 IP），无该头时回退 `X-Forwarded-For` / `X-Real-IP`。限流记录存在 D1 `rate_limits` 表，10 秒滚动窗口计数。
- 若后端尚未连接，主页显示明确标注的本地预览数据；预览数据不会写进数据库，也不能调用 VocaDB 或投票。

## 项目结构

```text
xinghe-music-rank/
├── public/
│   ├── index.html         # 页面结构（VocaDB 搜索、收藏卡片、投票控件、管理后台）
│   ├── styles.css         # 暗黑星河主题样式
│   ├── app.js             # 前端逻辑（500ms 防抖、VocaDB 选中、投票、后台审核）
│   ├── _headers
│   └── _routes.json       # 仅 /api/* 走 Functions
├── functions/
│   ├── _lib.js            # 工具：JSON、访客Cookie、10s/10 限流、BV 规范化、曲目插入、管理员会话
│   └── api/
│       ├── state.js       # GET  已审核歌曲 + 统计 + 今日额度
│       ├── search.js      # GET  VocaDB 搜索（缓存优先，自动提取封面与 BV）
│       ├── submit.js      # POST 提交【待审核】
│       ├── vote.js        # POST 投票（30/日，单曲15/日）
│       └── admin/         # 登录 / 退出 / 列表 / 审核 / 增删 / 批量导入
├── migrations/
│   └── 0001_init.sql      # 建表脚本（在 D1 控制台执行）
└── README.md
```
