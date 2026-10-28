import { normalizeOpportunity } from './opportunity-search';
import type { JobOpportunity } from '../types/opportunity';
import type { OpportunityKeyValueStorage } from './opportunity-storage';
export const ARCHIVE_KEY='myjobs:demo:v1:opportunity-archive:v1';
export const applicationStates=['Por analisar','Pretendo candidatar-me','Candidatura enviada','Entrevista','Proposta','Encerrada'] as const;
export type ApplicationState=typeof applicationStates[number];
export interface ArchivedOpportunity {key:string;job:JobOpportunity;favorite:boolean;state:ApplicationState;notes:string;updatedAt:string|null;}
export const opportunityKey=(job:Pick<JobOpportunity,'source'|'id'>)=>JSON.stringify([job.source,job.id]);
export function createArchive(storage:OpportunityKeyValueStorage){
 function read():{version:1;entries:unknown[]}{const raw=storage.getItem(ARCHIVE_KEY);if(!raw)return {version:1,entries:[]};let data;try{data=JSON.parse(raw);}catch{throw new Error('Arquivo ilegível; dados originais preservados.');}if(data?.version!==1||!Array.isArray(data.entries))throw new Error('Formato não suportado; dados preservados.');return data;}
 function decode(value:unknown):ArchivedOpportunity|null{if(!value||typeof value!=='object')return null;const r=value as Record<string,unknown>;if(!r.job||typeof r.job!=='object')return null;const raw=r.job as Record<string,unknown>;if(typeof raw.id!=='string'||!raw.id.trim()||typeof raw.source!=='string'||!raw.source.trim())return null;const job=normalizeOpportunity(r.job);if(!job.id||!job.source||r.key!==opportunityKey(job))return null;return {key:r.key as string,job,favorite:r.favorite===true,state:applicationStates.includes(r.state as ApplicationState)?r.state as ApplicationState:'Por analisar',notes:typeof r.notes==='string'?r.notes:'',updatedAt:typeof r.updatedAt==='string'?r.updatedAt:null};}
 const list=()=>read().entries.flatMap(v=>{const item=decode(v);return item?[item]:[];});
 function write(item:ArchivedOpportunity){const data=read();const index=data.entries.findIndex(v=>decode(v)?.key===item.key);if(index<0)data.entries.push(item);else data.entries[index]=item;storage.setItem(ARCHIVE_KEY,JSON.stringify(data));return item;}
 return {list,unresolved:()=>read().entries.filter(v=>!decode(v)).length,
 save(value:unknown){const raw=value as Record<string,unknown>|null;if(!raw||typeof raw.id!=='string'||!raw.id.trim()||typeof raw.source!=='string'||!raw.source.trim())throw new Error('Origem e ID obrigatórios.');const job=normalizeOpportunity(value);if(!job.id||!job.source)throw new Error('Origem e ID obrigatórios.');const key=opportunityKey(job);const old=list().find(i=>i.key===key);return write({key,job,favorite:true,state:old?.state??'Por analisar',notes:old?.notes??'',updatedAt:new Date().toISOString()});},
 update(key:string,patch:{favorite?:boolean;state?:ApplicationState;notes?:string}){const item=list().find(i=>i.key===key);if(!item)throw new Error('Oportunidade não encontrada.');if(patch.state!==undefined&&!applicationStates.includes(patch.state))throw new Error('Estado inválido.');if(patch.notes!==undefined&&(typeof patch.notes!=='string'||patch.notes.length>20000))throw new Error('Notas demasiado longas.');return write({...item,...patch,updatedAt:new Date().toISOString()});},
 migrate(ids:string[],catalog:JobOpportunity[]){for(const id of ids){const matches=catalog.filter(j=>j.id===id);if(matches.length===1&&!list().some(i=>i.key===opportunityKey(matches[0])))this.save(matches[0]);}return ids.filter(id=>!catalog.some(j=>j.id===id));}};
}
