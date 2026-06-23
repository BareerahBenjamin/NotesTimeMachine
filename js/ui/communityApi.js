/**
 * 社区功能 API - 基于 Supabase
 */
import { API_BASE, SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

// Edge Functions API 基础地址
const COMMUNITY_API = `${API_BASE}/community`;

function getAuthHeaders() {
  const token = localStorage.getItem('community_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// 初始化 Supabase 客户端（用于直接数据库访问）
function getSupabase() {
  if (typeof window.supabase !== 'undefined') {
    return window.supabase;
  }
  // 如果还没加载，返回 null，后续会通过 window.supabaseClient 获取
  return window.supabaseClient || null;
}

// ==================== 认证相关（使用 Edge Functions）====================

export async function login(username, password) {
  try {
    const response = await fetch(`${COMMUNITY_API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    return await response.json();
  } catch (error) {
    console.error('Login error:', error);
    return { error: '登录失败，请检查网络连接' };
  }
}

export async function register(username, password, nickname) {
  try {
    const response = await fetch(`${COMMUNITY_API}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, nickname })
    });
    return await response.json();
  } catch (error) {
    console.error('Register error:', error);
    return { error: '注册失败，请检查网络连接' };
  }
}

export async function getCurrentUser() {
  try {
    const response = await fetch(`${COMMUNITY_API}/user`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Get current user error:', error);
    return null;
  }
}

// ==================== 分类相关（直接使用 Supabase）====================

export async function getCategories() {
  const supabase = getSupabase();
  if (!supabase) {
    console.warn('Supabase not initialized, falling back to API');
    return [];
  }
  
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name');
    
    if (error) {
      console.error('Error fetching categories:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error('Error fetching categories:', error);
    return [];
  }
}

// ==================== 帖子相关 ========================

export async function getPosts(categoryId = null, page = 1) {
  const supabase = getSupabase();
  const pageSize = 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  
  try {
    let query = supabase
      .from('posts')
      .select(`
        *,
        categories(name, color)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
    
    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }
    
    const { data, error, count } = await query;
    
    if (error) {
      console.error('Error fetching posts:', error);
      return { posts: [], total_pages: 0, page: 1 };
    }
    
    const posts = (data || []).map(post => ({
      id: post.id,
      title: post.title,
      content: post.content,
      category_id: post.category_id,
      category_name: post.categories?.name || '综合交流',
      category_color: post.categories?.color || '#8B3A2A',
      user_id: post.user_id,
      username: '用户',
      nickname: post.nickname,
      view_count: post.view_count || 0,
      like_count: post.like_count || 0,
      comment_count: post.comment_count || 0,
      created_at: post.created_at
    }));
    
    return {
      posts,
      total_pages: Math.ceil((count || 0) / pageSize),
      page
    };
  } catch (error) {
    console.error('Error fetching posts:', error);
    return { posts: [], total_pages: 0, page: 1 };
  }
}

export async function getPost(postId) {
  const supabase = getSupabase();
  
  try {
    // 获取帖子
    const { data: post, error } = await supabase
      .from('posts')
      .select(`
        *,
        categories(name, color)
      `)
      .eq('id', postId)
      .single();
    
    if (error || !post) {
      return { error: '帖子不存在' };
    }
    
    // 增加浏览数
    await supabase
      .from('posts')
      .update({ view_count: (post.view_count || 0) + 1 })
      .eq('id', postId);
    
    return {
      id: post.id,
      title: post.title,
      content: post.content,
      category_id: post.category_id,
      category_name: post.categories?.name || '综合交流',
      category_color: post.categories?.color || '#8B3A2A',
      user_id: post.user_id,
      username: '用户',
      nickname: post.nickname,
      view_count: (post.view_count || 0) + 1,
      like_count: post.like_count || 0,
      comment_count: post.comment_count || 0,
      created_at: post.created_at
    };
  } catch (error) {
    console.error('Error fetching post:', error);
    return { error: '加载失败' };
  }
}

export async function createPost(title, content, categoryId) {
  const supabase = getSupabase();
  const userInfo = getUserInfo();
  
  if (!userInfo) {
    return { error: '请先登录' };
  }
  
  try {
    const { data, error } = await supabase
      .from('posts')
      .insert({
        title,
        content,
        category_id: categoryId,
        user_id: userInfo.id,
        nickname: userInfo.nickname || userInfo.username,
        view_count: 0,
        like_count: 0,
        comment_count: 0
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error creating post:', error);
      return { error: '发布失败，请重试' };
    }
    
    return { success: true, post: data };
  } catch (error) {
    console.error('Error creating post:', error);
    return { error: '发布失败，请重试' };
  }
}

export async function deletePost(postId) {
  const supabase = getSupabase();
  
  try {
    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId);
    
    if (error) {
      console.error('Error deleting post:', error);
      return { error: '删除失败' };
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error deleting post:', error);
    return { error: '删除失败' };
  }
}

// ==================== 评论相关 ========================

export async function getComments(postId) {
  const supabase = getSupabase();
  
  try {
    const { data, error } = await supabase
      .from('comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('Error fetching comments:', error);
      return [];
    }
    
    return (data || []).map(comment => ({
      id: comment.id,
      post_id: comment.post_id,
      user_id: comment.user_id,
      username: '用户',
      nickname: comment.nickname,
      content: comment.content,
      created_at: comment.created_at
    }));
  } catch (error) {
    console.error('Error fetching comments:', error);
    return [];
  }
}

export async function addComment(postId, content) {
  const supabase = getSupabase();
  const userInfo = getUserInfo();
  
  if (!userInfo) {
    return { error: '请先登录' };
  }
  
  try {
    // 添加评论
    const { error: insertError } = await supabase
      .from('comments')
      .insert({
        post_id: postId,
        user_id: userInfo.id,
        nickname: userInfo.nickname || userInfo.username,
        content
      });
    
    if (insertError) {
      console.error('Error adding comment:', insertError);
      return { error: '评论失败' };
    }
    
    // 更新帖子评论数
    const { data: post } = await supabase
      .from('posts')
      .select('comment_count')
      .eq('id', postId)
      .single();
    
    if (post) {
      await supabase
        .from('posts')
        .update({ comment_count: (post.comment_count || 0) + 1 })
        .eq('id', postId);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error adding comment:', error);
    return { error: '评论失败' };
  }
}

export async function deleteComment(commentId) {
  const supabase = getSupabase();
  
  try {
    // 获取评论信息
    const { data: comment } = await supabase
      .from('comments')
      .select('post_id')
      .eq('id', commentId)
      .single();
    
    // 删除评论
    const { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', commentId);
    
    if (error) {
      console.error('Error deleting comment:', error);
      return { error: '删除失败' };
    }
    
    // 更新帖子评论数
    if (comment) {
      const { data: post } = await supabase
        .from('posts')
        .select('comment_count')
        .eq('id', comment.post_id)
        .single();
      
      if (post && post.comment_count > 0) {
        await supabase
          .from('posts')
          .update({ comment_count: post.comment_count - 1 })
          .eq('id', comment.post_id);
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error deleting comment:', error);
    return { error: '删除失败' };
  }
}

// ==================== 点赞相关 ========================

export async function toggleLike(postId) {
  const supabase = getSupabase();
  const userInfo = getUserInfo();
  
  if (!userInfo) {
    return { error: '请先登录' };
  }
  
  try {
    // 检查是否已点赞
    const { data: existingLike } = await supabase
      .from('likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userInfo.id)
      .single();
    
    let liked = false;
    
    if (existingLike) {
      // 取消点赞
      await supabase
        .from('likes')
        .delete()
        .eq('id', existingLike.id);
      
      // 减少点赞数
      const { data: post } = await supabase
        .from('posts')
        .select('like_count')
        .eq('id', postId)
        .single();
      
      if (post && post.like_count > 0) {
        await supabase
          .from('posts')
          .update({ like_count: post.like_count - 1 })
          .eq('id', postId);
      }
    } else {
      // 添加点赞
      await supabase
        .from('likes')
        .insert({
          post_id: postId,
          user_id: userInfo.id
        });
      
      // 增加点赞数
      const { data: post } = await supabase
        .from('posts')
        .select('like_count')
        .eq('id', postId)
        .single();
      
      if (post) {
        await supabase
          .from('posts')
          .update({ like_count: (post.like_count || 0) + 1 })
          .eq('id', postId);
      }
      
      liked = true;
    }
    
    return { liked };
  } catch (error) {
    console.error('Error toggling like:', error);
    return { error: '操作失败' };
  }
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
  
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  
  return date.toLocaleDateString('zh-CN');
}
