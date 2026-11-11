import {fetchFeedbackAvailability,submitReadingFeedback} from '../api.js';
import {switchContent} from '../motion/index.js';
import {analytics,EVENTS} from '../analytics/index.js';
let sequence=0;
/** One inline widget captures immutable public IDs; no login or persistent feedback body. */
export function createReadingFeedback(context,{label='这段解读对你有帮助吗？',problemOnly=false}={}){
 const target=Object.freeze({...context});
 const host=document.createElement('section');host.className='reading-feedback';host.setAttribute('aria-label','阅读反馈');
 const heading=document.createElement('p');heading.textContent=label;host.appendChild(heading);
 const actions=document.createElement('div');actions.className='feedback-actions';host.appendChild(actions);
 const status=document.createElement('p');status.className='feedback-status';status.id=`feedback-status-${++sequence}`;status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const buttons=[];let busy=false,lastPayload=null,lastSubmissionId=null,lastChanges=null;
 const send=async changes=>{
  if(busy)return;const hadFormFocus=form.contains(document.activeElement);busy=true;lastChanges={...changes};buttons.forEach(b=>b.disabled=true);retry.hidden=true;host.setAttribute('aria-busy','true');status.textContent='正在确认反馈服务…';
  const {classic_id,work_id,...contextFields}=target;
  const payload={...contextFields,work_id:work_id||classic_id,...changes},signature=JSON.stringify(payload);
  if(signature!==lastPayload){lastPayload=signature;lastSubmissionId=crypto.randomUUID()}
  try{
   const service=await fetchFeedbackAvailability();if(!host.isConnected)return;
   if(!service.available){status.textContent='反馈服务尚未启用，本次没有提交。无需登录，可稍后再试。';retry.hidden=false;return}
   status.textContent='正在提交…';const result=await submitReadingFeedback({...payload,submission_id:lastSubmissionId});if(!host.isConnected)return;
   if(result.received!==true)throw new Error('服务尚未确认收到反馈。');
   analytics.track(EVENTS.FEEDBACK,{work_id:payload.work_id,paragraph_id:target.paragraph_id,annotation_id:target.annotation_id,target:target.target,rating:changes.rating,issue_type:changes.issue_type},lastSubmissionId);
   form.hidden=true;problem.setAttribute('aria-expanded','false');
   status.textContent='已收到反馈，谢谢你帮助我们改进。';actions.querySelectorAll('[data-rating]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.rating===changes.rating)));
   if(hadFormFocus){problem.disabled=false;restoreFocus()}switchContent(status);
  }catch(error){if(host.isConnected){status.textContent=(error.name==='AbortError'?'提交超时，结果尚未确认。请重试确认；同一内容不会重复记录。':error.status===429?'提交较频繁，请稍后重试。':error.message||'网络连接失败，结果尚未确认。可以重试相同内容。')+(error.requestId?` 请求编号：${error.requestId}`:'');retry.hidden=false;}}
  finally{busy=false;buttons.forEach(b=>b.disabled=false);host.setAttribute('aria-busy','false')}
 };
 for(const [rating,text] of problemOnly?[]:[['helpful','有帮助'],['unhelpful','没有帮助']]){
  const button=document.createElement('button');button.type='button';button.className='btn btn-secondary';button.textContent=text;button.dataset.rating=rating;button.setAttribute('aria-pressed','false');button.addEventListener('click',()=>send({rating}));actions.appendChild(button);buttons.push(button);
 }
 const problem=document.createElement('button');problem.type='button';problem.className='btn btn-secondary';problem.textContent='反馈问题';problem.setAttribute('aria-expanded','false');actions.appendChild(problem);buttons.push(problem);
 const form=document.createElement('form');form.hidden=true;form.id=`reading-feedback-${sequence}`;problem.setAttribute('aria-controls',form.id);
 const typeLabel=document.createElement('label');typeLabel.textContent='问题类型（必选）';
 const select=document.createElement('select');select.required=true;select.setAttribute('aria-label','问题类型');select.setAttribute('aria-describedby',status.id);
 for(const [value,text] of [['','请选择问题类型'],['inaccurate_content','内容不准确'],['questionable_source','引用或出处错误'],['unclear_explanation','解释不清楚'],['interaction_problem','页面操作问题'],['other','其他']]){const option=document.createElement('option');option.value=value;option.textContent=text;select.appendChild(option)}
 select.addEventListener('invalid',()=>{select.setAttribute('aria-invalid','true');status.textContent='请选择问题类型；补充说明可以留空。'});select.addEventListener('change',()=>select.removeAttribute('aria-invalid'));
 typeLabel.appendChild(select);form.appendChild(typeLabel);
 const noteLabel=document.createElement('label');noteLabel.textContent='补充说明（选填，最多500字）';const note=document.createElement('textarea');note.rows=3;note.maxLength=500;note.autocomplete='off';noteLabel.appendChild(note);form.appendChild(noteLabel);
 const privacy=document.createElement('p');privacy.id=form.id+'-privacy';privacy.textContent='无需登录。仅关联当前公开作品、段落及注疏编号，供内部核查。请勿填写姓名、联系方式、登录凭证或私人阅读记录；说明不会发送到分析平台。';note.setAttribute('aria-describedby',privacy.id);form.appendChild(privacy);
 const submit=document.createElement('button');submit.type='submit';submit.className='btn btn-primary';submit.textContent='提交反馈';form.appendChild(submit);buttons.push(submit);
 let returnFocus=problem;
 const restoreFocus=()=>{const trigger=returnFocus?.isConnected&&returnFocus.getClientRects().length?returnFocus:problem;trigger.focus({preventScroll:true});const r=trigger.getBoundingClientRect();if(r.top<140||r.bottom>innerHeight-16)trigger.scrollIntoView({block:'center',behavior:'instant'})};
 const closeForm=()=>{form.hidden=true;problem.setAttribute('aria-expanded','false');restoreFocus()};
 const cancel=document.createElement('button');cancel.type='button';cancel.className='btn btn-secondary';cancel.textContent='取消';cancel.addEventListener('click',closeForm);form.appendChild(cancel);buttons.push(cancel);
 form.addEventListener('keydown',event=>{if(event.key==='Escape'&&!busy){event.preventDefault();event.stopPropagation();closeForm()}});
 form.addEventListener('submit',event=>{event.preventDefault();if(form.reportValidity())send({rating:'problem',issue_type:select.value,note:note.value.trim()||null})});
 host.openIssue=(issue,trigger=problem)=>{if(busy)return;returnFocus=trigger;form.hidden=false;problem.setAttribute('aria-expanded','true');if(issue&&[...select.options].some(o=>o.value===issue))select.value=issue;select.focus({preventScroll:true});select.scrollIntoView({block:'nearest',behavior:'instant'});switchContent(form)};
 problem.addEventListener('click',()=>form.hidden?host.openIssue():closeForm());
 const retry=document.createElement('button');retry.type='button';retry.className='btn btn-secondary feedback-retry';retry.textContent='重试提交';retry.hidden=true;retry.addEventListener('click',()=>{if(lastChanges)send(lastChanges)});buttons.push(retry);
 host.append(form,status,retry);return host;
}
