import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOpportunityStore, FAVORITES_STORAGE_KEY, SAVED_SEARCHES_STORAGE_KEY } from '../src/lib/opportunity-storage';
import { createEmptyQuery } from '../src/lib/opportunity-search';
import type { OpportunityKeyValueStorage } from '../src/lib/opportunity-storage';
class MemoryStorage implements OpportunityKeyValueStorage{private data=new Map<string,string>();getItem(key:string){return this.data.get(key)??null;}setItem(key:string,value:string){this.data.set(key,value);}removeItem(key:string){this.data.delete(key);}}

test('favorite identifiers toggle, persist across store instances and can be removed',()=>{
 const memory=new MemoryStorage();const store=createOpportunityStore(memory);assert.deepEqual(store.loadFavoriteIds(),[]);assert.deepEqual(store.toggleFavorite('job-a'),['job-a']);assert.deepEqual(createOpportunityStore(memory).loadFavoriteIds(),['job-a']);assert.deepEqual(store.toggleFavorite('job-a'),[]);store.toggleFavorite('job-b');assert.deepEqual(store.removeFavorite('job-b'),[]);assert.equal(memory.getItem(FAVORITES_STORAGE_KEY),'[]');
});

test('saved searches preserve query, filters and sorting across reloads and support rename/delete',()=>{
 const memory=new MemoryStorage();const store=createOpportunityStore(memory);const search=createEmptyQuery();search.text='frontend TypeScript';search.filters.workMode='remote';search.filters.salaryMinimum='2500';search.sort='salary';const saved=store.saveSearch('Remote development',search);
 let loaded=createOpportunityStore(memory).loadSavedSearches();assert.equal(loaded.length,1);assert.equal(loaded[0]?.text,'frontend TypeScript');assert.equal(loaded[0]?.filters.workMode,'remote');assert.equal(loaded[0]?.filters.salaryMinimum,'2500');assert.equal(loaded[0]?.sort,'salary');
 loaded=store.renameSearch(saved.id,'Remote TypeScript');assert.equal(loaded[0]?.name,'Remote TypeScript');assert.equal(store.deleteSearch(saved.id).length,0);assert.deepEqual(store.loadSavedSearches(),[]);assert.ok(memory.getItem(SAVED_SEARCHES_STORAGE_KEY));
});

test('malformed favorite and saved-search data recovers to safe empty values',()=>{
 const memory=new MemoryStorage();memory.setItem(FAVORITES_STORAGE_KEY,'not-json');memory.setItem(SAVED_SEARCHES_STORAGE_KEY,JSON.stringify([{id:'x',name:'',text:'q',filters:{area:'Made up'},sort:'nonsense'}]));const store=createOpportunityStore(memory);assert.deepEqual(store.loadFavoriteIds(),[]);assert.deepEqual(store.loadSavedSearches(),[]);
});

test('job stores keep the professional profile key and value untouched',()=>{
 const memory=new MemoryStorage();const profileKey='myjobs:demo:v1:professional-profile:v1';const original=JSON.stringify({version:1,personal:{fullName:'Profile data'}});memory.setItem(profileKey,original);const store=createOpportunityStore(memory);store.toggleFavorite('job-1');const query=createEmptyQuery();store.saveSearch('Sample query',query);assert.equal(memory.getItem(profileKey),original);
});
