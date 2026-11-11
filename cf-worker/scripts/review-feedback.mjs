#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export async function reviewFeedback(args,env=process.env,send=fetch){
 const [command,...rest]=args,options={};
 for(let i=0;i<rest.length;i+=2){if(!rest[i]?.startsWith('--')||rest[i+1]==null||rest[i+1].startsWith('--'))throw Error('Use --name value options.');if(Object.hasOwn(options,rest[i].slice(2)))throw Error('Duplicate option.');options[rest[i].slice(2)]=rest[i+1]}
 const allowed={list:['work-id','status','issue-type','limit','cursor'],show:['id'],status:['id','status','expected-version','change-id','reason-file']};
 if(!allowed[command]||Object.keys(options).some(k=>!allowed[command].includes(k)))throw Error('Commands: list [filters], show --id UUID, status --id UUID --status VALUE --expected-version N --change-id UUID [--reason-file PATH].');
 const base=new URL(env.FEEDBACK_API_URL||''),token=env.FEEDBACK_REVIEW_TOKEN;
 if(base.username||base.password||base.search||base.hash||!['','/'].includes(base.pathname)||!(base.protocol==='https:'||base.protocol==='http:'&&['127.0.0.1','localhost'].includes(base.hostname)))throw Error('FEEDBACK_API_URL must be an HTTPS origin (HTTP loopback allowed).');
 if(!token||token.length<32||token.length>256||/\s/.test(token))throw Error('Set a dedicated FEEDBACK_REVIEW_TOKEN through a private environment file.');
 const url=new URL('/api/internal/feedback',base),headers={Authorization:`Bearer ${token}`};let body;
 if(command==='list'){for(const [key,value] of Object.entries(options))url.searchParams.set(key.replaceAll('-','_'),value)}
 else{
  if(!/^[a-f0-9-]{36}$/i.test(options.id||''))throw Error('A feedback UUID is required.');url.pathname+='/'+options.id;
  if(command==='status'){
   if(!options.status||!/^\d+$/.test(options['expected-version']||'')||!/^[a-f0-9-]{36}$/i.test(options['change-id']||''))throw Error('Provide status, expected-version and a stable change-id UUID.');
   const reason=options['reason-file']?(await readFile(options['reason-file'],'utf8')).trim():null;if(reason?.length>500)throw Error('Reason must be at most 500 characters.');
   body=JSON.stringify({status:options.status,expected_version:Number(options['expected-version']),change_id:options['change-id'],reason});url.pathname+='/status';headers['Content-Type']='application/json';
  }
 }
 const response=await send(url,{method:body?'POST':'GET',headers,...(body?{body}:{}),redirect:'error',credentials:'omit',signal:AbortSignal.timeout(15000)});
 const result=await response.json();if(!response.ok)throw Error(`Review failed (${response.status}): ${result.error_type||'service_error'}${result.request_id?' request_id='+result.request_id:''}`);
 return result;
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){try{console.log(JSON.stringify(await reviewFeedback(process.argv.slice(2)),null,2))}catch(error){console.error(error instanceof Error?error.message:'Feedback review failed.');process.exitCode=1}}
