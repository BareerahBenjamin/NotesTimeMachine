/**
 * 入口文件：初始化与全局事件委托
 */
import { state } from './state.js';
import { checkApiConnection } from './api.js';
import { getSupabase } from './config.js';
import * as bookshelf from './ui/bookshelf.js';
import * as reader from './ui/reader.js';
import * as timeline from './ui/timeline.js';
import * as aiPanel from './ui/aiPanel.js';
import * as search from './ui/search.js';
import * as authorCards from './ui/authorCards.js';
import * as bookDetail from './ui/bookDetail.js';
import { renderCommunityPage, initCommunity } from './ui/community.js';

let previousPage = 'home';

export function navigateToPage(pageId) {
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });
  
  document.querySelectorAll('.nav-link[data-page], .mobile-nav-link[data-page]').forEach(link => {
    link.classList.remove('active');
  });
  
  const targetPage = document.getElementById(`page-${pageId}`);
  if (targetPage) {
    targetPage.classList.add('active');
  }
  
  const activeLinks = document.querySelectorAll(`[data-page="${pageId}"]`);
  activeLinks.forEach(link => link.classList.add('active'));
  
  previousPage = pageId;
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
  
  if (pageId === 'bookshelf') {
    bookshelf.renderBookshelf();
  }
  
  if (pageId === 'reader') {
    const searchBar = document.getElementById('searchBar');
    const searchResults = document.getElementById('searchResults');
    if (searchBar) searchBar.style.display = 'flex';
    if (searchResults) searchResults.innerHTML = '';
  }

  if (pageId === 'community') {
    renderCommunityPage();
  }
}

export function navigateToHome() {
  navigateToPage('home');
}

export function navigateToAuthors() {
  navigateToPage('authors');
}

export function navigateToBookshelf() {
  navigateToPage('bookshelf');
}

export function navigateToReader(bookId) {
  if (bookId) {
    state.currentBook = bookId;
  }
  navigateToPage('reader');
  setTimeout(() => {
    reader.loadBook(state.currentBook);
  }, 300);
}

export function navigateBack() {
  if (previousPage === 'reader') {
    navigateToBookshelf();
  } else {
    navigateToHome();
  }
}

function handleDocumentClick(e) {
  const target = e.target.closest('[data-action]');
  if (!target) return;

  const action = target.dataset.action;

  switch (action) {
    case 'navigateToHome':
      navigateToHome();
      break;
    case 'navigateToAuthors':
      navigateToAuthors();
      break;
    case 'navigateToBookshelf':
      navigateToBookshelf();
      break;
    case 'navigateBack':
      navigateBack();
      break;
    case 'selectAuthorCard': {
      const bookId = target.closest('[data-book]')?.dataset.book;
      if (bookId) {
        navigateToReader(bookId);
      }
      break;
    }
    case 'toggleAuthorDetail': {
      const bookId = target.closest('[data-book]')?.dataset.book;
      if (bookId) {
        e.stopPropagation();
        authorCards.toggleAuthorDetail(bookId);
      }
      break;
    }
    case 'closeAuthorDetail':
      authorCards.closeAuthorDetail();
      break;
    case 'showCurrentAuthorDetail': {
      authorCards.toggleAuthorDetail(state.currentBook);
      break;
    }
    case 'selectBook': {
      const bookId = target.dataset.book;
      if (bookId) {
        navigateToReader(bookId);
      }
      break;
    }
    case 'prevChapter':
      reader.prevChapter();
      break;
    case 'nextChapter':
      reader.nextChapter();
      break;
    case 'closeTimeline':
      timeline.closeTimeline();
      break;
    case 'filterTimeline': {
      const era = target.dataset.era ?? null;
      timeline.filterTimeline(era);
      break;
    }
    case 'semanticSearch':
      search.semanticSearch();
      break;
    case 'jumpToParagraph': {
      const classicId = target.dataset.classic;
      const paragraphId = target.dataset.paragraph;
      if (classicId && paragraphId) {
        reader.jumpToParagraph(classicId, paragraphId);
      }
      break;
    }
    case 'scrollToReader':
      navigateToReader();
      break;
    case 'toggleTheme':
      toggleTheme();
      break;
    case 'toggleBookDetail': {
      const bookId = target.closest('[data-book]')?.dataset.book;
      if (bookId) {
        e.stopPropagation();
        bookDetail.toggleBookDetail(bookId);
      }
      break;
    }
    case 'closeBookDetail':
      bookDetail.closeBookDetail();
      break;
    case 'showCurrentBookDetail': {
      bookDetail.toggleBookDetail(state.currentBook);
      break;
    }
  }
}

