/** Real Chrome UI integration with explicitly TEST-ONLY approval fixtures.
 * Starts its own local static server. No real AI, auth or database requests.
 * Run: node tests/browser-activation.cjs
 */
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createHash,randomUUID}=require('node:crypto');
const assert=require('node:assert/strict');
const WebSocket=require('../cf-worker/node_modules/ws');
const http=require('node:http');
const {once}=require('node:events');
const root=path.resolve(__dirname,'..');
const analyticsMode=process.env.NTM_ANALYTICS_TEST==='true';
const feedbackMode=process.env.NTM_FEEDBACK_TEST==='true';
const output=path.resolve(root,process.env.NTM_TEST_OUTPUT||(feedbackMode?'docs/feedback-evidence/2026-11-06/browser':analyticsMode?'docs/analytics-evidence/2026-11-06/browser':'docs/activation-evidence/2026-11-06'));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

(async()=>{
 await fs.mkdir(output,{recursive:true});
 const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
 const server=http.createServer(async(req,res)=>{
  if(analyticsMode&&req.url==='/js/analytics/config.js'){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});res.end('export default '+JSON.stringify({enabled:true,projectKey:'phc_TEST_ONLY',apiHost:'https://eu.i.posthog.com',environment:'test',utmAllowlist:{source:['test_newsletter','test_social'],medium:['email'],campaign:['test_launch']}}));return;}
  const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  try{const data=await fs.readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data)}catch{res.writeHead(404);res.end()}
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 const catalog=JSON.parse(await fs.readFile(path.join(root,'knowledge_base/metadata/classics.json'),'utf8')).classics;
 const chapters={};
 for(const id of ['shuyuci-01','shuyuci-02','liuye-01']){
  const chapter=JSON.parse(await fs.readFile(path.join(root,`knowledge_base/content/${id.split('-')[0]}/${id}.json`),'utf8'));
  for(const para of chapter.paragraphs)para.annotations=para.annotations.map(a=>({...a,source_id:`${para.id}:annotation:${a.id}`,source_title:a.source,dynasty:a.era_name,verification_status:a.ai_generated?'ai_generated':'unverified',content_type:a.ai_generated?'ai_interpretation':a.era==='modern'?'modern_research':'historical_annotation'}));
  chapters[id]=chapter;
 }
 const original=chapters['shuyuci-01'].paragraphs[0];
 const proof=s=>({...s,verification_status:'verified',verification_record:{status:'verified',source_id:s.source_id,source_title:s.source_title,author:s.author,dynasty:s.dynasty,content_sha256:createHash('sha256').update(s.content).digest('hex'),reference:'TEST ONLY — not a real approval',edition:'TEST ONLY',verification_id:'TEST ONLY',reviewed_at:'2020-01-01',reference_url:'https://example.org/TEST-ONLY'}});
 const example={classic_id:'shuyuci',chapter_id:'shuyuci-01',paragraph_id:original.id,original:proof({source_id:`${original.id}:original`,source_title:'漱玉词',author:'李清照',dynasty:'宋',content_type:'original_text',content:original.content}),annotations:[proof(original.annotations.find(a=>a.era==='song')),proof(original.annotations.find(a=>a.era==='ming'))]};
 const fixture={chapters,example,catalog};
 const profile=path.join(os.tmpdir(),'ntm-activation-'+randomUUID());
 const child=spawn(process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--user-data-dir='+profile,'--remote-debugging-port=9227','about:blank'],{stdio:'ignore'});
 let ws,scriptId;
 const report={measured_at:new Date().toISOString(),environment:'Real headless Chrome + actual application HTML/JS/CSS; all API requests controlled; approval proofs are TEST ONLY, not historical verification',results:[],viewports:[],errors:[]};
 try{
  let tabs;
  for(let i=0;i<60;i++){try{tabs=await(await fetch('http://127.0.0.1:9227/json/list')).json();break}catch{await delay(100)}}
  if(!tabs)throw Error('Chrome debugger unavailable');
  ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)});
  let sequence=0;const pending=new Map();
  ws.on('message',raw=>{const m=JSON.parse(raw);if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}else if(m.method==='Runtime.exceptionThrown')report.errors.push(m.params.exceptionDetails)});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))});
  report.browser=await call('Browser.getVersion');
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
  const until=async(expression)=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(60)}throw Error('Timed out: '+expression)};
  const check=async(name,fn)=>{if(process.env.NTM_TEST_FILTER&&!name.includes(process.env.NTM_TEST_FILTER))return;try{await fn();report.results.push({name,status:'PASS'});console.log('PASS '+name)}catch(error){report.results.push({name,status:'FAIL',error:error.message,diagnostic:await evaluate('({hash:location.hash,page:document.querySelector(".page.active")?.id,calls:window.__calls,detailVisible:document.getElementById("bookDetail")?.classList.contains("visible"),text:document.getElementById("originalText")?.textContent,lastTap:window.__lastTap})').catch(()=>null)});console.log('FAIL '+name+': '+error.message);await screenshot('failure-'+report.results.length).catch(()=>{})}await fs.writeFile(path.join(output,'browser-flows.json'),JSON.stringify(report,null,2)+'\n')};
  await call('Page.enable');await call('Runtime.enable');await call('Network.enable');
  await call('Network.setCacheDisabled',{cacheDisabled:true});
  await call('Network.setBlockedURLs',{urls:['https://*','http://localhost:8787/*']});
  async function open({width=390,logged=false,mode='verified',reduced=false,hash='',theme='light',analyticsConsent=null,query='',gpc=false}={}){
   const fixtureKey=randomUUID();
   await call('Emulation.setDeviceMetricsOverride',{width,height:width>768?1000:844,deviceScaleFactor:1,mobile:width<=768});
   await call('Emulation.setTouchEmulationEnabled',{enabled:width<=768});
   await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]});
   if(scriptId)await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:scriptId});
   const setup=`
    window.__documentToken=crypto.randomUUID();window.__fixture=${JSON.stringify(fixture)};window.__scenario={mode:${JSON.stringify(mode)},delayActivation:0,delayChapters:0};window.__calls=[];window.__analyticsEvents=[];
    localStorage.removeItem('community_token');localStorage.removeItem('community_user');
    if(sessionStorage.getItem('ntm-test-fixture')!==${JSON.stringify(fixtureKey)}){
     for(const key of ['ntm.analytics.consent.v1','ntm.analytics.identity.v1'])localStorage.removeItem(key);sessionStorage.removeItem('ntm.analytics.session.v1');sessionStorage.setItem('ntm-test-fixture',${JSON.stringify(fixtureKey)});
     ${analyticsConsent?`localStorage.setItem('ntm.analytics.consent.v1',JSON.stringify({version:1,value:${JSON.stringify(analyticsConsent)},at:Date.now()}));`:''}
    }
    Object.defineProperty(navigator,'globalPrivacyControl',{value:${gpc},configurable:true});
    ${analyticsMode?"Object.defineProperty(navigator,'share',{value:undefined,configurable:true});Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__sharedURL=text}},configurable:true});":''}
    localStorage.setItem('theme',${JSON.stringify(theme)});
    ${logged?"localStorage.setItem('community_token','TEST-ONLY-TOKEN');localStorage.setItem('community_user',JSON.stringify({id:123,username:'test-only',nickname:'测试用户'}));":''}
    const nativeFetch=window.fetch.bind(window);
    window.fetch=async(input,options={})=>{
     const url=new URL(String(input),location.href),p=url.pathname;
     if(url.hostname.endsWith('.i.posthog.com')){window.__analyticsEvents.push({payload:JSON.parse(options.body),credentials:options.credentials,referrerPolicy:options.referrerPolicy});if(window.__scenario.analyticsFailure)throw Error('TEST ONLY analytics unavailable');return new Response('{"status":1}',{status:200})}
     if(!p.startsWith('/api/'))return nativeFetch(input,options);
     window.__calls.push({path:p,method:options.method||'GET',credentials:options.credentials||null,authorization:options.headers?.Authorization||null,body:options.body||null});
     const reply=(data,status=200)=>Promise.resolve(new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}}));
     const sleep=ms=>new Promise(r=>setTimeout(r,ms));const f=window.__fixture,s=window.__scenario;
     if(p==='/api/health')return reply({status:'ok'});
     if(p==='/api/activation/example'){
      await sleep(s.delayActivation);if(options.signal?.aborted)throw new DOMException('Aborted','AbortError');
      if(s.mode==='network')throw new TypeError('TEST ONLY network failure');
      return reply(s.mode==='missing'?{available:false,reason:'verified_example_missing',message:'已核验体验文献尚未备齐；普通馆藏仍可阅读。'}:{available:true,example:f.example});
     }
     if(p.startsWith('/api/chapters/')){await sleep(s.delayChapters);const id=p.split('/').pop();return reply({chapters:s.mode==='missingChapter'?[]:Object.values(f.chapters).filter(c=>c.classic_id===id).map(c=>({chapter_id:c.chapter_id,title:c.title}))})}
     if(p.startsWith('/api/paragraphs/')){if(s.mode==='chapterNetwork')throw new TypeError('TEST ONLY chapter network failure');const c=f.chapters[p.split('/').pop()];return reply({paragraphs:s.mode==='missingParagraph'?[]:c?.paragraphs||[]})}
     if(p.startsWith('/api/paragraph/')){const id=p.split('/').pop(),para=Object.values(f.chapters).flatMap(c=>c.paragraphs).find(x=>x.id===id);return reply({paragraph:para,annotations:para?.annotations||[]})}
     if(p==='/api/feedback/availability')return reply({available:s.feedbackEnabled===true});
     if(p==='/api/feedback'){if(s.feedbackDelay)await sleep(s.feedbackDelay);if(s.feedbackFailure)throw new TypeError('TEST ONLY network failure');if(s.feedbackError)return reply({error:'反馈暂时不可用，请重试。',error_type:'database_transport',request_id:'TEST-ONLY-REQUEST'},503);return reply(s.feedbackUnconfirmed?{}:{received:true})}
     if(p==='/api/query')return reply({results:[{paragraph:{...f.chapters['shuyuci-01'].paragraphs[0],classic_id:'shuyuci',chapter_title:'春日闲情'},annotations:f.chapters['shuyuci-01'].paragraphs[0].annotations}]});
     if(p==='/api/analyze'||p==='/api/annotation/interpret')return s.aiValidated?reply({analysis:'TEST ONLY AI response fixture',interpretation:'TEST ONLY AI response fixture',generation_status:'validated',ai_response_id:s.aiResponseId,readings:[],sources:[]}):reply({error:'TEST ONLY AI unavailable'},503);
     if(p.endsWith('/reading-progress'))return reply({ok:true});
     if(p==='/api/community/reset-password'){
      const body=JSON.parse(options.body);
      return body.code==='a'.repeat(64)
       ? reply({message:'密码已重置，请使用新密码登录。'})
       : reply({error:'恢复码无效、已过期或已使用'},401);
     }
     if(p.endsWith('/categories'))return reply([{id:1,name:'测试分类'}]);
     if(p.endsWith('/comments'))return reply([]);
     if(p==='/api/community/posts/1')return reply({post:{id:1,title:'测试帖子',content:'TEST ONLY',user_id:999,nickname:'测试作者',created_at:'2026-01-01',comment_count:0,like_count:0}});
     if(p.endsWith('/posts'))return reply({posts:[{id:1,title:'测试帖子',content:'TEST ONLY',nickname:'测试作者',category_name:'测试分类',created_at:'2026-01-01'}],total:1});
     return reply({});
    };
    document.addEventListener('DOMContentLoaded',()=>{const note=document.createElement('div');note.textContent='隔离交互测试 · 核验记录为夹具，非真实文献审核';note.style.cssText='position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#f7f5ef;color:#503a2f;font:11px/1.6 sans-serif;padding:4px;text-align:center;pointer-events:none';document.body.append(note)});
   `;
   scriptId=(await call('Page.addScriptToEvaluateOnNewDocument',{source:setup})).identifier;
   await call('Page.navigate',{url:base+'/index.html?activation='+randomUUID()+query+hash});
   await until('Boolean(window.app && document.getElementById("loginBtn") || window.app && document.querySelector(".user-avatar"))');
  }
  async function tap(selector,width=390){
   await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({behavior:'instant',block:'center'})`);await delay(50);
   const r=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
   await evaluate(`window.__lastTap={selector:${JSON.stringify(selector)},hit:document.elementFromPoint(${r.x},${r.y})?.outerHTML?.slice(0,300),x:${r.x},y:${r.y}}`);
   if(width<=768){await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x,y:r.y}]});await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}
   else{await call('Input.dispatchMouseEvent',{type:'mousePressed',x:r.x,y:r.y,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:r.x,y:r.y,button:'left',clickCount:1})}
  }
  const noAI=()=>evaluate("window.__calls.filter(c=>c.path==='/api/analyze'||c.path==='/api/annotation/interpret').length");
  async function reload(ready){const previous=await evaluate('window.__documentToken');await call('Page.reload');await until(`window.__documentToken!==${JSON.stringify(previous)} && (${ready})`);}
  async function screenshot(name){const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(path.join(output,name+'.png'),Buffer.from(shot.data,'base64'))}
  await check('前端模块回归（禁用缓存，当前版本）',async()=>{
   await call('Page.navigate',{url:base+'/tests/regression.html?activation='+Date.now()});
   await until('Boolean(document.getElementById("run")?.onclick)');await evaluate('document.getElementById("run").click()');await until('Boolean(document.getElementById("summary"))');
   const result=await evaluate('({rows:[...document.querySelectorAll("#results li")].map(e=>e.textContent),summary:document.getElementById("summary").textContent})');
   await fs.writeFile(path.join(output,'module-tests.json'),JSON.stringify(result,null,2)+'\n');assert.equal(result.rows.length,35);assert.ok(result.rows.every(r=>r.startsWith('通过')));assert.equal(result.summary,'35 / 35 通过');
  });
  if(feedbackMode){await require('./feedback-browser-scenarios.cjs')({open,tap,evaluate,until,check,call,delay,screenshot,reload,report,output,fs});}
  else if(analyticsMode){await require('./analytics-browser-scenarios.cjs')({open,tap,evaluate,until,check,call,delay,screenshot,reload,report,output,fs});}
  else {
  await check('移动端旧账号密码重置与登录回跳',async()=>{
   await open({width:390});
   await tap('#loginBtn');
   await tap('[data-tab="recovery"]');
   await evaluate(`document.getElementById('recoveryUsername').value='legacy-browser-fixture';
    document.getElementById('recoveryCode').value='b'.repeat(64);
    document.getElementById('recoveryPassword').value='isolated-browser-fixture-password';`);
   await tap('#authSubmit');
   await until("!document.getElementById('recoveryError').hidden");
   assert.match(await evaluate("document.getElementById('recoveryError').textContent"),/恢复码无效/);
   await evaluate("document.getElementById('recoveryCode').value='a'.repeat(64)");
   await tap('#authSubmit');
   await until("!document.getElementById('recoverySuccess').hidden");
   assert.equal(await evaluate("document.getElementById('loginUsername').value"),'legacy-browser-fixture');
   assert.ok(await evaluate("!document.getElementById('recoveryCode').value && !document.getElementById('recoveryPassword').value"));
   assert.equal(await evaluate("localStorage.getItem('community_token')"),null);
  });
  for(const width of [375,390,768,1440])await check(`完整触屏/鼠标流程 ${width}px`,async()=>{
   await open({width});await tap('#startReadingExperience',width);
   await until('!document.getElementById("readerGuide").hidden && document.querySelector(".is-reading-target")?.dataset.id==="shuyuci-01-01"');
   assert.equal(await evaluate('location.hash'),'#experience');assert.equal(await noAI(),0);
   assert.equal(await evaluate('Boolean(document.querySelector("#authModal.visible"))'),false);
   await tap('#readerGuide .btn-primary',width);await until('document.querySelectorAll(".timeline-item").length===2');
   await tap('#eraNavigation [data-node="1"]',width);
   assert.equal(await evaluate('document.querySelectorAll(".timeline-item:not(.node-inactive):not(.hidden-era)").length'),1);
   await tap('.timeline-item:not(.node-inactive) .source-details summary',width);
   assert.equal(await evaluate('document.querySelector(".timeline-item:not(.node-inactive) details").open'),true);
   const layout=await evaluate(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,annotationVisible:document.querySelector('.timeline-item:not(.node-inactive)').getBoundingClientRect().width,eraButtons:[...document.querySelectorAll('.era-node')].map(e=>e.getBoundingClientRect().height),sourceTouchHeight:document.querySelector('.timeline-item:not(.node-inactive) summary').getBoundingClientRect().height})`);
   report.viewports.push(layout);assert.ok(layout.scrollWidth<=width+1);assert.ok(layout.eraButtons.every(h=>h>=43.9));assert.ok(layout.sourceTouchHeight>=43.9);
   await screenshot('timeline-'+width);
   await tap('.timeline-reading-actions button',width);await until('location.hash==="#read/shuyuci/shuyuci-01/shuyuci-01-01" && document.getElementById("readerGuide").hidden');
   assert.equal(await evaluate('document.activeElement.dataset.id'),'shuyuci-01-01');
   await reload('Boolean(document.querySelector(".is-reading-target")?.dataset.id==="shuyuci-01-01" && !document.getElementById("readerGuide").hidden)');
   assert.equal(await noAI(),0);
   await evaluate('history.back()');await until('document.getElementById("page-home").classList.contains("active")');
   await evaluate('history.forward()');await until('document.getElementById("page-reader").classList.contains("active") && Boolean(document.querySelector(".is-reading-target"))');
   await evaluate('window.app.navigateToReader("liuye")');await until('document.getElementById("currentBookTitle").textContent.includes("李冶") && Boolean(document.querySelector("[data-id=liuye-01-01]"))');
   assert.equal(await evaluate('Boolean(document.querySelector(".ancient-text.selected"))'),false);assert.equal(await noAI(),0);
   assert.equal(await evaluate('window.__calls.filter(c=>c.path.endsWith("/reading-progress")).length'),0);
  });
  await check('数据缺口真实提示，普通阅读不冒充已核验示例',async()=>{
   await open({mode:'missing'});await tap('#startReadingExperience');await until('Boolean(document.querySelector("#activationStatus button"))');
   assert.ok((await evaluate('document.getElementById("activationStatus").textContent')).includes('尚未备齐'));
   await screenshot('missing-data-390');await tap('#activationStatus button');await until('!document.getElementById("readerGuide").hidden');
   await tap('#readerGuide .btn-primary');await until('document.querySelectorAll(".timeline-item").length>2');
   assert.ok((await evaluate('document.getElementById("timelineTrack").textContent')).includes('待核验'));assert.equal(await noAI(),0);
  });
  await check('刷新体验地址会重新核验，公开阅读支持键盘选句',async()=>{
   await open({hash:'#experience'});await until('!document.getElementById("readerGuide").hidden');
   assert.equal(await evaluate('window.__calls.filter(c=>c.path==="/api/activation/example").length'),1);
   await reload('!document.getElementById("readerGuide").hidden');
   assert.equal(await evaluate('window.__calls.filter(c=>c.path==="/api/activation/example").length'),1);assert.equal(await noAI(),0);
   await evaluate('document.querySelector(".is-reading-target").focus({preventScroll:true})');
   await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
   await until('document.querySelectorAll(".timeline-item").length===2');assert.equal(await noAI(),0);
  });
  await check('网络异常可重试，无自动重放或伪造内容',async()=>{
   await open({mode:'network'});await tap('#startReadingExperience');await until('document.getElementById("activationStatus").textContent.includes("重新加载体验文献")');
   assert.equal(await evaluate('window.__calls.filter(c=>c.path==="/api/activation/example").length'),1);
   await evaluate('window.__scenario.mode="verified"');await tap('#activationStatus button');await until('!document.getElementById("readerGuide").hidden');
   assert.equal(await noAI(),0);
  });
  for(const [mode,text] of [['missingChapter','暂无可读章节'],['missingParagraph','指定原文未找到'],['chapterNetwork','原文加载失败']])await check('内容/网络错误 '+mode,async()=>{
   await open({mode});await tap('#startReadingExperience');await until(`document.getElementById('page-reader').classList.contains('active') && document.body.textContent.includes(${JSON.stringify(text)})`);
   assert.equal(await evaluate('Boolean(document.querySelector(".ancient-text.selected"))'),false);assert.equal(await noAI(),0);
  });
  await check('离开首页取消迟到体验请求，不覆盖书架',async()=>{
   await open();await evaluate('window.__scenario.delayActivation=300');await tap('#startReadingExperience');await evaluate('window.app.navigateToBookshelf()');await delay(450);
   assert.equal(await evaluate('document.getElementById("page-bookshelf").classList.contains("active")'),true);assert.equal(await evaluate('location.hash'),'#page/bookshelf');
  });
  await check('已登录用户同样无需 AI；公共读取不携带账号，进度权限保留',async()=>{
   await open({logged:true});await tap('#startReadingExperience');await until('!document.getElementById("readerGuide").hidden');await tap('#readerGuide .btn-primary');await delay(1350);
   const calls=await evaluate('window.__calls');assert.ok(calls.some(c=>c.path.endsWith('/reading-progress')&&c.authorization==='Bearer TEST-ONLY-TOKEN'));
   assert.ok(calls.filter(c=>!c.path.startsWith('/api/community/')).every(c=>c.credentials==='omit'&&!c.authorization));assert.equal(await noAI(),0);
  });
  await check('AI 只有主动点击才请求，失败不影响历史注疏',async()=>{
   await open();await tap('#startReadingExperience');await until('!document.getElementById("readerGuide").hidden');await tap('#readerGuide .btn-primary');assert.equal(await noAI(),0);
   await tap('#aiContent button');await until('document.getElementById("aiContent").textContent.includes("暂时不可用")');assert.equal(await noAI(),1);assert.equal(await evaluate('document.querySelectorAll(".timeline-item").length'),2);
  });
  await check('减少动效偏好：流程可用且无活动动画',async()=>{
   await open({reduced:true});await tap('#startReadingExperience');await until('!document.getElementById("readerGuide").hidden');await tap('#readerGuide .btn-primary');await delay(100);
   assert.equal(await evaluate('document.getAnimations().filter(a=>a.playState==="running").length'),0);assert.equal(await noAI(),0);
  });
  await check('作品详情直接阅读并关闭详情弹窗',async()=>{
   await open({width:1440});await evaluate('window.app.navigateToBookshelf()');await until('Boolean(document.querySelector(".book-detail-trigger"))');await tap('.book-item[data-book="shuyuci"] .book-detail-trigger',1440);await until('document.getElementById("bookDetail").classList.contains("visible")');
   await tap('#bookDetailContent [data-action=selectBook]',1440);await until('document.getElementById("page-reader").classList.contains("active") && Boolean(document.querySelector(".ancient-text"))');
   assert.equal(await evaluate('document.getElementById("bookDetail").classList.contains("visible")'),false);assert.equal(await noAI(),0);
  });
  await check('游客主动评论时才提示登录',async()=>{
   await open();await evaluate('window.app.navigateToPage ? window.app.navigateToPage("community") : document.querySelector(".nav-link[data-page=community]").click()');
   await until('Boolean(document.querySelector(".post-card"))');assert.equal(await evaluate('Boolean(document.querySelector("#authModal.visible"))'),false);
   await tap('.post-card');await until('Boolean(document.querySelector("[data-action=scrollToComments]"))');await tap('[data-action=scrollToComments]');await until('Boolean(document.querySelector("#authModal.visible"))');
   assert.equal(await evaluate('window.__calls.some(c=>c.method==="POST" && c.path.endsWith("/comments"))'),false);
  });
  }
 }finally{
  report.completed_at=new Date().toISOString();report.summary={passed:report.results.filter(r=>r.status==='PASS').length,total:report.results.length,uncaught_errors:report.errors.length};
  await fs.writeFile(path.join(output,'browser-flows.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary));
  ws?.close();child.kill('SIGTERM');server.closeAllConnections();await new Promise(resolve=>server.close(resolve));if(report.results.some(r=>r.status==='FAIL')||report.errors.length)process.exitCode=1;
 }
})().catch(error=>{console.error(error);process.exitCode=1});
