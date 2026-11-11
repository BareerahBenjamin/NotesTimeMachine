/** Lab-only CDP measurement. Never loaded in the application or presented as field CWV. */
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto');
const {launch}=require('./chrome.cjs');
const root=path.resolve(__dirname,'../..'),phase=process.argv[2]||'baseline',out=path.join(root,'docs/v2-release-evidence/2026-11-06',phase);
(async()=>{
 await fs.mkdir(out,{recursive:true});const server=JSON.parse(await fs.readFile('/tmp/ntm-release-qa-server.json','utf8'));
 const chrome=await launch(),{call,evaluate,until,pause}=chrome;
 const report={scope:'LAB ONLY: actual local static files + actual Worker with isolated D1/R2; AI/search bindings TEST ONLY; no production CDN/RUM',phase,measured_at:new Date().toISOString(),browser:chrome.version,host:{platform:os.platform(),architecture:os.arch(),cpu:os.cpus()[0]?.model,logical_cpus:os.cpus().length,memory_bytes:os.totalmem()},source_sha256:createHash('sha256').update(await fs.readFile(path.join(root,'index.html'))).digest('hex'),runs:[]};
 const requests=new Map();let current;
 chrome.on('Network.requestWillBeSent',e=>{requests.set(e.requestId,{url:e.request.url,type:e.type,started:e.timestamp});});
 chrome.on('Network.responseReceived',e=>{const r=requests.get(e.requestId);if(r)Object.assign(r,{status:e.response.status,mime:e.response.mimeType,protocol:e.response.protocol,from_cache:e.response.fromDiskCache||e.response.fromServiceWorker});});
 chrome.on('Network.loadingFinished',e=>{const r=requests.get(e.requestId);if(r&&current)current.network.push({...r,duration_ms:Math.round((e.timestamp-r.started)*1000),encoded_bytes:e.encodedDataLength});});
 chrome.on('Network.loadingFailed',e=>{const r=requests.get(e.requestId);if(current)current.failures.push({url:r?.url,error:e.errorText,canceled:e.canceled});});
 chrome.on('Runtime.exceptionThrown',e=>{if(current)current.js_errors.push({message:e.exceptionDetails.exception?.description||e.exceptionDetails.text,url:e.exceptionDetails.url,line:e.exceptionDetails.lineNumber})});
 const observe=`window.__lab={lcp:null,shifts:[],events:[],longtasks:[],paint:[]};for(const type of ['largest-contentful-paint','layout-shift','event','longtask','paint']){try{const observer=new PerformanceObserver(list=>{for(const e of list.getEntries()){if(type==='largest-contentful-paint')window.__lab.lcp={value:e.startTime,tag:e.element?.tagName,id:e.element?.id};if(type==='layout-shift'&&!e.hadRecentInput)window.__lab.shifts.push({at:e.startTime,value:e.value,sources:e.sources?.map(s=>({tag:s.node?.tagName,class:s.node?.className,id:s.node?.id}))});if(type==='event')window.__lab.events.push({name:e.name,duration:e.duration,interaction_id:e.interactionId});if(type==='longtask')window.__lab.longtasks.push({at:e.startTime,duration:e.duration});if(type==='paint')window.__lab.paint.push({name:e.name,at:e.startTime})}});observer.observe({type,buffered:true,...(type==='event'?{durationThreshold:16}:{})})}catch{}}`;
 await call('Page.addScriptToEvaluateOnNewDocument',{source:observe});
 function cls(entries){let max=0,sum=0,start=-Infinity,last=-Infinity;for(const e of entries){if(e.at-last>=1000||e.at-start>=5000){sum=e.value;start=e.at}else sum+=e.value;last=e.at;max=Math.max(max,sum)}return max}
 try{
 for(const spec of [{name:'mobile-390-cold',width:390,mobile:true,cpu:4,latency:150,kbps:1600},{name:'desktop-1440-cold',width:1440,mobile:false,cpu:1,latency:0,kbps:-1},{name:'third-party-offline',width:390,mobile:true,cpu:1,latency:0,kbps:-1,blocked:true}]){
  requests.clear();current={...spec,network:[],failures:[],js_errors:[]};report.runs.push(current);
  await call('Network.clearBrowserCache');await call('Network.setCacheDisabled',{cacheDisabled:true});await call('Network.setBlockedURLs',{urls:spec.blocked?['https://*']:[]});await call('Emulation.setCPUThrottlingRate',{rate:spec.cpu});
  await call('Network.emulateNetworkConditions',{offline:false,latency:spec.latency,downloadThroughput:spec.kbps>0?spec.kbps*1024/8:-1,uploadThroughput:spec.kbps>0?750*1024/8:-1});
  await call('Emulation.setDeviceMetricsOverride',{width:spec.width,height:844,deviceScaleFactor:1,mobile:spec.mobile});
  const begin=Date.now();await call('Page.navigate',{url:server.url+'/index.html?qa='+Date.now()});
  try{await until('Boolean(window.app&&document.getElementById("loginBtn"))',45000);current.app_ready_wall_ms=Date.now()-begin}catch(error){current.ready_error=error.message}
  await pause(spec.blocked?1500:4000);
  current.observation=await evaluate('({lab:window.__lab,readyState:document.readyState,navigation:performance.getEntriesByType("navigation")[0]?.toJSON(),fonts:{status:document.fonts.status,faces:[...document.fonts].map(f=>({family:f.family,status:f.status}))},images:[...document.images].map(i=>({src:i.getAttribute("src"),natural_width:i.naturalWidth,rendered_width:i.getBoundingClientRect().width,loaded:i.complete&&i.naturalWidth>0})),animations:document.getAnimations().map(a=>({target:a.effect?.target?.className,state:a.playState,iterations:String(a.effect?.getTiming().iterations),timeline:a.timeline?.constructor.name})),viewport:{width:innerWidth,scroll_width:document.documentElement.scrollWidth}})');
  current.cls_session_window=cls(current.observation.lab.shifts);current.cold_cache='CDP cache cleared + cache disabled; OS/DNS/TLS and external upstream caches uncontrolled';
  if(!spec.blocked){const data=await call('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(out,spec.name+'.png'),Buffer.from(data.data,'base64'))}
  await fs.writeFile(path.join(out,'metrics.json'),JSON.stringify(report,null,2)+'\n');
 }
 }finally{await chrome.stop()}
 console.log(JSON.stringify({phase,runs:report.runs.map(r=>({name:r.name,ready_ms:r.app_ready_wall_ms,lcp:r.observation.lab.lcp?.value,cls:r.cls_session_window,failures:r.failures.length,errors:r.js_errors.length}))}));
})().catch(error=>{console.error(error);process.exitCode=1});
