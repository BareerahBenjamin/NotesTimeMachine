/** Replays saved REAL model outputs through current validators. No model/network calls. */
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
const require=createRequire(new URL('../../cf-worker/package.json',import.meta.url));
const {build}=require('esbuild');
await build({entryPoints:[new URL('../../cf-worker/src/grounding.ts',import.meta.url).pathname],bundle:true,platform:'node',format:'esm',outfile:'/tmp/ntm-eval-replay.mjs',logLevel:'silent'});
const {validateReading,PROMPT_VERSION}=await import('/tmp/ntm-eval-replay.mjs?v='+Date.now());
const rows=JSON.parse(await readFile(new URL('../../docs/ai-evidence/experiment-v3-live.json',import.meta.url),'utf8'));
const results=rows.map(row=>{
 const output=row.output;
 if(output.generation_status!=='validated')return {id:row.id,status:'no_generated_answer',original_http_status:row.status};
 try{
  const readings=output.readings.map(({source_id,quote,explanation})=>({source_id,quote,explanation}));
  validateReading({response:{readings,uncertainty:output.uncertainty}},output.sources);
  return {id:row.id,status:'accepted_by_current_rules',citation_count:readings.length};
 }catch(e){return {id:row.id,status:'rejected_by_current_rules',reason:e.code || 'unknown'}};
});
const summary={kind:'offline replay, not live final model accuracy',prompt_version:PROMPT_VERSION,cases:results.length,generated_inputs:results.filter(x=>x.status!=='no_generated_answer').length,accepted:results.filter(x=>x.status==='accepted_by_current_rules').length,rejected:results.filter(x=>x.status==='rejected_by_current_rules').length};
await writeFile(new URL('../../docs/ai-evidence/replay-v4.json',import.meta.url),JSON.stringify({summary,results},null,2)+'\n');console.log(JSON.stringify(summary,null,2));
