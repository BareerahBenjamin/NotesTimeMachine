// Approval fixture is test-only; it does not verify real literature.
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
await build({entryPoints:['src/index.ts'],bundle:true,platform:'node',format:'esm',outfile:'/tmp/ntm-activation-app.mjs',logLevel:'silent'});
await build({entryPoints:['src/routes/activation.ts','src/sources.ts'],bundle:true,platform:'node',format:'esm',outdir:'/tmp/ntm-activation-modules',outbase:'src',outExtension:{'.js':'.mjs'},logLevel:'silent'});
const {default:app}=await import('/tmp/ntm-activation-app.mjs?v='+Date.now());
const {sha256}=await import('/tmp/ntm-activation-modules/routes/activation.mjs');
const {loadParagraph}=await import('/tmp/ntm-activation-modules/sources.mjs');
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-07-01',d1Databases:{DB:'activation-isolated'},r2Buckets:{KNOWLEDGE_BUCKET:'activation-isolated'}}));
const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('KNOWLEDGE_BUCKET');
const env={DB:db,KNOWLEDGE_BUCKET:bucket,FEEDBACK_ENABLED:'true',FEEDBACK_ALLOWED_ORIGINS:'https://test',FEEDBACK_RATE_LIMIT_SECRET:'ISOLATED-TEST-ONLY-RATE-SECRET-000000',ENVIRONMENT:'test'},rows=[],logs=[];
const old={log:console.log,error:console.error};console.log=x=>logs.push(x);console.error=x=>logs.push(x);
async function check(name,fn){try{await fn();rows.push({name,passed:true})}catch(e){rows.push({name,passed:false,error:e.message});old.error(name,e)}}
async function req(path,body,custom=env){const r=await app.fetch(new Request('https://test/api'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','Origin':'https://test','CF-Connecting-IP':'192.0.2.10'},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})}),custom);return{status:r.status,body:await r.json()}}
const key='metadata/activation-example.json';
try{
for(const file of ['metadata/classics.json','content/shuyuci/shuyuci-01.json'])await bucket.put(file,await readFile('../knowledge_base/'+file));
const context=await loadParagraph(bucket,'shuyuci-01-01');
const eligible=[context.sources[0],...context.annotations.filter(a=>a.content_type==='historical_annotation').filter((a,i,all)=>all.findIndex(b=>b.era===a.era)===i).slice(0,2)];assert.equal(eligible.length,3);
const manifest={schema_version:1,classic_id:'shuyuci',paragraph_id:'shuyuci-01-01',sources:await Promise.all(eligible.map(async s=>({source_id:s.source_id,source_title:s.source_title,author:s.author,dynasty:s.dynasty,edition:'ISOLATED TEST ONLY',reference:'ISOLATED TEST ONLY',reference_url:'https://example.org/test-only',content_sha256:await sha256(s.content),verification_id:'ISOLATED-TEST-ONLY',reviewed_at:'2020-01-01T00:00:00Z'})))};
await check('missing manifest is explicit unavailable state',async()=>{const r=await req('/activation/example');assert.equal(r.status,200);assert.equal(r.body.reason,'verified_example_missing');assert.equal(r.body.available,false)});
await check('test-only manifest attaches exact canonical sources',async()=>{await bucket.put(key,JSON.stringify(manifest));const r=await req('/activation/example');assert.equal(r.body.available,true);assert.equal(r.body.example.annotations.length,2);assert.equal(r.body.example.original.verification_status,'verified')});
for(const [name,mutate,reason] of [
 ['changed quote hash',m=>m.sources[1].content_sha256='a'.repeat(64),'source_changed'],
 ['missing original proof',m=>m.sources[0]={...m.sources[1],source_id:'missing'},'verification_incomplete'],
 ['invented author',m=>m.sources[1].author='imaginary','verification_incomplete'],
 ['unsafe reference credentials',m=>m.sources[1].reference_url='https://private@example.org','verification_incomplete'],
 ['future review',m=>m.sources[1].reviewed_at='2999-01-01','verification_incomplete'],
 ['missing edition',m=>m.sources[1].edition='','verification_incomplete'],
 ['duplicate proof',m=>m.sources[2]=m.sources[1],'verification_incomplete'],
 ['wrong classic',m=>m.classic_id='nujie','example_not_found'],
 ])await check(name+' cannot enable experience',async()=>{const m=structuredClone(manifest);mutate(m);await bucket.put(key,JSON.stringify(m));const r=await req('/activation/example');assert.equal(r.body.available,false);assert.equal(r.body.reason,reason)});
await check('AI cannot qualify as historical comparison',async()=>{const m=structuredClone(manifest),s=context.annotations.find(a=>a.ai_generated);m.sources[2]={...m.sources[2],source_id:s.source_id};await bucket.put(key,JSON.stringify(m));assert.equal((await req('/activation/example')).body.available,false)});
await check('malformed manifest and R2 outage explicit',async()=>{await bucket.put(key,'{');assert.equal((await req('/activation/example')).body.reason,'invalid_manifest');assert.equal((await req('/activation/example',undefined,{...env,KNOWLEDGE_BUCKET:{get:async()=>{throw Error('transport')}}})).status,503)});
const base={submission_id:crypto.randomUUID(),classic_id:'shuyuci',paragraph_id:'shuyuci-01-01',annotation_id:context.annotations[0].id,target:'annotation',rating:'problem',issue_type:'questionable_source',note:'private-note-fixture'};
await check('disabled feedback no D1 call or false receipt',async()=>{const custom={...env,FEEDBACK_ENABLED:'false',DB:undefined};assert.equal((await req('/feedback/availability',undefined,custom)).body.available,false);const r=await req('/feedback',base,custom);assert.equal(r.status,503);assert.equal(r.body.received,undefined)});
await check('missing schema returns unavailable and 503',async()=>{assert.equal((await req('/feedback/availability')).body.reason,'schema_not_installed');assert.equal((await req('/feedback',base)).status,503)});
for(const sql of (await readFile('schema-proposals/001-content-feedback.sql','utf8')).replace(/--[^\n]*/g,'').split(';').filter(x=>x.trim()))await db.prepare(sql).run();
for(const sql of (await readFile('schema-proposals/002-feedback-workflow.up.sql','utf8')).replace(/--[^\n]*/g,'').split(';').filter(x=>x.trim()))await db.prepare(sql).run();
await check('anonymous feedback saves IDs without account fields',async()=>{assert.equal((await req('/feedback/availability')).body.available,true);assert.equal((await req('/feedback',base)).status,201);const row=await db.prepare('SELECT * FROM content_feedback').first();assert.equal(row.annotation_id,base.annotation_id);for(const k of ['user_id','ip','cookie','token'])assert.ok(!(k in row))});
await check('serial and concurrent same submission idempotent',async()=>{for(let i=0;i<5;i++)assert.equal((await req('/feedback',base)).status,201);assert.ok((await Promise.all(Array.from({length:6},()=>req('/feedback',base)))).every(r=>r.status===201));assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM content_feedback').first()).n,1)});
await check('same ID changed payload is 409',async()=>assert.equal((await req('/feedback',{...base,note:'changed'})).status,409));
await check('cross-book and cross-annotation rejected',async()=>{assert.equal((await req('/feedback',{...base,submission_id:crypto.randomUUID(),classic_id:'nujie'})).status,404);assert.equal((await req('/feedback',{...base,submission_id:crypto.randomUUID(),annotation_id:'unrelated'})).status,404)});
await check('invalid input, PII fields, JSON and body limit',async()=>{for(const change of [{submission_id:'x'},{rating:'other'},{issue_type:'made-up'},{annotation_id:null},{note:'x'.repeat(501)},{email:'do-not-collect'}])assert.equal((await req('/feedback',{...base,...change})).status,400);assert.equal((await req('/feedback','{')).status,400);assert.equal((await req('/feedback',{...base,note:'x'.repeat(9000)})).status,413)});
await check('reading and AI feedback no annotation/login required',async()=>{for(const target of ['reading','ai_analysis'])assert.equal((await req('/feedback',{...base,submission_id:crypto.randomUUID(),target,annotation_id:null,rating:'helpful',issue_type:null,note:null})).status,201)});
await check('D1 transport 503 once with no write replay',async()=>{let calls=0;const bad=new Proxy(db,{get(t,k){if(k==='prepare')return()=>{calls++;throw Error('D1_ERROR: Network connection lost')};const v=t[k];return typeof v==='function'?v.bind(t):v}});const r=await req('/feedback',{...base,submission_id:crypto.randomUUID()},{...env,DB:bad});assert.equal(r.status,503);assert.equal(calls,1);assert.equal(r.body.received,undefined)});
await check('structured logs omit feedback content and IDs',()=>{const text=JSON.stringify(logs);for(const secret of ['private-note-fixture',base.submission_id,base.paragraph_id])assert.ok(!text.includes(secret));assert.ok(logs.some(x=>x.error_type==='database_transport'))});
}finally{await mf.dispose();console.log=old.log;console.error=old.error}
await mkdir('../docs/activation-evidence',{recursive:true});await writeFile('../docs/activation-evidence/backend-tests.json',JSON.stringify({environment:'isolated Miniflare D1/R2; test-only approval fixture is NOT real verification; no production writes',results:rows},null,2)+'\n');console.log(JSON.stringify({passed:rows.filter(x=>x.passed).length,total:rows.length,failures:rows.filter(x=>!x.passed)},null,2));process.exitCode=rows.some(x=>!x.passed)?1:0;
