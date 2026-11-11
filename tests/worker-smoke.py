#!/usr/bin/env python3
"""Read-only live integration checks. AI calls consume the configured Workers AI quota.
No account creation, community mutation, or reading-progress writes.
"""
import concurrent.futures
import json
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = 'http://127.0.0.1:8787'
ORIGIN = 'http://127.0.0.1:3302'
REPORT = Path('/tmp/ntm-worker-smoke.json')
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

def request(path, payload=None, method=None):
    start = time.monotonic()
    body = json.dumps(payload, ensure_ascii=False).encode() if payload is not None else None
    req = urllib.request.Request(BASE + path, data=body, method=method,
        headers={'Origin': ORIGIN, 'Content-Type': 'application/json'})
    try:
        with opener.open(req, timeout=45) as response:
            raw = response.read()
            return {'status': response.status, 'seconds': round(time.monotonic()-start, 2),
                    'cors': response.headers.get('Access-Control-Allow-Origin'),
                    'data': json.loads(raw) if raw else {}}
    except urllib.error.HTTPError as error:
        try: data = json.loads(error.read())
        except Exception: data = {'error': str(error)}
        return {'status': error.code, 'seconds': round(time.monotonic()-start, 2), 'data': data}
    except Exception as error:
        return {'status': 0, 'seconds': round(time.monotonic()-start, 2), 'data': {'error': str(error)}}

def main():
    paths = ['/api/health', '/api/classics', '/api/chapters/shuyuci', '/api/community/categories', '/api/community/posts?per_page=1']
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        initial = dict(zip(paths, pool.map(request, paths)))
    report = {}
    for path, result in initial.items():
        data = result['data']
        report[path] = {k:v for k,v in result.items() if k!='data'}
        if result['status']!=200: report[path]['error'] = str(data.get('error',data))[:250]
        elif isinstance(data,list): report[path]['count'] = len(data)
        elif isinstance(data,dict):
            report[path]['keys'] = list(data)
            if 'classics' in data: report[path]['count'] = len(data['classics'])
            if 'chapters' in data: report[path]['count'] = len(data['chapters'])
            if 'total' in data: report[path]['count'] = data['total']
    chapters = initial['/api/chapters/shuyuci']['data'].get('chapters', [])
    if chapters:
        chapter_id = chapters[0]['chapter_id']
        paragraphs = request('/api/paragraphs/' + chapter_id)
        paras = paragraphs['data'].get('paragraphs', [])
        report['paragraphs'] = {'status': paragraphs['status'], 'count':len(paras), 'seconds':paragraphs['seconds']}
        paragraph = next((p for p in paras if p.get('annotations')), paras[0] if paras else None)
        if paragraph:
            detail = request('/api/paragraph/' + paragraph['id'])
            report['paragraph_detail'] = {'status': detail['status'], 'annotations': len(detail['data'].get('annotations',[])), 'seconds': detail['seconds']}
            checks = [('/api/query', {'query':'相思','top_k':3}), ('/api/analyze', {'paragraph_id': paragraph['id']})]
            annotations = detail['data'].get('annotations', [])
            if annotations: checks.append(('/api/annotation/interpret', {'annotation':annotations[0]}))
            with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
                futures = {pool.submit(request,path,payload): path for path,payload in checks}
                for future in concurrent.futures.as_completed(futures):
                    path = futures[future]; result = future.result(); data=result['data']
                    row = {'status':result['status'], 'seconds':result['seconds'], 'model':data.get('ai_model')}
                    if 'results' in data: row['count']=len(data['results'])
                    for field in ['analysis','interpretation']:
                        if field in data: row[field+'_characters']=len(data[field]); row['sample']=data[field][:80]
                    if 'error' in data: row['error']=data['error']; row['detail']=str(data.get('detail',''))[:300]
                    report[path]=row
    for name,payload in [('empty_query',{}),('unauthenticated_progress',{'classic_id':'shuyuci','chapter_index':0,'progress_pct':0})]:
        path = '/api/query' if name=='empty_query' else '/api/community/me/reading-progress'
        result=request(path,payload)
        report[name]={'status':result['status'],'expected':400 if name=='empty_query' else 401}
    REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps(report,ensure_ascii=False,indent=2))
    failed=any(row['status'] != row.get('expected',200) for row in report.values())
    raise SystemExit(1 if failed else 0)

if __name__=='__main__': main()
