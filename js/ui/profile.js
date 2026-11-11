import * as communityApi from './communityApi.js';
import * as state from '../state.js';
import * as reader from './reader.js';
import { BOOK_NAMES } from '../config.js';

const PROFILE_PAGE_ID = 'page-profile';
const PROFILE_CONTENT_ID = 'profileContent';
let currentUserId = null;
let currentTab = 'reading';
let profileVersion = 0;
let tabVersion = 0;

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function classicTitle(classicId) {
  const key = String(classicId || '');
  if (BOOK_NAMES && BOOK_NAMES[key]) return BOOK_NAMES[key];
  const extraMap = {
    lunyu: '论语', xiaojing: '孝经', daxue: '大学',
    zhongyong: '中庸', mengzi: '孟子', laoji: '老子',
    zhuangzi: '庄子', sunzi: '孙子兵法', shiji: '史记',
    chuci: '楚辞', shijing: '诗经', tangshi: '唐诗三百首',
    songci: '宋词三百首',
  };
  return extraMap[key] || key;
}

export async function openUserProfile(userId) {
  if (!userId) return;
  const page = document.getElementById(PROFILE_PAGE_ID);
  if (!page) return;
  state.navigateTo('profile');
  ++profileVersion; ++tabVersion;
  currentUserId = userId;
  currentTab = isOwnProfile(userId) ? 'reading' : 'posts';
  const content = document.getElementById(PROFILE_CONTENT_ID);
  if (content) content.innerHTML = '<div class="empty-state">加载中...</div>';
  await renderProfile();
}

function isOwnProfile(userId) {
  return Number(state.getCurrentUserId()) === Number(userId);
}

async function renderProfile() {
  const content = document.getElementById(PROFILE_CONTENT_ID);
  if (!content || !currentUserId) return;
  const version = profileVersion;
  const userId = currentUserId;
  const ownProfile = isOwnProfile(userId);
  try {
    const [profileRes, postsRes, progressRes] = await Promise.all([
      communityApi.getUserProfile(userId),
      communityApi.getUserPosts(userId, 1, 20),
      ownProfile ? communityApi.getUserReadingProgress(userId) : null,
    ]);

    if (version !== profileVersion) return;
    if (profileRes.error) {
      content.innerHTML = `<div class="empty-state">加载失败：${escapeHtml(profileRes.error)}</div>`;
      return;
    }
    if (!profileRes.user) {
      content.innerHTML = `<div class="empty-state">用户不存在</div>`;
      return;
    }

    const { user, stats = {} } = profileRes;

    content.innerHTML = `
      <div class="profile-card">
        <div class="profile-avatar">
          ${user.avatar
            ? `<img src="${escapeHtml(user.avatar)}" alt="${escapeHtml(user.nickname || user.username)}">`
            : `<span class="avatar-placeholder">${escapeHtml((user.nickname || user.username || '?').charAt(0))}</span>`
          }
        </div>
        <div class="profile-main">
          <div class="profile-name-row">
            <h2 class="profile-name">${escapeHtml(user.nickname || user.username)}</h2>
            <span class="profile-username">@${escapeHtml(user.username)}</span>
          </div>
          ${user.bio ? `<div class="profile-bio">${escapeHtml(user.bio)}</div>` : ''}
          <div class="profile-meta">
            <span>注册：${escapeHtml(communityApi.formatTime(user.created_at))}</span>
          </div>
        </div>
        <div class="profile-stats">
          ${ownProfile ? `<div class="stat-item"><span class="stat-num">${stats.books_count || 0}</span><span class="stat-label">在读古籍</span></div>` : ''}
          <div class="stat-item"><span class="stat-num">${stats.post_count || 0}</span><span class="stat-label">帖子</span></div>
          <div class="stat-item"><span class="stat-num">${stats.total_likes || 0}</span><span class="stat-label">获赞</span></div>
          <div class="stat-item"><span class="stat-num">${stats.total_views || 0}</span><span class="stat-label">阅读量</span></div>
          <div class="stat-item"><span class="stat-num">${stats.total_comments || 0}</span><span class="stat-label">评论</span></div>
        </div>
      </div>

      <div class="profile-tabs">
        ${ownProfile ? `<button class="tab-btn ${currentTab === 'reading' ? 'active' : ''}" data-profile-tab="reading">读书进度 <span class="tab-count">${(progressRes?.progress || []).length}</span></button>` : ''}
        <button class="tab-btn ${currentTab === 'posts' ? 'active' : ''}" data-profile-tab="posts">发帖记录 <span class="tab-count">${postsRes.total || 0}</span></button>
      </div>

      <div class="profile-tab-panel" id="profileTabPanel">
        ${renderTabBody(currentTab, postsRes, progressRes)}
      </div>
    `;
  } catch (error) {
    if (version !== profileVersion) return;
    console.error('渲染个人页失败:', error);
    content.innerHTML = `<div class="empty-state">加载失败：${escapeHtml(error.message || String(error))}</div>`;
  }
}

