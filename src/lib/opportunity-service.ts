import { createArchive, opportunityKey } from './opportunity-archive';
import { demoOpportunities } from '../data/opportunities-demo';
import { createOpportunityStore } from './opportunity-storage';
import type { OpportunityKeyValueStorage } from './opportunity-storage';
import type { OpportunitySearchQuery, SavedOpportunitySearch } from '../types/opportunity';
const localStorageAdapter:OpportunityKeyValueStorage={getItem:key=>window.localStorage.getItem(key),setItem:(key,value)=>window.localStorage.setItem(key,value),removeItem:key=>window.localStorage.removeItem(key)};
const store=()=>createOpportunityStore(localStorageAdapter);
export const opportunityArchive=()=>createArchive(localStorageAdapter);
export function syncArchive(){const archive=opportunityArchive();archive.migrate(store().loadFavoriteIds(),demoOpportunities);return archive;}
export const loadFavoriteOpportunityIds=():string[]=>{const items=syncArchive().list();return demoOpportunities.filter(j=>items.some(i=>i.key===opportunityKey(j)&&i.favorite)).map(j=>j.id);};
export const toggleFavoriteOpportunity=(id:string):string[]=>{const job=demoOpportunities.find(j=>j.id===id);if(!job)throw new Error('Anúncio indisponível');const archive=syncArchive();const old=archive.list().find(i=>i.key===opportunityKey(job));if(old)archive.update(old.key,{favorite:!old.favorite});else archive.save(job);return loadFavoriteOpportunityIds();};
export const removeFavoriteOpportunity=(id:string):string[]=>{const archive=syncArchive();const item=archive.list().find(i=>i.key===id||i.job.id===id);if(item){archive.update(item.key,{favorite:false});return loadFavoriteOpportunityIds();}return store().removeFavorite(id);};
export const loadSavedOpportunitySearches=():SavedOpportunitySearch[]=>store().loadSavedSearches();
export const saveOpportunitySearch=(name:string,query:OpportunitySearchQuery):SavedOpportunitySearch=>store().saveSearch(name,query);
export const renameOpportunitySearch=(id:string,name:string):SavedOpportunitySearch[]=>store().renameSearch(id,name);
export const deleteOpportunitySearch=(id:string):SavedOpportunitySearch[]=>store().deleteSearch(id);
