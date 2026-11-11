const assert=require('node:assert/strict');
module.exports=async({open,tap,evaluate,until,check,call,delay,screenshot,reload,output,fs})=>{
 const events=()=>evaluate('window.__analyticsEvents.map(r=>r.payload)');
 const count=name=>evaluate(`window.__analyticsEvents.filter(r=>r.payload.event===${JSON.stringify(name)}).length`);
 async function reader(){await tap('#startReadingExperience');await until('!document.getElementById("readerGuide").hidden');await tap('#readerGuide .btn-primary');await until('document.querySelectorAll(".timeline-item").length===2');}
 await check('同意前浏览和注疏操作不生成标识、不发送事件',async()=>{
  await open();await reader();await delay(100);assert.equal((await events()).length,0);
  assert.equal(await evaluate('localStorage.getItem("ntm.analytics.identity.v1")'),null);assert.equal(await evaluate('sessionStorage.getItem("ntm.analytics.session.v1")'),null);
  await screenshot('consent-pending-390');
 });
 await check('同意界面及重复初始化只触发一次 landing，UTM 精确归因',async()=>{
  await open({query:'&utm_source=test_newsletter&utm_medium=email&utm_campaign=test_launch&email=PRIVATE_EMAIL'});
  await tap('#analyticsAllow');await until('window.__analyticsEvents.length===1');
  await evaluate('(async()=>{const a=await import("/js/analytics/index.js");a.initAnalytics();a.initAnalytics();document.dispatchEvent(new CustomEvent("page-change",{detail:{pageId:"home"}}))})()');await delay(100);
  assert.equal(await count('landing_view'),1);const e=(await events())[0];assert.equal(e.properties.source,'test_newsletter');assert.equal(e.properties.medium,'email');assert.equal(e.properties.campaign,'test_launch');assert.ok(!JSON.stringify(e).includes('PRIVATE_EMAIL'));
 });
 await check('游客真实激活路径事件、作品作者 ID 和恢复去重正确',async()=>{
  await open({analyticsConsent:'granted'});await reader();await delay(100);
  assert.equal(await count('landing_view'),1);assert.equal(await count('start_exploration'),1);assert.equal(await count('reading_opened'),1);
  const list=await events(),reading=list.find(e=>e.event==='reading_opened');assert.equal(reading.properties.work_id,'shuyuci');assert.equal(reading.properties.author_id,'li-qingzhao');
  assert.ok(list.every(e=>e.properties.anonymous_user_id===list[0].distinct_id&&e.properties.session_id));
  assert.equal(await evaluate('Boolean(document.querySelector("#authModal.visible"))'),false);
  const ids=await evaluate('({user:JSON.parse(localStorage.getItem("ntm.analytics.identity.v1")).id,session:JSON.parse(sessionStorage.getItem("ntm.analytics.session.v1")).id})');
  await reload('!document.getElementById("readerGuide").hidden');await delay(100);
  assert.equal(await count('landing_view'),0);assert.equal(await count('reading_opened'),0);
  assert.deepEqual(await evaluate('({user:JSON.parse(localStorage.getItem("ntm.analytics.identity.v1")).id,session:JSON.parse(sessionStorage.getItem("ntm.analytics.session.v1")).id})'),ids);
  await evaluate('history.back()');await until('document.getElementById("page-home").classList.contains("active")');await evaluate('history.forward()');await until('!document.getElementById("readerGuide").hidden');await delay(100);assert.equal(await count('start_exploration'),0);
 });
 await check('不同作品不沿用上一作品 ID',async()=>{
  await open({analyticsConsent:'granted'});await reader();await evaluate('window.app.navigateToReader("liuye")');await until('document.getElementById("currentBookTitle").textContent.includes("李冶") && Boolean(document.querySelector("[data-id=liuye-01-01]"))');await delay(100);
  const rows=(await events()).filter(e=>e.event==='reading_opened');assert.deepEqual(rows.map(e=>[e.properties.work_id,e.properties.author_id]),[['shuyuci','li-qingzhao'],['liuye','li-ye']]);
 });
 await check('搜索提交和点击各一次，不上传搜索词或完整 URL',async()=>{
  await open({analyticsConsent:'granted'});await evaluate('document.getElementById("heroSemanticSearch").value="PRIVATE_SEARCH_TEST"');await tap('#page-home [data-action=semanticSearch]');await until('Boolean(document.querySelector("#heroSearchResults .search-result-item"))');
  await evaluate('window.__clickedResult=document.querySelector("#heroSearchResults .search-result-item");window.__clickedResult.click();window.__clickedResult.click()');await until('Boolean(document.querySelector(".is-reading-target"))');await delay(100);
  assert.equal(await count('search_submitted'),1);assert.equal(await count('search_result_clicked'),1);
  const list=await events(),submitted=list.find(e=>e.event==='search_submitted'),clicked=list.find(e=>e.event==='search_result_clicked');assert.equal(clicked.properties.search_id,submitted.properties.search_id);assert.equal(clicked.properties.result_position,1);assert.equal(clicked.properties.work_id,'shuyuci');assert.ok(!JSON.stringify(list).includes('PRIVATE_SEARCH_TEST'));
 });
 await check('两条前台连续可见 5 秒注疏才完成一次有效对照',async()=>{
  await open({analyticsConsent:'granted'});await reader();await tap('#eraNavigation [data-node="0"]');await tap('.timeline-item[data-node="0"] .annotation-copy');await delay(150);
  assert.equal(await count('annotation_opened'),1);assert.equal(await count('comparison_completed'),0);
  await delay(5200);assert.equal(await count('annotation_opened'),1);assert.equal(await count('comparison_completed'),0);
  await tap('#eraNavigation [data-node="1"]');await tap('.timeline-item[data-node="1"] .annotation-copy');await delay(5200);
  assert.equal(await count('annotation_opened'),2);assert.equal(await count('comparison_completed'),1);
  await tap('#eraNavigation [data-node="0"]');await tap('.timeline-item[data-node="0"] .annotation-copy');await delay(5200);
  assert.equal(await count('annotation_opened'),2);assert.equal(await count('comparison_completed'),1);
  const e=(await events()).find(e=>e.event==='comparison_completed');assert.equal(e.properties.paragraph_id,'shuyuci-01-01');assert.equal(e.properties.comparison_rule,'visible_5s_two_sources_or_eras_v1');
 });
 await check('快速切换和后台状态不会虚构有效对照',async()=>{
  await open({analyticsConsent:'granted'});await reader();await tap('#eraNavigation [data-node="0"]');await delay(100);await tap('#eraNavigation [data-node="1"]');
  await evaluate('window.__nativeFocus=document.hasFocus.bind(document);document.hasFocus=()=>false;window.dispatchEvent(new Event("blur"))');await delay(5200);
  assert.equal(await count('comparison_completed'),0);
  await evaluate('document.hasFocus=window.__nativeFocus;window.dispatchEvent(new Event("focus"))');await tap('[data-action=closeTimeline]');await delay(100);assert.equal(await count('comparison_completed'),0);
 });
 await check('AI 使用事件仅在主动请求时触发一次，不发送对话',async()=>{
  await open({analyticsConsent:'granted'});await reader();assert.equal(await count('ai_interpretation_used'),0);await tap('#aiContent button');await delay(100);assert.equal(await count('ai_interpretation_used'),1);assert.equal((await events()).find(e=>e.event==='ai_interpretation_used').properties.usage_kind,'analysis');
 });
 await check('分享只在复制成功后记录，公开链接去除全部查询参数',async()=>{
  await open({analyticsConsent:'granted',query:'&utm_source=test_newsletter&private=PRIVATE_VALUE',hash:'#read/shuyuci/shuyuci-01/shuyuci-01-01'});await until('!document.getElementById("readerGuide").hidden');
  await evaluate('const b=[...document.querySelectorAll("#readerGuide button")].find(e=>e.textContent==="分享这一段");b.click();b.click()');await until('Boolean(window.__sharedURL)');await delay(100);
  assert.equal(await count('content_shared'),1);const url=await evaluate('window.__sharedURL');assert.ok(url.endsWith('#read/shuyuci/shuyuci-01/shuyuci-01-01'));assert.ok(!url.includes('?'));assert.ok(!JSON.stringify(await events()).includes('PRIVATE_VALUE'));
 });
 await check('失败或取消分享不计成功',async()=>{
  await open({analyticsConsent:'granted',hash:'#read/shuyuci/shuyuci-01/shuyuci-01-01'});await until('!document.getElementById("readerGuide").hidden');await evaluate('navigator.clipboard.writeText=async()=>{throw new DOMException("TEST ONLY cancelled","AbortError")};[...document.querySelectorAll("#readerGuide button")].find(e=>e.textContent==="分享这一段").click()');await delay(100);assert.equal(await count('content_shared'),0);
 });
 await check('反馈确认回执只计一次，不发送说明正文',async()=>{
  await open({analyticsConsent:'granted'});await reader();await evaluate('window.__scenario.feedbackEnabled=true');await tap('#eraNavigation [data-node="0"]');
  const selector='.timeline-item[data-node="0"] .reading-feedback [data-rating="helpful"]';await tap(selector);await until('document.querySelector(".timeline-item .feedback-status").textContent.includes("已收到")');await tap(selector);await delay(100);assert.equal(await count('feedback_submitted'),1);
  await evaluate('const host=document.querySelector(".timeline-item .reading-feedback");[...host.querySelectorAll("button")].find(b=>b.textContent==="反馈问题").click();host.querySelector("select").value="other";host.querySelector("textarea").value="PRIVATE_FEEDBACK_TEST";host.querySelector("form").requestSubmit()');await delay(100);assert.equal(await count('feedback_submitted'),2);assert.ok(!JSON.stringify(await events()).includes('PRIVATE_FEEDBACK_TEST'));
  const list=await events();assert.ok(list.every(e=>!('note' in e.properties)&&!('body' in e.properties)));assert.equal(list.find(e=>e.event==='feedback_submitted').properties.annotation_id,'huzi-shuyuci-01-01');
 });
 await check('反馈服务未启用时不计提交成功',async()=>{
  await open({analyticsConsent:'granted'});await reader();await tap('#eraNavigation [data-node="0"]');await tap('.timeline-item[data-node="0"] .reading-feedback [data-rating="helpful"]');await delay(100);assert.equal(await count('feedback_submitted'),0);
 });
 await check('分析服务不可用不影响阅读且无自动重试',async()=>{
  await open({analyticsConsent:'granted'});await evaluate('window.__scenario.analyticsFailure=true');await reader();await delay(100);
  assert.equal(await evaluate('document.querySelectorAll(".timeline-item").length'),2);assert.equal(await count('start_exploration'),1);await delay(300);const rows=await events();assert.equal(new Set(rows.map(e=>e.uuid)).size,rows.length);for(const name of ['landing_view','start_exploration','reading_opened'])assert.equal(rows.filter(e=>e.event===name).length,1);assert.equal(await evaluate('Boolean(document.querySelector("#authModal.visible"))'),false);
 });
 await check('关闭非必要分析立即生效，清除标识并保留账号',async()=>{
  await open({analyticsConsent:'granted',logged:true});await delay(100);await tap('#analyticsSettings');await tap('#analyticsDeny');const before=(await events()).length;
  assert.equal(await evaluate('localStorage.getItem("ntm.analytics.identity.v1")'),null);assert.equal(await evaluate('sessionStorage.getItem("ntm.analytics.session.v1")'),null);assert.equal(await evaluate('localStorage.getItem("community_token")'),'TEST-ONLY-TOKEN');
  await reader();await delay(100);assert.equal((await events()).length,before);
 });
 await check('DNT/GPC 不跟踪信号保持关闭且不生成标识',async()=>{
  await open({gpc:true,analyticsConsent:'granted'});await reader();await delay(100);assert.equal((await events()).length,0);assert.equal(await evaluate('localStorage.getItem("ntm.analytics.identity.v1")'),null);await tap('#analyticsSettings');assert.equal(await evaluate('document.getElementById("analyticsAllow").disabled'),true);
 });
 await check('测试事件强制隔离，不含敏感正文和平台自动采集字段',async()=>{
  await open({analyticsConsent:'granted',query:'&utm_source=PRIVATE_EMAIL%40test.invalid&utm_medium=unknown'});await reader();await delay(100);
  const list=await events();assert.ok(list.length>=3);for(const e of list){assert.equal(e.properties.environment,'test');assert.equal(e.properties.is_test,true);assert.equal(e.properties.$process_person_profile,false);assert.equal(e.properties.$geoip_disable,true);for(const name of ['source','medium','campaign','$current_url','$referrer','email','token','cookie','query','note','content'])assert.ok(!(name in e.properties));}
  await fs.writeFile(output+'/browser-test-events.json',JSON.stringify({environment:'TEST ONLY; intercepted locally, never sent to real PostHog',events:list},null,2)+'\n');
 });
};
