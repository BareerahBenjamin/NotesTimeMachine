/**
 * 社区功能 API - 基于 Cloudflare Workers + D1
 * 所有接口通过 REST API 调用后端 Worker，不再依赖 Supabase 客户端
 */
import { API_BASE } from '../config.js';

const COMMUNITY_API = `${API_BASE}/api/community`;

function getAuthHeaders() {
  const token = localStorage.getItem('community_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

async function request(url, options = {}) {
  try {
    const resp = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...options.headers },
      ...options,
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { error: data.error || `请求失败 (${resp.status})` };
    }
    return data;
  } catch (e) {
    console.error('Request error:', e);
    return { error: '网络错误，请检查连接' };
  }
}

// ==================== 认证相关（使用 Edge Functions）====================

export async function login(username, password) {
  return request(`${COMMUNITY_API}/login`, {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function register(username, password, nickname) {
  return request(`${COMMUNITY_API}/register`, {
    method: 'POST',
    body: JSON.stringify({ username, password, nickname }),
  });
}

export async function getCurrentUser() {
  const result = await request(`${COMMUNITY_API}/user`);
  if (result && !result.error) return result;
  return null;
}

// ==================== 分类相关 ====================

export async function getCategories() {
  const result = await request(`${COMMUNITY_API}/categories`);
  if (Array.isArray(result)) return result;
  if (result && !result.error && Array.isArray(result.data)) return result.data;
  console.warn('获取分类失败:', result?.error);
  return [];
}

// ==================== 帖子相关 ========================

export async function getPosts(categoryId = null, page = 1) {
  const params = new URLSearchParams({ page: String(page) });
  if (categoryId) params.set('category_id', String(categoryId));

  const result = await request(`${COMMUNITY_API}/posts?${params.toString()}`);

  if (result?.error) {
    console.error('Error fetching posts:', result.error);
    return { posts: [], total_pages: 0, page: 1 };
  }

  const posts = (result.posts || []).map((post) => ({
    id: post.id,
    title: post.title,
    content: post.content,
    category_id: post.category_id,
    category_name: post.category_name || '综合交流',
    category_color: post.category_color || '#8B3A2A',
    user_id: post.user_id,
    username: post.username || '用户',
    nickname: post.nickname,
    view_count: post.view_count || 0,
    like_count: post.like_count || 0,
    comment_count: post.comment_count || 0,
    created_at: post.created_at,
  }));

  return {
    posts,
    total_pages: result.total_pages || 0,
    total: result.total || 0,
    page,
  };
}

export async function getPost(postId) {
  const result = await request(`${COMMUNITY_API}/posts/${postId}`);
  if (result?.error) return { error: result.error };
  return {
    id: result.id,
    title: result.title,
    content: result.content,
    category_id: result.category_id,
    category_name: result.category_name || '综合交流',
    category_color: result.category_color || '#8B3A2A',
    user_id: result.user_id,
    username: result.username || '用户',
    nickname: result.nickname,
    view_count: result.view_count || 0,
    like_count: result.like_count || 0,
    comment_count: result.comment_count || 0,
    created_at: result.created_at,
    user_liked: result.user_liked ?? false,
  };
}

export async function createPost(title, content, categoryId) {
  const userInfo = getUserInfo();
  if (!userInfo) return { error: '请先登录' };

  const result = await request(`${COMMUNITY_API}/posts`, {
    method: 'POST',
    body: JSON.stringify({ title, content, category_id: categoryId }),
  });

  if (result?.error) {
    console.error('Error creating post:', result.error);
    return { error: result.error || '发布失败，请重试' };
  }

  return { success: true, post: result.post || { id: result.id } };
}

export async function deletePost(postId) {
  const result = await request(`${COMMUNITY_API}/posts/${postId}`, { method: 'DELETE' });
  if (result?.error) {
    console.error('Error deleting post:', result.error);
    return { error: result.error || '删除失败' };
  }
  return { success: true };
}

// ==================== 评论相关 ========================

export async function getComments(postId) {
  const result = await request(`${COMMUNITY_API}/posts/${postId}/comments`);
  if (result?.error) {
    console.error('Error fetching comments:', result.error);
    return [];
  }
  const list = Array.isArray(result) ? result : (result.data || []);
  return list.map((comment) => ({
    id: comment.id,
    post_id: comment.post_id,
    user_id: comment.user_id,
    username: comment.username || '用户',
    nickname: comment.nickname,
    content: comment.content,
    created_at: comment.created_at,
  }));
}

export async function addComment(postId, content) {
  const userInfo = getUserInfo();
  if (!userInfo) return { error: '请先登录' };

  const result = await request(`${COMMUNITY_API}/posts/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });

  if (result?.error) {
    console.error('Error adding comment:', result.error);
    return { error: result.error || '评论失败' };
  }
  return { success: true };
}

export async function deleteComment(commentId) {
  const result = await request(`${COMMUNITY_API}/comments/${commentId}`, { method: 'DELETE' });
  if (result?.error) {
    console.error('Error deleting comment:', result.error);
    return { error: result.error || '删除失败' };
  }
  return { success: true };
}

// ==================== 点赞相关 ========================

export async function toggleLike(postId) {
  const userInfo = getUserInfo();
  if (!userInfo) return { error: '请先登录' };

  const result = await request(`${COMMUNITY_API}/posts/${postId}/like`, { method: 'POST' });
  if (result?.error) {
    console.error('Error toggling like:', result.error);
    return { error: result.error || '操作失败' };
  }
  return { liked: result.liked ?? false };
}

// ==================== 会话管理 ========================

export function isLoggedIn() {
  return !!localStorage.getItem('community_token');
}

export function getUserInfo() {
  const token = localStorage.getItem('community_token');
  const userData = localStorage.getItem('community_user');
  if (token && userData) {
    try {
      return JSON.parse(userData);
    } catch {
      return null;
    }
  }
  return null;
}

export function setUserSession(token, user) {
  localStorage.setItem('community_token', token);
  localStorage.setItem('community_user', JSON.stringify(user));
}

export function clearUserSession() {
  localStorage.removeItem('community_token');
  localStorage.removeItem('community_user');
}

// ==================== 工具函数 ========================

export function formatTime(dateString) {
  if (!dateString) return '';

  let date;
  if (typeof dateString === 'number') {
    date = new Date(dateString);
  } else if (typeof dateString === 'string') {
    const naive = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/;
    const m = dateString.match(naive);
    if (m) {
      date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
    } else {
      date = new Date(dateString);
    }
  } else {
    date = new Date(dateString);
  }

  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (isNaN(diff)) return String(dateString);

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (diff < 0) return date.toLocaleString('zh-CN');
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;

  return date.toLocaleDateString('zh-CN');
}

export async function getUserProfile(userId) {
  const result = await request(`${COMMUNITY_API}/users/${encodeURIComponent(userId)}`);
  if (result?.error) return { error: result.error, detail: result.detail };
  return {
    user: result.user,
    stats: result.stats,
  };
}

export async function getUserPosts(userId, page = 1, perPage = 10) {
  const url = `${COMMUNITY_API}/users/${encodeURIComponent(userId)}/posts?page=${page}&per_page=${perPage}`;
  const result = await request(url);
  if (result?.error) return { error: result.error, detail: result.detail, posts: [], total: 0 };
  return { posts: result.posts || [], total: result.total || 0, page, perPage };
}

export async function getUserReadingProgress(userId) {
  const result = await request(`${COMMUNITY_API}/users/${encodeURIComponent(userId)}/reading-progress`);
  if (result?.error) return { error: result.error, detail: result.detail, progress: [] };
  return { progress: result.progress || [] };
}

export async function updateMyReadingProgress(payload) {
  if (!isLoggedIn()) return { error: '需要登录' };
  const result = await request(`${COMMUNITY_API}/me/reading-progress`, { method: 'POST', body: JSON.stringify(payload || {}) });
  if (result?.error) return { error: result.error, detail: result.detail };
  return { ok: !!result.ok, message: result.message };
}
