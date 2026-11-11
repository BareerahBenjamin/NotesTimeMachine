#!/usr/bin/env python3
"""Public literary inputs only; bounded real Worker calls, resume without replaying saved cases."""
import argparse, concurrent.futures, datetime, json, pathlib, time, urllib.request, urllib.error
p=argparse.ArgumentParser();p.add_argument('--base',default='http://127.0.0.1:8787');p.add_argument('--output',required=True);p.add_argument('--workers',type=int,default=2);a=p.parse_args()
cases=json.loads(pathlib.Path(__file__).with_name('cases.json').read_text());out=pathlib.Path(a.output);rows=json.loads(out.read_text()) if out.exists() else [];done={x['id'] for x in rows}
http=urllib.request.build_opener(urllib.request.ProxyHandler({}))
def run(case):
 start=time.monotonic();row={'measured_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'id':case['id'],'paragraph_id':case['paragraph_id'],'category':case['category']}
 req=urllib.request.Request(a.base+'/api/analyze',data=json.dumps({'paragraph_id':case['paragraph_id']}).encode(),headers={'Content-Type':'application/json'})
 try:
  with http.open(req,timeout=50) as r: row.update(status=r.status,request_id=r.headers.get('X-Request-ID'),output=json.load(r))
 except urllib.error.HTTPError as e:
  try:body=json.load(e)
  except Exception:body={'error':'non_json_response'}
  row.update(status=e.code,output=body)
 except Exception as e:row.update(status=0,output={'error_type':type(e).__name__})
 row['duration_ms']=round((time.monotonic()-start)*1000);return row
out.parent.mkdir(parents=True,exist_ok=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=max(1,min(a.workers,3))) as pool:
 for row in pool.map(run,[x for x in cases if x['id'] not in done]):
  rows.append(row);out.write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n');print(row['id'],row['status'],row['duration_ms'],flush=True)
