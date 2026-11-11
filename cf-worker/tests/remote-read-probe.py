#!/usr/bin/env python3
"""Read-only live probe: never registers/logs in/writes or opens a post detail (view counter).
Only status/timing and recognized error categories are recorded, not response content.
"""
import concurrent.futures, gzip, json, time, urllib.request, urllib.error, argparse
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--base',default='http://127.0.0.1:8787');parser.add_argument('--output',default='/tmp/ntm-d1-before.json');args=parser.parse_args()
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
paths=['/api/community/categories']*6+['/api/community/posts?page=1']*4+['/api/community/users/999999999/posts','/api/community/users/999999999/reading-progress','/api/community/users/999999999']+['/api/community/posts?page=bad','/api/community/posts?per_page=-1','/api/community/posts?per_page=0','/api/community/users/999999999/posts?page=bad','/api/community/posts?category_id=bad']
def probe(path):
 start=time.monotonic();req=urllib.request.Request(args.base+path)
 try:resp=opener.open(req,timeout=20)
 except urllib.error.HTTPError as error:resp=error
 except Exception as error:return {'route':path,'status':0,'duration_ms':round((time.monotonic()-start)*1000),'error_type':type(error).__name__}
 raw=resp.read()
 if resp.headers.get('Content-Encoding')=='gzip':raw=gzip.decompress(raw)
 try:data=json.loads(raw)
 except: data={}
 message=str(data.get('detail',''))+' '+str(data.get('error','')) if isinstance(data,dict) else ''
 category='transport' if 'fetch failed' in message or 'Failed to parse body as JSON' in message else 'database' if 'D1_' in message else None
 return {'route':path,'status':resp.status,'duration_ms':round((time.monotonic()-start)*1000),'request_id':resp.headers.get('X-Request-ID'),'error_type':data.get('error_type',category) if isinstance(data,dict) else None}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:rows=list(pool.map(probe,paths))
Path(args.output).write_text(json.dumps(rows,ensure_ascii=False,indent=2));print(json.dumps({'requests':len(rows),'statuses':{str(s):sum(r['status']==s for r in rows) for s in {r['status'] for r in rows}},'failures':[r for r in rows if r['status']>=500 or not r['status']]},ensure_ascii=False,indent=2))
