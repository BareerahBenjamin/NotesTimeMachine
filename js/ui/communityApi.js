/**
 * 社区功能 API
 */
import { API_BASE } from '../config.js';

const COMMUNITY_API = `${API_BASE}/api/community`;

function getAuthHeaders() {
  const token = localStorage.getItem('community_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

export async function login(username, password) {
  const response = await fetch(`${COMMUNITY_API}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  return await response.json();
}

export async function register(username, password, nickname) {
  const response = await fetch(`${COMMUNITY_API}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, nickname })
  });
  return await response.json();
}

export async function getCurrentUser() {
  const response = await fetch(`${COMMUNITY_API}/user`, {
    headers: getAuthHeaders()
  });
  if (!response.ok) return null;
  return await response.json();
}

export async function getCategories() {
  const response = await fetch(`${COMMUNITY_API}/categories`);
  return await response.json();
}

export async function getPosts(categoryId = null, page = 1) {
  let url = `${COMMUNITY_API}/posts?page=${page}`;
  if (categoryId) {
    url += `&category_id=${categoryId}`;
  }
  const response = await fetch(url);
  return await response.json();
}

export async function getPost(postId) {
  const response = await fetch(`${COMMUNITY_API}/posts/${postId}`, {
    headers: getAuthHeaders()
  });
  return await response.json();
}

export async function createPost(title, content, categoryId) {
  const response = await fetch(`${COMMUNITY_API}/posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({ title, content, category_id: categoryId })
  });
  return await response.json();
}

export async function deletePost(postId) {
  const response = await fetch(`${COMMUNITY_API}/posts/${postId}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  return await response.json();
}

export async function getComments(postId) {
  const response = await fetch(`${COMMUNITY_API}/posts/${postId}/comments`);
  return await response.json();
}

export async function addComment(postId, content) {
  const response = await fetch(`${COMMUNITY_API}/posts/${postId}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({ content })
  });
  return await response.json();
}

export async function deleteComment(commentId) {
  const response = await fetch(`${COMMUNITY_API}/comments/${commentId}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  return await response.json();
}

export async function toggleLike(postId) {
  const response = await fetch(`${COMMUNITY_API}/posts/${postId}/like`, {
    method: 'POST',
    headers: getAuthHeaders()
  });
  return await response.json();
}

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

export function formatTime(dateString) {
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
