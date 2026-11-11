import { fetchActivationExample } from '../api.js';
import { navigateTo } from '../state.js';
import { loadBook } from './reader.js';
import { switchContent } from '../motion/index.js';
import { pushPublicRoute } from '../readingRoute.js';
import {analytics,EVENTS} from '../analytics/index.js';
let version=0,controller=null;
export function cancelActivation(){version++;controller?.abort();controller=null;const button=document.getElementById('startReadingExperience');if(button){button.disabled=false;button.setAttribute('aria-busy','false')}}
export async function startReadingExperience({restore=false}={}) {
  cancelActivation();const current=version;controller=new AbortController();
  const button=document.getElementById('startReadingExperience'),status=document.getElementById('activationStatus');
  if(!button||!status)return;
  if(!restore)analytics.track(EVENTS.START,{entry_point:'home_cta'},'session');
  button.disabled=true;button.setAttribute('aria-busy','true');status.hidden=false;status.textContent='正在核对体验文献与注疏来源…';
  if(!restore)pushPublicRoute('#experience');
  try {
    const result=await fetchActivationExample(controller.signal);
    if(current!==version)return;
    if(!result.available){
      status.replaceChildren();const text=document.createElement('p');text.textContent=result.message || '已核验体验文献尚未备齐。';
      const read=document.createElement('button');read.className='btn btn-secondary';read.textContent='先读馆藏原文';
      read.addEventListener('click',()=>{cancelActivation();navigateTo('reader');loadBook('shuyuci',{paragraphId:'shuyuci-01-01',selectTarget:false})});
      status.append(text,read);switchContent(status);return;
    }
    const example=result.example;
    if(!example?.classic_id||!example?.paragraph_id||!Array.isArray(example.annotations)||example.annotations.length<2){status.textContent='体验数据不完整，请从书架选择作品。';return}
    navigateTo('reader',{history:false});
    await loadBook(example.classic_id,{paragraphId:example.paragraph_id,selectTarget:false,guidedExample:example});
  }catch(error){if(current===version && error.name!=='AbortError'){
    status.replaceChildren();const message=document.createElement('p');message.textContent='体验文献暂时无法加载，原文与注疏不会被替换为演示内容。';
    const retry=document.createElement('button');retry.className='btn btn-secondary';retry.textContent='重新加载体验文献';retry.addEventListener('click',()=>startReadingExperience({restore:true}));
    const browse=document.createElement('button');browse.className='btn btn-secondary';browse.textContent='从书架选择作品';browse.addEventListener('click',()=>navigateTo('bookshelf'));
    status.append(message,retry,browse);
  }}
  finally {if(current===version){controller=null;button.disabled=false;button.setAttribute('aria-busy','false')}}
}
