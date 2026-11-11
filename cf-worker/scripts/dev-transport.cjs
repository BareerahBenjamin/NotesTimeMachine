// Local development only: preserve Worker WebSocket upgrades through the existing proxy.
const undici = require('undici');
const { Response, WebSocketPair } = require('miniflare');
const HOP_HEADERS = ['connection','keep-alive','transfer-encoding','upgrade','expect','proxy-connection'];
function cleanHeaders(request) {
  const headers = new undici.Headers(request.headers);
  for (const token of (headers.get('connection') || '').split(',')) if (token.trim()) headers.delete(token.trim());
  for (const name of HOP_HEADERS) headers.delete(name);
  return headers;
}
function forwardWebSocket(request, dispatcher) {
  const url = new URL(request.url); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const protocols = (request.headers.get('sec-websocket-protocol') || '').split(',').map(x=>x.trim()).filter(Boolean);
  const headers = cleanHeaders(request);
  for (const name of ['sec-websocket-key','sec-websocket-version','sec-websocket-protocol','sec-websocket-extensions']) headers.delete(name);
  const socket = new undici.WebSocket(url, {dispatcher,headers,protocols}); socket.binaryType='arraybuffer';
  return new Promise((resolve,reject)=>{
    const [worker,client]=Object.values(new WebSocketPair());
    let opened=false;
    const timer=setTimeout(()=>{socket.close();reject(new Error('WebSocket handshake timed out'));},15000);
    const safeCode=code=>code===1000 || (code>=3000&&code<=4999) ? code : 1000;
    socket.addEventListener('error',event=>{
      clearTimeout(timer);
      if (!opened) reject(new Error('WebSocket handshake failed',{cause:event.error}));
      else { try {client.close(1011,'Transport unavailable');} catch {} }
    });
    socket.addEventListener('message',event=>{try{client.send(event.data)}catch{socket.close()}});
    socket.addEventListener('close',event=>{clearTimeout(timer);try{client.close(safeCode(event.code))}catch{}});
    client.addEventListener('message',event=>{if(socket.readyState===undici.WebSocket.OPEN) socket.send(event.data)});
    client.addEventListener('close',event=>{if(socket.readyState<undici.WebSocket.CLOSING)socket.close(safeCode(event.code))});
    socket.addEventListener('open',()=>{
      opened=true;clearTimeout(timer);client.accept();
      resolve(new Response(null,{status:101,webSocket:worker,headers:socket.protocol?{'sec-websocket-protocol':socket.protocol}:{}}));
    },{once:true});
  });
}
function createTransport(dispatcher) {
  return async request=>{
    if(request.method==='GET' && request.headers.get('upgrade')?.toLowerCase()==='websocket')return forwardWebSocket(request,dispatcher);
    return undici.fetch(request.url,{dispatcher,method:request.method,headers:cleanHeaders(request),body:request.body,duplex:'half',redirect:'manual'});
  };
}
module.exports={createTransport};
