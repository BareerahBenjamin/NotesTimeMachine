/** Public document location only; no account/session identifiers or local reading history. */
const id = value => typeof value==='string' && /^[a-z0-9_-]{1,160}$/i.test(value);
const pages = new Set(['home','bookshelf','authors','reader','community']);
export function parsePageRoute(hash) {
  if (!hash || hash === '#') return 'home';
  const page = hash.startsWith('#page/') ? hash.slice(6) : null;
  return pages.has(page) ? page : null;
}
export function pushPublicRoute(hash) {
  if (window.location.hash === hash) return;
  const depth = Number.isSafeInteger(window.history.state?.ntmDepth) ? window.history.state.ntmDepth : 0;
  window.history.pushState({ntmDepth:depth+1},'',hash || window.location.pathname+window.location.search);
}
export function writePageRoute(page) {
  if (pages.has(page)) pushPublicRoute(page==='home'?'':`#page/${page}`);
}
export function parseReadingRoute(hash) {
  if (hash==='#experience') return {experience:true};
  const parts=hash.split('/');
  if(parts[0]!=='#read' || parts.length<3 || parts.length>4) return null;
  const [,classicId,chapterId,paragraphId]=parts;
  if(parts.length===4 && !id(paragraphId))return null;
  if(!id(classicId)||!id(chapterId)||!chapterId.startsWith(classicId+'-')||(paragraphId&&(!id(paragraphId)||!paragraphId.startsWith(chapterId+'-'))))return null;
  return {classicId,chapterId,paragraphId:paragraphId||null};
}
export function writeReadingRoute(classicId,chapterId,paragraphId=null) {
  if(!id(classicId)||!id(chapterId)||(paragraphId&&!id(paragraphId)))return;
  window.history.replaceState(window.history.state,'',`#read/${classicId}/${chapterId}${paragraphId?'/'+paragraphId:''}`);
}
export function clearReadingRoute() {
  if(/^#(?:read\/|experience$)/.test(window.location.hash))window.history.replaceState(null,'',window.location.pathname+window.location.search);
}
