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
  pendingRead: null, // { classicId, chapterIndex, paragraphId? }

  reset() {
    this.currentBook = 'nujie';
    this.currentChapterIndex = 0;
    this.chapters = [];
    this.currentParagraphs = [];
    this.selectedParagraph = null;
    this.timelineFilter = null;
    this.pendingRead = null;
  },
};

export function navigateTo(pageId) {
  if (!pageId) return;
  const pages = document.querySelectorAll('.page');
  let matched = false;
  pages.forEach(p => {
    if (p.id === `page-${pageId}`) {
      p.classList.add('active');
      matched = true;
    } else {
      p.classList.remove('active');
    }
  });
  if (matched) {
    state.previousPage = pageId;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
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

