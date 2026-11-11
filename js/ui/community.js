/**
 * 社区功能组件
 */
import * as communityApi from './communityApi.js';
import { navigateTo } from '../state.js';
import { scrollBehavior } from '../motion/index.js';

let currentCategoryId = null;
let currentPage = 1;
let categories = [];
let posts = [];
let currentPost = null;
let initialized = false;
let listVersion = 0;
let detailVersion = 0;
let pageVersion = 0;

// 渲染社区页面
export async function renderCommunityPage() {
  const version = ++pageVersion; ++detailVersion; ++listVersion;
  const container = document.getElementById('communityContent');
  if (!container) {
    console.error('communityContent container not found');
    return;
  }

  // 先创建完整的HTML结构
  container.innerHTML = `
    <div class="community-container">
      <div class="category-filter" id="categoryFilter">
        <button class="category-btn ${currentCategoryId == null ? 'active' : ''}" data-category="">全部</button>
        <div class="loading" style="padding: 0 16px;">加载分类...</div>
      </div>
      <button class="create-post-btn" id="createPostBtn" style="display: none;">
        <span>+</span> 发布话题
      </button>
      <div class="post-list" id="postList">
        <div class="loading">加载帖子中...</div>
      </div>
      <div class="pagination" id="pagination"></div>
    </div>
  `;

  try {
    // 加载分类
    await loadCategories();

    if (version !== pageVersion) return;
    // 加载帖子
    await loadPosts();
    if (version !== pageVersion) return;

    // 绑定事件
    bindCommunityEvents();
  } catch (error) {
    console.error('加载社区页面失败:', error);
    container.innerHTML = `
      <div class="community-container">
        <div class="empty-state">
          <div class="empty-state-text">加载失败，请刷新页面重试</div>
          <div style="font-size: var(--text-small); color: var(--muted); margin-top: 8px;">${error.message}</div>
        </div>
      </div>
    `;
  }
}

// 加载分类
async function loadCategories() {
  try {
    categories = await communityApi.getCategories();
    const filterContainer = document.getElementById('categoryFilter');
    
    const categoryBtns = categories.map(cat => `
      <button class="category-btn ${Number(currentCategoryId) === Number(cat.id) ? 'active' : ''}" data-category="${cat.id}" style="border-color: ${cat.color}">${cat.name}</button>
    `).join('');
    
    filterContainer.innerHTML = `
      <button class="category-btn ${currentCategoryId == null ? 'active' : ''}" data-category="">全部</button>
      ${categoryBtns}
    `;
  } catch (error) {
    const container = document.getElementById('categoryFilter');
    if (container) container.innerHTML = '<button class="category-btn" data-category="">全部</button><span role="status">分类加载失败，请重试。</span>';
  }
}

