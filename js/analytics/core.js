/** Explicit capture only. No SDK, cookies, account identification, URL/DOM autocapture or replay. */
export const EVENTS=Object.freeze({LANDING:'landing_view',START:'start_exploration',READING:'reading_opened',SEARCH:'search_submitted',SEARCH_CLICK:'search_result_clicked',ANNOTATION:'annotation_opened',COMPARISON:'comparison_completed',AI:'ai_interpretation_used',SHARE:'content_shared',FEEDBACK:'feedback_submitted'});
export const KEYS=Object.freeze({consent:'ntm.analytics.consent.v1',identity:'ntm.analytics.identity.v1',session:'ntm.analytics.session.v1'});
export const ENGAGEMENT_MS=5000;
const ID=/^[a-z0-9][a-z0-9_:.-]{0,199}$/i;
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const SESSION_UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-7[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const TTL=90*86400000,IDLE=30*60000,MAX_SESSION=24*3600000;
const ERAS=['han','wei_jin','jin','beiwei','tang','song','yuan','ming','qing','modern'];
const enumValue=(value,values)=>values.includes(value)?value:undefined;
const cleanId=value=>typeof value==='string'&&ID.test(value)?value:undefined;
// PostHog's $session_id expects UUIDv7. Reuse cryptographic UUID entropy, replace its timestamp/version.
export function sessionUuid(timestamp,randomUUID){
 const time=Math.floor(timestamp).toString(16).padStart(12,'0'),random=randomUUID().replace(/-/g,'');
 if(!/^[a-f0-9]{12}$/i.test(time)||!/^[a-f0-9]{32}$/i.test(random))throw Error('Invalid session entropy/time');
 return `${time.slice(0,8)}-${time.slice(8)}-7${random.slice(13,16)}-${random.slice(16,20)}-${random.slice(20)}`;
}
export function bibliographyKey(annotation){
 const title=annotation.source_title||annotation.source;if(typeof title!=='string'||!title.trim())return undefined;
 const work=title.match(/《([^》]+)》/)?.[1]||title;
 const author=annotation.author_id||annotation.author;
 return `${work.normalize('NFKC').replace(/\s+/g,'').slice(0,180)}|${typeof author==='string'?author.trim().slice(0,60):''}`;
}

export function createAnalytics({config={},authors={},local,session,send=globalThis.fetch?.bind(globalThis),now=Date.now,uuid=()=>crypto.randomUUID(),location=()=>globalThis.location,device=()=>undefined,privacySignal=()=>false,onChange=()=>{}}={}){
 let choice=null,identity=null,visit=null,stopped=false;
 const inFlight=new Set(),pending=new Set();
 const read=(store,key)=>{try{return JSON.parse(store?.getItem(key)||'null')}catch{return null}};
 const write=(store,key,value)=>{try{store?.setItem(key,JSON.stringify(value));return !!store}catch{return false}};
 const remove=(store,key)=>{try{store?.removeItem(key)}catch{}};
 const enabled=()=>config.enabled===true && typeof config.projectKey==='string' && /^phc_[a-z0-9_-]+$/i.test(config.projectKey) && ['production','staging','development','test'].includes(config.environment) && ['https://us.i.posthog.com','https://eu.i.posthog.com'].includes(config.apiHost) && typeof send==='function';
 function consent(){
  const saved=choice||read(local,KEYS.consent),value=enumValue(saved?.value,['granted','denied']);
  if(saved?.version===1&&value&&Number.isFinite(saved.at)&&now()-saved.at>=0&&now()-saved.at<TTL)return value;
  choice=null;remove(local,KEYS.consent);reset();return null;
 }
 const allowed=()=>!stopped&&enabled()&&consent()==='granted'&&!privacySignal();
 function cleanAttribution(input){
  const props={};
  for(const name of ['source','medium','campaign']){
   const value=input?.[name],list=config.utmAllowlist?.[name];
   if(typeof value==='string'&&/^[a-z][a-z0-9_.-]{0,63}$/i.test(value)&&Array.isArray(list)&&list.includes(value))props[name]=value;
  }return props;
 }
 function attribution(){let query;try{query=new URL(location().href).searchParams}catch{return {}}return cleanAttribution(Object.fromEntries(['source','medium','campaign'].map(name=>[name,query.get('utm_'+name)])));}
 function ensure(){
  if(!allowed())return null;const time=now();
  if(identity&&time-identity.created>=TTL){identity=null;visit=null;remove(local,KEYS.identity);remove(session,KEYS.session);}
  if(!identity){const saved=read(local,KEYS.identity);identity=saved&&UUID.test(saved.id)&&time-saved.created<TTL?saved:{id:uuid(),created:time};identity.persistent=write(local,KEYS.identity,identity);}
  if(!visit){const saved=read(session,KEYS.session);if(saved?.version===1&&saved.owner===identity.id&&SESSION_UUID.test(saved.id)&&Array.isArray(saved.seen)&&Array.isArray(saved.readings)&&saved.progress&&typeof saved.progress==='object'&&time-saved.last<IDLE&&time-saved.started<MAX_SESSION)visit=saved;}
  if(!visit||time-visit.last>=IDLE||time-visit.started>=MAX_SESSION){visit={version:1,id:sessionUuid(time,uuid),owner:identity.id,started:time,last:time,seen:[],readings:[],progress:{},completed:false,attribution:attribution()};}
  visit.last=time;write(session,KEYS.session,visit);return visit;
 }
 function persist(){if(visit)write(session,KEYS.session,visit);}
 function context(workId){return cleanId(workId)&&Object.hasOwn(authors,workId)?{work_id:workId,...(cleanId(authors[workId])?{author_id:authors[workId]}:{})}:{};}
 function properties(event,input){
  const out=context(input.work_id);
  if(out.work_id){for(const key of ['chapter_id','paragraph_id'])if(cleanId(input[key])&&input[key].startsWith(out.work_id+'-'))out[key]=input[key];}
  for(const key of ['annotation_id','source_id'])if(cleanId(input[key]))out[key]=input[key];
  for(const key of ['search_id'])if(typeof input[key]==='string'&&UUID.test(input[key]))out[key]=input[key];
  const enums={entry_point:['home_cta','experience_restore','reader','search','reader_guide'],usage_kind:['analysis','annotation'],share_method:['native','clipboard'],target:['reading','annotation','ai_analysis','annotation_interpretation'],rating:['helpful','unhelpful','problem'],issue_type:['inaccurate_content','questionable_source','unclear_explanation','interaction_problem','other'],source_verification:['all_verified','mixed_or_unverified'],era:['han','wei_jin','jin','beiwei','tang','song','yuan','ming','qing','modern'],comparison_rule:['visible_5s_two_sources_or_eras_v1']};
  for(const [key,values] of Object.entries(enums)){const value=enumValue(input[key],values);if(value!==undefined)out[key]=value;}
  for(const key of ['query_length','result_position','engaged_ms','annotation_count'])if(Number.isSafeInteger(input[key])&&input[key]>=0&&input[key]<=100000)out[key]=input[key];
  return out;
 }
 function track(event,input={},dedupeKey){
  try{
   if(!Object.values(EVENTS).includes(event)||!input||typeof input!=='object')return false;
   const safe=properties(event,input);
   if([EVENTS.READING,EVENTS.SEARCH_CLICK,EVENTS.ANNOTATION,EVENTS.COMPARISON,EVENTS.AI,EVENTS.SHARE,EVENTS.FEEDBACK].includes(event)&&!safe.work_id)return false;
   const state=ensure();if(!state)return false;
   const key=dedupeKey?`${event}:${dedupeKey}`:null;
   if(key&&state.seen.includes(key))return false;
   if(state.seen.length>=500)return false; // Bound storage; preserve earlier deduplication keys.
   if(key){state.seen.push(key);persist();}
   if(event===EVENTS.START&&!UUID.test(state.exploration_id||'')){state.exploration_id=uuid();persist();}
   const timestamp=new Date(now()).toISOString();
   const payload={api_key:config.projectKey,event,uuid:uuid(),distinct_id:identity.id,timestamp,properties:{...safe,...cleanAttribution(state.attribution),anonymous_user_id:identity.id,session_id:state.id,$session_id:state.id,...(UUID.test(state.exploration_id||'')?{exploration_id:state.exploration_id}:{}),timestamp,environment:config.environment,is_test:config.environment!=='production',schema_version:1,identity_persistence:identity.persistent?'local':'memory',$process_person_profile:false,$geoip_disable:true,...(enumValue(device(),['mobile','tablet','desktop'])?{device_type:device()}: {})}};
   // Dispatch outside the reader stack. At most 50 pending/in-flight events; no persistent queue or retries.
   if(pending.size+inFlight.size>=50)return false;
   const timer=setTimeout(()=>{
    pending.delete(timer);if(!allowed())return;
    const controller=new AbortController();inFlight.add(controller);const timeout=setTimeout(()=>controller.abort(),3000);
    Promise.resolve().then(()=>send(config.apiHost+'/i/v0/e/',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',referrerPolicy:'no-referrer',keepalive:true,signal:controller.signal,body:JSON.stringify(payload)})).catch(()=>{}).finally(()=>{clearTimeout(timeout);inFlight.delete(controller)});
   },0);pending.add(timer);return true;
  }catch{return false;}
 }
 function setConsent(value){
  if(!['granted','denied'].includes(value))return;
  choice={version:1,value,at:now()};write(local,KEYS.consent,choice);
  if(value==='denied'||privacySignal())reset();
  try{onChange()}catch{}
 }
 function reset(){for(const t of pending)clearTimeout(t);pending.clear();for(const c of inFlight)c.abort();inFlight.clear();remove(local,KEYS.identity);remove(session,KEYS.session);identity=null;visit=null;}
 function readingOpened(workId,chapterId){
  const state=ensure();if(!state||!context(workId).work_id||!cleanId(chapterId)||!chapterId.startsWith(workId+'-'))return;
  if(!state.readings.includes(chapterId)&&state.readings.length<100){state.readings.push(chapterId);persist();}
  track(EVENTS.READING,{work_id:workId,chapter_id:chapterId},`${chapterId}:${state.exploration_id||'visit'}`);
 }
 function annotationOpened({workId,paragraphId,annotationId,sourceId,era,aiGenerated=false}){
  const state=ensure();if(aiGenerated||!state||!context(workId).work_id||!cleanId(paragraphId)||!paragraphId.startsWith(workId+'-')||!cleanId(annotationId)||!state.readings.some(chapter=>paragraphId.startsWith(chapter+'-')))return false;
  return track(EVENTS.ANNOTATION,{work_id:workId,paragraph_id:paragraphId,annotation_id:annotationId,source_id:sourceId,era},`${workId}:${paragraphId}:${annotationId}:${state.exploration_id||'visit'}`);
 }
 function annotationRead({workId,paragraphId,annotationId,sourceId,bibliography,era,verified=false,engagedMs,aiGenerated=false}){
  if(aiGenerated)return false;
  const state=ensure();if(!state||!context(workId).work_id||!cleanId(paragraphId)||!paragraphId.startsWith(workId+'-')||!cleanId(annotationId)||engagedMs<ENGAGEMENT_MS)return false;
  if(!state.readings.some(chapter=>paragraphId.startsWith(chapter+'-')))return false;
  const group=`${workId}:${paragraphId}`;
  if(!state.progress[group]){if(Object.keys(state.progress).length>=100)return false;state.progress[group]=[];}
  const rows=state.progress[group];if(rows.some(r=>r.id===annotationId))return false;
  // Bibliographic text stays local, is bounded public metadata, and is never sent to PostHog.
  const row={id:annotationId,bibliography:typeof bibliography==='string'?bibliography.slice(0,240):null,era:enumValue(era,ERAS)||null,verified:verified===true};
  if(rows.length<20)rows.push(row);persist();
  annotationOpened({workId,paragraphId,annotationId,sourceId,era});
  const distinct=rows.some((a,i)=>rows.some((b,j)=>i!==j&&((a.bibliography&&b.bibliography&&a.bibliography!==b.bibliography)||(a.era&&b.era&&a.era!==b.era))));
  if(distinct&&!state.completed){
   state.completed=true;persist();
   track(EVENTS.COMPARISON,{work_id:workId,paragraph_id:paragraphId,annotation_count:rows.length,engaged_ms:ENGAGEMENT_MS,comparison_rule:'visible_5s_two_sources_or_eras_v1',source_verification:rows.every(r=>r.verified)?'all_verified':'mixed_or_unverified'},'session');
  }return true;
 }
 return {track,readingOpened,annotationOpened,annotationRead,context,consent,setConsent,allowed,enabled,reset,operationId:()=>allowed()?uuid():undefined,status:()=>({configured:enabled(),consent:consent(),privacy_signal:privacySignal(),region:config.apiHost==='https://eu.i.posthog.com'?'欧盟':config.apiHost==='https://us.i.posthog.com'?'美国':null}),syncConsent:()=>{choice=null;if(consent()!=='granted'||privacySignal())reset();try{onChange()}catch{}},destroy:()=>{stopped=true;for(const t of pending)clearTimeout(t);pending.clear();for(const c of inFlight)c.abort();inFlight.clear();}};
}
