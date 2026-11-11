import {analytics} from './index.js';
import {ENGAGEMENT_MS,bibliographyKey} from './core.js';
let stop=()=>{},refresh=()=>{};
export function stopAnnotationObservation(){stop();stop=()=>{};refresh=()=>{};}
export function refreshAnnotationObservation(){refresh();}
export function observeAnnotations({workId,chapterId,paragraphId,entries}){
 stopAnnotationObservation();if(!window.IntersectionObserver||!entries.length)return;
 const controller=new AbortController(),timers=new Map(),ratios=new Map();
 const active=entry=>{
  if(!analytics.allowed()||document.hidden||!document.hasFocus()||!entry.element.isConnected||entry.element.closest('[inert]')||document.getElementById('analyticsConsent')?.hidden===false||!document.getElementById('page-reader')?.classList.contains('active')||(ratios.get(entry.element)||0)<0.5)return false;
  const r=entry.element.getBoundingClientRect();if(r.width<=0||r.height<=0)return false;
  const area=Math.max(0,Math.min(r.bottom,innerHeight)-Math.max(0,r.top))*Math.max(0,Math.min(r.right,innerWidth)-Math.max(0,r.left));
  const hit=document.elementFromPoint((Math.max(r.left,0)+Math.min(r.right,innerWidth))/2,(Math.max(r.top,0)+Math.min(r.bottom,innerHeight))/2);
  return area/(r.width*r.height)>=0.5 && !!hit && entry.element.contains(hit);
 };
 const cancel=entry=>{clearTimeout(timers.get(entry.element));timers.delete(entry.element)};
 const start=entry=>{
  if(!active(entry)){cancel(entry);return;}if(timers.has(entry.element))return;
  analytics.readingOpened(workId,chapterId);
  analytics.annotationOpened({workId,paragraphId,annotationId:entry.annotation.id,sourceId:entry.annotation.source_id,era:entry.annotation.era});
  const began=performance.now();timers.set(entry.element,setTimeout(()=>{
   timers.delete(entry.element);if(!active(entry)||performance.now()-began<ENGAGEMENT_MS)return;
   analytics.readingOpened(workId,chapterId);
   analytics.annotationRead({workId,paragraphId,annotationId:entry.annotation.id,sourceId:entry.annotation.source_id,bibliography:bibliographyKey(entry.annotation),era:entry.annotation.era,verified:entry.verified,engagedMs:ENGAGEMENT_MS});
  },ENGAGEMENT_MS+10));
 };
 const observer=new IntersectionObserver(updates=>{for(const entry of updates)ratios.set(entry.target,entry.intersectionRatio);entries.forEach(start)},{threshold:[0,0.5,1]});
 entries.forEach(entry=>observer.observe(entry.element));
 refresh=()=>{entries.forEach(cancel);entries.forEach(start)};
 for(const event of ['analytics-consent-change','visibilitychange'])document.addEventListener(event,refresh,{signal:controller.signal});
 window.addEventListener('blur',refresh,{signal:controller.signal});window.addEventListener('focus',refresh,{signal:controller.signal});
 const modalObserver=new MutationObserver(refresh),main=document.getElementById('mainContent');if(main)modalObserver.observe(main,{attributes:true,attributeFilter:['inert']});
 stop=()=>{controller.abort();observer.disconnect();modalObserver.disconnect();entries.forEach(cancel)};
}
