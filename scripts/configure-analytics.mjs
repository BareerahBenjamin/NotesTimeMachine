import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function authorCatalog(){
 const classics=JSON.parse(await readFile(resolve(root,'knowledge_base/metadata/classics.json'),'utf8')).classics;
 const authors=JSON.parse(await readFile(resolve(root,'knowledge_base/metadata/authors.json'),'utf8')).authors;
 return Object.fromEntries(classics.map(work=>{const matches=authors.filter(a=>a.name===work.author);return [work.id,matches.length===1?matches[0].id:null]}));
}
export function deploymentConfig(env=process.env){
 if(env.ANALYTICS_ENABLED!=='true')return {enabled:false,projectKey:null,apiHost:null,environment:'development',utmAllowlist:{source:[],medium:[],campaign:[]}};
 if(!/^phc_[a-z0-9_-]+$/i.test(env.POSTHOG_PROJECT_KEY||''))throw Error('Provide a public PostHog project capture token (phc_), never a personal/secret API key.');
 if(!['https://us.i.posthog.com','https://eu.i.posthog.com'].includes(env.POSTHOG_API_HOST))throw Error('Set POSTHOG_API_HOST to the actual US/EU ingestion region.');
 if(!['production','staging','development','test'].includes(env.ANALYTICS_ENVIRONMENT))throw Error('Explicit ANALYTICS_ENVIRONMENT is required.');
 const input=JSON.parse(env.ANALYTICS_UTM_ALLOWLIST||'{}'),utmAllowlist={};
 for(const name of ['source','medium','campaign']){const list=input[name]||[];if(!Array.isArray(list)||list.length>100||list.some(v=>typeof v!=='string'||!/^[a-z][a-z0-9_.-]{0,63}$/i.test(v)))throw Error('UTM allowlist must contain approved campaign labels only.');utmAllowlist[name]=[...new Set(list)];}
 return {enabled:true,projectKey:env.POSTHOG_PROJECT_KEY,apiHost:env.POSTHOG_API_HOST,environment:env.ANALYTICS_ENVIRONMENT,utmAllowlist};
}
export async function writeAnalyticsConfig(directory,env=process.env){
 const target=resolve(directory,'js/analytics');await mkdir(target,{recursive:true});
 const config=deploymentConfig(env),authors=await authorCatalog();
 await writeFile(resolve(target,'config.js'),'// Public capture configuration. Never put a personal/secret API key here.\nexport default Object.freeze('+JSON.stringify(config,null,2)+');\n');
 await writeFile(resolve(target,'catalog.js'),'// Generated from exact, unambiguous metadata name matches; null means unavailable.\nexport default Object.freeze('+JSON.stringify(authors,null,2)+');\n');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv[2]==='--catalog-only')await writeFile(resolve(root,'js/analytics/catalog.js'),'// Generated from knowledge_base metadata; null means missing/ambiguous.\nexport default Object.freeze('+JSON.stringify(await authorCatalog(),null,2)+');\n');
 else{if(process.argv[2]!=='--out'||!process.argv[3])throw Error('Usage: node scripts/configure-analytics.mjs --out <static-artifact-directory>');await writeAnalyticsConfig(process.argv[3]);}
}
