import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyProfile, createProfileStore, PROFILE_STORAGE_KEY, type KeyValueStorage } from '../src/lib/profile-storage';

class MemoryStorage implements KeyValueStorage {
  private values = new Map<string,string>();
  getItem(key:string){return this.values.get(key)??null;}
  setItem(key:string,value:string){this.values.set(key,value);}
  removeItem(key:string){this.values.delete(key);}
}

test('returns a complete empty profile when no stored data exists',()=>{
  const store=createProfileStore(new MemoryStorage());
  const loaded=store.load();
  assert.equal(loaded.recoveredInvalidData,false);
  assert.deepEqual(loaded.profile,createEmptyProfile());
});

test('saves and reloads a profile in a new store instance',()=>{
  const memory=new MemoryStorage();
  const first=createProfileStore(memory);
  const profile=createEmptyProfile();
  profile.personal.fullName='Joana Exemplo';
  profile.personal.email='joana@example.test';
  profile.areas.push({name:'Web Development',priority:2,desiredRoles:['Frontend Developer','Web Developer']});
  first.save(profile);
  const reloaded=createProfileStore(memory).load();
  assert.equal(reloaded.profile.personal.fullName,'Joana Exemplo');
  assert.deepEqual(reloaded.profile.areas[0]?.desiredRoles,['Frontend Developer','Web Developer']);
  assert.ok(reloaded.profile.updatedAt);
});

test('edits saved personal information without losing other profile data',()=>{
  const memory=new MemoryStorage();const store=createProfileStore(memory);const profile=createEmptyProfile();
  profile.personal.fullName='Joana';profile.skills.push({id:'skill-1',name:'TypeScript',kind:'technical',technology:'TypeScript',level:'intermediate'});
  store.save(profile);const changed=store.load().profile;changed.personal.fullName='Joana Exemplo';changed.personal.location='Porto';store.save(changed);
  const loaded=store.load().profile;assert.equal(loaded.personal.fullName,'Joana Exemplo');assert.equal(loaded.personal.location,'Porto');assert.equal(loaded.skills[0]?.name,'TypeScript');
});

test('adds and deletes work experience entries',()=>{
  const memory=new MemoryStorage();const store=createProfileStore(memory);const profile=createEmptyProfile();
  profile.experience.push({id:'exp-1',title:'Support Specialist',company:'Example Co',location:'Porto',startDate:'2024-01',endDate:'',current:true,description:'Customer and technical support.'});
  store.save(profile);let loaded=store.load().profile;assert.equal(loaded.experience.length,1);assert.equal(loaded.experience[0]?.current,true);
  loaded.experience=loaded.experience.filter(item=>item.id!=='exp-1');store.save(loaded);assert.deepEqual(store.load().profile.experience,[]);
});

test('adds and deletes skills',()=>{
  const memory=new MemoryStorage();const store=createProfileStore(memory);const profile=createEmptyProfile();
  profile.skills.push({id:'skill-1',name:'Planning',kind:'personal',technology:'',level:''});store.save(profile);let loaded=store.load().profile;
  assert.equal(loaded.skills[0]?.kind,'personal');loaded.skills=[];store.save(loaded);assert.deepEqual(store.load().profile.skills,[]);
});

test('normalizes incomplete data and removes unsupported values safely',()=>{
  const memory=new MemoryStorage();memory.setItem(PROFILE_STORAGE_KEY,JSON.stringify({version:1,personal:{fullName:'Rui',email:42},preferences:{modalities:['remote','invalid'],internationalRemote:'yes'},experience:[{title:'Technician'}],areas:[{name:'Not a profession',priority:999}]}));
  const loaded=createProfileStore(memory).load();assert.equal(loaded.recoveredInvalidData,true);assert.equal(loaded.profile.personal.fullName,'Rui');assert.equal(loaded.profile.personal.email,'');assert.deepEqual(loaded.profile.preferences.modalities,['remote']);assert.equal(loaded.profile.preferences.internationalRemote,false);assert.equal(loaded.profile.experience[0]?.title,'Technician');assert.deepEqual(loaded.profile.areas,[]);
});

test('recovers from invalid JSON or an unsupported document shape',()=>{
  const memory=new MemoryStorage();memory.setItem(PROFILE_STORAGE_KEY,'{broken');let result=createProfileStore(memory).load();
  assert.equal(result.recoveredInvalidData,true);assert.deepEqual(result.profile,createEmptyProfile());
  memory.setItem(PROFILE_STORAGE_KEY,JSON.stringify({version:99}));result=createProfileStore(memory).load();assert.equal(result.recoveredInvalidData,true);assert.deepEqual(result.profile,createEmptyProfile());
});

test('clear removes the persisted profile',()=>{
  const memory=new MemoryStorage();const store=createProfileStore(memory);const profile=createEmptyProfile();profile.personal.fullName='Rui';store.save(profile);store.clear();
  assert.equal(memory.getItem(PROFILE_STORAGE_KEY),null);assert.deepEqual(store.load().profile,createEmptyProfile());
});

