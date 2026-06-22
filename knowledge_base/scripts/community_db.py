"""
社区功能数据库模型
使用SQLite数据库
"""
import sqlite3
from datetime import datetime
import hashlib
import jwt
import os
from functools import wraps
from flask import request, jsonify

DATABASE_PATH = os.path.join(os.path.dirname(__file__), '..', 'community.db')
SECRET_KEY = os.environ.get('SECRET_KEY', 'your-secret-key-change-in-production')

def get_db():
    """获取数据库连接"""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """初始化数据库表"""
    conn = get_db()
    cursor = conn.cursor()
    
    # 用户表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            nickname TEXT,
            avatar TEXT,
            bio TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # 分类表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            color TEXT DEFAULT '#8B3A2A'
        )
    ''')
    
    # 帖子表
    cursor.execute('''
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
        )
    ''')
    
    # 评论表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (post_id) REFERENCES posts(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')
    
    # 点赞表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS likes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(post_id, user_id),
            FOREIGN KEY (post_id) REFERENCES posts(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')
    
    # 插入默认分类
    default_categories = [
        ('读书心得', '分享阅读古籍的心得体会', '#2E5A4C'),
        ('作品讨论', '讨论具体作品的思想内涵', '#4A4A8A'),
        ('创作分享', '分享自己的诗词创作', '#8B3A2A'),
        ('提问求助', '关于古籍阅读的问题', '#6B4C8A'),
        ('综合交流', '其他相关话题', '#8A6A2A')
    ]
    
    cursor.executemany('''
        INSERT OR IGNORE INTO categories (name, description, color) 
        VALUES (?, ?, ?)
    ''', default_categories)
    
    conn.commit()
    conn.close()

# ==================== 用户认证相关 ====================

def hash_password(password):
    """密码哈希"""
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(password, password_hash):
    """验证密码"""
    return hash_password(password) == password_hash

def create_token(user_id):
    """创建JWT令牌"""
    return jwt.encode({'user_id': user_id}, SECRET_KEY, algorithm='HS256')

def decode_token(token):
    """解码JWT令牌"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
        return payload['user_id']
    except:
        return None

def auth_required(f):
    """认证装饰器"""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        if not token:
            return jsonify({'error': '需要登录'}), 401
        
        user_id = decode_token(token)
        if not user_id:
            return jsonify({'error': '无效的令牌'}), 401
        
        request.current_user_id = user_id
        return f(*args, **kwargs)
    return decorated

# ==================== 用户操作 ====================

def create_user(username, password, nickname=None):
    """创建新用户"""
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        password_hash = hash_password(password)
        cursor.execute('''
            INSERT INTO users (username, password_hash, nickname)
            VALUES (?, ?, ?)
        ''', (username, password_hash, nickname or username))
        
        user_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        return {'id': user_id, 'username': username, 'nickname': nickname or username}
    except sqlite3.IntegrityError:
        conn.close()
        return {'error': '用户名已存在'}

def authenticate_user(username, password):
    """用户登录验证"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM users WHERE username = ?', (username,))
    user = cursor.fetchone()
    conn.close()
    
    if user and verify_password(password, user['password_hash']):
        return {
            'id': user['id'],
            'username': user['username'],
            'nickname': user['nickname'],
            'token': create_token(user['id'])
        }
    
    return None

def get_user_by_id(user_id):
    """获取用户信息"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('SELECT id, username, nickname, avatar, bio, created_at FROM users WHERE id = ?', (user_id,))
    user = cursor.fetchone()
    conn.close()
    
    return dict(user) if user else None

# ==================== 分类操作 ====================

def get_all_categories():
    """获取所有分类"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM categories ORDER BY id')
    categories = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return categories

# ==================== 帖子操作 ====================

def create_post(user_id, title, content, category_id=None):
    """创建帖子"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT INTO posts (user_id, title, content, category_id)
        VALUES (?, ?, ?, ?)
    ''', (user_id, title, content, category_id))
    
    post_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return {'id': post_id}

def get_posts(category_id=None, page=1, per_page=20):
    """获取帖子列表"""
    conn = get_db()
    cursor = conn.cursor()
    
    offset = (page - 1) * per_page
    
    if category_id:
        cursor.execute('''
            SELECT p.*, u.username, u.nickname, c.name as category_name, c.color as category_color
            FROM posts p
            LEFT JOIN users u ON p.user_id = u.id
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.category_id = ?
            ORDER BY p.created_at DESC
            LIMIT ? OFFSET ?
        ''', (category_id, per_page, offset))
    else:
        cursor.execute('''
            SELECT p.*, u.username, u.nickname, c.name as category_name, c.color as category_color
            FROM posts p
            LEFT JOIN users u ON p.user_id = u.id
            LEFT JOIN categories c ON p.category_id = c.id
            ORDER BY p.created_at DESC
            LIMIT ? OFFSET ?
        ''', (per_page, offset))
    
    posts = [dict(row) for row in cursor.fetchall()]
    
    # 获取总数量
    if category_id:
        cursor.execute('SELECT COUNT(*) as count FROM posts WHERE category_id = ?', (category_id,))
    else:
        cursor.execute('SELECT COUNT(*) as count FROM posts')
    
    total = cursor.fetchone()['count']
    conn.close()
    
    return {
        'posts': posts,
        'total': total,
        'page': page,
        'per_page': per_page,
        'total_pages': (total + per_page - 1) // per_page
    }

