import {Hono} from 'hono';
import {bodyLimit} from 'hono/body-limit';
import type {AppEnv} from '../reliability';
import {ApiError,database,integer,jsonObject,text} from '../reliability';
import {feedbackStatuses,feedbackIssues,feedbackUUID,requireFeedbackAdmin,feedbackJSON} from '../feedbackSecurity';
import {sha256} from './activation';
export const feedbackReviewRoutes=new Hono<AppEnv>();
type Workflow={status:string;version:number;last_change_id:string|null};
const transitions:Record<string,string[]>={new:['triaged','rejected'],triaged:['in_progress','rejected'],in_progress:['resolved','rejected'],resolved:['triaged'],rejected:['triaged']};
feedbackReviewRoutes.use('*',async(c,next)=>{await requireFeedbackAdmin(c);await next()});
feedbackReviewRoutes.get('/',async c=>{
  const query=c.req.query();
  if(Object.keys(query).some(k=>!['work_id','status','issue_type','limit','cursor'].includes(k)))throw new ApiError(400,'invalid_parameter','不支持的反馈筛选。');
  const limit=integer(query.limit??20,'limit',1,50),where:string[]=[],values:(string|number)[]=[];
  for(const [field,list] of [['status',feedbackStatuses],['issue_type',feedbackIssues]] as const){if(query[field]!=null){if(!list.includes(query[field]))throw new ApiError(400,'invalid_parameter','反馈筛选无效。');where.push(`${field}=?`);values.push(query[field]);}}
  if(query.work_id!=null){if(!/^[a-z0-9_-]{1,100}$/i.test(query.work_id))throw new ApiError(400,'invalid_parameter','作品筛选无效。');where.push('work_id=?');values.push(query.work_id)}
  if(query.cursor){try{if(query.cursor.length>256)throw Error();const cursor=JSON.parse(atob(query.cursor));if(!feedbackUUID.test(cursor.id)||typeof cursor.at!=='string'||!/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(cursor.at))throw Error();where.push('(created_at<? OR (created_at=? AND submission_id<?))');values.push(cursor.at,cursor.at,cursor.id)}catch{throw new ApiError(400,'invalid_parameter','分页游标无效。')}}
  const rows=await database(c).prepare(`SELECT submission_id,work_id,paragraph_id,annotation_id,ai_response_id,target,rating,issue_type,status,version,created_at,updated_at FROM feedback_review ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY created_at DESC,submission_id DESC LIMIT ?`).bind(...values,limit+1).all<{submission_id:string;created_at:string}>();
  const items=rows.results.slice(0,limit),last=items.at(-1);
  return c.json({items,next_cursor:rows.results.length>limit&&last?btoa(JSON.stringify({at:last.created_at,id:last.submission_id})):null});
});
feedbackReviewRoutes.get('/:id',async c=>{
  const id=c.req.param('id');if(!feedbackUUID.test(id))throw new ApiError(400,'invalid_parameter','反馈编号无效。');
  const item=await database(c).prepare('SELECT submission_id,work_id,paragraph_id,annotation_id,ai_response_id,target,rating,issue_type,note,prompt_version,model,status,version,created_at,updated_at FROM feedback_review WHERE submission_id=?').bind(id).first();
  if(!item)throw new ApiError(404,'not_found','反馈不存在。');
  const history=await database(c).prepare('SELECT change_id,from_status,to_status,from_version,reason,created_at FROM feedback_status_history WHERE submission_id=? ORDER BY from_version,change_id').bind(id).all();
  return c.json({item,history:history.results});
});
feedbackReviewRoutes.post('/:id/status',bodyLimit({maxSize:4096,onError:()=>{throw new ApiError(413,'payload_too_large','处理说明过长。')}}),async c=>{
  feedbackJSON(c);const id=c.req.param('id');
  if(!feedbackUUID.test(id))throw new ApiError(400,'invalid_parameter','反馈编号无效。');
  const body=await jsonObject(c);
  if(Object.keys(body).some(k=>!['change_id','status','expected_version','reason'].includes(k)))throw new ApiError(400,'invalid_parameter','不支持的处理字段。');
  const changeId=text(body.change_id,'change_id',36),status=text(body.status,'status',20),version=integer(body.expected_version,'expected_version',0),reason=body.reason==null?null:text(body.reason,'reason',500,false).trim()||null;
  if(!feedbackUUID.test(changeId)||!feedbackStatuses.includes(status)||(['resolved','rejected'].includes(status)&&!reason))throw new ApiError(400,'invalid_parameter','状态、变更编号或结案理由无效。');
  const digest=await sha256(JSON.stringify({id,status,version,reason})),db=database(c);
  const prior=await db.prepare('SELECT payload_hash FROM feedback_status_history WHERE change_id=?').bind(changeId).first<{payload_hash:string}>();
  if(prior){if(prior.payload_hash!==digest)throw new ApiError(409,'change_conflict','此变更编号已使用。');return c.json({updated:true,change_id:changeId,status,version:version+1,replayed:true})}
  const item=await db.prepare('SELECT status,version FROM feedback_review WHERE submission_id=?').bind(id).first<Workflow>();
  if(!item)throw new ApiError(404,'not_found','反馈不存在。');
  if(item.version!==version)throw new ApiError(409,'version_conflict','反馈已被更新，请重新查看后处理。');
  if(!transitions[item.status]?.includes(status))throw new ApiError(409,'invalid_transition','当前状态不能进行此转换，请先分流或重新打开。');
  const result=await db.batch<Workflow>([
    db.prepare('INSERT INTO feedback_workflow(submission_id) VALUES (?) ON CONFLICT(submission_id) DO NOTHING').bind(id),
    db.prepare('UPDATE feedback_workflow SET status=?,version=version+1,last_change_id=?,updated_at=CURRENT_TIMESTAMP WHERE submission_id=? AND version=? AND status=?').bind(status,changeId,id,version,item.status),
    db.prepare(`INSERT INTO feedback_status_history(change_id,submission_id,from_status,to_status,from_version,reason,payload_hash)
      SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM feedback_workflow WHERE submission_id=? AND last_change_id=? AND version=?) ON CONFLICT(change_id) DO NOTHING`).bind(changeId,id,item.status,status,version,reason,digest,id,changeId,version+1),
    db.prepare('SELECT status,version,last_change_id FROM feedback_workflow WHERE submission_id=?').bind(id),
    db.prepare('SELECT payload_hash FROM feedback_status_history WHERE change_id=?').bind(changeId),
  ]);
  const finalWorkflow=result.at(-2)?.results[0],history=result.at(-1)?.results[0];
  if(finalWorkflow?.last_change_id!==changeId||!history||!('payload_hash' in history)||history.payload_hash!==digest)throw new ApiError(409,'version_conflict','反馈已被更新，请重新查看后处理。');
  return c.json({updated:true,change_id:changeId,status,version:version+1});
});
