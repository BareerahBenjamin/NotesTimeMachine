import { scrollBehavior } from './motion/index.js';
import { writePageRoute } from './readingRoute.js';

/**
 * 全局状态管理（极简 Store）
 */

export const state = {
  currentBook: 'nujie',
  currentChapterIndex: 0,
  chapters: [],
  currentParagraphs: [],  // 当前章节的段落（含注疏）
  selectedParagraph: null,
  apiAvailable: false,
  timelineFilter: null,
  previousPage: 'home',
  guidedExample: null,
  pendingRead: null, // { classicId, chapterIndex, paragraphId? }

  reset() {
    this.currentBook = 'nujie';
    this.currentChapterIndex = 0;
    this.chapters = [];
    this.currentParagraphs = [];
    this.selectedParagraph = null;
    this.timelineFilter = null;
    this.pendingRead = null;
    this.guidedExample = null;
  },
};

export function navigateTo(pageId, {history=true}={}) {
  const target = document.getElementById(`page-${pageId}`);
  if (!target) return;
  const current = document.querySelector('.page.active');
  if (current === target) return;
  if(history)writePageRoute(pageId);
  state.previousPage = current?.id.replace('page-', '') || 'home';
  document.querySelectorAll('.page').forEach(page => {
    page.classList.toggle('active', page === target);
    page.inert = page !== target;
  });
  document.querySelectorAll('.nav-link[data-page], .mobile-nav-link[data-page]').forEach(link => {
    const active = link.dataset.page === pageId;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.getElementById('mainContent')?.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: scrollBehavior() });
  document.dispatchEvent(new CustomEvent('page-change', { detail: { pageId } }));
}

export function getPreviousPage() {
  return state.previousPage || 'home';
}

export function setPendingRead(info) {
  if (!info) { state.pendingRead = null; return; }
  state.pendingRead = {
    classicId: info.classicId || info.classic_id || null,
    chapterIndex: Number(info.chapterIndex ?? info.chapter_index ?? 0),
    paragraphId: info.paragraphId || info.paragraph_id || null,
  };
}

export function getPendingRead() {
  return state.pendingRead;
}

export function consumePendingRead() {
  const r = state.pendingRead;
  state.pendingRead = null;
  return r;
}

export function getCurrentUserId() {
  try {
    const raw = localStorage.getItem('community_user');
    if (!raw) return null;
    const user = JSON.parse(raw);
    return user?.id ? Number(user.id) : null;
  } catch {
    return null;
  }
}

export function getCurrentUser() {
  try {
    const raw = localStorage.getItem('community_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

