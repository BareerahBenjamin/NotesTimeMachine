#!/usr/bin/env python3
"""Deterministic contract metrics, not an automated historical truth judge."""
import argparse,collections,json,pathlib,statistics
p=argparse.ArgumentParser();p.add_argument('input');p.add_argument('--output',required=True);a=p.parse_args()
cases={x['id']:x for x in json.loads(pathlib.Path(__file__).with_name('cases.json').read_text())};rows=json.loads(pathlib.Path(a.input).read_text());scores=[]
for row in rows:
 o=row.get('output',{});readings=o.get('readings',[]);sources={x['source_id']:x for x in o.get('sources',[])};text=o.get('analysis','')
 matched=sum(bool(isinstance(r.get('quote'),str) and r.get('quote') and r.get('source_id') in sources and r['quote'] in sources[r['source_id']].get('content','')) for r in readings)
 metrics={
  'response_success':row['status']==200,
  'generated_answer':o.get('generation_status')=='validated' or (bool(text) and 'generation_status' not in o),
  'structure_validated':o.get('generation_status')=='validated',
  'exact_citations':matched,'cited_items':len(readings),
  'unmatched_citations':len(readings)-matched,
  'has_source_metadata':bool(sources),
  'explicit_ai_label':o.get('content_label')=='AI 辅助解读',
  'uncertainty_expressed':bool(o.get('uncertainty')),
  'distinct_view_sources':len({r.get('source_id') for r in readings}),
  'false_verified_labels':sum(x.get('verification_status')=='verified' for x in sources.values()),
  # Null prevents abstention or a schema pass from becoming a factual-accuracy score.
  'factual_accuracy':None,'interpretation_completeness':None,'viewpoint_quality':None,
  'human_review_required':True,
 }
 scores.append({'id':row['id'],'category':cases[row['id']]['category'],'status':row['status'],**metrics})
summary={'cases':len(rows),'http_200':sum(x['response_success'] for x in scores),'generated_answers':sum(x['generated_answer'] for x in scores),'structure_validated_answers':sum(x['structure_validated'] for x in scores),'withheld':sum(x.get('output',{}).get('generation_status')=='withheld' for x in rows),'exact_citations':sum(x['exact_citations'] for x in scores),'unmatched_citations':sum(x['unmatched_citations'] for x in scores),'source_metadata_responses':sum(x['has_source_metadata'] for x in scores),'explicit_ai_labels':sum(x['explicit_ai_label'] for x in scores),'uncertainty_responses':sum(x['uncertainty_expressed'] for x in scores),'false_verified_labels':sum(x['false_verified_labels'] for x in scores),'duration_median_ms':statistics.median(x['duration_ms'] for x in rows),'http_statuses':dict(collections.Counter(str(x['status']) for x in rows)),'factual_accuracy':'not_established; requires expert adjudication','warning':'Zero unmatched citations is not zero hallucinations. Withheld answers do not count as correct answers. Baseline lacked machine-readable citations, so its citation truth is unmeasured, not 0%.'}
pathlib.Path(a.output).write_text(json.dumps({'input':a.input,'summary':summary,'cases':scores},ensure_ascii=False,indent=2)+'\n');print(json.dumps(summary,ensure_ascii=False,indent=2))
