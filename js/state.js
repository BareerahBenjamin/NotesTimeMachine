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

  reset() {
    this.currentBook = 'nujie';
    this.currentChapterIndex = 0;
    this.chapters = [];
    this.currentParagraphs = [];
    this.selectedParagraph = null;
    this.timelineFilter = null;
  }
};
