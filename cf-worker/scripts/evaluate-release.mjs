#!/usr/bin/env node
// Bounded real AI/R2 acceptance run. No D1 calls, writes, deployment or account changes.
import {build} from 'esbuild';
import {getPlatformProxy} from 'wrangler';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';

const output=process.argv[2];
if (!output) throw Error('Usage from cf-worker: node scripts/evaluate-release.mjs <new-output.json>');
const target=resolve(output);
try { await access(target); throw Error('Refusing to overwrite existing evidence'); }
catch(error) { if(error.code!=='ENOENT')throw error; }
await mkdir(resolve(target,'..'),{recursive:true});
const cases=JSON.parse(await readFile('../evaluations/ai/cases.json','utf8'));
const selected=['clear_source-01','clear_source-03','clear_source-06'].map(id=>cases.find(c=>c.id===id));
if(selected.some(c=>!c?.external_reference))throw Error('Selected source evidence missing');
const bundle=resolve(tmpdir(),`ntm-release-${randomUUID()}.mjs`);
await build({entryPoints:['src/index.ts'],bundle:true,platform:'node',format:'esm',outfile:bundle,logLevel:'silent'});
const {default:app}=await import(pathToFileURL(bundle));
const sha256=value=>createHash('sha256').update(value).digest('hex');
const hashes={};
for(const path of ['src/routes/ai.ts','src/grounding.ts','src/sources.ts','../evaluations/ai/cases.json'])hashes[path]=sha256(await readFile(path));
const run={run_id:randomUUID(),measured_at:new Date().toISOString(),environment:'current Hono app in Node + real remote Workers AI/R2 via Wrangler getPlatformProxy; not deployed production Worker',maximum_cases:3,maximum_model_attempts_per_case:2,source_hashes:hashes,rows:[]};
const save=()=>writeFile(target,JSON.stringify(run,null,2)+'\n');
await save();
const platform=await getPlatformProxy({configPath:'wrangler.jsonc',persist:false,remoteBindings:true});
try {
 let blocked=null;
 for(const sample of selected){
  const row={task_id:`${run.run_id}:${sample.id}`,case_id:sample.id,paragraph_id:sample.paragraph_id,prompt_version:'grounded-v4',source_reference:sample.external_reference,measured_at:new Date().toISOString(),attempts:[],human_scores:null};
  run.rows.push(row);await save();
  if(blocked){row.status='BLOCKED';row.blocked_reason=blocked;await save();continue;}
  const env={...platform.env,AI:{run:async(model,input)=>{
   const attempt={model,input,started_at:new Date().toISOString()};row.attempts.push(attempt);const started=performance.now();
   try{const result=await platform.env.AI.run(model,input);attempt.actual_output=result;return result;}
   catch(error){attempt.error={name:error.name,message:error.message,code:error.code??null,cause:error.cause instanceof Error?{name:error.cause.name,message:error.cause.message,code:error.cause.code??null}:null};throw error;}
   finally{attempt.duration_ms=Math.round(performance.now()-started);await save();}
  }}};
  const started=performance.now();
  try{
   const response=await app.fetch(new Request('https://release-evaluation.invalid/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paragraph_id:sample.paragraph_id})}),env);
   row.http_status=response.status;row.request_id=response.headers.get('X-Request-ID');row.output=await response.json();
   const sharedFailure=row.output.validation_failures?.find(f=>/quota|rate_limited|transport|timeout|access_denied|model_unavailable/.test(f.error_type));
   if(sharedFailure)blocked=sharedFailure.error_type;
   if(response.status>=500)blocked=row.output.error_type||'remote_service_failure';
   row.status=row.output.generation_status==='validated'?'NOT_TESTED':blocked?'BLOCKED':'FAIL';
   row.assessment=row.status==='NOT_TESTED'?'real generation captured; semantic/source review still required':'no accepted real generation; never count fallback as quality pass';
  }catch(error){row.status='BLOCKED';row.error={name:error.name,message:error.message};blocked='evaluation_transport_failure';}
  row.duration_ms=Math.round(performance.now()-started);await save();
  console.log(JSON.stringify({case_id:sample.id,status:row.status,generation_status:row.output?.generation_status,attempts:row.attempts.length,duration_ms:row.duration_ms}));
 }
}finally{await platform.dispose();await save();}
