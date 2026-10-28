import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyQuery, normalizeOpportunity, searchOpportunities, areDuplicateOpportunities, findDuplicateOpportunities } from '../src/lib/opportunity-search';
import { createEmptyProfile } from '../src/lib/profile-storage';
import { matchesProfilePreferences } from '../src/lib/job-interface';
import type { JobOpportunity, OpportunityFilters } from '../src/types/opportunity';
const now=Date.parse('2026-10-26T12:00:00.000Z');
function job(overrides:Partial<JobOpportunity>={}):JobOpportunity{return {id:'job-1',title:'Frontend Developer',company:'Sample Studio',location:'Lisboa',country:'Portugal',workMode:'hybrid',contractType:'full-time',salary:{minimum:3000,maximum:4000,currency:'EUR'},description:'Build web interfaces and developer tools.',requirements:['TypeScript experience'],skills:['TypeScript','Astro'],professionalAreas:['Web Development'],experienceLevel:'mid',publishedAt:'2026-10-25T12:00:00.000Z',collectedAt:'2026-10-26T09:00:00.000Z',source:'Sample Source',originalUrl:null,status:'active',externalId:null,isDemo:true,...overrides};}
function query(text=''){const value=createEmptyQuery();value.text=text;return value;}
function ids(jobs:JobOpportunity[],search=query()){return searchOpportunities(jobs,search,now).map(result=>result.job.id);}

test('searches by every supplied term across role, skills, employer and description',()=>{
 const first=job();const second=job({id:'job-2',title:'QA Analyst',company:'TypeScript Labs',skills:['Testing'],description:'Build tools for the web.'});
 assert.deepEqual(ids([first,second],query('Frontend TypeScript')),['job-1']);
 assert.deepEqual(ids([first,second],query('TypeScript Labs')),['job-2']);
});

test('matches accented Portuguese keywords without accent sensitivity',()=>{
 const automation=job({id:'automation',title:'Especialista em automação',professionalAreas:['AI Automation & Digital Operations'],skills:['Automação'],description:'Integração de processos.'});
 assert.deepEqual(ids([automation],query('automacao processos')),['automation']);
});

test('combines area, country, mode, contract, level, location, salary and publication filters',()=>{
 const filters:OpportunityFilters={area:'Web Development',location:'lisboa',country:'Portugal',workMode:'hybrid',contractType:'full-time',experienceLevel:'mid',salaryMinimum:'2800',salaryMaximum:'4200',publishedWithinDays:'7'};
 const exact=query();exact.filters=filters;assert.deepEqual(ids([job(),job({id:'remote',workMode:'remote'})],exact),['job-1']);
 filters.area='Digital Marketing';assert.deepEqual(ids([job()],exact),[]);
});

test('sorts by text relevance, newest publication and known salary with unknown salary last',()=>{
 const low=job({id:'low',title:'Developer',salary:{minimum:2000,maximum:2500,currency:'EUR'},publishedAt:'2026-10-24T12:00:00.000Z'});
 const high=job({id:'high',title:'Frontend Developer TypeScript',salary:{minimum:5000,maximum:6000,currency:'EUR'},publishedAt:'2026-10-23T12:00:00.000Z'});
 const unknown=job({id:'unknown',title:'Developer',salary:null,publishedAt:null});
 const byRelevance=query('Frontend TypeScript');assert.equal(ids([low,high,unknown],byRelevance)[0],'high');
 const byDate=query();byDate.sort='date';assert.deepEqual(ids([low,high,unknown],byDate),['low','high','unknown']);
 const bySalary=query();bySalary.sort='salary';assert.deepEqual(ids([low,high,unknown],bySalary),['high','low','unknown']);
});

test('keeps incomplete listings searchable and excludes explicitly closed listings',()=>{
 const incomplete=normalizeOpportunity({id:'incomplete',title:'Support',company:'',skills:['Helpdesk'],status:'unknown',professionalAreas:[]});
 assert.equal(incomplete.salary,null);assert.equal(incomplete.publishedAt,null);assert.deepEqual(ids([incomplete],query('Support')),['incomplete']);
 assert.deepEqual(ids([job({status:'closed'})]),[]);
});

test('salary and publication filters do not invent missing values',()=>{
 const request=query();request.filters.salaryMinimum='2000';assert.deepEqual(ids([job({salary:null})],request),[]);
 request.filters.salaryMinimum='';request.filters.publishedWithinDays='7';assert.deepEqual(ids([job({publishedAt:null})],request),[]);
});

test('an empty or incomplete profile does not prevent search preference matching',()=>{
 const listing=job();assert.equal(matchesProfilePreferences(listing,null),false);assert.equal(matchesProfilePreferences(listing,createEmptyProfile()),false);
 const profile=createEmptyProfile();profile.areas.push({name:'Web Development',priority:1,desiredRoles:[]});assert.equal(matchesProfilePreferences(listing,profile),true);
 profile.areas=[];profile.preferences.modalities.push('hybrid');assert.equal(matchesProfilePreferences(listing,profile),true);
});

test('detects duplicates by source-scoped external ID, normalized URL or exact title-company-location',()=>{
 const extA=job({id:'a',externalId:'external-7',source:'Board A'}),extB=job({id:'b',externalId:'external-7',source:'Board A'});assert.equal(areDuplicateOpportunities(extA,extB),true);
 const urlA=job({id:'c',originalUrl:'https://board.test/jobs/44/?utm_source=mail#details'}),urlB=job({id:'d',originalUrl:'https://board.test/jobs/44'});assert.equal(areDuplicateOpportunities(urlA,urlB),true);
 const sameTitle=job({id:'e'}),sameListing=job({id:'f',title:'frontend developer',company:'sample studio',location:'lisboa'});assert.equal(areDuplicateOpportunities(sameTitle,sameListing),true);
 const differentEmployer=job({id:'g',title:'Frontend Developer II',company:'Sample Studio',location:'Lisboa'});assert.equal(areDuplicateOpportunities(sameTitle,differentEmployer),false);
 assert.deepEqual(findDuplicateOpportunities([sameTitle,sameListing,differentEmployer]),[['e','f']]);
});

test('duplicate detection does not remove matching records from search results',()=>{
 const first=job({id:'one'}),second=job({id:'two'});assert.equal(areDuplicateOpportunities(first,second),true);assert.deepEqual(ids([first,second]),['one','two']);
});


test('matches listing preferences by modality, contract, salary, location and international remote setting',()=>{
 const listing=job({professionalAreas:[],workMode:'remote',contractType:'full-time',salary:{minimum:3200,maximum:4000,currency:'EUR'}});const profile=createEmptyProfile();profile.preferences.contractTypes.push('full-time');assert.equal(matchesProfilePreferences(listing,profile),true);profile.preferences.contractTypes=[];profile.preferences.minimumSalary='3000';assert.equal(matchesProfilePreferences(listing,profile),true);profile.preferences.minimumSalary='5000';assert.equal(matchesProfilePreferences(listing,profile),false);profile.preferences.minimumSalary='';profile.preferences.internationalRemote=true;assert.equal(matchesProfilePreferences(listing,profile),true);
});
