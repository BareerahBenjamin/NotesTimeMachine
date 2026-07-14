-- ============================================================
-- 注疏时光机社区功能 - D1 数据库初始化 Schema
-- 与 SQLite 版 community_db.py 结构保持一致
-- 执行方式：wrangler d1 execute zhushu-community --remote --file ./schema.sql
-- ============================================================

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    nickname TEXT,
    avatar TEXT,
    bio TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 分类表
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#8B3A2A'
);

-- 帖子表
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    category_id INTEGER,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    view_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- 评论表
CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    nickname TEXT,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 点赞表
CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(post_id, user_id),
    FOREIGN KEY (post_id) REFERENCES posts(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ============================================================
-- 索引优化（D1 / SQLite 均支持）
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category_id);
CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_likes_post_user ON likes(post_id, user_id);

-- ============================================================
-- 插入默认分类
-- ============================================================
INSERT OR IGNORE INTO categories (name, description, color) VALUES ('读书心得', '分享阅读古籍的心得体会', '#2E5A4C');
INSERT OR IGNORE INTO categories (name, description, color) VALUES ('作品讨论', '讨论具体作品的思想内涵', '#4A4A8A');
INSERT OR IGNORE INTO categories (name, description, color) VALUES ('创作分享', '分享自己的诗词创作', '#8B3A2A');
INSERT OR IGNORE INTO categories (name, description, color) VALUES ('提问求助', '关于古籍阅读的问题', '#6B4C8A');
INSERT OR IGNORE INTO categories (name, description, color) VALUES ('综合交流', '其他相关话题', '#8A6A2A');

-- ============================================================
-- 读书进度表（每用户 × 每本书 一条记录）
-- ============================================================
CREATE TABLE IF NOT EXISTS reading_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    classic_id TEXT NOT NULL,
    chapter_index INTEGER NOT NULL DEFAULT 0,
    paragraph_id TEXT,
    progress_pct REAL NOT NULL DEFAULT 0,
    last_read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, classic_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_reading_progress_user ON reading_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_reading_progress_last ON reading_progress(last_read_at DESC);
