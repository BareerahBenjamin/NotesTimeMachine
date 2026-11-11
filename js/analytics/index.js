import config from './config.js';
import authors from './catalog.js';
import {createAnalytics,EVENTS,KEYS} from './core.js';
export {EVENTS};
let local,session;
try{local=window.localStorage}catch{}
try{session=window.sessionStorage}catch{}
const signal=()=>navigator.globalPrivacyControl===true||navigator.doNotTrack==='1';
export const analytics=createAnalytics({config,authors,local,session,location:()=>window.location,device:()=>innerWidth<768?'mobile':innerWidth<1024?'tablet':'desktop',privacySignal:signal,onChange:()=>{
 document.dispatchEvent(new CustomEvent('analytics-consent-change'));updateNotice();captureCurrentPage();
}});
function captureCurrentPage(){
 if(!document.hidden)analytics.track(EVENTS.LANDING,{},'session');
 const host=document.getElementById('originalText');
 if(!document.hidden&&document.getElementById('page-reader')?.classList.contains('active')&&host?.querySelector('.ancient-text'))analytics.readingOpened(host.dataset.workId,host.dataset.chapterId);
}
function updateNotice(force=false){
 const notice=document.getElementById('analyticsConsent'),text=document.getElementById('analyticsConsentStatus');if(!notice||!text)return;
 const state=analytics.status();notice.hidden=!force&&(!state.configured||state.consent!==null||state.privacy_signal);
 text.textContent=!state.configured?'分析尚未配置，目前不会向分析平台发送事件。':state.privacy_signal?'浏览器已请求不跟踪，非必要分析保持关闭。':state.consent==='granted'?'当前已允许匿名行为分析，可随时停止并清除本机分析标识。':state.consent==='denied'?'当前仅使用必要功能，不生成分析标识或发送分析事件。':'你可以选择是否帮助我们了解原文与注疏功能的使用情况。';
 if(state.configured&&state.region)text.textContent+=` 分析服务区域：${state.region}。`;
 const allow=document.getElementById('analyticsAllow');if(allow)allow.disabled=!state.configured||state.privacy_signal;
}
let dispose;
export function initAnalytics(){
 if(dispose)return dispose;
 const controller=new AbortController(),options={signal:controller.signal};
 document.getElementById('analyticsSettings')?.addEventListener('click',()=>{updateNotice(true);document.dispatchEvent(new CustomEvent('analytics-consent-change'));document.getElementById('analyticsConsentStatus')?.focus({preventScroll:true})},options);
 document.getElementById('analyticsAllow')?.addEventListener('click',()=>analytics.setConsent('granted'),options);
 document.getElementById('analyticsDeny')?.addEventListener('click',()=>analytics.setConsent('denied'),options);
 document.getElementById('analyticsDismiss')?.addEventListener('click',()=>{const notice=document.getElementById('analyticsConsent');if(notice)notice.hidden=true;document.dispatchEvent(new CustomEvent('analytics-consent-change'))},options);
 document.addEventListener('page-change',captureCurrentPage,options);
 window.addEventListener('storage',e=>{if(e.key===KEYS.consent||e.key===null)analytics.syncConsent()},options);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)captureCurrentPage()},options);
 if(signal())analytics.syncConsent();
 updateNotice();captureCurrentPage();
 dispose=()=>{controller.abort();dispose=null};return dispose;
}
