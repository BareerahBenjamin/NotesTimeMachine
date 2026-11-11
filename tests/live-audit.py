#!/usr/bin/env python3
"""Live API audit. Creates one dedicated test account; credentials stay in /tmp.
Run setup once, verify after browser tests, cleanup for its own test posts.
Never reads or deletes another user's content. No mocked API responses.
"""
import argparse, gzip, json, secrets, time, urllib.request, urllib.error
from pathlib import Path
BASE='http://127.0.0.1:8787/api/community'
SESSION=Path('/tmp/ntm-audit-session.json')
REPORT=Path('/tmp/ntm-live-audit.json')
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))

def request(path, body=None, token=None, method=None):
    headers={'Content-Type':'application/json', 'Origin':'http://127.0.0.1:3302'}
    if token: headers['Authorization']='Bearer '+token
    data=json.dumps(body,ensure_ascii=False).encode() if body is not None else None
    req=urllib.request.Request(BASE+path,data=data,headers=headers,method=method)
    try:
        response=opener.open(req,timeout=40)
    except urllib.error.HTTPError as e: response=e
    raw=response.read()
    if response.headers.get('Content-Encoding')=='gzip': raw=gzip.decompress(raw)
    return response.status,json.loads(raw) if raw else {}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('mode',choices=['setup','verify','cleanup']);args=parser.parse_args()
    report=json.loads(REPORT.read_text()) if REPORT.exists() else {}
    def check(name,response,expected):
        status,data=response; report[name]={'status':status,'expected':expected,'pass':status==expected}
        if status!=expected: report[name]['error']=data.get('error','Unexpected response')
        return data
    if args.mode=='setup':
        if SESSION.exists(): raise SystemExit('Session exists; use verify, do not create duplicate accounts.')
        user='ntm_audit_'+str(int(time.time()));password=secrets.token_urlsafe(24)
        data=check('register',request('/register',{'username':user,'password':password,'nickname':'V2验收专用测试账号'}),201)
        check('wrong_password',request('/login',{'username':user,'password':'invalid-test-password'}),401)
        login=check('login',request('/login',{'username':user,'password':password}),200)
        session={'username':user,'password':password,'token':login['token'],'user_id':data['user']['id']}
        SESSION.write_text(json.dumps(session));SESSION.chmod(0o600)
        check('authenticated_user',request('/user',token=login['token']),200)
        check('invalid_token',request('/user',token='invalid.test.token'),401)
        check('unauthenticated_post',request('/posts',{'title':'鉴权测试','content':'不应写入任何内容'}),401)
    else:
        session=json.loads(SESSION.read_text());token=session['token'];uid=session['user_id']
        posts=check('test_user_posts',request(f'/users/{uid}/posts',token=token),200)
        progress=check('saved_progress',request(f'/users/{uid}/reading-progress',token=token),200)
        report['saved_progress']['records']=[{'classic_id':p['classic_id'],'chapter_index':p['chapter_index'],'paragraph_id':p['paragraph_id']} for p in progress.get('progress',[])]
        if args.mode=='cleanup':
            for post in posts.get('posts',[]):
                if post['title'].startswith('[V2验收]'):
                    check('cleanup_post_'+str(post['id']),request('/posts/'+str(post['id']),token=token,method='DELETE'),200)
        else:
            for post in posts.get('posts',[]):
                comments=check('test_post_comments',request('/posts/'+str(post['id'])+'/comments',token=token),200)
                report['test_post_comments']['count']=len(comments if isinstance(comments,list) else comments.get('data',[]))
    REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps(report,ensure_ascii=False,indent=2))
    if not all(row['pass'] for row in report.values()):raise SystemExit(1)
if __name__=='__main__':main()
