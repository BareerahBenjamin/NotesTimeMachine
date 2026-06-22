/**
 * 书架渲染与交互
 */
import { BOOKS } from '../config.js';
import { state } from '../state.js';

const BOOK_COLORS = {
  shuyuci: 'linear-gradient(135deg, #8B3A2A 0%, #5C2819 100%)',
  nujie: 'linear-gradient(135deg, #2E5A4C 0%, #1A3A2B 100%)',
  beifen: 'linear-gradient(135deg, #4A4A8A 0%, #2D2D5A 100%)',
  donghaiyuge: 'linear-gradient(135deg, #8A6A2A 0%, #5A4519 100%)',
  xuetao: 'linear-gradient(135deg, #6B4C8A 0%, #4A2A5A 100%)',
  yuxuanji: 'linear-gradient(135deg, #4A7A4A 0%, #2A4A2A 100%)',
  liuye: 'linear-gradient(135deg, #7A5A4A 0%, #4A3A2A 100%)',
  liucaichun: 'linear-gradient(135deg, #8A6A4A 0%, #5A4A2A 100%)',
  zhushuzhen: 'linear-gradient(135deg, #8A2A4A 0%, #5A1A2A 100%)',
  weiwan: 'linear-gradient(135deg, #2A5A8A 0%, #1A3A5A 100%)',
  baitouyin: 'linear-gradient(135deg, #8A5A2A 0%, #5A3515 100%)',
  gongci: 'linear-gradient(135deg, #6A8A6A 0%, #4A5A4A 100%)',
  huange: 'linear-gradient(135deg, #7A4A6A 0%, #4A2A4A 100%)',
  taishanyin: 'linear-gradient(135deg, #4A6A8A 0%, #2A4A5A 100%)',
  caishuyuan: 'linear-gradient(135deg, #8A4A4A 0%, #5A2A2A 100%)',
  yuangexing: 'linear-gradient(135deg, #5A5A7A 0%, #3A3A5A 100%)',
  nixiaoshan: 'linear-gradient(135deg, #6A6A8A 0%, #4A4A6A 100%)',
};

export function renderBookshelf(filter = '') {
  const shelf = document.querySelector('.shelf');
  const filteredBooks = BOOKS.filter(book =>
    book.name.includes(filter) || book.chapter.includes(filter)
  );

  if (filteredBooks.length === 0) {
    shelf.innerHTML = '<div class="no-results">未找到相关古籍</div>';
    return;
  }

  shelf.innerHTML = filteredBooks.map((book, i) => `
    <div class="book-item ${book.id === state.currentBook ? 'active' : ''}"
         data-book="${book.id}" data-action="selectBook"
         style="animation-delay: ${i * 0.1}s">
      <div class="book-spine" style="background: ${BOOK_COLORS[book.color] || BOOK_COLORS.nujie}">${book.name}</div>
      <span class="book-label">${book.name}</span>
    </div>
  `).join('');
}

export function updateBookshelfActive(bookId) {
  document.querySelectorAll('.book-item').forEach(el => {
    el.classList.toggle('active', el.dataset.book === bookId);
  });
}
