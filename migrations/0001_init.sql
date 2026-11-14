-- ============================================================================
-- 星河音浪榜 · 精简版 v4 数据库迁移
-- 每周一清空 + 每日每IP限投1个 + 开发者审核上架 + 一键复制BV
-- 在 Cloudflare D1 控制台执行本文件全部内容。
-- ============================================================================

-- 1) 废弃旧表（v2/v3 的投票、互动、VocaDB 缓存、用户等）
DROP TABLE IF EXISTS interaction_events;
DROP TABLE IF EXISTS weekly_song_stats;
DROP TABLE IF EXISTS weekly_totals;
DROP TABLE IF EXISTS song_totals;
DROP TABLE IF EXISTS daily_usage;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS submissions;
DROP TABLE IF EXISTS votes;
DROP TABLE IF EXISTS vote_usage;
DROP TABLE IF EXISTS vocadb_cache;
DROP TABLE IF EXISTS songs;

-- ----------------------------------------------------------------------------
-- 2) 歌曲表（精简版：只存 BV号 / 作者名 / 视频名 / 状态 / 投稿IP / 投稿日）
--    每周一清空；只有 status='approved' 才会展示并被计入一键复制。
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS songs (
  id           TEXT PRIMARY KEY,                       -- 站内唯一 ID（UUID）
  bvid         TEXT NOT NULL,                          -- B 站视频 BV 号
  artist       TEXT NOT NULL DEFAULT '未知创作者',     -- 作者名
  title        TEXT NOT NULL,                          -- 视频名
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'approved', 'rejected')),
  submitter_ip TEXT,                                   -- 投稿者 IP
  day          TEXT,                                   -- 投稿当天（北京时间 YYYY-MM-DD）
  created_at   TEXT NOT NULL,
  reviewed_at  TEXT,
  reviewed_by  TEXT
);
CREATE INDEX IF NOT EXISTS idx_songs_status ON songs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_songs_ip_day ON songs(submitter_ip, day);

-- ----------------------------------------------------------------------------
-- 3) 设置表：站点名 / 限流参数 / 当前周（用于每周一清空）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO settings(key, value) VALUES ('site_name', '星河音浪榜');
INSERT OR IGNORE INTO settings(key, value) VALUES ('rate_limit_window_seconds', '10');
INSERT OR IGNORE INTO settings(key, value) VALUES ('rate_limit_max_requests', '10');
-- week_key 记录最近一次清空时的“本周一”日期；运行时由 ensureWeek 维护
INSERT OR IGNORE INTO settings(key, value) VALUES ('week_key', '');

-- ----------------------------------------------------------------------------
-- 4) API 频率限制表：每个 IP 每 10 秒最多 10 次（代码层限流）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limits (
  ip              TEXT PRIMARY KEY,
  request_count   INTEGER NOT NULL DEFAULT 0,
  last_request_at TEXT NOT NULL
);
