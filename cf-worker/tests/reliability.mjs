import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {SignJWT} from 'jose';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
await build({entryPoints:['src/index.ts'],bundle:true,platform:'node',format:'esm',outfile:'/tmp/ntm-reliability.mjs',logLevel:'silent'});
const {default:app}=await import('/tmp/ntm-reliability.mjs?v='+Date.now());
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-07-01',d1Databases:{DB:'isolated-tests'},r2Buckets:{KNOWLEDGE_BUCKET:'isolated-tests'}}));
const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('KNOWLEDGE_BUCKET');
const env={DB:db,KNOWLEDGE_BUCKET:bucket,JWT_SIGNING_KEY:randomBytes(32).toString('hex'),ENVIRONMENT:'test'},logs=[],results=[];
const original={log:console.log,error:console.error};console.log=x=>logs.push(x);console.error=x=>logs.push(x);
async function check(name,fn){try{await fn();results.push({name,passed:true})}catch(e){results.push({name,passed:false,error:e.message});original.error(name,e)}}
async function req(path,body,token,method=body===undefined?'GET':'POST',custom=env){const r=await app.fetch(new Request('https://test/api/community'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})}),custom);return {status:r.status,body:await r.json(),requestId:r.headers.get('X-Request-ID')}}
function fault(message){let calls=0;return {get calls(){return calls},binding:new Proxy(db,{get(t,k){if(k==='prepare')return()=>{calls++;throw new Error(message)};const v=t[k];return typeof v==='function'?v.bind(t):v}})}}
try{
for(const sql of (await readFile('schema.sql','utf8')).replace(/--[^\n]*/g,'').split(';').filter(x=>x.trim()))await db.prepare(sql).run();
let a,b,id,cid;
await check('register/login two users',async()=>{for(const username of ['alice','bob'])assert.equal((await req('/register',{username,password:'private-test-password'})).status,201);a=(await req('/login',{username:'alice',password:'private-test-password'})).body;b=(await req('/login',{username:'bob',password:'private-test-password'})).body;assert.ok(a.token&&b.token)});
await check('invalid credentials/anonymous writes',async()=>{assert.equal((await req('/login',{username:'alice',password:'wrong'})).status,401);assert.equal((await req('/posts',{title:'x',content:'x'})).status,401)});
await check('different salts and known password collision rejected', async () => {
  const { results: users } = await db.prepare("SELECT password_hash FROM users WHERE username IN ('alice', 'bob')").all();
  assert.equal(users.length, 2);
  assert.ok(users.every(user => /^pbkdf2-sha256-v1\$[0-9a-f]{32}\$[0-9a-f]{64}$/.test(user.password_hash)));
  assert.notEqual(users[0].password_hash, users[1].password_hash);
  assert.equal((await req('/register', { username: 'collision-test', password: 'AaAaAa' })).status, 201);
  const wrong = await req('/login', { username: 'collision-test', password: 'BBBBBB' });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.token, undefined);
});
await check('legacy credential requires reset and preserves account data', async () => {
  const legacyHash = 'h_' + Math.abs([...('AaAaAa')].reduce((hash, letter) => (31 * hash + letter.charCodeAt(0)) | 0, 0)).toString(16).padStart(16, '0');
  await db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').bind('legacy-test', legacyHash).run();
  for (const password of ['AaAaAa', 'BBBBBB']) {
    const response = await req('/login', { username: 'legacy-test', password });
    assert.equal(response.status, 401);
    assert.equal(response.body.token, undefined);
  }
  assert.equal((await db.prepare('SELECT password_hash FROM users WHERE username = ?').bind('legacy-test').first()).password_hash, legacyHash);
});
await check('missing or malformed signing key fails closed', async () => {
  for (const key of [undefined, 'TEST ONLY invalid key']) {
    const config = { ...env, JWT_SIGNING_KEY: key };
    for (const path of ['/register', '/login', '/reset-password']) {
      const response = await req(path, { username: 'alice', password: 'private-test-password' }, null, 'POST', config);
      assert.equal(response.status, 503);
      assert.equal(response.body.token, undefined);
    }
    assert.equal((await req('/user', undefined, a.token, 'GET', config)).status, 401);
    assert.equal((await req('/categories', undefined, null, 'GET', config)).status, 200);
  }
});
await check('malformed JSON',async()=>assert.equal((await req('/register','{')).status,400));
await check('invalid pagination before SQL',async()=>{const f=fault('must not query');for(const path of ['/posts?page=bad','/posts?per_page=0','/posts?per_page=-1','/posts?category_id=NaN','/users/1/posts?page=Infinity','/users/1.5'])assert.equal((await req(path,undefined,null,'GET',{...env,DB:f.binding})).status,400);assert.equal(f.calls,0)});
await check('categories/empty/not-found',async()=>{assert.equal((await req('/categories')).body.length,5);assert.deepEqual((await req('/posts')).body.posts,[]);assert.equal((await req('/users/999')).status,404)});
await check('reject signed JWT with invalid subject, missing expiration or old key', async () => {
  const key = new TextEncoder().encode(env.JWT_SIGNING_KEY);
  const oldKey = new TextEncoder().encode('TEST ONLY OLD KEY');
  const token = (subject, signingKey) => new SignJWT({ sub: subject })
    .setProtectedHeader({ alg: 'HS256' }).setIssuer('zhushu-notes-community').setIssuedAt()
    .setExpirationTime('1m').sign(signingKey);
  const invalid = [
    await token('Infinity', key),
    await new SignJWT({ sub: String(a.user.id) }).setProtectedHeader({ alg: 'HS256' })
      .setIssuer('zhushu-notes-community').setIssuedAt().sign(key),
    await token(String(a.user.id), oldKey),
    await new SignJWT({ sub: String(a.user.id) }).setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt().setExpirationTime('1m').sign(key),
    await new SignJWT({ sub: String(a.user.id) }).setProtectedHeader({ alg: 'HS256' })
      .setIssuer('zhushu-notes-community').setIssuedAt().setExpirationTime('1s ago').sign(key),
  ];
  for (const jwt of invalid) assert.equal((await req('/posts', { title: 'x', content: 'x' }, jwt)).status, 401);
  assert.equal((await req('/user', undefined, a.token)).body.id, a.user.id);
});
await check('similar usernames remain distinct accounts', async () => {
  assert.equal((await req('/login', { username: 'Alice', password: 'private-test-password' })).status, 401);
  assert.equal((await req('/register', { username: 'Alice', password: 'different-fixture-password' })).status, 201);
  assert.equal((await req('/login', { username: 'Alice', password: 'private-test-password' })).status, 401);
  assert.notEqual((await req('/login', { username: 'Alice', password: 'different-fixture-password' })).body.user.id, a.user.id);
});
await check('verified recovery grant is scoped, expires and is consumed exactly once', async () => {
  const account = await db.prepare('SELECT id FROM users WHERE username = ?').bind('legacy-test').first();
  await db.prepare('INSERT INTO reading_progress (user_id, classic_id, chapter_index, progress_pct) VALUES (?, ?, ?, ?)')
    .bind(account.id, 'shuyuci', 1, 0.5).run();
  await db.prepare('INSERT INTO posts (user_id, title, content) VALUES (?, ?, ?)').bind(account.id, 'Recovery fixture', 'Test only').run();
  const code = randomBytes(32).toString('hex');
  const password = 'recovery-fixture-password';
  const sql = (id, input) => {
    const plan = spawnSync(process.execPath, ['scripts/prepare-account-recovery.mjs', String(id)], { input, encoding: 'utf8' });
    assert.equal(plan.status, 0);
    assert.ok(!plan.stdout.includes(input));
    return plan.stdout;
  };
  const reset = (username, grant = code, nextPassword = password) => req('/reset-password', { username, code: grant, password: nextPassword });
  const invalid = await reset('legacy-test');
  assert.equal(invalid.status, 401);
  assert.equal((await db.prepare(sql(a.user.id, code)).all()).results.length, 0);
  assert.equal((await db.prepare(sql(account.id, code)).all()).results.length, 1);
  for (const username of ['Legacy-test', 'alice', 'absent']) assert.deepEqual((await reset(username)).body, invalid.body);
  assert.equal((await reset('legacy-test', randomBytes(32).toString('hex'))).status, 401);
  assert.equal((await reset('legacy-test', code, 'short')).status, 400);
  await db.prepare("UPDATE users SET password_hash = 'recovery-v1$1000000000$' || substr(password_hash, 24) WHERE id = ?").bind(account.id).run();
  assert.deepEqual((await reset('legacy-test')).body, invalid.body);
  const replacement = randomBytes(32).toString('hex');
  assert.equal((await db.prepare(sql(account.id, replacement)).all()).results.length, 1);
  assert.deepEqual((await reset('legacy-test')).body, invalid.body);
  const responses = await Promise.all([reset('legacy-test', replacement), reset('legacy-test', replacement)]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 401]);
  assert.ok(responses.every(response => response.body.token === undefined));
  assert.equal((await reset('legacy-test', replacement)).status, 401);
  assert.equal((await db.prepare(sql(account.id, replacement)).all()).results.length, 0);
  const login = await req('/login', { username: 'legacy-test', password });
  assert.equal(login.body.user.id, account.id);
  assert.equal((await req('/login', { username: 'legacy-test', password: 'AaAaAa' })).status, 401);
  assert.equal((await req('/users/' + account.id + '/reading-progress', undefined, login.body.token)).body.progress[0].progress_pct, 0.5);
  assert.equal((await req('/users/' + account.id + '/posts')).body.posts[0].user_id, account.id);
  assert.ok([code, replacement, password].every(value => !JSON.stringify(logs).includes(value)));
  await db.prepare('DELETE FROM posts WHERE user_id = ?').bind(account.id).run();
});
await check('create/read post',async()=>{const r=await req('/posts',{title:'test post',content:'public fixture',category_id:1},a.token);assert.equal(r.status,201);id=r.body.post.id;assert.equal((await req('/posts/'+id)).body.title,'test post')});
await check('invalid/dangling category',async()=>{for(const [v,status] of [['bad',400],[999,409]])assert.equal((await req('/posts',{title:'x',content:'x',category_id:v},a.token)).status,status)});
await check('progress consistency/user isolation',async()=>{
  const ownPath = '/users/' + a.user.id;
  const progressPath = ownPath + '/reading-progress';
  for (const pct of [0.2, 0.6]) {
    const result = await req('/me/reading-progress', { classic_id:'shuyuci', chapter_index:1, paragraph_id:'private-paragraph-fixture', progress_pct:pct, user_id:b.user.id }, a.token);
    assert.equal(result.status, 200);
  }
  const p = (await req(progressPath, undefined, a.token)).body.progress;
  assert.equal(p.length, 1);
  assert.equal(p[0].progress_pct, 0.6);
  assert.equal((await req(progressPath)).status, 401);
  assert.equal((await req(progressPath, undefined, b.token)).status, 403);
  assert.equal((await req(ownPath, undefined, b.token)).body.stats.books_count, undefined);
  assert.equal((await req(ownPath, undefined, a.token)).body.stats.books_count, 1);
  assert.equal((await req('/users/' + b.user.id + '/reading-progress', undefined, b.token)).body.progress.length, 0);
});
await check('invalid progress parameters',async()=>{for(const change of [{progress_pct:'bad'},{progress_pct:1.1},{chapter_index:-1},{chapter_index:0.5},{paragraph_id:{}}])assert.equal((await req('/me/reading-progress',{classic_id:'shuyuci',...change},a.token)).status,400)});
await check('comment create/read/authorization',async()=>{const r=await req(`/posts/${id}/comments`,{content:'fixture comment'},a.token);assert.equal(r.status,201);cid=r.body.comment.id;assert.equal((await req(`/posts/${id}/comments`)).body.length,1);assert.equal((await req(`/posts/${id}`)).body.comment_count,1);assert.equal((await req('/comments/'+cid,undefined,b.token,'DELETE')).status,400)});
await check('missing comment/like parent',async()=>{assert.equal((await req('/posts/999/comments',{content:'x'},a.token)).status,404);assert.equal((await req('/posts/999/like',{},a.token)).status,404)});
await check('comment atomic rollback on counter failure',async()=>{await db.prepare("CREATE TRIGGER fail_counter BEFORE UPDATE OF comment_count ON posts BEGIN SELECT RAISE(ABORT,'injected'); END").run();const before=await db.prepare('SELECT COUNT(*) AS n FROM comments').first();assert.equal((await req(`/posts/${id}/comments`,{content:'must roll back'},a.token)).status,500);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM comments').first()).n,before.n);await db.prepare('DROP TRIGGER fail_counter').run()});
await check('sequential like/unlike',async()=>{assert.equal((await req(`/posts/${id}/like`,{},a.token)).body.liked,true);assert.equal((await req(`/posts/${id}/like`,{},a.token)).body.liked,false)});
await check('concurrent likes preserve unique/counter',async()=>{const r=await Promise.all(Array.from({length:6},()=>req(`/posts/${id}/like`,{},a.token)));assert.ok(r.every(x=>x.status===200));const post=await db.prepare('SELECT like_count FROM posts WHERE id=?').bind(id).first(),n=await db.prepare('SELECT COUNT(*) AS n FROM likes WHERE post_id=?').bind(id).first();assert.equal(post.like_count,n.n);assert.ok(n.n<=1)});
await check('concurrent comments preserve counter',async()=>{const r=await Promise.all(Array.from({length:6},(_,i)=>req(`/posts/${id}/comments`,{content:'concurrent-'+i},b.token)));assert.ok(r.every(x=>x.status===201));const post=await db.prepare('SELECT comment_count FROM posts WHERE id=?').bind(id).first(),n=await db.prepare('SELECT COUNT(*) AS n FROM comments WHERE post_id=?').bind(id).first();assert.equal(post.comment_count,n.n)});
await check('20 serial + 6 parallel reads',async()=>{for(let i=0;i<20;i++)assert.equal((await req('/posts')).status,200);assert.ok((await Promise.all(Array.from({length:6},()=>req('/categories')))).every(x=>x.status===200))});
for(const [label,message] of [['connection loss','D1_ERROR: Failed to parse body as JSON, got: TypeError: fetch failed'],['timeout','D1_ERROR: operation timed out']])await check(label+' 503/no write replay',async()=>{const f=fault(message),r=await req('/me/reading-progress',{classic_id:'shuyuci'},a.token,'POST',{...env,DB:f.binding});assert.equal(r.status,503);assert.equal(f.calls,1);assert.equal(r.body.error_type,'database_transport');assert.ok(r.body.request_id);assert.equal(r.body.detail,undefined)});
await check('schema/binding failure classification',async()=>{assert.equal((await req('/categories',undefined,null,'GET',{...env,DB:fault('D1_ERROR: no such table: categories').binding})).body.error_type,'schema_mismatch');assert.equal((await req('/categories',undefined,null,'GET',{...env,DB:undefined})).body.error_type,'binding_missing')});
await check('delete authorization and rollback',async()=>{assert.equal((await req('/posts/'+id,undefined,b.token,'DELETE')).status,400);assert.equal((await req('/comments/'+cid,undefined,a.token,'DELETE')).status,200);await db.prepare("CREATE TRIGGER fail_delete BEFORE DELETE ON posts BEGIN SELECT RAISE(ABORT,'injected'); END").run();const before=await db.prepare('SELECT COUNT(*) AS n FROM comments WHERE post_id=?').bind(id).first();assert.equal((await req('/posts/'+id,undefined,a.token,'DELETE')).status,500);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM comments WHERE post_id=?').bind(id).first()).n,before.n);await db.prepare('DROP TRIGGER fail_delete').run();assert.equal((await req('/posts/'+id,undefined,a.token,'DELETE')).status,200)});
await check('structured logs exclude secrets/private data',async()=>{const errors=logs.filter(x=>x?.status>=500);assert.ok(errors.length>=5);for(const log of errors)for(const k of ['request_id','route','method','status','duration_ms','error_type','database_operation','exception_stack'])assert.ok(k in log);const text=JSON.stringify(logs);for(const secret of [a.token,b.token,'private-test-password','private-paragraph-fixture','concurrent-','must roll back'])assert.ok(!text.includes(secret));assert.ok(logs.every(x=>!x?.route?.includes('?')))});
await check('query plans use existing user/comment indexes',async()=>{for(const sql of ['SELECT * FROM reading_progress WHERE user_id=1','SELECT * FROM comments WHERE post_id=1']){const plan=await db.prepare('EXPLAIN QUERY PLAN '+sql).all();assert.ok(plan.results.some(r=>/INDEX/.test(r.detail)))}});
await check('R2 classics/chapter/paragraph routes',async()=>{await bucket.put('metadata/classics.json',await readFile('../knowledge_base/metadata/classics.json'));await bucket.put('content/shuyuci/shuyuci-01.json',await readFile('../knowledge_base/content/shuyuci/shuyuci-01.json'));for(const path of ['/classics','/chapters/shuyuci','/paragraphs/shuyuci-01','/paragraph/shuyuci-01-01'])assert.equal((await app.fetch(new Request('https://test/api'+path),env)).status,200)});
}finally{await mf.dispose();console.log=original.log;console.error=original.error}
await mkdir('../docs/d1-evidence',{recursive:true});
await writeFile('../docs/d1-evidence/local-tests.json',JSON.stringify({environment:'ephemeral Miniflare D1; no production writes',results},null,2)+'\n');
console.log(JSON.stringify({passed:results.filter(x=>x.passed).length,total:results.length,failures:results.filter(x=>!x.passed)},null,2));process.exitCode=results.some(x=>!x.passed)?1:0;
