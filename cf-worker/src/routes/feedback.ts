import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { AppEnv } from '../reliability';
import { ApiError, database, jsonObject, text } from '../reliability';
import { loadParagraph } from '../sources';
import { sha256 } from './activation';
import {feedbackConfigured,feedbackOrigin,feedbackJSON,feedbackNetworkKey,feedbackUUID,feedbackIssues} from '../feedbackSecurity';
import {feedbackReviewRoutes} from './feedbackReview';
export const feedbackRoutes = new Hono<AppEnv>();
const targets = new Set(['reading','annotation','ai_analysis','annotation_interpretation']);
feedbackRoutes.use('/feedback/*',async(c,next)=>{c.header('Cache-Control','no-store');await next()});
feedbackRoutes.get('/feedback/availability',async c=>{
  if(c.env.FEEDBACK_ENABLED!=='true')return c.json({available:false,reason:'not_enabled'});
  if(!feedbackConfigured(c))return c.json({available:false,reason:'security_not_configured'});
  const row=await database(c).prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('content_feedback','feedback_workflow','feedback_status_history','feedback_rate_limits','feedback_review') AND type IN ('table','view')").first<{n:number}>();
  return c.json({available:row?.n===5,reason:row?.n===5?null:'schema_not_installed'});
});
feedbackRoutes.post('/feedback',bodyLimit({maxSize:8192,onError:()=>{throw new ApiError(413,'payload_too_large','反馈内容过长，请缩短后重试。')}}),async c=>{
  c.header('Cache-Control','no-store');
  if(c.env.FEEDBACK_ENABLED!=='true')throw new ApiError(503,'feedback_not_enabled','反馈接口尚未启用，本次没有提交。');
  if(!feedbackConfigured(c))throw new ApiError(503,'feedback_not_configured','反馈服务尚未配置完成，本次没有提交。');
  feedbackOrigin(c);feedbackJSON(c);
  const body=await jsonObject(c);
  const allowed=new Set(['submission_id','work_id','classic_id','paragraph_id','annotation_id','ai_response_id','target','rating','issue_type','note','prompt_version','model']);
  if(Object.keys(body).some(key=>!allowed.has(key)))throw new ApiError(400,'invalid_parameter','反馈包含不支持的字段。');
  const submissionId=text(body.submission_id,'submission_id',36),workId=text(body.work_id??body.classic_id,'work_id',100);
  if(body.classic_id!=null&&body.classic_id!==workId)throw new ApiError(400,'invalid_parameter','作品编号不一致。');
  const paragraphId=text(body.paragraph_id,'paragraph_id',160),target=text(body.target,'target',40),rating=text(body.rating,'rating',20);
  const issue=body.issue_type==null?null:text(body.issue_type,'issue_type',40),note=body.note==null?null:text(body.note,'note',500,false).trim()||null;
  const annotationId=body.annotation_id==null?null:text(body.annotation_id,'annotation_id',200),aiResponseId=body.ai_response_id==null?null:text(body.ai_response_id,'ai_response_id',36);
  const promptVersion=body.prompt_version==null?null:text(body.prompt_version,'prompt_version',80),model=body.model==null?null:text(body.model,'model',160);
  if(!feedbackUUID.test(submissionId)||!targets.has(target)||!['helpful','unhelpful','problem'].includes(rating)||(rating==='problem'?!issue||!feedbackIssues.includes(issue):issue!==null)||rating!=='problem'&&note!==null)throw new ApiError(400,'invalid_parameter','反馈选项或提交编号无效。');
  if((target==='annotation'||target==='annotation_interpretation')!==Boolean(annotationId))throw new ApiError(400,'invalid_parameter','注疏反馈必须指定对应注疏。');
  if(aiResponseId&&(!feedbackUUID.test(aiResponseId)||!['ai_analysis','annotation_interpretation'].includes(target)))throw new ApiError(400,'invalid_parameter','AI 响应编号或关联目标无效。');
  // Preserve v1 retry digests when no AI response ID exists.
  const payload={classic_id:workId,paragraph_id:paragraphId,annotation_id:annotationId,target,rating,issue_type:issue,note,prompt_version:promptVersion,model,...(aiResponseId?{ai_response_id:aiResponseId}:{})};
  const digest=await sha256(JSON.stringify(payload));
  try{
    const db=database(c),existing=await db.prepare('SELECT payload_hash FROM content_feedback WHERE submission_id=?').bind(submissionId).first<{payload_hash:string}>();
    if(existing){if(existing.payload_hash!==digest)throw new ApiError(409,'submission_conflict','此提交编号已用于其他反馈，请重新填写。');return c.json({received:true,feedback_id:submissionId},201)}
    const context=await loadParagraph(c.env.KNOWLEDGE_BUCKET,paragraphId);
    if(!context||context.classic?.id!==workId||(annotationId&&!context.annotations.some((a:{id:string})=>a.id===annotationId)))throw new ApiError(404,'not_found','反馈对应的作品、段落或注疏不存在。');
    const seconds=Math.floor(Date.now()/1000),day=Math.floor(seconds/86400),network=await feedbackNetworkKey(c,day);
    const shortKey=`${network}:10m:${Math.floor(seconds/600)}`,dailyKey=`${network}:day:${day}`;
    const bucket=(key:string,limit:number,expiry:number)=>db.prepare(`INSERT INTO feedback_rate_limits(bucket_key,count,expires_at)
      SELECT ?,1,? WHERE NOT EXISTS(SELECT 1 FROM content_feedback WHERE submission_id=?)
      ON CONFLICT(bucket_key) DO UPDATE SET count=MIN(count+1,?)`).bind(key,expiry,submissionId,limit+1);
    const results=await db.batch<{payload_hash:string}>([
      db.prepare('DELETE FROM feedback_rate_limits WHERE expires_at<=?').bind(seconds),
      bucket(shortKey,10,(Math.floor(seconds/600)+1)*600),bucket(dailyKey,50,(day+1)*86400),
      db.prepare(`INSERT INTO content_feedback(submission_id,classic_id,paragraph_id,annotation_id,target,rating,issue_type,note,prompt_version,model,payload_hash)
        SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT count FROM feedback_rate_limits WHERE bucket_key=?)<=10
        AND (SELECT count FROM feedback_rate_limits WHERE bucket_key=?)<=50 ON CONFLICT(submission_id) DO NOTHING`)
        .bind(submissionId,workId,paragraphId,annotationId,target,rating,issue,note,promptVersion,model,digest,shortKey,dailyKey),
      db.prepare(`INSERT INTO feedback_workflow(submission_id,ai_response_id)
        SELECT submission_id,? FROM content_feedback WHERE submission_id=? AND payload_hash=? ON CONFLICT(submission_id) DO NOTHING`).bind(aiResponseId,submissionId,digest),
      db.prepare('SELECT payload_hash FROM content_feedback WHERE submission_id=?').bind(submissionId),
    ]);
    const stored=results.at(-1)?.results[0];
    if(!stored){
      const daily=await db.prepare('SELECT count FROM feedback_rate_limits WHERE bucket_key=?').bind(dailyKey).first<{count:number}>();
      c.header('Retry-After',String((daily&&daily.count>50?(day+1)*86400:(Math.floor(seconds/600)+1)*600)-seconds));
      throw new ApiError(429,'feedback_rate_limited','提交较频繁，请稍后再试。');
    }
    if(stored.payload_hash!==digest)throw new ApiError(409,'submission_conflict','此提交编号已用于其他反馈，请重新填写。');
    return c.json({received:true,feedback_id:submissionId},201);
  }catch(error){
    if(error instanceof ApiError&&error.errorType==='schema_mismatch')throw new ApiError(503,'feedback_not_configured','反馈存储尚未配置，本次没有提交。',error.databaseOperation,{cause:error});
    throw error;
  }
});
feedbackRoutes.route('/internal/feedback',feedbackReviewRoutes);
