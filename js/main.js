/**
 * 入口文件：初始化与全局事件委托
 */
import { state, navigateTo } from './state.js';
import { initMotion } from './motion/index.js';
import { initAccessibility } from './ui/accessibility.js';
import { checkApiConnection } from './api.js';
import { parseReadingRoute, parsePageRoute } from './readingRoute.js';
import {initAnalytics} from './analytics/index.js';
import { startReadingExperience, cancelActivation } from './ui/activation.js';
import * as bookshelf from './ui/bookshelf.js';
import * as reader from './ui/reader.js';
import * as timeline from './ui/timeline.js';
import * as search from './ui/search.js';
import * as authorCards from './ui/authorCards.js';
import * as bookDetail from './ui/bookDetail.js';
import { renderCommunityPage, initCommunity } from './ui/community.js';

export function navigateToPage(pageId, options) {
  navigateTo(pageId, options);
}

function handlePageChange({ detail: { pageId } }) {
  cancelActivation();
  if (pageId !== 'reader') { reader.cancelReaderLoad(); timeline.closeTimeline(); }
  if (pageId === 'bookshelf') {
    bookshelf.renderBookshelf();
  }
  
  if (pageId === 'reader') {
    search.clearSearch();
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
  reader.loadBook(state.currentBook);
}

export function navigateBack() {
  if (document.getElementById('page-reader').classList.contains('active')) {
    if(window.history.state?.ntmDepth>0){window.history.back();return;}
    navigateToBookshelf();
  } else {
    navigateToPage(state.previousPage === 'profile' ? 'community' : state.previousPage);
  }
}

function handleDocumentClick(e) {
  const target = e.target.closest('[data-action]');
  if (!target) return;

  const action = target.dataset.action;

  switch (action) {
    case 'startReadingExperience':
      startReadingExperience();
      break;
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
        bookDetail.closeBookDetail();
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
      timeline.closeTimeline({restorePosition:true});
      break;
    case 'continueReading':
      reader.continueReading();
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
        navigateToPage('reader');
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
  if (e.key === 'Enter' && (e.target.id === 'heroSemanticSearch' || e.target.id === 'readerSemanticSearch')) {
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
  console.log('初始化注疏时光机（Cloudflare Workers 架构）');

  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('page-change', handlePageChange);
  document.addEventListener('keydown', handleKeyDown);
  
  const originalText = document.getElementById('originalText');
  if (originalText) {
    originalText.addEventListener('click', handleParagraphClick);
  }

  bookshelf.renderBookshelf();
  initCommunity();
  // Reading/route restoration must not wait for a separate health request.
  void checkApiConnection();
  await restoreReadingRoute();
  window.addEventListener('popstate',restoreReadingRoute);
}

async function restoreReadingRoute(){
  const route=parseReadingRoute(window.location.hash);
  if(route?.experience){navigateToPage('home',{history:false});await startReadingExperience({restore:true});return}
  if(route){navigateToPage('reader',{history:false});await reader.loadBook(route.classicId,{chapterId:route.chapterId,paragraphId:route.paragraphId,selectTarget:false});return}
  const page=parsePageRoute(window.location.hash);
  if(page){navigateToPage(page,{history:false});if(page==='reader')await reader.loadBook(state.currentBook);return}
  if(window.location.hash.startsWith('#read/')){navigateToPage('home',{history:false});const status=document.getElementById('activationStatus');status.hidden=false;status.textContent='阅读链接无效，请从书架重新选择作品。'}
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initMotion();
  initAccessibility();
  initAnalytics();

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

  const menuToggle = document.getElementById('menuToggle');
  const mobileMenu = document.getElementById('mobileMenu');
  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener('click', () => {
      menuToggle.classList.toggle('active');
      mobileMenu.classList.toggle('open');
      menuToggle.setAttribute('aria-expanded', String(mobileMenu.classList.contains('open')));
    });
    mobileMenu.querySelectorAll('.mobile-nav-link').forEach(link => {
      link.addEventListener('click', () => {
        menuToggle.classList.remove('active');
        mobileMenu.classList.remove('open');
        menuToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }


  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && mobileMenu?.classList.contains('open')) {
      mobileMenu.classList.remove('open'); menuToggle.classList.remove('active');
      menuToggle.setAttribute('aria-expanded', 'false'); menuToggle.focus();
    }
  });
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