function handleKeyDown(e) {
  if (e.key === 'Enter' && e.target.id === 'semanticSearch') {
    search.semanticSearch();
  }
}

function handleParagraphClick(e) {
  const paraEl = e.target.closest('.ancient-text');
  if (!paraEl) return;

  const paraId = paraEl.dataset.id;
  const content = paraEl.dataset.content;
  if (!paraId || !content) return;

  const storedPara = state.currentParagraphs.find(p => p.id === paraId);
  const para = storedPara || {
    id: paraId,
    content,
    annotations: state.selectedParagraph?.id === paraId ? state.selectedParagraph.annotations : []
  };
  reader.selectParagraph(para);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  
  document.documentElement.setAttribute('data-theme', newTheme === 'light' ? '' : 'dark');
  localStorage.setItem('theme', newTheme);
}

function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
}

async function init() {
  // 初始化 Supabase 客户端
  window.supabaseClient = getSupabase();
  console.log('Supabase client initialized:', !!window.supabaseClient);

  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('keydown', handleKeyDown);
  
  const originalText = document.getElementById('originalText');
  if (originalText) {
    originalText.addEventListener('click', handleParagraphClick);
  }

  bookshelf.renderBookshelf();
  initCommunity();
  await checkApiConnection();
  
  // 将 supabaseClient 暴露到全局，供其他模块使用
  if (window.supabaseClient) {
    window.supabase = window.supabaseClient;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();

  const navLinks = document.querySelectorAll('.nav-link[data-page], .mobile-nav-link[data-page]');
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const pageId = link.dataset.page;
      if (pageId) {
        navigateToPage(pageId);
      }
    });
  });

  const logo = document.querySelector('.logo[data-action="navigateToHome"]');
  if (logo) {
    logo.addEventListener('click', () => {
      navigateToHome();
    });
  }

  const menuToggle = document.getElementById('menuToggle');
  const mobileMenu = document.getElementById('mobileMenu');
  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener('click', () => {
      menuToggle.classList.toggle('active');
      mobileMenu.classList.toggle('open');
    });
    mobileMenu.querySelectorAll('.mobile-nav-link').forEach(link => {
      link.addEventListener('click', () => {
        menuToggle.classList.remove('active');
        mobileMenu.classList.remove('open');
      });
    });
  }

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        document.documentElement.style.setProperty('--scroll', window.scrollY);
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });

  init();
});

window.app = {
  navigateToHome,
  navigateToAuthors,
  navigateToBookshelf,
  navigateToReader,
  navigateBack,
  selectAuthorCard: authorCards.selectAuthorCard,
  toggleAuthorDetail: authorCards.toggleAuthorDetail,
  closeAuthorDetail: authorCards.closeAuthorDetail,
  toggleBookDetail: bookDetail.toggleBookDetail,
  closeBookDetail: bookDetail.closeBookDetail,
  selectBook: reader.loadBook,
  prevChapter: reader.prevChapter,
  nextChapter: reader.nextChapter,
  semanticSearch: search.semanticSearch,
  filterTimeline: timeline.filterTimeline,
  closeTimeline: timeline.closeTimeline,
  jumpToParagraph: reader.jumpToParagraph,
};