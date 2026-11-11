/** Local-only release QA: actual Worker + ephemeral D1/R2; AI and search bindings are TEST ONLY. */
const {createRequire}=require('node:module'),{once}=require('node:events'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),req=createRequire(path.join(root,'cf-worker/package.json'));
(async()=>{
 const {build}=req('esbuild'),{Miniflare,convertV4MiniflareOptions}=req('miniflare');
 await build({entryPoints:[path.join(root,'cf-worker/src/index.ts')],bundle:true,platform:'node',format:'esm',outfile:'/tmp/ntm-release-qa-worker.mjs',logLevel:'silent'});
 const {default:app}=await import('file:///tmp/ntm-release-qa-worker.mjs?v='+Date.now());
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("TEST ONLY")}}',compatibilityDate:'2026-07-01',d1Databases:{DB:'release-qa-isolated'},r2Buckets:{KNOWLEDGE_BUCKET:'release-qa-isolated'}}));
 const DB=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('KNOWLEDGE_BUCKET');
 for(const file of ['schema.sql','schema-proposals/001-content-feedback.sql','schema-proposals/002-feedback-workflow.up.sql']){
  for(const sql of (await fs.readFile(path.join(root,'cf-worker',file),'utf8')).replace(/--[^\n]*/g,'').split(';').filter(s=>s.trim()))await DB.prepare(sql).run();
 }
 async function populate(directory,prefix){for(const file of await fs.readdir(directory,{withFileTypes:true})){const full=path.join(directory,file.name),key=prefix+'/'+file.name;if(file.isDirectory())await populate(full,key);else if(file.name.endsWith('.json'))await bucket.put(key,await fs.readFile(full))}}
 await populate(path.join(root,'knowledge_base/metadata'),'metadata');await populate(path.join(root,'knowledge_base/content'),'content');
 const environment={DB,KNOWLEDGE_BUCKET:bucket,ENVIRONMENT:'test',JWT_SIGNING_KEY:require('node:crypto').randomBytes(32).toString('hex'),FEEDBACK_ENABLED:'true',FEEDBACK_RATE_LIMIT_SECRET:'TEST-ONLY-LOCAL-RATE-SECRET-NOT-PRODUCTION',FEEDBACK_ALLOWED_ORIGINS:'',AI:{run:async(model,params)=>{if(params.text!=null)return {data:[Array(1024).fill(0)]};throw Error('TEST ONLY model unavailable')}},VECTOR_INDEX:{query:async()=>({matches:[{score:1,metadata:{paragraph_id:'shuyuci-01-01'}}]})}};
 const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
 const resources=[];const staticServer=http.createServer(async(request,response)=>{
  let file=path.resolve(root,'.'+decodeURIComponent(new URL(request.url,'http://localhost').pathname==='/'?'/index.html':new URL(request.url,'http://localhost').pathname));
  if(file.startsWith(root+path.sep))try{const content=await fs.readFile(file);response.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});response.end(content);return}catch{}
  response.writeHead(404);response.end('Not found');
 });
 staticServer.listen(0,'127.0.0.1');await once(staticServer,'listening');const url='http://127.0.0.1:'+staticServer.address().port;
 environment.FEEDBACK_ALLOWED_ORIGINS=url;
 const counts={},apiLogs=[];
 const handler=async(request,response)=>{
  const chunks=[];for await(const chunk of request)chunks.push(chunk);const name=new URL(request.url,'http://localhost').pathname;counts[name]=(counts[name]||0)+1;
  const headers={...request.headers,'cf-connecting-ip':'192.0.2.180'};
  try{
   const result=await app.fetch(new Request('http://localhost:8787'+request.url,{method:request.method,headers,...(!['GET','HEAD'].includes(request.method)?{body:Buffer.concat(chunks)}:{})}),environment);
   response.writeHead(result.status,Object.fromEntries(result.headers));response.end(Buffer.from(await result.arrayBuffer()));apiLogs.push({route:name,status:result.status});
  }catch{response.writeHead(500,{'Content-Type':'application/json'});response.end('{"error":"TEST ONLY fixture failure"}')}
 };
 const servers=[];for(const host of ['127.0.0.1','::1']){const server=http.createServer(handler);server.listen(8787,host);await once(server,'listening');servers.push(server)}
 const signup=await app.fetch(new Request('http://localhost:8787/api/community/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'release_qa_test_only',password:'TEST_ONLY_RELEASE_QA_PASSWORD',nickname:'发布验收测试用户'})}),environment);if(signup.status!==201)throw Error('Isolated account setup failed');
 const info={url,api:'http://localhost:8787',environment:'TEST ONLY ephemeral D1/R2, actual app/Worker, mock inference/search bindings, no production data',pid:process.pid};
 await fs.writeFile('/tmp/ntm-release-qa-server.json',JSON.stringify(info,null,2));console.log(JSON.stringify(info));
 const close=async()=>{await fs.writeFile(path.join(root,'docs/v2-release-evidence/2026-11-06/local-api-observations.json'),JSON.stringify({scope:info.environment,counts,responses:apiLogs},null,2));for(const server of [...servers,staticServer]){server.closeAllConnections();server.close()}await mf.dispose();process.exit()};process.once('SIGTERM',close);process.once('SIGINT',close);
})().catch(error=>{console.error(error);process.exitCode=1});
