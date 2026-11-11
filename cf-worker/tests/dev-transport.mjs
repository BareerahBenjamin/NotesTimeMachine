import {createRequire} from 'node:module';
import http from 'node:http';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {WebSocketServer} from 'ws';
import {Agent,fetch} from 'undici';
import {Request} from 'miniflare';
const require=createRequire(import.meta.url),{createTransport}=require('../scripts/dev-transport.cjs');
const server=http.createServer((req,res)=>{req.resume();req.on('end',()=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({method:req.method,custom:req.headers['x-test']}))})});
const wss=new WebSocketServer({server});wss.on('connection',socket=>socket.on('message',(message,binary)=>socket.send(message,{binary})));
server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
const dispatcher=new Agent(),forward=createTransport(dispatcher),results=[];
try{
 // Reproduces the old forwarding path, before applying the transport adapter.
 try{await fetch(base,{dispatcher,headers:{upgrade:'websocket',connection:'Upgrade'}});throw new Error('old path unexpectedly accepted upgrade')}catch(e){assert.equal(e.cause?.code,'UND_ERR_INVALID_ARG');results.push({name:'old fetch path reproduces invalid upgrade header',passed:true})}
 const response=await forward(new Request(base,{method:'POST',headers:{'x-test':'retained','keep-alive':'timeout=5',connection:'keep-alive'},body:'fixture'}));assert.equal(response.status,200);assert.deepEqual(await response.json(),{method:'POST',custom:'retained'});results.push({name:'HTTP forwarding strips hop headers, retains application header and body',passed:true});
 const upgraded=await forward(new Request(base,{headers:{upgrade:'websocket',connection:'Upgrade'}}));assert.equal(upgraded.status,101);const ws=upgraded.webSocket;ws.accept();
 const message=new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('echo timeout')),2000);ws.addEventListener('message',e=>{clearTimeout(t);resolve(e.data)},{once:true})});ws.send('literature-fixture');assert.equal(await message,'literature-fixture');results.push({name:'WebSocket upgrade and bidirectional echo through Worker pair',passed:true});
 ws.close(1000);await new Promise(resolve=>setTimeout(resolve,50));assert.ok([...wss.clients].every(c=>c.readyState>=2));results.push({name:'closing Worker pair closes underlying socket',passed:true});
}finally{for(const c of wss.clients)c.terminate();wss.close();server.close();await dispatcher.close()}
await mkdir('../docs/d1-evidence',{recursive:true});
await writeFile('../docs/d1-evidence/transport-tests.json',JSON.stringify({environment:'local HTTP/WebSocket echo server only; no remote writes',results},null,2)+'\n');console.log(JSON.stringify({passed:results.length,total:4}));
