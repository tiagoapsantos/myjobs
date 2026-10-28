import { appPath } from './app-path';
import type { ArchivedOpportunity } from './opportunity-archive';
const timestamp=(item:ArchivedOpportunity)=>{for(const value of [item.updatedAt,item.job.collectedAt,item.job.publishedAt]){const parsed=Date.parse(value??'');if(Number.isFinite(parsed))return parsed;}return null;};
/** Counts describe current snapshots, not a cumulative history of transitions. */
export function summarizeArchive(entries:ArchivedOpportunity[]){
 const unique=[...new Map(entries.map(item=>[item.key,item])).values()];
 return {total:unique.length,favorites:unique.filter(i=>i.favorite).length,sent:unique.filter(i=>i.state==='Candidatura enviada').length,interviews:unique.filter(i=>i.state==='Entrevista').length,offers:unique.filter(i=>i.state==='Proposta').length,
 recent:unique.map(item=>({item,timestamp:timestamp(item)})).sort((a,b)=>(b.timestamp??-Infinity)-(a.timestamp??-Infinity)||a.item.key.localeCompare(b.item.key)).slice(0,5)};
}
export const archivedRecordHref=(item:ArchivedOpportunity)=>appPath((item.favorite?'guardadas':'candidaturas')+'/?record='+encodeURIComponent(item.key));