def get_post_by_id(post_id):
    """获取单个帖子详情"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT p.*, u.username, u.nickname, c.name as category_name, c.color as category_color
        FROM posts p
        LEFT JOIN users u ON p.user_id = u.id
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.id = ?
    ''', (post_id,))
    
    post = cursor.fetchone()
    
    if post:
        # 增加浏览次数
        cursor.execute('UPDATE posts SET view_count = view_count + 1 WHERE id = ?', (post_id,))
        conn.commit()
        post = dict(post)
        post['view_count'] += 1
    else:
        conn.close()
        return None
    
    conn.close()
    return post

def delete_post(post_id, user_id):
    """删除帖子"""
    conn = get_db()
    cursor = conn.cursor()
    
    # 检查是否是帖子作者
    cursor.execute('SELECT user_id FROM posts WHERE id = ?', (post_id,))
    post = cursor.fetchone()
    
    if not post:
        conn.close()
        return {'error': '帖子不存在'}
    
    if post['user_id'] != user_id:
        conn.close()
        return {'error': '无权限删除'}
    
    # 删除相关评论和点赞
    cursor.execute('DELETE FROM comments WHERE post_id = ?', (post_id,))
    cursor.execute('DELETE FROM likes WHERE post_id = ?', (post_id,))
    cursor.execute('DELETE FROM posts WHERE id = ?', (post_id,))
    
    conn.commit()
    conn.close()
    
    return {'success': True}

# ==================== 评论操作 ====================

def add_comment(post_id, user_id, content):
    """添加评论"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT INTO comments (post_id, user_id, content)
        VALUES (?, ?, ?)
    ''', (post_id, user_id, content))
    
    comment_id = cursor.lastrowid
    
    # 更新评论数
    cursor.execute('UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?', (post_id,))
    
    conn.commit()
    conn.close()
    
    return {'id': comment_id}

def get_comments(post_id):
    """获取帖子的评论"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT c.*, u.username, u.nickname
        FROM comments c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.post_id = ?
        ORDER BY c.created_at ASC
    ''', (post_id,))
    
    comments = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return comments

def delete_comment(comment_id, user_id):
    """删除评论"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('SELECT user_id, post_id FROM comments WHERE id = ?', (comment_id,))
    comment = cursor.fetchone()
    
    if not comment:
        conn.close()
        return {'error': '评论不存在'}
    
    if comment['user_id'] != user_id:
        conn.close()
        return {'error': '无权限删除'}
    
    cursor.execute('DELETE FROM comments WHERE id = ?', (comment_id,))
    cursor.execute('UPDATE posts SET comment_count = comment_count - 1 WHERE id = ?', (comment['post_id'],))
    
    conn.commit()
    conn.close()
    
    return {'success': True}

# ==================== 点赞操作 ====================

def toggle_like(post_id, user_id):
    """切换点赞状态"""
    conn = get_db()
    cursor = conn.cursor()
    
    # 检查是否已经点赞
    cursor.execute('SELECT id FROM likes WHERE post_id = ? AND user_id = ?', (post_id, user_id))
    like = cursor.fetchone()
    
    if like:
        # 取消点赞
        cursor.execute('DELETE FROM likes WHERE post_id = ? AND user_id = ?', (post_id, user_id))
        cursor.execute('UPDATE posts SET like_count = like_count - 1 WHERE id = ?', (post_id,))
        conn.commit()
        conn.close()
        return {'liked': False}
    else:
        # 添加点赞
        cursor.execute('INSERT INTO likes (post_id, user_id) VALUES (?, ?)', (post_id, user_id))
        cursor.execute('UPDATE posts SET like_count = like_count + 1 WHERE id = ?', (post_id,))
        conn.commit()
        conn.close()
        return {'liked': True}

def check_user_liked(post_id, user_id):
    """检查用户是否点赞"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('SELECT id FROM likes WHERE post_id = ? AND user_id = ?', (post_id, user_id))
    liked = cursor.fetchone() is not None
    conn.close()
    
    return liked
