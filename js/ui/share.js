import {analytics,EVENTS} from '../analytics/index.js';
export function createShareControl({workId,chapterId,paragraphId}){
 const host=document.createElement('span'),button=document.createElement('button'),status=document.createElement('span');
 button.type='button';button.className='btn btn-secondary';button.textContent='分享这一段';
 status.className='share-status';status.setAttribute('role','status');let busy=false;
 button.addEventListener('click',async()=>{
  if(busy)return;busy=true;button.disabled=true;
  const url=new URL(location.pathname,location.origin);url.hash=`read/${workId}/${chapterId}/${paragraphId}`;
  try{
   let method;
   if(navigator.share){await navigator.share({title:'注疏时光机',url:url.href});method='native';status.textContent='分享操作已完成。';}
   else if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url.href);method='clipboard';status.textContent='已复制公开阅读链接。';}
   else{status.textContent='当前浏览器不支持直接分享，可复制地址栏中的公开阅读链接。';return;}
   analytics.track(EVENTS.SHARE,{work_id:workId,chapter_id:chapterId,paragraph_id:paragraphId,share_method:method},analytics.operationId());
  }catch(error){status.textContent=error.name==='AbortError'?'已取消分享。':'暂时无法分享，未记录分享成功。';}
  finally{busy=false;button.disabled=false;}
 });host.append(button,status);return host;
}
