# 星河音浪榜 · 精简版：发布前检查清单

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
| `ADMIN_PASSWORD` | 开发者模式登录密码 |
| `ADMIN_SESSION_SECRET` | 签名开发者会话 Cookie 的长随机密钥（≥ 32 字符） |

不要把秘密加在公开的 `vars`、HTML、JavaScript、SQL、网址参数或 GitHub 文件里。设置绑定和 Secret 后，需要重新部署一次。

## SQL 初始化

打开 `migrations/0001_init.sql`，全选复制，粘贴到 D1 数据库的 SQL Editor / Console 执行。执行成功后应存在 3 张表：`songs`、`settings`、`rate_limits`。脚本会先废弃旧的投票 / 互动 / 用户 / 投稿 / VocaDB 缓存表。

## WAF 速率限制（建议）

Pages 项目 → **安全性 → WAF → 速率限制规则**，新建规则：

- 匹配条件：`http.request.uri.path contains "/api/"`
- 速率：10 次 / 10 秒，计数特征选 **IP 地址**
- 操作：**Block**，拦截 10 秒

保存并部署。代码层 `_lib.js` 已内置同样的 10s / 10 次限流，WAF 是边缘层的双保险。

## 如何检查成功

1. 首页顶部状态应显示 **“实时数据已连接”**，而不是“预览模式”。
2. 填 BV 号 / 作者名 / 视频名提交，应提示“已提交，等待审核”；再提交一次应提示“今天已经投过 1 个”。
3. 用 `ADMIN_PASSWORD` 进入开发者模式，在“投稿审核”点 **通过**，作品应出现在本周榜单；点 **拒绝** 则不显示。
4. 开发者“总览”里点 **一键复制全部 BV 号**，剪贴板得到所有已上架作品的 BV 号（逗号分隔），不含待审核 / 已拒绝。
5. 10 秒内连续请求 `/api/state` 超过 10 次，应出现“请求过于频繁”提示（429）。

如果首页一直显示“预览模式”，先检查 D1 绑定变量名是否严格为 `DB`，SQL 是否执行成功，并确认绑定/Secret 设置后**重新部署**过。
