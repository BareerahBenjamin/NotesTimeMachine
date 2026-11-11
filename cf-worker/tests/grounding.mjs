import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
await build({entryPoints:['src/grounding.ts'],bundle:true,platform:'node',format:'esm',outfile:'/tmp/ntm-grounding.mjs',logLevel:'silent'});
await build({entryPoints:['src/sources.ts'],bundle:true,platform:'node',format:'esm',outfile:'/tmp/ntm-sources.mjs',logLevel:'silent'});
await build({entryPoints:['src/index.ts'],bundle:true,platform:'node',format:'esm',outfile:'/tmp/ntm-ai-test.mjs',logLevel:'silent'});
const {validateReading,groundedPrompt,GroundingError}=await import('/tmp/ntm-grounding.mjs?v='+Date.now()),{normalizeAnnotation,loadParagraph}=await import('/tmp/ntm-sources.mjs?v='+Date.now()),{default:app}=await import('/tmp/ntm-ai-test.mjs?v='+Date.now());
const rows=[],old={log:console.log,error:console.error};console.log=()=>{};console.error=()=>{};
async function check(name,fn){try{await fn();rows.push({name,passed:true})}catch(e){rows.push({name,passed:false,error:e.message});old.error(name,e)}}
// Controlled binding for contract/fault tests; live model evidence is a separate run.
const bucket={async get(key){try{const content=await readFile('../knowledge_base/'+key,'utf8');return {text:async()=>content,json:async()=>JSON.parse(content)}}catch{return null}}};
const context=await loadParagraph(bucket,'shuyuci-01-01');
const evidence=context.sources.filter(s=>s.content_type!=='ai_interpretation');
const valid={readings:evidence.map(s=>({source_id:s.source_id,quote:s.content.slice(0,25),explanation:'现代阅读可以关注这段文字的措辞和情感。'})),uncertainty:'出处尚待核验'};
const response=data=>({response:JSON.stringify(data)});
const env={KNOWLEDGE_BUCKET:bucket,AI:{run:async()=>response(valid)}};
async function api(path,body,custom=env){const r=await app.fetch(new Request('https://test/api'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:typeof body==='string'?body:JSON.stringify(body)}),custom);return {status:r.status,body:await r.json()}}
const rejected=(value,code)=>assert.throws(()=>validateReading(response(value),evidence),e=>e instanceof GroundingError&&e.code===code);
await check('valid JSON and exact source/quote match',()=>assert.equal(validateReading(response(valid),evidence).readings.length,6));
await check('JSON-mode object response',()=>assert.equal(validateReading({response:valid},evidence).readings.length,6));
await check('unknown citation source rejected',()=>rejected({...valid,readings:[{...valid.readings[0],source_id:'invented-book'}]},'unknown_source'));
await check('fabricated quote rejected',()=>rejected({...valid,readings:[{...valid.readings[0],quote:'从未出现的历史注疏'}]},'quote_mismatch'));
await check('AI-generated content cannot be evidence',()=>assert.throws(()=>validateReading(response({readings:[{source_id:'ai',quote:'模型生成',explanation:'解释'}],uncertainty:''}),[{source_id:'ai',content_type:'ai_interpretation',content:'模型生成'}]),/unknown_source/));
await check('unverified legacy flag cannot claim verified',()=>{const a=normalizeAnnotation({id:'test',content:'x',verification_status:'verified'},'p');assert.equal(a.verification_status,'unverified')});
await check('simulated historical generator prefix marked AI',()=>assert.equal(normalizeAnnotation({id:'guoxiang-zhuangzi-01-01',author:'郭象',source:'《庄子注》'},'zhuangzi-01-01').ai_generated,true));
await check('missing provenance remains null',()=>{const a=normalizeAnnotation({id:'x',content:'x'},'p');for(const k of ['source_title','edition','reference','author','dynasty'])assert.equal(a[k],null)});
await check('duplicate legacy IDs are scoped to paragraph',()=>assert.notEqual(normalizeAnnotation({id:'same'},'p1').source_id,normalizeAnnotation({id:'same'},'p2').source_id));
await check('wrong structure/extra verified field rejected',()=>rejected({...valid,verification_status:'verified'},'invalid_structure'));
await check('empty or non-string explanation rejected',()=>rejected({...valid,readings:[{...valid.readings[0],explanation:{text:'x'}}]},'invalid_reading'));
await check('duplicate source rejected',()=>rejected({...valid,readings:[valid.readings[0],valid.readings[0]]},'duplicate_source'));
await check('original anchor required',()=>rejected({...valid,readings:valid.readings.slice(1)},'missing_original'));
await check('comparison cannot collapse to one source',()=>rejected({...valid,readings:[valid.readings[0]]},'missing_comparison'));
await check('incomplete reasoning/malformed output rejected',()=>{assert.throws(()=>validateReading('<think>still thinking',evidence),/incomplete_reasoning/);assert.throws(()=>validateReading('not JSON',evidence),/invalid_json/)});
await check('uncertainty cannot be removed by model',()=>assert.match(validateReading(response({...valid,uncertainty:'完全确定'}),evidence).uncertainty,/证据不足/));
await check('prompt contains actual text, metadata and restrictions',()=>{const p=groundedPrompt(evidence,'比较');for(const t of ['李清照','昨夜雨疏风骤','不能虚构','待核验','不可信数据','逐字'])assert.ok(p.includes(t))});
await check('API analyze preserves legacy string + structured evidence',async()=>{const r=await api('/analyze',{paragraph_id:'shuyuci-01-01'});assert.equal(r.status,200);assert.equal(r.body.content_label,'AI 辅助解读');assert.equal(r.body.generation_status,'validated');assert.ok(r.body.analysis);assert.ok(r.body.sources.every(s=>s.verification_status!=='verified'))});
await check('client annotation content is ignored; canonical R2 used',async()=>{let prompt='';const c={...env,AI:{run:async(_,p)=>{prompt=p.messages?.[0]?.content||p.prompt;return response({...valid,readings:[valid.readings[0],valid.readings[1]]})}}};const r=await api('/annotation/interpret',{annotation:{id:'huzi-shuyuci-01-01',paragraph_id:'shuyuci-01-01',content:'client-injected-fiction',source:'imaginary-book'}},c);assert.equal(r.status,200);assert.ok(!prompt.includes('client-injected-fiction'));assert.ok(!prompt.includes('imaginary-book'))});
await check('annotation cannot reference different paragraph',async()=>assert.equal((await api('/annotation/interpret',{annotation:{id:'huzi-shuyuci-01-01',paragraph_id:'liuye-02-01'}})).status,404));
await check('AI annotation never assigned historical evidence',async()=>{const r=await api('/annotation/interpret',{annotation:{id:'ai-modern-shuyuci-01-01',paragraph_id:'shuyuci-01-01'}});assert.equal(r.status,200);assert.equal(r.body.generation_status,'insufficient_evidence');assert.deepEqual(r.body.readings,[])});
await check('fallback validates each model; no unchecked prose returned',async()=>{let n=0;const r=await api('/analyze',{paragraph_id:'shuyuci-01-01'},{...env,AI:{run:async()=>++n===1?{response:'invalid'}:response(valid)}});assert.equal(n,2);assert.equal(r.body.generation_status,'validated');assert.equal(r.body.validation_failures[0].error_type,'invalid_json')});
await check('all model failures return explicit withheld state',async()=>{const r=await api('/analyze',{paragraph_id:'shuyuci-01-01'},{...env,AI:{run:async()=>{throw new Error('provider secret must not leak')}}});assert.equal(r.status,200);assert.equal(r.body.generation_status,'withheld');assert.ok(!JSON.stringify(r.body).includes('provider secret'))});
await check('invalid JSON/input/missing paragraph',async()=>{assert.equal((await api('/analyze','{')).status,400);assert.equal((await api('/analyze',{paragraph_id:[]})).status,400);assert.equal((await api('/analyze',{paragraph_id:'missing-01-01'})).status,404)});
await check('semantic invalid parameter rejected before binding',async()=>assert.equal((await api('/query',{query:'相思',top_k:-1})).status,400));
await check('embedding failure does not fall back across vector spaces',async()=>{let n=0;const r=await api('/query',{query:'相思'},{...env,AI:{run:async()=>{n++;throw new Error('embedding unavailable')}}});assert.equal(r.status,503);assert.equal(n,1)});
await check('R2 outage is explicit 503 with request id',async()=>{const r=await api('/analyze',{paragraph_id:'shuyuci-01-01'},{...env,KNOWLEDGE_BUCKET:{get:async()=>{throw new Error('fetch failed')}}});assert.equal(r.status,503);assert.equal(r.body.error_type,'knowledge_unavailable');assert.ok(r.body.request_id)});
await check('retrieval resolves canonical R2 sources and skips stale annotation IDs',async()=>{const custom={...env,AI:{run:async()=>({data:[Array(1024).fill(0.1)]})},VECTOR_INDEX:{query:async()=>({matches:[{score:0.9,metadata:{paragraph_id:'shuyuci-01-01',annotation_id:'huzi-shuyuci-01-01'}},{score:0.8,metadata:{paragraph_id:'shuyuci-01-01',annotation_id:'imaginary-ann'}}]})}};const r=await api('/query',{query:'绿肥红瘦'},custom);assert.equal(r.status,200);assert.equal(r.body.results.length,1);assert.equal(r.body.results[0].original_source.author,'李清照');assert.equal(r.body.results[0].annotations[0].verification_status,'unverified')});
await check('nonfinite embeddings rejected before Vectorize',async()=>{const r=await api('/query',{query:'相思'},{...env,AI:{run:async()=>({data:[Array(1024).fill(NaN)]})}});assert.equal(r.status,503)});
await check('matching excerpt cannot authenticate attribution to a historical figure',()=>rejected({...valid,readings:[valid.readings[0],{...valid.readings[1],explanation:'胡仔认为此词独特'}]},'unverified_attribution'));
await check('invented book/title rejected even with matching quote',()=>rejected({...valid,readings:[{...valid.readings[0],explanation:'这是《花间知否知非》的内容'},valid.readings[1]]},'unsupported_document'));
await check('real timeout budget withholds without parallel fallback',async()=>{let n=0;const started=Date.now();const r=await api('/analyze',{paragraph_id:'shuyuci-01-01'},{...env,AI:{run:()=>{n++;return new Promise(()=>{})}}});assert.equal(r.body.generation_status,'withheld');assert.equal(r.body.validation_failures[0].error_type,'model_timeout');assert.equal(n,1);assert.ok(Date.now()-started>=9900)});
await check('provider quota errors expose only safe category/code',async()=>{const r=await api('/analyze',{paragraph_id:'shuyuci-01-01'},{...env,AI:{run:async()=>{throw new Error('4006: daily free allocation exceeded; private-provider-diagnostic')}}});assert.equal(r.body.generation_status,'withheld');assert.equal(r.body.validation_failures[0].error_type,'model_quota_exceeded');assert.equal(r.body.validation_failures[0].provider_code,'4006');assert.ok(!JSON.stringify(r.body).includes('private-provider-diagnostic'))});
for(const [label,error,expected] of [
 ['documented quota code',new Error('3036: account limited'),'model_quota_exceeded'],
 ['account rate limit',new Error('429: too many requests'),'model_rate_limited'],
 ['provider timeout',new Error('3007: request timeout'),'model_provider_timeout'],
 ['account access denied',new Error('5035: model requires paid plan'),'model_access_denied'],
 ['socket error cause',new Error('fetch failed',{cause:Object.assign(new Error('private-network-fixture'),{code:'UND_ERR_SOCKET'})}),'model_transport'],
])await check(label+' stops same-account fallback',async()=>{let calls=0;const r=await api('/analyze',{paragraph_id:'shuyuci-01-01'},{...env,AI:{run:async()=>{calls++;throw error}}});assert.equal(calls,1);assert.equal(r.body.generation_status,'withheld');assert.equal(r.body.validation_failures[0].error_type,expected);assert.ok(!JSON.stringify(r.body).includes('private-network-fixture'))});
await check('model-specific missing model permits one bounded fallback',async()=>{let calls=0;const r=await api('/analyze',{paragraph_id:'shuyuci-01-01'},{...env,AI:{run:async()=>{if(++calls===1)throw new Error('5007: No such model');return response(valid)}}});assert.equal(calls,2);assert.equal(r.body.generation_status,'validated');assert.equal(r.body.validation_failures[0].error_type,'model_invalid')});
await check('bare 4006 cannot be silently interpreted as exhausted quota',async()=>{let calls=0;const r=await api('/analyze',{paragraph_id:'shuyuci-01-01'},{...env,AI:{run:async()=>{calls++;throw new Error('4006: unknown diagnostic')}}});assert.equal(calls,2);assert.equal(r.body.validation_failures[0].error_type,'model_unavailable');assert.equal(r.body.validation_failures[0].provider_code,'4006')});
console.log=old.log;console.error=old.error;
await mkdir('../docs/ai-evidence',{recursive:true});
await writeFile('../docs/ai-evidence/contract-tests.json',JSON.stringify({environment:'controlled binding contract/fault tests; not real model accuracy',results:rows},null,2)+'\n');console.log(JSON.stringify({passed:rows.filter(x=>x.passed).length,total:rows.length,failures:rows.filter(x=>!x.passed)},null,2));process.exitCode=rows.some(x=>!x.passed)?1:0;
