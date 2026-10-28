import { syncArchive } from '../lib/opportunity-service';
import { applicationStates } from '../lib/opportunity-archive';
import { createOpportunityCard, getJobLocale } from '../lib/job-interface';
import { normalizeSearchText } from '../lib/opportunity-search';
const root=document.querySelector<HTMLElement>('#archive-results')!;
const feedback=document.querySelector<HTMLElement>('#archive-feedback')!;
const search=document.querySelector<HTMLInputElement>('#archive-query')!;
const sort=document.querySelector<HTMLSelectElement>('#archive-sort')!;
const favoritesOnly=location.pathname.includes('/guardadas');
function render(){try{
 const archive=syncArchive();const entries=archive.list().sort((a,b)=>sort.value==='title'?a.job.title.localeCompare(b.job.title):sort.value==='date'?(Date.parse(b.job.publishedAt??'')||0)-(Date.parse(a.job.publishedAt??'')||0):(Date.parse(b.updatedAt??'')||0)-(Date.parse(a.updatedAt??'')||0));let legacy:unknown=[];let legacyInvalid=false;try{legacy=JSON.parse(localStorage.getItem('myjobs:demo:v1:opportunity-favorites:v1')??'[]');legacyInvalid=!Array.isArray(legacy);}catch{legacyInvalid=true;}
 const missing=Array.isArray(legacy)?legacy.filter(id=>!entries.some(i=>i.job.id===id)):[];
 feedback.textContent=(archive.unresolved()||missing.length||legacyInvalid)?'Existem registos antigos ou incompletos preservados, indisponíveis como anúncios completos.':'';
 root.replaceChildren();
 for(const entry of entries.filter(i=>(!favoritesOnly||i.favorite)&&normalizeSearchText([i.job.title,i.job.company,i.job.description,i.notes,i.state].join(' ')).includes(normalizeSearchText(search.value)))){
 const card=createOpportunityCard({...entry.job,id:entry.key},{favorites:new Set(entry.favorite?[entry.key]:[]),profile:null,locale:getJobLocale()});
 const select=document.createElement('select');select.setAttribute('aria-label','Estado da candidatura');for(const state of applicationStates){const option=document.createElement('option');option.value=state;option.textContent=state;select.append(option);}select.value=entry.state;
 const notes=document.createElement('textarea');notes.value=entry.notes;notes.maxLength=20000;notes.setAttribute('aria-label','Notas da oportunidade');notes.placeholder='Notas pessoais';
 const label=document.createElement('label');label.className='profile-field';label.append('Estado da candidatura',select);
 const noteLabel=document.createElement('label');noteLabel.className='profile-field';noteLabel.append('Notas',notes);
 const save=document.createElement('button');save.type='button';save.className='button button-outline';save.textContent='Guardar estado e notas';
 const date=document.createElement('p');date.textContent=entry.updatedAt?'Actualizado: '+new Date(entry.updatedAt).toLocaleString('pt-PT'):'';
 save.addEventListener('click',()=>{try{archive.update(entry.key,{state:select.value as typeof applicationStates[number],notes:notes.value});render();feedback.textContent='Alterações guardadas.';}catch(error){feedback.textContent=String(error);}});
 card.querySelector<HTMLButtonElement>('[data-favorite-id]')?.addEventListener('click',()=>{try{archive.update(entry.key,{favorite:!entry.favorite});render();}catch(error){feedback.textContent=String(error);}});
 const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Consultar anúncio completo';const body=document.createElement('p');body.style.whiteSpace='pre-wrap';body.textContent=entry.job.description||'Descrição não disponibilizada.';details.append(summary,body);if(entry.job.requirements.length){const requirements=document.createElement('p');requirements.textContent=entry.job.requirements.join(' · ');details.append(requirements);}if(entry.job.originalUrl){try{const url=new URL(entry.job.originalUrl);if(['https:','http:'].includes(url.protocol)){const link=document.createElement('a');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Abrir anúncio original (novo separador)';details.append(link);}}catch{}}
 card.append(details,label,noteLabel,save,date);root.append(card);if(new URLSearchParams(location.search).get('record')===entry.key){card.id='selected-opportunity';card.tabIndex=-1;details.open=true;requestAnimationFrame(()=>{card.scrollIntoView({block:'center'});card.focus({preventScroll:true});});}
 }
 if(!root.children.length){const empty=document.createElement('p');empty.textContent='Não há oportunidades para apresentar.';root.append(empty);}
 }catch(error){feedback.textContent='Não foi possível abrir o arquivo. '+String(error);}}
sort.addEventListener('change',render);search.addEventListener('input',render);window.addEventListener('storage',render);window.addEventListener('pageshow',render);render();
