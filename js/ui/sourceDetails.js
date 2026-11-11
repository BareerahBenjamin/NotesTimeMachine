/** Source labels are determined by API provenance, never by a model's prose. */
const types = {original_text:'古籍原文',historical_annotation:'历史注疏（待核验）',modern_research:'现代研究（待核验）',ai_interpretation:'AI 辅助解读'};
export function isVerifiedSource(source) {
  const proof=source.verification_record;
  return source.verification_status==='verified' && proof?.status==='verified' && proof.source_id===source.source_id && /^[a-f0-9]{64}$/.test(proof.content_sha256||'') && Boolean(proof.reference && proof.edition && proof.verification_id && proof.reviewed_at);
}
export function sourceDetails(source,{onReportIssue}={}) {
  const details=document.createElement('details'); details.className='source-details';
  const summary=document.createElement('summary');summary.textContent='查看来源详情';details.appendChild(summary);
  const list=document.createElement('dl');
  const verified=isVerifiedSource(source);
  const fields=[['类型',verified?'已核验'+(source.content_type==='original_text'?'古籍原文':'历史注疏'):types[source.content_type] || (source.ai_generated?'AI 辅助解读':'馆藏资料（待核验）')],['来源编号',source.source_id || '尚未提供'],['文献',source.source_title || source.source || '出处未提供'],['署名',source.author || '未提供'],['时代（原始记录）',source.dynasty || source.era_name || '未提供'],['版本',source.edition || '未提供'],['卷页或定位',source.reference || '未提供'],['核验状态',source.ai_generated || source.verification_status==='ai_generated' ? 'AI 生成，不是历史文献证据' : verified ? '已核验版本、定位及文字；现代解读仍需独立判断' : '出处待核验；与馆藏文字匹配不代表文献已核实']];
  for(const [label,value] of fields){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;list.append(dt,dd)}
  details.appendChild(list);
  if(verified){
    try {const url=new URL(source.verification_record.reference_url);if(url.protocol==='https:'&&!url.username&&!url.password){const link=document.createElement('a');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.textContent='打开核验文献（新窗口）';details.appendChild(link)}}catch{}
  }
  if(source.content){const block=document.createElement('blockquote');block.textContent=source.content;details.appendChild(block)}
  if(onReportIssue){const report=document.createElement('button');report.type='button';report.className='btn btn-secondary source-report';report.textContent='纠正引用或出处';report.addEventListener('click',onReportIssue);details.appendChild(report)}
  return details;
}
export function appendAIEvidence(container,data) {
  const label=document.createElement('p');label.className='interpretation-label';label.textContent='AI 辅助解读';container.prepend(label);
  const notice=document.createElement('p');notice.className='ai-evidence-notice';notice.setAttribute('role','note');
  notice.textContent=data.uncertainty || '此内容由 AI 生成，尚未核验事实与引用，请结合原文阅读。';container.appendChild(notice);
  for(const reading of data.readings || []){
    const source=(data.sources || []).find(s=>s.source_id===reading.source_id);
    if(!source || !source.content?.includes(reading.quote)) continue;
    const citation=document.createElement('p');citation.textContent=`引文已匹配馆藏文本 · ${source.source_title || '题名未提供'} · 出处待核验`;container.appendChild(citation);
  }
  for(const source of data.sources || [])container.appendChild(sourceDetails(source));
  if(data.omitted_source_count>0){const p=document.createElement('p');p.textContent=`本次未纳入 ${data.omitted_source_count} 条资料（含 AI 整理或超出上下文限额的内容），请在时间轴查看完整记录。`;container.appendChild(p)}
}