function renderTabBody(tab, postsRes, progressRes) {
  const error = tab === 'reading' ? progressRes?.error : postsRes?.error;
  if (error) return `<div class="empty-state" role="status">加载失败：${escapeHtml(error)}</div>`;
  if (tab === 'reading') {
    const list = progressRes?.progress || [];
    if (list.length === 0) {
      return `<div class="empty-state">暂无读书进度<br><span style="font-size:var(--text-small);color:var(--muted);">登录后在读书页翻章或选段会自动记录</span></div>`;
    }
    return `
      <div class="reading-list">
        ${list.map(p => {
          const pct = Math.max(0, Math.min(100, Math.round(Number(p.progress_pct || 0) * 100)));
          const title = classicTitle(p.classic_id);
          const chapterLabel = typeof p.chapter_index === 'number' ? `第 ${p.chapter_index + 1} 章` : (p.chapter_index || '-');
          return `
          <div class="reading-card" role="button" tabindex="0" data-action="openClassicFromProgress" data-classic-id="${escapeHtml(p.classic_id)}" data-chapter-index="${Number(p.chapter_index || 0)}" data-paragraph-id="${escapeHtml(p.paragraph_id || '')}">
            <div class="reading-card-header">
              <div class="reading-title">${escapeHtml(title)}</div>
              <div class="reading-time">${escapeHtml(communityApi.formatTime(p.last_read_at))}</div>
            </div>
            <div class="reading-card-meta">
              <span>当前：${escapeHtml(chapterLabel)}</span>
              <span class="progress-pct">${pct}%</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill" style="width:${pct}%"></div>
            </div>
          </div>`;
        }).join('')}
      </div>
    `;
  }

  const list = postsRes?.posts || [];
  if (list.length === 0) {
    return `<div class="empty-state">暂无发帖记录</div>`;
  }
  return `
    <div class="posts-list">
      ${list.map(p => `
        <div class="post-card" role="group" data-post-id="${p.id}">
          <div class="post-header">
            <span class="post-category" style="background-color:${p.category_color || '#8B3A2A'}">${escapeHtml(p.category_name || '综合交流')}</span>
            <span class="post-time">${escapeHtml(communityApi.formatTime(p.created_at))}</span>
          </div>
          <h3 class="post-title"><button class="post-open">${escapeHtml(p.title)}</button></h3>
          <p class="post-preview">${escapeHtml(p.content)}</p>
          <div class="post-stats">
            <span class="post-stat">阅读 ${p.view_count || 0}</span>
            <span class="post-stat">评论 ${p.comment_count || 0}</span>
            <span class="post-stat">点赞 ${p.like_count || 0}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

async function handleTabSwitch(tab) {
  if (tab !== 'reading' && tab !== 'posts') return;
  if (tab === 'reading' && !isOwnProfile(currentUserId)) return;
  currentTab = tab;
  const version = ++tabVersion;
  const userId = currentUserId;
  const panel = document.getElementById('profileTabPanel');
  if (!panel) return;
  panel.innerHTML = '<div class="empty-state">加载中...</div>';
  if (tab === 'reading') {
    const pr = await communityApi.getUserReadingProgress(currentUserId);
    if (version !== tabVersion || currentUserId !== userId) return;
    panel.innerHTML = renderTabBody('reading', null, pr);
  } else {
    const po = await communityApi.getUserPosts(currentUserId, 1, 20);
    if (version !== tabVersion || currentUserId !== userId) return;
    panel.innerHTML = renderTabBody('posts', po, null);
  }
}

document.addEventListener('click', (e) => {
  const authorEl = e.target.closest('[data-user-id]');
  if (authorEl && authorEl.dataset.userId) {
    const uid = Number(authorEl.dataset.userId);
    if (!isNaN(uid)) openUserProfile(uid);
    return;
  }

  const myProf = e.target.closest('[data-action="myProfile"]');
  if (myProf) {
    const uid = state.getCurrentUserId();
    if (uid) openUserProfile(uid);
    return;
  }

  if (!document.getElementById(PROFILE_PAGE_ID)?.classList.contains('active')) return;

  const tabBtn = e.target.closest('[data-profile-tab]');
  if (tabBtn) {
    const tab = tabBtn.dataset.profileTab;
    document.querySelectorAll('#page-profile .tab-btn').forEach(b => {
      b.classList.toggle('active', b === tabBtn);
    });
    handleTabSwitch(tab);
    return;
  }

  const progressCard = e.target.closest('[data-action="openClassicFromProgress"]');
  if (progressCard) {
    const classicId = progressCard.dataset.classicId;
    const chapterIndex = Number(progressCard.dataset.chapterIndex ?? 0);
    const paragraphId = progressCard.dataset.paragraphId || '';
    if (!classicId) return;
    state.setPendingRead({
      classicId,
      chapterIndex: isNaN(chapterIndex) ? 0 : chapterIndex,
      paragraphId,
    });
    state.navigateTo('reader');
    reader.loadBook(classicId);
    return;
  }


});

export { openUserProfile as default };
