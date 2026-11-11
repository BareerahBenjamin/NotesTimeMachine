// Isolated module tests, NOT live business regression. Fetch is controlled only in this page.
// This page never sends a request: every fetch is mocked before modules import.
const calls = [];
const pending = new Map();
const responses = new Map();
window.fetch = (url, options = {}) => new Promise(resolve => {
  calls.push({url,options});
  if (url.includes('/reading-progress')) { resolve({ok:true,json:async()=>({ok:true})}); return; }
  const key = url.endsWith('/api/analyze') ? JSON.parse(options.body).paragraph_id : url.split('/').pop();
  if (responses.has(key)) { resolve({ok:true,json:async()=>responses.get(key)}); return; }
  pending.set(key, data => resolve({ ok: true, json: async () => data }));
});
const nativeMatchMedia = window.matchMedia.bind(window);
const preference = new EventTarget(); preference.matches = false;
window.matchMedia = query => query === '(prefers-reduced-motion: reduce)' ? preference : nativeMatchMedia(query);
const { state, navigateTo } = await import('../js/state.js');
const { renderAnalysis } = await import('../js/ui/safeContent.js');
const { sourceDetails, appendAIEvidence } = await import('../js/ui/sourceDetails.js');
const reader = await import('../js/ui/reader.js');
const timeline = await import('../js/ui/timeline.js');
const motion = await import('../js/motion/index.js');
const search = await import('../js/ui/search.js');
const { renderBookshelf } = await import('../js/ui/bookshelf.js');
const {parseReadingRoute} = await import('../js/readingRoute.js');
const {startReadingExperience} = await import('../js/ui/activation.js');
const {createReadingFeedback} = await import('../js/ui/feedback.js');
const { cancelAIAnalysis } = await import('../js/ui/aiPanel.js');
const results = document.getElementById('results');
function assert(value, message) { if (!value) throw new Error(message); }
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const annotation = {id:'test-ann',era:'song',era_name:'宋代',author:'测试注家',content:'测试注疏'};
const para = id => ({id,content:`原文 ${id}`,annotations:[annotation]});
const onlineParagraph = {id:'nujie-02-01', content:'第二章原文', annotations:[annotation]};
const render = paragraphs => { state.currentParagraphs = paragraphs; reader.renderParagraphs(paragraphs); };
const tests = [
 ['书架仍有 17 个独立读书入口与详情按钮', () => { renderBookshelf(); assert(document.querySelectorAll('.book-read').length===17, '书目数量'); assert(document.querySelectorAll('.book-detail-trigger').length===17, '详情数量'); }],
 ['离线示例保留原文和两条预置注疏', async () => { state.apiAvailable=false; reader.loadDemoBook('shuyuci'); assert(state.currentParagraphs.length===1,'示例未同步'); await reader.selectParagraph(state.currentParagraphs[0]); assert(document.querySelectorAll('.timeline-item').length===2,'注疏丢失'); assert(!document.getElementById('detailPanels').inert,'面板不可操作'); }],
 ['节点切换只显示所选注疏，原文关联保持不变', () => { const sentence=document.getElementById('selectedSentence').textContent; timeline.selectTimelineNode(1); assert(document.querySelectorAll('.timeline-item:not(.node-inactive)').length===1,'显示数量'); assert(document.querySelector('.era-node[data-node="1"]').getAttribute('aria-pressed')==='true','节点状态'); assert(document.getElementById('selectedSentence').textContent===sentence,'原文关联'); assert(document.querySelector('.legend-reset').getAttribute('aria-pressed')==='false','全部状态应取消'); }],
 ['朝代筛选空态与全部重置', () => { timeline.filterTimeline('tang'); assert(!document.querySelector('.empty-timeline').hidden,'缺少空态'); timeline.filterTimeline(null); assert(document.querySelector('.empty-timeline').hidden,'重置空态'); assert(document.querySelectorAll('.hidden-era, .node-inactive').length===0,'重置筛选'); }],
 ['收起后立即重新展开不会被旧退出动画隐藏', async () => { timeline.closeTimeline(); timeline.openTimeline(state.currentParagraphs[0]); await Promise.allSettled(document.getElementById('detailPanels').getAnimations().map(a=>a.finished)); assert(document.getElementById('detailPanels').classList.contains('visible'),'重开后隐藏'); }],
 ['减弱动态效果时 JS 动画立即降级，面板仍可打开', () => { preference.matches=true; assert(motion.enter(document.getElementById('selectedSentence'))===null,'未降级'); timeline.closeTimeline(); assert(!document.getElementById('detailPanels').classList.contains('visible'),'即时收起'); timeline.openTimeline(state.currentParagraphs[0]); assert(!document.getElementById('detailPanels').inert,'降级不可读'); assert(motion.scrollBehavior()==='instant','仍平滑滚动'); preference.matches=false; }],
 ['快速选句：后返回的旧 AI 解读不会覆盖当前句子', async () => { state.apiAvailable=true; const a=para('A'),b=para('B'); render([a,b]); const first=reader.selectParagraph(a,{deferAI:false}); const second=reader.selectParagraph(b,{deferAI:false}); pending.get('B')({analysis:'当前 B 解读'}); await second; pending.get('A')({analysis:'过期 A 解读'}); await first; assert(document.getElementById('aiContent').textContent.includes('当前 B 解读'),'旧响应覆盖'); assert(document.getElementById('selectedSentence').textContent==='原文 B','原文错配'); }],
 ['快速选句：旧段落注疏请求不再打开过期内容', async () => { const a={id:'old',content:'旧句',annotations:[]},b=para('new'); render([a,b]); const first=reader.selectParagraph(a); const second=reader.selectParagraph(b,{deferAI:false}); pending.get('new')({analysis:'新句解读'}); await second; pending.get('old')({annotations:[annotation]}); await first; assert(document.getElementById('selectedSentence').textContent==='原文 new','旧注疏覆盖'); }],
 ['关闭面板使正在请求的 AI 响应失效', async () => { const c=para('closing'); render([c]); const promise=reader.selectParagraph(c,{deferAI:false}); timeline.closeTimeline(); const before=document.getElementById('aiContent').innerHTML; pending.get('closing')({analysis:'关闭后的响应'}); await promise; assert(document.getElementById('aiContent').innerHTML===before,'关闭后仍更新'); assert(state.selectedParagraph===null,'未清除选句'); }],
 ['在线章节导航保留上一章、下一章与边界状态', async () => {
   responses.set('nujie',{chapters:[{chapter_id:'nujie-01',title:'第一章'},{chapter_id:'nujie-02',title:'第二章'}]});
   responses.set('nujie-01',{paragraphs:[para('nujie-01-01')]}); responses.set('nujie-02',{paragraphs:[onlineParagraph]});
   await reader.loadBook('nujie'); assert(state.currentChapterIndex===0,'初始章节'); assert(document.querySelector('[data-action="prevChapter"]').disabled,'首章边界');
   reader.nextChapter(); await tick(); assert(state.currentParagraphs[0].id==='nujie-02-01','下一章内容'); assert(document.querySelector('[data-action="nextChapter"]').disabled,'末章边界');
   reader.prevChapter(); await tick(); assert(state.currentChapterIndex===0,'上一章');
 }],
 ['在线语义检索保留双入口结果与跳转数据', async () => {
   responses.set('query',{results:[{paragraph:{...onlineParagraph,classic_id:'nujie',chapter_title:'第二章'},annotations:[annotation]}]});
   document.getElementById('heroSemanticSearch').value='相思'; await search.semanticSearch();
   for (const id of ['heroSearchResults','readerSearchResults']) {const result=document.querySelector(`#${id} .search-result-item`); assert(result?.dataset.classic==='nujie' && result.dataset.paragraph==='nujie-02-01','检索跳转数据');}
 }],
 ['检索跳转仍打开正确章节并选中原文', async () => {
   responses.set('nujie-02-01',{analysis:'目标段落解读'}); await reader.jumpToParagraph('nujie','nujie-02-01');
   assert(state.currentChapterIndex===1 && state.selectedParagraph.id==='nujie-02-01','目标章节或原文错误');
 }],
 ['同一本书连续加载，较早的章节列表不能覆盖新列表', async () => {
   responses.delete('nujie');
   const oldRequest=reader.loadBook('nujie'); const oldReply=pending.get('nujie');
   const currentRequest=reader.loadBook('nujie');
   pending.get('nujie')({chapters:[{chapter_id:'nujie-02',title:'最新列表'}]}); await currentRequest;
   oldReply({chapters:[{chapter_id:'nujie-01',title:'旧列表'}]}); await oldRequest;
   assert(state.chapters[0].chapter_id==='nujie-02','旧列表覆盖新请求');
 }],
 ['搜索连续提交时只显示最新响应并合并重复段落', async () => {
   responses.delete('query');const input=document.getElementById('heroSemanticSearch');
   input.value='旧关键词';const old=search.semanticSearch();const oldReply=pending.get('query');
   input.value='新关键词';const current=search.semanticSearch();
   pending.get('query')({results:[{paragraph:{...onlineParagraph,classic_id:'nujie'},annotations:[annotation]},{paragraph:{...onlineParagraph,classic_id:'nujie'},annotations:[annotation]}]});await current;
   oldReply({results:[]});await old;
   assert(document.querySelectorAll('#heroSearchResults .search-result-item').length===1,'过期响应覆盖或重复段落: '+document.getElementById('heroSearchResults').innerHTML);
 }],
 ['切换作品立即清空旧段落并禁用章节按钮', async () => {
   const old = state.currentParagraphs[0];
   const promise = reader.loadBook('liuye');
   assert(!document.querySelector('.ancient-text'), '旧原文仍可操作');
   assert(!state.currentParagraphs.length && !state.selectedParagraph, '旧段落未清除');
   await reader.selectParagraph(old); assert(!state.selectedParagraph, '旧段落重新选中');
   pending.get('liuye')({chapters:[]}); await promise;
   assert(document.getElementById('originalText').textContent.includes('暂无可读章节'), '空态缺失');
 }],
 ['AI 富文本过滤执行属性、脚本及危险 URL，保留段落', () => {
   const host=document.getElementById('aiContent');
   window.marked={parse:()=>'<p onclick="alert(1)">正文<strong>重点</strong><a href="javascript:alert(1)">链接文字</a></p><script>alert(1)</script><img src=x onerror="alert(1)"><svg onload="alert(1)"></svg>'};
   renderAnalysis(host, 'test'); delete window.marked;
   assert(host.querySelector('strong')?.textContent==='重点','排版丢失');
   assert(!host.querySelector('script,img,svg,a,[onclick],[onerror],[href]'),'存在执行内容');
 }],
 ['面板重复显示不会重新启动入场动画', () => {
   const panel=document.getElementById('detailPanels'); motion.setPanelVisible(panel,true);
   const first=panel.getAnimations()[0]; motion.setPanelVisible(panel,true);
   assert(panel.getAnimations()[0]===first,'重复启动动画');
 }],
 ['初始化和销毁动效可重复执行，没有重复入口', () => {
   const first=motion.initMotion(); assert(motion.initMotion()===first,'重复初始化'); first();
   const second=motion.initMotion(); assert(second!==first,'销毁未清除'); second();
 }],
 ['统一导航记录真正来源，重复导航不再触发入场', () => {
   const home=document.createElement('section'), profile=document.createElement('section');
   home.id='page-home';home.className='page active';profile.id='page-profile';profile.className='page';
   document.body.append(home,profile);let count=0;const onChange=()=>count++;
   document.addEventListener('page-change',onChange);navigateTo('profile');navigateTo('profile');
   assert(state.previousPage==='home' && count===1 && home.inert && !profile.inert,'路由状态不一致');
   document.removeEventListener('page-change',onChange);home.remove();profile.remove();
 }],
 ['来源详情保留缺失信息且不会采信伪 verified 标签', () => {
   const source=sourceDetails({source_id:'sample:source',source_title:'测试文献',verification_status:'verified'});
   assert(source.querySelector('summary').textContent==='查看来源详情','缺少展开入口');
   assert(source.textContent.includes('出处待核验') && source.textContent.includes('未提供'),'把缺失数据或状态当作核实');
 }],
 ['来源字段只渲染为文本，不执行来源 HTML', () => {
   const host=document.createElement('div');host.appendChild(sourceDetails({source_title:'<img src=x onerror="alert(1)">',content:'<script>alert(1)</script>'}));
   assert(!host.querySelector('script,img,[onerror]'),'执行了来源 HTML');assert(host.textContent.includes('<script>'),'丢失原资料文本');
 }],
 ['AI 引用错配不显示已匹配标签，并始终保留 AI 标记', () => {
   const host=document.createElement('div');appendAIEvidence(host,{sources:[{source_id:'s',content:'真正的原文'}],readings:[{source_id:'s',quote:'虚构引文'}]});
   assert(host.textContent.includes('AI 辅助解读'),'缺少 AI 标记');assert(!host.textContent.includes('引文已匹配'),'错引被标记为匹配');
 }],
 ['隔离核验夹具只展示获准注疏，原文出处可展开', async () => {
   state.apiAvailable=true;
   const proof=s=>({...s,verification_status:'verified',verification_record:{status:'verified',source_id:s.source_id,content_sha256:'a'.repeat(64),reference:'TEST ONLY',edition:'TEST ONLY',verification_id:'TEST ONLY',reviewed_at:'2020-01-01',reference_url:'https://example.org/test-only'}});
   const a=proof({...annotation,id:'a',source_id:'test:a',content_type:'historical_annotation',dynasty:'宋代'}),b=proof({...annotation,id:'b',source_id:'test:b',era:'ming',era_name:'明代',dynasty:'明代',content_type:'historical_annotation'});
   const p={id:'nujie-02-01',content:'隔离测试原文',annotations:[a,b,annotation]};
   responses.set('nujie',{chapters:[{chapter_id:'nujie-02',title:'隔离章节'}]});responses.set('nujie-02',{paragraphs:[p]});
   await reader.loadBook('nujie',{paragraphId:p.id,selectTarget:false,guidedExample:{paragraph_id:p.id,original:proof({source_id:'test:original',content_type:'original_text',content:p.content}),annotations:[a,b]}});
   assert(document.getElementById('readerGuide').textContent.includes('已核验古籍原文'),'原文核验详情');document.querySelector('#readerGuide .btn-primary').click();await tick();
   assert(document.querySelectorAll('.timeline-item').length===2,'展示未获准注疏');assert(location.hash==='#experience','未保留体验地址');
 }],
 ['体验正文变更后退出核验模式，保留普通阅读', async () => {
   await reader.loadBook('nujie',{paragraphId:'nujie-02-01',selectTarget:false,guidedExample:{paragraph_id:'nujie-02-01',original:{content:'过期原文'},annotations:[]}});
   assert(state.guidedExample===null && !state.selectedParagraph,'变更后仍核验');assert(document.getElementById('readingStatus').textContent.includes('需重新核验'),'无变化提示');assert(document.querySelector('.ancient-text'),'普通原文丢失');
 }],
 ['公开阅读链接校验作品、章节和段落关联' , () => {
   assert(parseReadingRoute('#read/nujie/nujie-02/nujie-02-01')?.paragraphId==='nujie-02-01','有效地址');
   for(const h of ['#read/nujie/shuyuci-01','#read/nujie/nujie-01/nujie-02-01','#read/<script>/x','#read/nujie/nujie-01/'])assert(parseReadingRoute(h)===null,'接受了无效地址 '+h);
   assert(parseReadingRoute('#experience')?.experience,'体验地址');
 }],
 ['匿名定位原文不自动调用 AI，按钮才展开注疏', async () => {
   state.apiAvailable=true;responses.set('nujie',{chapters:[{chapter_id:'nujie-01',title:'第一章'},{chapter_id:'nujie-02',title:'第二章'}]});responses.set('nujie-02',{paragraphs:[onlineParagraph]});
   const before=calls.filter(c=>c.url.endsWith('/analyze')).length;
   await reader.loadBook('nujie',{paragraphId:'nujie-02-01',selectTarget:false});
   assert(state.currentChapterIndex===1 && !state.selectedParagraph,'未定位或自动选中');
   assert(document.querySelector('.is-reading-target')?.dataset.id==='nujie-02-01','缺少柔和高亮');
   document.querySelector('#readerGuide .btn-primary').click();await tick();
   assert(state.selectedParagraph?.id==='nujie-02-01','按钮未选句');assert(calls.filter(c=>c.url.endsWith('/analyze')).length===before,'自动调用了 AI');
   assert(document.getElementById('aiContent').textContent.includes('查看 AI 辅助解读'),'缺少显式 AI 操作');
   assert(location.hash==='#read/nujie/nujie-02/nujie-02-01','刷新地址错误');
 }],
 ['继续完整作品和切换作品清理引导、选句与时间轴', async () => {
   document.querySelector('#readerGuide .btn-secondary').click();assert(document.getElementById('readerGuide').hidden,'引导未收起');assert(!state.selectedParagraph,'选句未清理');assert(location.hash==='#read/nujie/nujie-02/nujie-02-01','未保留阅读位置');
   responses.set('liuye',{chapters:[]});await reader.loadBook('liuye');assert(!state.guidedExample && !state.currentParagraphs.length,'跨书残留');
 }],
 ['体验文献缺失时只提供诚实提示与普通阅读入口', async () => {
   responses.set('example',{available:false,reason:'verified_example_missing',message:'核验文献尚未备齐'});await startReadingExperience();
   const host=document.getElementById('activationStatus');assert(host.textContent.includes('核验文献尚未备齐'),'缺失提示');assert(host.querySelector('button').textContent==='先读馆藏原文','普通入口');assert(!document.getElementById('startReadingExperience').disabled,'按钮未恢复');
 }],
 ['反馈未启用不发送 POST、不显示已收到', async () => {
   responses.set('availability',{available:false});const host=createReadingFeedback({classic_id:'nujie',paragraph_id:'nujie-02-01',target:'ai_analysis'});document.getElementById('fixtures').append(host);
   const before=calls.filter(c=>c.url.endsWith('/feedback')).length;host.querySelector('[data-rating="helpful"]').click();await tick();
   assert(host.textContent.includes('本次没有提交'),'误报成功');assert(calls.filter(c=>c.url.endsWith('/feedback')).length===before,'禁用时仍 POST');host.remove();
 }],
 ['匿名反馈固定作品上下文，未知回执重试沿用幂等编号', async () => {
   responses.set('availability',{available:true});responses.set('feedback',{});const context={classic_id:'nujie',paragraph_id:'nujie-02-01',target:'ai_analysis'};
   const host=createReadingFeedback(context);document.getElementById('fixtures').append(host);context.classic_id='shuyuci';state.currentBook='shuyuci';
   const button=host.querySelector('[data-rating="helpful"]');button.click();await tick();
   const first=calls.filter(c=>c.url.endsWith('/feedback')).at(-1);assert(host.textContent.includes('尚未确认'),'未知回执误报成功');
   responses.set('feedback',{received:true});button.click();await tick();const second=calls.filter(c=>c.url.endsWith('/feedback')).at(-1);
   assert(JSON.parse(first.options.body).submission_id===JSON.parse(second.options.body).submission_id,'重试重复记录风险');assert(JSON.parse(second.options.body).work_id==='nujie','作品上下文被覆盖');assert(second.options.credentials==='omit' && !second.options.headers.Authorization,'匿名带凭证');assert(host.textContent.includes('已收到反馈'),'确认成功未显示');host.remove();
 }],
 ['问题反馈保留五类选项与隐私提示，未生成内容只允许报错', () => {
   const host=createReadingFeedback({classic_id:'nujie',paragraph_id:'nujie-02-01',target:'ai_analysis'},{problemOnly:true});document.getElementById('fixtures').append(host);
   assert(!host.querySelector('[data-rating]'),'空解读可评有帮助');host.querySelector('button').click();assert(!host.querySelector('form').hidden,'未展开表单');assert(host.querySelectorAll('option').length===6,'问题类别');assert(host.querySelector('select').required && host.querySelector('textarea').maxLength===500,'缺少限制');assert(host.textContent.includes('请勿填写姓名'),'缺少隐私提示');host.remove();
 }],
 ['未收录注疏的原文有可读空态'  , () => { timeline.openTimeline({content:'暂无注疏的句子',annotations:[]}); assert(!document.querySelector('.empty-timeline').hidden,'无注疏空态'); }],
 ['普通选句默认只展示注疏，AI 必须主动开启', async()=>{
   state.apiAvailable=true;const p=para('ordinary');render([p]);const before=calls.filter(c=>c.url.endsWith('/analyze')).length;
   await reader.selectParagraph(p);assert(calls.filter(c=>c.url.endsWith('/analyze')).length===before,'普通选句自动请求 AI');
   assert(document.getElementById('aiContent').querySelector('button')?.textContent==='查看 AI 辅助解读','没有显式入口');
 }],
 ['离开阅读使迟到章节响应失效，不能改写新页面地址',async()=>{
   responses.delete('nujie');const promise=reader.loadBook('nujie');reader.cancelReaderLoad();const hash=location.hash;
   pending.get('nujie')({chapters:[{chapter_id:'nujie-01',title:'迟到章节'}]});await promise;
   assert(location.hash===hash && state.chapters.length===0,'离开后旧请求仍写入页面');
 }],
 ['时代筛选不把魏晋或未知朝代错误归入汉代',()=>{
   timeline.openTimeline({content:'测试原文',annotations:[{...annotation,id:'jin',era:'wei_jin',era_name:'魏晋'},{...annotation,id:'yuan',era:'yuan',era_name:'元代'}]});
   timeline.filterTimeline('han');assert([...document.querySelectorAll('.timeline-item')].every(x=>x.classList.contains('hidden-era')),'颜色映射污染时代筛选');
 }],
];
document.getElementById('run').onclick = async event => {
 event.currentTarget.disabled=true; results.replaceChildren(); state.reset(); pending.clear(); responses.clear(); let passed=0;
 for (const [name,test] of tests) { const li=document.createElement('li'); try { await test(); passed++; li.textContent=`通过 · ${name}`; } catch(error) { li.textContent=`失败 · ${name}：${error.message}`; } results.appendChild(li); }
 cancelAIAnalysis(); document.getElementById('run').disabled=false;
 const summary=document.createElement('p'); summary.id='summary'; summary.textContent=`${passed} / ${tests.length} 通过`; results.appendChild(summary);
};
