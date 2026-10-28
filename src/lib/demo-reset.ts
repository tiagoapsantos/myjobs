import { ARCHIVE_KEY, createArchive } from './opportunity-archive';
import { demoOpportunities } from '../data/opportunities-demo';
import type { OpportunityKeyValueStorage } from './opportunity-storage';
/** Only demo archive data is replaced. Profile, searches, legacy data and other origins remain untouched. */
export function resetDemo(storage:OpportunityKeyValueStorage,confirm:()=>boolean,empty=false){
 if(!confirm())return false;
 const raw=storage.getItem(ARCHIVE_KEY);const current=raw?JSON.parse(raw):{version:1,entries:[]};
 if(current.version!==1||!Array.isArray(current.entries))throw new Error('Arquivo desconhecido; dados preservados.');
 const memory=new Map<string,string>();const adapter={getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>{memory.set(k,v);},removeItem:(k:string)=>{memory.delete(k);}};
 const archive=createArchive(adapter);
 if(!empty)for(const job of demoOpportunities.slice(0,4))archive.save(job);
 const generated=JSON.parse(memory.get(ARCHIVE_KEY)??'{"entries":[]}').entries;
 const kept=current.entries.filter((r:unknown)=>!r||typeof r!=='object'||!(r as {job?:{isDemo?:boolean}}).job?.isDemo);
 storage.setItem(ARCHIVE_KEY,JSON.stringify({version:1,entries:[...kept,...generated]}));return true;
}
