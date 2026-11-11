const assert=require('node:assert/strict');
module.exports=async({open,tap,evaluate,until,check,call,delay,screenshot,reload})=>{
 const posts=()=>evaluate('window.__calls.filter(c=>c.path==="/api/feedback")');
 const item='.timeline-item[data-node="0"]',widget=item+' > .reading-feedback';
 async function reader(options={}){await open(options);await tap('#startReadingExperience',options.width);await until('!document.getElementById("readerGuide").hidden');await tap('#readerGuide .btn-primary',options.width);await until('document.querySelectorAll(".timeline-item").length===2');await evaluate('window.__scenario.feedbackEnabled=true');await tap('#eraNavigation [data-node="0"]',options.width)}
 for(const width of [375,390,768,1440])await check('来源纠错完整流程 '+width+'px',async()=>{
  await reader({width});await tap(item+' summary',width);await tap(item+' .source-report',width);
  assert.equal(await evaluate('document.activeElement.tagName'),'SELECT');assert.equal(await evaluate(`document.querySelector('${widget} select').value`),'questionable_source');
  const before=(await posts()).length;await tap(widget+' [type=submit]',width);await until(`document.querySelector('${widget} .feedback-status').textContent.includes('已收到反馈')`);
  const rows=await posts();assert.equal(rows.length,before+1);const payload=JSON.parse(rows.at(-1).body);assert.equal(payload.work_id,'shuyuci');assert.equal(payload.paragraph_id,'shuyuci-01-01');assert.equal(payload.annotation_id,'huzi-shuyuci-01-01');assert.equal(payload.issue_type,'questionable_source');assert.equal(payload.note,null);assert.equal(rows.at(-1).authorization,null);assert.equal(rows.at(-1).credentials,'omit');
  assert.equal(await evaluate('document.activeElement.classList.contains("source-report")'),true);
  assert.ok(await evaluate('(()=>{const r=document.activeElement.getBoundingClientRect();return r.top>=80&&r.bottom<=innerHeight})()'));
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));await delay(250);await screenshot('source-feedback-'+width);
 });
 await check('空问题类型拒绝，补充说明自愿，字段错误可访问',async()=>{
  await reader();await evaluate(`document.querySelector('${widget}').openIssue()`);await evaluate(`document.querySelector('${widget} form').requestSubmit()`);await delay(80);
  assert.equal((await posts()).length,0);assert.equal(await evaluate(`document.querySelector('${widget} select').getAttribute('aria-invalid')`),'true');assert.ok(await evaluate(`document.querySelector('${widget} .feedback-status').textContent.includes('请选择')`));assert.equal(await evaluate('document.activeElement.tagName'),'SELECT');
 });
 await check('键盘 Escape 和取消返回原触发按钮，不关闭阅读面板',async()=>{
  await reader();await tap(item+' summary');await tap(item+' .source-report');await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  assert.equal(await evaluate(`document.querySelector('${widget} form').hidden`),true);assert.equal(await evaluate('document.activeElement.classList.contains("source-report")'),true);assert.equal(await evaluate('document.getElementById("detailPanels").classList.contains("visible")'),true);
  await evaluate(`document.querySelector('${widget}').openIssue()`);await tap(widget+' form [type=button]');assert.equal(await evaluate(`document.querySelector('${widget} form').hidden`),true);
 });
 await check('键盘 Enter 和 Tab 可以完整纠错并提交',async()=>{
  await reader({width:1440});await delay(300);await evaluate(`document.querySelector('${item} summary').focus()`);assert.equal(await evaluate('document.activeElement.tagName'),'SUMMARY');
  const key=async(name,code)=>{await call('Input.dispatchKeyEvent',{type:'keyDown',key:name,code:name,windowsVirtualKeyCode:code,...(name==='Enter'?{text:'\r',unmodifiedText:'\r'}:{})});await call('Input.dispatchKeyEvent',{type:'keyUp',key:name,code:name,windowsVirtualKeyCode:code})};
  await key('Enter',13);assert.equal(await evaluate(`document.querySelector('${item} details').open`),true,'native details Enter');await evaluate(`document.querySelector('${item} .source-report').focus()`);assert.equal(await evaluate('document.activeElement.classList.contains("source-report")'),true,'source trigger focus');await key('Enter',13);assert.equal(await evaluate('document.activeElement.tagName'),'SELECT');await key('Tab',9);assert.equal(await evaluate('document.activeElement.tagName'),'TEXTAREA');await key('Tab',9);assert.equal(await evaluate('document.activeElement.type'),'submit');await key('Enter',13);await until(`document.querySelector('${widget} .feedback-status').textContent.includes('已收到反馈')`);assert.equal((await posts()).length,1);
 });
 await check('刷新不自动重放，面板重新挂载没有重复提交监听',async()=>{
  await reader();await evaluate(`document.querySelector('${widget}').openIssue('other')`);await reload('!document.getElementById("readerGuide").hidden');assert.equal((await posts()).length,0);await tap('#readerGuide .btn-primary');await until('document.querySelectorAll(".timeline-item").length===2');await tap('[data-action=closeTimeline]');await tap('#readerGuide .btn-primary');await until('document.querySelectorAll(".timeline-item").length===2');await tap('#eraNavigation [data-node="0"]');await evaluate('window.__scenario.feedbackEnabled=true');assert.equal(await evaluate(`document.querySelectorAll('${widget}').length`),1);await tap(widget+' [data-rating=helpful]');await until(`document.querySelector('${widget} .feedback-status').textContent.includes('已收到反馈')`);assert.equal((await posts()).length,1);
 });
 await check('网络失败保留输入和幂等编号，明确重试后确认成功',async()=>{
  await reader();await evaluate('window.__scenario.feedbackFailure=true');await evaluate(`const h=document.querySelector('${widget}');h.openIssue('other');h.querySelector('textarea').value='TEST ONLY PRIVATE DESCRIPTION';h.querySelector('form').requestSubmit()`);
  await until(`!document.querySelector('${widget} .feedback-retry').hidden`);assert.ok(!(await evaluate(`document.querySelector('${widget} .feedback-status').textContent`)).includes('已收到反馈'));assert.equal(await evaluate(`document.querySelector('${widget} textarea').value`),'TEST ONLY PRIVATE DESCRIPTION');
  const first=JSON.parse((await posts()).at(-1).body);await evaluate('window.__scenario.feedbackFailure=false');await tap(widget+' .feedback-retry');await until(`document.querySelector('${widget} .feedback-status').textContent.includes('已收到反馈')`);
  assert.equal(JSON.parse((await posts()).at(-1).body).submission_id,first.submission_id);assert.equal(await evaluate(`document.querySelector('${widget} form').hidden`),true);
 });
 await check('进行中快速重复点击只发送一个提交请求',async()=>{
  await reader();await evaluate(`window.__scenario.feedbackDelay=250;const b=document.querySelector('${widget} [data-rating=helpful]');b.click();b.click();b.click()`);await until(`document.querySelector('${widget} .feedback-status').textContent.includes('已收到反馈')`);assert.equal((await posts()).length,1);
 });
 await check('数据库错误显示请求编号，保留表单且允许重试',async()=>{
  await reader();await evaluate(`window.__scenario.feedbackError=true;document.querySelector('${widget}').openIssue('inaccurate_content');document.querySelector('${widget} form').requestSubmit()`);await until(`!document.querySelector('${widget} .feedback-retry').hidden`);assert.ok((await evaluate(`document.querySelector('${widget} .feedback-status').textContent`)).includes('TEST-ONLY-REQUEST'));assert.equal(await evaluate(`document.querySelector('${widget} form').hidden`),false);
 });
 await check('AI 结果有帮助/没有帮助/问题入口及可选响应编号',async()=>{
  await reader();await evaluate('window.__scenario.aiValidated=true;window.__scenario.aiResponseId=crypto.randomUUID()');await tap('#aiContent button');await until('Boolean(document.querySelector("#aiContent .reading-feedback"))');
  const text=await evaluate('document.querySelector("#aiContent .reading-feedback").textContent');for(const value of ['这段解读对你有帮助吗？','有帮助','没有帮助','反馈问题'])assert.ok(text.includes(value));
  await tap('#aiContent [data-rating=helpful]');await until('document.querySelector("#aiContent .feedback-status").textContent.includes("已收到反馈")');const payload=JSON.parse((await posts()).at(-1).body);assert.equal(payload.target,'ai_analysis');assert.equal(payload.annotation_id,undefined);assert.equal(payload.ai_response_id,await evaluate('window.__scenario.aiResponseId'));
 });
 await check('阅读器核心区域游客可反馈，继续阅读不受影响',async()=>{
  await reader();await tap('[data-action=closeTimeline]');await evaluate('document.querySelector("#readerGuide .reading-feedback").openIssue("interaction_problem")');await tap('#readerGuide .reading-feedback [type=submit]');await until('document.querySelector("#readerGuide .feedback-status").textContent.includes("已收到反馈")');assert.equal(JSON.parse((await posts()).at(-1).body).target,'reading');assert.equal(await evaluate('Boolean(document.querySelector("#authModal.visible"))'),false);
  await evaluate('[...document.querySelectorAll("#readerGuide button")].find(b=>b.textContent==="继续阅读完整作品").click()');assert.equal(await evaluate('document.getElementById("readerGuide").hidden'),true);assert.equal(await evaluate('document.activeElement.dataset.id'),'shuyuci-01-01');
 });
 await check('登录用户提交不携带凭据，切换作品后关联新的作品 ID',async()=>{
  await reader({logged:true});await evaluate('window.app.navigateToReader("liuye")');await until('Boolean(document.querySelector("[data-id=liuye-01-01]"))');await tap('[data-id=liuye-01-01]');await tap('[data-action=closeTimeline]');await evaluate('document.querySelector("#readerGuide .reading-feedback").openIssue("other");document.querySelector("#readerGuide .reading-feedback form").requestSubmit()');await until('document.querySelector("#readerGuide .feedback-status").textContent.includes("已收到反馈")');const row=(await posts()).at(-1),payload=JSON.parse(row.body);assert.equal(payload.work_id,'liuye');assert.equal(payload.paragraph_id,'liuye-01-01');assert.equal(row.authorization,null);assert.equal(row.credentials,'omit');assert.equal(await evaluate('localStorage.getItem("community_token")'),'TEST-ONLY-TOKEN');
 });
};
