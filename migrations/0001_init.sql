-- ============================================================================
-- 星河音浪榜 · D1 数据库初始化 / 迁移脚本（v3：纯票数投票 + 审核）
-- 说明：
--   1) 本脚本会【废弃旧的投票/互动/用户/投稿表】并重建全新结构。
--      在已有数据库上执行时旧数据会被清空，请先确认无需保留。
--   2) 在 Cloudflare 控制台 D1 数据库的 Console / SQL Editor 中全量执行本文件。
--   3) 全部表均使用 IF NOT EXISTS / IF EXISTS，可重复执行。
-- 规则：
--   每人每天 30 票（vote_usage 记录总数），对同一作品每天最多投 15 票（votes 表控制）。
--   用户提交的歌曲先进 pending 审核，管理员通过后才进入收藏列表（approved）。
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------------
-- 1) 废弃旧表（不存在则忽略）
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS interaction_events;
DROP TABLE IF EXISTS weekly_song_stats;
DROP TABLE IF EXISTS weekly_totals;
DROP TABLE IF EXISTS song_totals;
DROP TABLE IF EXISTS daily_usage;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS submissions;
DROP TABLE IF EXISTS votes;
DROP TABLE IF EXISTS vote_usage;
DROP TABLE IF EXISTS songs;
DROP TABLE IF EXISTS vocadb_cache;

-- ----------------------------------------------------------------------------
-- 2) songs 表：收录曲目 + B 站播放源 + 审核状态 + 票数
--    status：pending（待审核）/ approved（已通过，进入收藏并可投票）/ rejected（已拒绝）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS songs (
  id          TEXT PRIMARY KEY,                       -- 站内唯一 ID（UUID）
  title       TEXT NOT NULL,                          -- 歌名
  artist      TEXT NOT NULL DEFAULT '未知创作者',     -- 歌手 / 创作者
  cover_url   TEXT NOT NULL DEFAULT '',               -- 封面图 URL（自动来自 VocaDB）
  bvid        TEXT NOT NULL DEFAULT '',               -- B 站视频 BV 号（自动来自 VocaDB PV）
  bili_url    TEXT NOT NULL DEFAULT '',               -- B 站完整播放链接（自动）
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','approved','rejected')),  -- 审核状态
  votes       INTEGER NOT NULL DEFAULT 0,             -- 累计票数（仅 approved 参与）
  created_at  TEXT NOT NULL,                          -- 提交时间
  reviewed_at TEXT,                                   -- 审核时间
  reviewed_by TEXT                                    -- 审核人
);
CREATE INDEX IF NOT EXISTS idx_songs_status ON songs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_songs_votes ON songs(votes DESC);

-- ----------------------------------------------------------------------------
-- 3) VocaDB 搜索结果缓存表（含自动提取的 B 站 BV / 链接）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vocadb_cache (
  id         TEXT PRIMARY KEY,                        -- VocaDB 歌曲 ID
  title      TEXT NOT NULL,                           -- 歌名
  artist     TEXT NOT NULL DEFAULT '',                -- 歌手 / 创作者
  cover_url  TEXT NOT NULL DEFAULT '',                -- 封面缩略图
  bvid       TEXT NOT NULL DEFAULT '',                -- 自动提取的 B 站 BV 号（无则空）
  bili_url   TEXT NOT NULL DEFAULT '',                -- 自动提取的 B 站链接
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vocadb_title ON vocadb_cache(title);

-- ----------------------------------------------------------------------------
-- 4) 投票明细表：记录每个访客每天对每首歌投了多少票
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS votes (
  id         TEXT PRIMARY KEY,                        -- UUID
  visitor_id TEXT NOT NULL,                           -- 匿名访客 ID（Cookie）
  song_id    TEXT NOT NULL,                           -- 歌曲 ID
  day        TEXT NOT NULL,                           -- 北京时间日期（YYYY-MM-DD）
  amount     INTEGER NOT NULL,                        -- 本次票数（1~15）
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_votes_visitor_day ON votes(visitor_id, day);
CREATE INDEX IF NOT EXISTS idx_votes_song_visitor_day ON votes(song_id, visitor_id, day);

-- ----------------------------------------------------------------------------
-- 5) 每人每日总票数使用量（30 票/天上限，原子扣减）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vote_usage (
  visitor_id TEXT NOT NULL,
  day        TEXT NOT NULL,
  total_used INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (visitor_id, day)
);

-- ----------------------------------------------------------------------------
-- 6) 站点设置表
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT OR IGNORE INTO settings(key, value) VALUES ('site_name', '星河音浪榜');
INSERT OR IGNORE INTO settings(key, value) VALUES ('daily_votes', '30');
INSERT OR IGNORE INTO settings(key, value) VALUES ('song_vote_cap', '15');
INSERT OR IGNORE INTO settings(key, value) VALUES ('rate_limit_window_seconds', '10');
INSERT OR IGNORE INTO settings(key, value) VALUES ('rate_limit_max_requests', '10');

-- ----------------------------------------------------------------------------
-- 7) API 频率限制表：每个 IP 每 10 秒最多 10 次（代码层限流）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limits (
  ip              TEXT PRIMARY KEY,
  request_count   INTEGER NOT NULL DEFAULT 0,
  last_request_at TEXT NOT NULL
);
