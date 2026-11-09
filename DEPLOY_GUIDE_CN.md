# 星河音浪榜：发布前检查清单

这份清单适合只用 Cloudflare 网页控制台操作的情况。

## GitHub 仓库要长这样

上传解压后的全部内容，仓库根目录中能直接看到：

- `public/index.html`
- `public/styles.css`
- `public/app.js`
- `functions/_lib.js`
- `functions/api/`
- `migrations/0001_init.sql`

不要把 `functions/` 塞进 `public/`，也不要只上传 `public/`。Pages Functions 的 `functions` 文件夹必须位于项目根目录。本项目刻意不附带 Wrangler 部署配置文件，这样 D1 绑定可以在 Pages 控制台里设置。

## Cloudflare 上的准确配置

**Pages 构建配置**

| 项目 | 填写内容 |
|---|---|
| 框架预设 | None / 无 |
| Build command | 留空 |
| Build output directory | `public` |

**D1 绑定**

| 项目 | 填写内容 |
|---|---|
| 绑定类型 | D1 database |
| 变量名称 / Binding name | `DB` |
| 数据库 | 你刚创建的 `xinghe-music-rank-db` |

**生产环境 Secrets（Settings → Variables and Secrets）**

| 名称 | 用途 |
|---|---|
| `ADMIN_PASSWORD` | 管理后台密码 |
| `ADMIN_SESSION_SECRET` | 签名后台会话 Cookie 的长随机密钥（≥ 32 字符） |

不要把秘密加在公开的 `vars`、HTML、JavaScript、SQL、网址参数或 GitHub 文件里。设置绑定和 Secret 后，需要重新部署一次。

## SQL 初始化

打开 `migrations/0001_init.sql`，全选复制，粘贴到 D1 数据库的 SQL Editor / Console 执行。执行成功后应存在 6 张表：`songs`、`vocadb_cache`、`votes`、`vote_usage`、`settings`、`rate_limits`。脚本会先废弃旧的投票/互动/用户/投稿表。

## WAF 速率限制（建议）

Pages 项目 → **安全性 → WAF → 速率限制规则**，新建规则：

- 匹配条件：`http.request.uri.path contains "/api/"`
- 速率：10 次 / 10 秒，计数特征选 **IP 地址**
- 操作：**Block**，拦截 10 秒

保存并部署。代码层 `_lib.js` 已内置同样的 10s / 10 次限流，WAF 是边缘层的双保险。

## 如何检查成功

1. 首页顶部状态应显示 **“实时数据已连接”**，而不是“预览模式”。
2. 在“提交歌曲”输入关键词，应出现 VocaDB 曲目卡片（自动标注 BV 号或“无B站源”）；选中带 BV 的曲目提交，后台“投稿审核”出现待处理项。
3. 在后台“投稿审核”点 **通过**，该歌曲进入收藏列表并可投票；点 **拒绝** 则不显示。
4. 投票后卡片票数与“今日剩余票数”同步变化；投到 15 票后该卡片投票按钮禁用。
5. 10 秒内连续请求 `/api/state` 超过 10 次，应出现“请求过于频繁”提示（429）。

如果首页一直显示“预览模式”，先检查 D1 绑定变量名是否严格为 `DB`，SQL 是否执行成功，并确认绑定/Secret 设置后**重新部署**过。
