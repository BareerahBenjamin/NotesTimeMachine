"""
社区功能API路由
"""
from flask import Blueprint, request, jsonify
from functools import wraps

# 导入数据库模块（这里需要设置PYTHONPATH）
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from community_db import (
    init_db, create_user, authenticate_user, get_user_by_id,
    get_all_categories, create_post, get_posts, get_post_by_id, delete_post,
    add_comment, get_comments, delete_comment, toggle_like, check_user_liked,
    auth_required
)

community_bp = Blueprint('community', __name__, url_prefix='/api/community')

# 初始化数据库
init_db()

# ==================== 用户认证 ====================

@community_bp.route('/register', methods=['POST'])
def register():
    """用户注册"""
    data = request.get_json()
    username = data.get('username', '').strip()
    password = data.get('password', '')
    nickname = data.get('nickname', '').strip()
    
    if not username or not password:
        return jsonify({'error': '用户名和密码不能为空'}), 400
    
    if len(password) < 6:
        return jsonify({'error': '密码长度至少6位'}), 400
    
    result = create_user(username, password, nickname)
    
    if 'error' in result:
        return jsonify(result), 400
    
    return jsonify({
        'message': '注册成功',
        'user': result
    }), 201

@community_bp.route('/login', methods=['POST'])
def login():
    """用户登录"""
    data = request.get_json()
    username = data.get('username', '').strip()
    password = data.get('password', '')
    
    if not username or not password:
        return jsonify({'error': '用户名和密码不能为空'}), 400
    
    result = authenticate_user(username, password)
    
    if not result:
        return jsonify({'error': '用户名或密码错误'}), 401
    
    return jsonify({
        'message': '登录成功',
        'user': {
            'id': result['id'],
            'username': result['username'],
            'nickname': result['nickname']
        },
        'token': result['token']
    })

@community_bp.route('/user', methods=['GET'])
@auth_required
def get_current_user():
    """获取当前用户信息"""
    user = get_user_by_id(request.current_user_id)
    if not user:
        return jsonify({'error': '用户不存在'}), 404
    return jsonify(user)

# ==================== 分类 ====================

@community_bp.route('/categories', methods=['GET'])
def get_categories():
    """获取所有分类"""
    categories = get_all_categories()
    return jsonify(categories)

# ==================== 帖子 ====================

@community_bp.route('/posts', methods=['GET'])
def list_posts():
    """获取帖子列表"""
    category_id = request.args.get('category_id', type=int)
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    
    result = get_posts(category_id, page, per_page)
    return jsonify(result)

@community_bp.route('/posts', methods=['POST'])
@auth_required
def create_new_post():
    """创建帖子"""
    data = request.get_json()
    title = data.get('title', '').strip()
    content = data.get('content', '').strip()
    category_id = data.get('category_id')
    
    if not title or not content:
        return jsonify({'error': '标题和内容不能为空'}), 400
    
    if len(title) > 100:
        return jsonify({'error': '标题长度不能超过100字'}), 400
    
    if len(content) > 10000:
        return jsonify({'error': '内容长度不能超过10000字'}), 400
    
    result = create_post(request.current_user_id, title, content, category_id)
    return jsonify({
        'message': '发布成功',
        'post': result
    }), 201

@community_bp.route('/posts/<int:post_id>', methods=['GET'])
def get_post(post_id):
    """获取帖子详情"""
    post = get_post_by_id(post_id)
    if not post:
        return jsonify({'error': '帖子不存在'}), 404
    
    # 检查当前用户是否点赞
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    if token:
        from community_db import decode_token
        user_id = decode_token(token)
        if user_id:
            post['user_liked'] = check_user_liked(post_id, user_id)
        else:
            post['user_liked'] = False
    else:
        post['user_liked'] = False
    
    return jsonify(post)

@community_bp.route('/posts/<int:post_id>', methods=['DELETE'])
@auth_required
def remove_post(post_id):
    """删除帖子"""
    result = delete_post(post_id, request.current_user_id)
    if 'error' in result:
        return jsonify(result), 400
    return jsonify({'message': '删除成功'})

# ==================== 评论 ====================

@community_bp.route('/posts/<int:post_id>/comments', methods=['GET'])
def list_comments(post_id):
    """获取帖子评论"""
    comments = get_comments(post_id)
    return jsonify(comments)

@community_bp.route('/posts/<int:post_id>/comments', methods=['POST'])
@auth_required
def create_comment(post_id):
    """添加评论"""
    data = request.get_json()
    content = data.get('content', '').strip()
    
    if not content:
        return jsonify({'error': '评论内容不能为空'}), 400
    
    if len(content) > 1000:
        return jsonify({'error': '评论长度不能超过1000字'}), 400
    
    result = add_comment(post_id, request.current_user_id, content)
    return jsonify({
        'message': '评论成功',
        'comment': result
    }), 201

@community_bp.route('/comments/<int:comment_id>', methods=['DELETE'])
@auth_required
def remove_comment(comment_id):
    """删除评论"""
    result = delete_comment(comment_id, request.current_user_id)
    if 'error' in result:
        return jsonify(result), 400
    return jsonify({'message': '删除成功'})

# ==================== 点赞 ====================

@community_bp.route('/posts/<int:post_id>/like', methods=['POST'])
@auth_required
def like_post(post_id):
    """切换点赞状态"""
    result = toggle_like(post_id, request.current_user_id)
    return jsonify(result)
