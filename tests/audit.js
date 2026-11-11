// Test-only diagnostics; never imported by the application.
const frame = document.getElementById('app');
let report = {}, observers = [];
frame.addEventListener('load', () => {
  observers.forEach(observer => observer.disconnect()); observers = [];
  const win = frame.contentWindow;
  report = { scope: 'real-page iframe laboratory observation', supported: win.PerformanceObserver.supportedEntryTypes, errors: [], resources: [], metrics: {}, shifts: [] };
  win.addEventListener('error', event => report.errors.push({message:event.message,file:event.filename,line:event.lineno}));
  win.addEventListener('unhandledrejection', event => report.errors.push(String(event.reason)));
  for (const type of ['largest-contentful-paint', 'layout-shift', 'event']) {
    if (!report.supported.includes(type)) { report.metrics[type] = 'unsupported'; continue; }
    const observer = new win.PerformanceObserver(list => {
      const entries = list.getEntries();
      if (type === 'largest-contentful-paint') report.metrics.lcp = entries.at(-1).startTime;
      if (type === 'layout-shift') {
        for (const entry of entries.filter(entry => !entry.hadRecentInput)) report.shifts.push({time:entry.startTime,value:entry.value,page:win.document.querySelector('.page.active')?.id,sources:entry.sources.map(source=>({tag:source.node?.tagName,class:source.node?.className}))});
        report.metrics.observedShiftSum = report.shifts.reduce((sum,entry)=>sum+entry.value,0);
      }
      if (type === 'event') report.metrics.maxObservedEventDuration = Math.max(report.metrics.maxObservedEventDuration || 0, ...entries.map(entry => entry.duration));
    });
    observer.observe({type,buffered:true,...(type==='event'?{durationThreshold:16}:{})}); observers.push(observer);
  }
});
document.getElementById('inspect').onclick = () => {
  const win = frame.contentWindow, doc = frame.contentDocument;
  report.viewport = { width:win.innerWidth, content:doc.body.scrollWidth };
  report.animations = doc.getAnimations().map(animation => ({state:animation.playState,infinite:animation.effect.getTiming().iterations===Infinity,target:animation.effect.target?.className}));
  report.resources = win.performance.getEntriesByType('resource').map(entry => ({name:entry.name,duration:Math.round(entry.duration),bytes:entry.transferSize}));
  report.fontStatus = doc.fonts.status;
  report.fontErrors = [...doc.fonts].filter(font => font.status === 'error').map(font => font.family);
  report.images = [...doc.images].map(image => ({src:image.getAttribute('src'),loaded:image.complete && image.naturalWidth>0}));
  document.getElementById('report').textContent = JSON.stringify(report,null,2);
};