// 加载帖子
async function loadPosts(page = 1) {
  const version = ++listVersion;
  currentPage = page;
  const postList = document.getElementById('postList');
  
  postList.innerHTML = '<div class="loading">加载中...</div>';

  try {
    const result = await communityApi.getPosts(currentCategoryId, page);
    if (version !== listVersion || !postList.isConnected) return;
    if (result.error) throw new Error(result.error);
    posts = result.posts || [];
    
    if (posts.length === 0) {
      postList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-text">还没有帖子，来说点什么吧</div>
        </div>
      `;
      document.getElementById('pagination').innerHTML = '';
      return;
    }

    postList.innerHTML = posts.map(post => `
      <div class="post-card" role="group" data-post-id="${post.id}">
        <div class="post-header">
          <span class="post-category" style="background-color: ${post.category_color || '#8B3A2A'}">${post.category_name || '综合交流'}</span>
          <button class="post-author" data-user-id="${post.user_id || ''}" title="查看个人主页">${escapeHtml(post.nickname || post.username)}</button>
          <span class="post-time">${communityApi.formatTime(post.created_at)}</span>
        </div>
        <h3 class="post-title"><button class="post-open">${escapeHtml(post.title)}</button></h3>
        <p class="post-preview">${escapeHtml(post.content)}</p>
        <div class="post-stats">
          <span class="post-stat">阅读 ${post.view_count || 0}</span>
          <span class="post-stat">评论 ${post.comment_count || 0}</span>
          <span class="post-stat">点赞 ${post.like_count || 0}</span>
        </div>
      </div>
    `).join('');

    // 渲染分页
    renderPagination(result);
  } catch (error) {
    console.error('加载帖子失败:', error);
    postList.innerHTML = '<div class="empty-state" role="status">加载失败，请检查网络后重试。<button class="btn btn-secondary" data-action="retryCommunity">重新加载社区</button></div>';
  }
}

// 渲染分页
function renderPagination(result) {
  const pagination = document.getElementById('pagination');
  if (result.total_pages <= 1) {
    pagination.innerHTML = '';
    return;
  }

  let html = '';
  for (let i = 1; i <= result.total_pages; i++) {
    html += `<button class="page-btn ${i === result.page ? 'active' : ''}" data-page="${i}">${i}</button>`;
  }
  pagination.innerHTML = html;
}

// 渲染发帖/编辑表单
function renderPostForm() {
  const modal = document.getElementById('postModal') || createModal('postModal');
  modal.classList.add('visible');
  
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">发布话题</h2>
        <button class="modal-close" data-action="closePostModal">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">分类</label>
          <select class="form-select" id="postCategory" aria-label="话题分类">
            ${categories.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">标题</label>
          <input type="text" class="form-input" id="postTitle" aria-label="话题标题" placeholder="请输入标题" maxlength="100">
        </div>
        <div class="form-group">
          <label class="form-label">内容</label>
          <textarea class="form-textarea" id="postContent" aria-label="话题内容" placeholder="请输入内容" maxlength="10000"></textarea>
        </div>
        <div class="form-error" id="postError" style="display: none;"></div>
      </div>
      <div class="modal-footer">
        <button class="btn-cancel" data-action="closePostModal">取消</button>
        <button class="btn-submit" id="submitPost">发布</button>
      </div>
    </div>
  `;

  document.getElementById('submitPost').addEventListener('click', submitPost);
}

// 提交帖子
async function submitPost() {
  const title = document.getElementById('postTitle').value.trim();
  const content = document.getElementById('postContent').value.trim();
  const categoryId = document.getElementById('postCategory').value;
  const errorEl = document.getElementById('postError');
  const submitBtn = document.getElementById('submitPost');

  if (!title) {
    errorEl.textContent = '请输入标题';
    errorEl.style.display = 'block';
    return;
  }

  if (!content) {
    errorEl.textContent = '请输入内容';
    errorEl.style.display = 'block';
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = '发布中...';

  try {
    const result = await communityApi.createPost(title, content, categoryId || null);
    
    if (result.error) {
      errorEl.textContent = result.error;
      errorEl.style.display = 'block';
    } else {
      closePostModal();
      await loadPosts(1);
      updateUserMenu();
    }
  } catch (error) {
    errorEl.textContent = '发布失败，请重试';
    errorEl.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '发布';
  }
}

// 关闭发帖模态框
function closePostModal() {
  const modal = document.getElementById('postModal');
  if (modal) modal.classList.remove('visible');
}

// 渲染帖子详情
export async function renderPostDetail(postId) {
  navigateTo('community');
  const version = ++detailVersion; ++pageVersion; ++listVersion;
  // Navigation can start a list refresh; this detail request supersedes it.
  ++pageVersion; ++listVersion;
  const container = document.getElementById('communityContent');
  container.innerHTML = '<div class="community-container"><div class="loading">加载中...</div></div>';

  try {
    const post = await communityApi.getPost(postId);
    if (version !== detailVersion) return;
    currentPost = post;
    
    if (!currentPost || currentPost.error) {
      container.innerHTML = '<div class="community-container"><div class="empty-state">帖子加载失败，请返回社区重试。</div><button class="back-btn" data-action="backToCommunity">返回社区</button></div>';
      return;
    }

    const userInfo = communityApi.getUserInfo();
    const isAuthor = userInfo && userInfo.id === currentPost.user_id;

    container.innerHTML = `
      <div class="post-detail-container">
        <button class="back-btn" data-action="backToCommunity">← 返回社区</button>
        
        <div class="post-detail-header">
          <h1 class="post-detail-title">${escapeHtml(currentPost.title)}</h1>
          <div class="post-detail-meta">
            <span class="post-category" style="background-color: ${currentPost.category_color || '#8B3A2A'}">${currentPost.category_name || '综合交流'}</span>
            <button data-user-id="${currentPost.user_id || ''}" title="查看个人主页">${escapeHtml(currentPost.nickname || currentPost.username)}</button>
            <span>${communityApi.formatTime(currentPost.created_at)}</span>
            <span>${currentPost.view_count || 0} 阅读</span>
          </div>
        </div>

        <div class="post-detail-content">${escapeHtml(currentPost.content)}</div>

        <div class="post-actions">
          <button class="action-btn ${currentPost.user_liked ? 'liked' : ''}" id="likeBtn" data-action="toggleLike">
            ${currentPost.user_liked ? '已赞' : '点赞'} <span id="likeCount">${currentPost.like_count || 0}</span>
          </button>
          <button class="action-btn" data-action="scrollToComments">
            评论 <span id="commentCount">${currentPost.comment_count || 0}</span>
          </button>
          ${isAuthor ? `<button class="action-btn danger" data-action="deletePost">删除</button>` : ''}
        </div>

        <div class="comments-section" id="commentsSection">
          <h2 class="comments-header">评论</h2>
          <div class="comment-form" id="commentForm" style="display: none;">
            <textarea class="comment-input" id="commentInput" aria-label="评论内容" placeholder="写下你的评论..." maxlength="1000"></textarea>
            <button class="comment-submit" id="submitComment">发表评论</button>
          </div>
          <div class="comment-list" id="commentList">
            <div class="loading">加载评论中...</div>
          </div>
        </div>
      </div>
    `;

    // 加载评论
    await loadComments(postId);

    // 绑定事件
    if (version !== detailVersion) return;
    bindPostDetailEvents(postId);
  } catch (error) {
    console.error('加载帖子详情失败:', error);
    container.innerHTML = '<div class="community-container"><div class="empty-state">加载失败，请重试</div></div>';
  }
}

// 加载评论
async function loadComments(postId) {
  const commentList = document.getElementById('commentList');
  
  try {
    const comments = await communityApi.getComments(postId);
    
    if (comments.length === 0) {
      commentList.innerHTML = '<div class="empty-state">暂无评论，快来抢沙发</div>';
      return;
    }

    const userInfo = communityApi.getUserInfo();
    
    commentList.innerHTML = comments.map(comment => `
      <div class="comment-item" data-comment-id="${comment.id}">
        <div class="comment-header">
          <button class="comment-author" data-user-id="${comment.user_id || ''}" title="查看个人主页">${escapeHtml(comment.nickname || comment.username)}</button>
          <span class="comment-time">${communityApi.formatTime(comment.created_at)}</span>
          ${userInfo && userInfo.id === comment.user_id ? `<button class="comment-delete" data-action="deleteComment" data-comment-id="${comment.id}">删除</button>` : ''}
        </div>
        <div class="comment-content">${escapeHtml(comment.content)}</div>
      </div>
    `).join('');
  } catch (error) {
    console.error('加载评论失败:', error);
    commentList.innerHTML = '<div class="empty-state">加载评论失败</div>';
  }
}

// 绑定社区事件（事件委托逻辑已移至 initCommunity，此处仅做按钮显隐等一次性初始化）
function bindCommunityEvents() {
  // 发帖按钮
  const createBtn = document.getElementById('createPostBtn');
  if (createBtn) {
    createBtn.style.display = 'flex';
    createBtn.addEventListener('click', () => {
      if (!communityApi.isLoggedIn()) {
        showAuthModal();
      } else {
        renderPostForm();
      }
    });
  }
}

// 绑定帖子详情事件
function bindPostDetailEvents(postId) {
  // 返回


  // 显示评论框
  const commentForm = document.getElementById('commentForm');
  if (communityApi.isLoggedIn()) {
    commentForm.style.display = 'block';
  }

  // 点赞
  document.getElementById('likeBtn')?.addEventListener('click', async () => {
    if (!communityApi.isLoggedIn()) {
      showAuthModal();
      return;
    }
    
    const result = await communityApi.toggleLike(postId);
    if (result.error) { alert(result.error); return; }
    const likeBtn = document.getElementById('likeBtn');
    const likeCount = document.getElementById('likeCount');
    
    if (result.liked) {
      likeBtn.classList.add('liked');
      likeBtn.innerHTML = `已赞 <span id="likeCount">${parseInt(likeCount.textContent) + 1}</span>`;
    } else {
      likeBtn.classList.remove('liked');
      likeBtn.innerHTML = `点赞 <span id="likeCount">${parseInt(likeCount.textContent) - 1}</span>`;
    }
  });

  // 滚动到评论
  document.querySelector('[data-action="scrollToComments"]')?.addEventListener('click', () => {
    if (!communityApi.isLoggedIn()) { showAuthModal(); return; }
    document.getElementById('commentsSection')?.scrollIntoView({ behavior: scrollBehavior() });
    if (communityApi.isLoggedIn()) {
      document.getElementById('commentInput')?.focus();
    }
  });

  // 删除帖子
  document.querySelector('[data-action="deletePost"]')?.addEventListener('click', async () => {
    if (confirm('确定要删除这个帖子吗？')) {
      await communityApi.deletePost(postId);
      renderCommunityPage();
    }
  });

  // 发表评论
  document.getElementById('submitComment')?.addEventListener('click', async () => {
    const content = document.getElementById('commentInput').value.trim();
    const submit = document.getElementById('submitComment');
    if (!content || submit.disabled) return;
    submit.disabled = true;
    const result = await communityApi.addComment(postId, content);
    submit.disabled = false;
    if (!document.getElementById('commentInput')) return;
    if (!result.error) {
      document.getElementById('commentInput').value = '';
      await loadComments(postId);
      
      // 更新评论数
      const commentCount = document.getElementById('commentCount');
      commentCount.textContent = parseInt(commentCount.textContent) + 1;
    } else { alert(result.error); }
  });

  // 删除评论
  document.getElementById('commentList')?.addEventListener('click', async event => {
    const button = event.target.closest('[data-action="deleteComment"]');
    if (!button || button.disabled || !confirm('确定要删除这条评论吗？')) return;
    button.disabled = true;
    const result = await communityApi.deleteComment(button.dataset.commentId);
    if (result.error) { alert(result.error); button.disabled = false; return; }
    await loadComments(postId);
    const count = document.getElementById('commentCount');
    if (count) count.textContent = Math.max(0, Number(count.textContent) - 1);
  });
}

// 显示登录/注册模态框
export function showAuthModal() {
  const modal = document.getElementById('authModal') || createModal('authModal');
  modal.classList.add('visible');
  
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">用户登录</h2>
        <button class="modal-close" data-action="closeAuthModal">&times;</button>
      </div>
      <div class="modal-body">
        <div class="auth-tabs">
          <button class="auth-tab active" data-tab="login">登录</button>
          <button class="auth-tab" data-tab="register">注册</button>
          <button class="auth-tab" data-tab="recovery">重置旧账号密码</button>
        </div>
        
        <div class="auth-form active" id="loginForm">
          <div class="form-group">
            <label class="form-label">用户名</label>
            <input type="text" class="form-input" id="loginUsername" aria-label="用户名" placeholder="请输入用户名">
          </div>
          <div class="form-group">
            <label class="form-label">密码</label>
            <input type="password" class="form-input" id="loginPassword" aria-label="密码" placeholder="请输入密码">
          </div>
          <div class="form-error" id="loginError" style="display: none;"></div>
          <p id="recoverySuccess" role="status" hidden></p>
        </div>

        <div class="auth-form" id="recoveryForm">
          <p>请输入维护人员核验账号归属后交付的一次性恢复码。</p>
          <div class="form-group">
            <label class="form-label" for="recoveryUsername">原用户名</label>
            <input type="text" class="form-input" id="recoveryUsername" autocomplete="username" maxlength="100">
          </div>
          <div class="form-group">
            <label class="form-label" for="recoveryCode">恢复码</label>
            <input type="password" class="form-input" id="recoveryCode" autocomplete="off" spellcheck="false" maxlength="64">
          </div>
          <div class="form-group">
            <label class="form-label" for="recoveryPassword">新密码（至少 15 个字符）</label>
            <input type="password" class="form-input" id="recoveryPassword" autocomplete="new-password" maxlength="1024">
          </div>
          <div class="form-error" id="recoveryError" role="alert" hidden></div>
        </div>

        <div class="auth-form" id="registerForm">
          <div class="form-group">
            <label class="form-label">用户名</label>
            <input type="text" class="form-input" id="regUsername" aria-label="注册用户名" placeholder="请输入用户名">
          </div>
          <div class="form-group">
            <label class="form-label">昵称</label>
            <input type="text" class="form-input" id="regNickname" aria-label="昵称" placeholder="请输入昵称（选填）">
          </div>
          <div class="form-group">
            <label class="form-label">密码</label>
            <input type="password" class="form-input" id="regPassword" aria-label="注册密码" placeholder="请输入密码（至少6位）">
          </div>
          <div class="form-error" id="regError" style="display: none;"></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-cancel" data-action="closeAuthModal">取消</button>
        <button class="btn-submit" id="authSubmit">登录</button>
      </div>
    </div>
  `;

  // Tab切换
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`${tab.dataset.tab}Form`).classList.add('active');
      document.getElementById('authSubmit').textContent = {
        login: '登录', register: '注册', recovery: '重置密码',
      }[tab.dataset.tab];
    });
  });

  // 提交
  document.getElementById('authSubmit').addEventListener('click', handleAuth);
}

// 处理登录/注册
async function handleAuth() {
  const button = document.getElementById('authSubmit');
  if (button.disabled) return;
  button.disabled = true;
  try { await submitAuth(); }
  finally { button.disabled = false; }
}

async function submitAuth() {
  const loginTab = document.querySelector('.auth-tab.active');
  const isLogin = loginTab.dataset.tab === 'login';
  if (loginTab.dataset.tab === 'recovery') {
    await submitAccountRecovery(document.getElementById('authModal'));
    return;
  }

  if (isLogin) {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');

    if (!username || !password) {
      errorEl.textContent = '请输入用户名和密码';
      errorEl.style.display = 'block';
      return;
    }

    const result = await communityApi.login(username, password);
    if (result.error) {
      errorEl.textContent = result.error;
      errorEl.style.display = 'block';
    } else {
      communityApi.setUserSession(result.token, result.user);
      closeAuthModal();
      updateUserMenu();
      
      // 如果在社区页面，刷新页面
      const communityContent = document.getElementById('communityContent');
      if (communityContent && communityContent.innerHTML.includes('community-container')) {
        // 重新加载当前页
        location.reload();
      }
    }
  } else {
    const username = document.getElementById('regUsername').value.trim();
    const nickname = document.getElementById('regNickname').value.trim();
    const password = document.getElementById('regPassword').value;
    const errorEl = document.getElementById('regError');

    if (!username || !password) {
      errorEl.textContent = '请输入用户名和密码';
      errorEl.style.display = 'block';
      return;
    }

    if (password.length < 6) {
      errorEl.textContent = '密码长度至少6位';
      errorEl.style.display = 'block';
      return;
    }

    const result = await communityApi.register(username, password, nickname);
    if (result.error) {
      errorEl.textContent = result.error;
      errorEl.style.display = 'block';
    } else {
      // 注册后自动登录
      const loginResult = await communityApi.login(username, password);
      if (loginResult.token) {
        communityApi.setUserSession(loginResult.token, loginResult.user);
        closeAuthModal();
        updateUserMenu();
        location.reload();
      } else {
        errorEl.textContent = loginResult.error || '注册成功，但登录失败，请切换登录重试。';
        errorEl.style.display = 'block';
      }
    }
  }
}

async function submitAccountRecovery(modal) {
  const username = modal.querySelector('#recoveryUsername').value;
  const code = modal.querySelector('#recoveryCode');
  const password = modal.querySelector('#recoveryPassword');
  const error = modal.querySelector('#recoveryError');
  const showError = message => {
    error.textContent = message;
    error.hidden = false;
  };
  error.hidden = true;
  if (!username.trim() || !/^[0-9a-f]{64}$/.test(code.value) || password.value.length < 15) {
    showError('请输入原用户名、完整恢复码和至少 15 个字符的新密码。');
    return;
  }
  const result = await communityApi.resetPassword(username, code.value, password.value);
  if (!modal.contains(code) || !modal.classList.contains('visible')) return;
  if (result.error) {
    showError(result.error);
    return;
  }
  code.value = '';
  password.value = '';
  modal.querySelector('[data-tab="login"]').click();
  modal.querySelector('#loginUsername').value = username;
  modal.querySelector('#loginPassword').value = '';
  modal.querySelector('#loginError').style.display = 'none';
  const status = modal.querySelector('#recoverySuccess');
  status.textContent = '密码已重置，请使用新密码登录。';
  status.hidden = false;
  modal.querySelector('#loginPassword').focus();
}

// 关闭认证模态框
function closeAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) {
    modal.classList.remove('visible');
    modal.querySelectorAll('input[type="password"]').forEach(input => { input.value = ''; });
  }
}

// 更新用户菜单
export function updateUserMenu() {
  const userMenuContainer = document.getElementById('userMenu');
  if (!userMenuContainer) return;

  const userInfo = communityApi.getUserInfo();
  
  if (userInfo) {
    userMenuContainer.innerHTML = `
      <div class="user-menu">
        <button class="user-avatar" aria-label="用户菜单" aria-expanded="false" aria-controls="userDropdown">${escapeHtml(userInfo.nickname?.charAt(0) || userInfo.username.charAt(0))}</button>
        <div class="user-dropdown" id="userDropdown">
          <div style="padding: 12px 16px; border-bottom: 1px solid var(--rule);">
            <div style="font-weight: 600;">${escapeHtml(userInfo.nickname || userInfo.username)}</div>
            <div style="font-size: var(--text-small); color: var(--muted);">@${escapeHtml(userInfo.username)}</div>
          </div>
          <button class="user-dropdown-item" data-action="myProfile">我的主页</button>
          <button class="user-dropdown-item" data-action="logout">退出登录</button>
        </div>
      </div>
    `;

    // 绑定下拉菜单事件
    const userAvatar = userMenuContainer.querySelector('.user-avatar');
    const dropdown = userMenuContainer.querySelector('.user-dropdown');
    
    userAvatar.addEventListener('click', () => {
      dropdown.classList.toggle('visible');
      userAvatar.setAttribute('aria-expanded', String(dropdown.classList.contains('visible')));
    });

    // 退出登录
    document.querySelector('[data-action="logout"]')?.addEventListener('click', () => {
      communityApi.clearUserSession();
      updateUserMenu();
      renderCommunityPage();
    });
  } else {
    userMenuContainer.innerHTML = `
      <button class="btn-secondary" id="loginBtn">
        登录 / 注册
      </button>
    `;

    document.getElementById('loginBtn').addEventListener('click', () => {
      showAuthModal();
    });
  }
}

// 创建模态框容器
function createModal(id) {
  const modal = document.createElement('div');
  modal.id = id;
  modal.className = 'modal-overlay';
  document.body.appendChild(modal);
  return modal;
}

// HTML转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 导出初始化函数
export function initCommunity() {
  if (initialized) return;
  initialized = true;
  updateUserMenu();
  document.addEventListener('community-session-expired', updateUserMenu);
  if (communityApi.isLoggedIn()) void communityApi.getCurrentUser();

  // 全局事件委托：帖子卡片、分类筛选、分页、模态框关闭等（innerHTML 重写后依然生效）
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('userMenu');
    if (!menu?.contains(e.target) || e.target.closest('[data-action="myProfile"]')) {
      document.getElementById('userDropdown')?.classList.remove('visible');
      menu?.querySelector('.user-avatar')?.setAttribute('aria-expanded', 'false');
    }
    if (e.target.closest('[data-user-id]')) return;
    if (e.target.closest('[data-action="retryCommunity"]')) { renderCommunityPage(); return; }
    if (e.target.closest('[data-action="backToCommunity"]')) { renderCommunityPage(); return; }
    // 关闭模态框
    if (e.target.dataset?.action === 'closePostModal') {
      closePostModal();
      return;
    }
    if (e.target.dataset?.action === 'closeAuthModal') {
      closeAuthModal();
      return;
    }

    // 点击模态框外部关闭
    const modal = e.target.closest('.modal-overlay');
    if (modal && e.target === modal && modal.classList.contains('visible')) {
      if (modal.id === 'authModal') closeAuthModal();
      else modal.classList.remove('visible');
      return;
    }

    // 帖子卡片点击 → 打开详情
    const postCard = e.target.closest('.post-card');
    if (postCard && postCard.dataset.postId) {
      const postId = Number(postCard.dataset.postId);
      if (!isNaN(postId) && typeof renderPostDetail === 'function') {
        renderPostDetail(postId);
      }
      return;
    }

    // 分类筛选按钮
    const categoryBtn = e.target.closest('.category-btn');
    if (categoryBtn && categoryBtn.dataset.category !== undefined) {
      document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
      categoryBtn.classList.add('active');
      const catVal = categoryBtn.dataset.category || null;
      currentCategoryId = (catVal === '' || catVal === null) ? null : Number(catVal);
      if (isNaN(currentCategoryId)) currentCategoryId = catVal;
      if (typeof loadPosts === 'function') loadPosts(1);
      return;
    }

    // 分页按钮
    const pageBtn = e.target.closest('.page-btn');
    if (pageBtn && pageBtn.dataset.page) {
      const page = parseInt(pageBtn.dataset.page, 10);
      if (!isNaN(page) && typeof loadPosts === 'function') {
        loadPosts(page);
      }
      return;
    }
  });
}
