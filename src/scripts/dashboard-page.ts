import { appPath } from '../lib/app-path';
import { syncArchive } from '../lib/opportunity-service';
import { summarizeArchive, archivedRecordHref } from '../lib/dashboard-summary';
const feedback=document.querySelector<HTMLElement>('#dashboard-feedback')!;
const opportunities=document.querySelector<HTMLElement>('#dashboard-opportunities')!;
const activity=document.querySelector<HTMLElement>('#dashboard-activity')!;
function text(tag:string,value:string){const element=document.createElement(tag);element.textContent=value;return element;}
function render(){try{
 const archive=syncArchive();const summary=summarizeArchive(archive.list());
 for(const key of ['total','favorites','sent','interviews','offers'] as const)document.querySelector<HTMLElement>('[data-metric="'+key+'"]')!.textContent=String(summary[key]);
 opportunities.replaceChildren();activity.replaceChildren();
 feedback.textContent=archive.unresolved()?'Alguns registos incompletos foram preservados e não entram nas contagens.':'';
 for(const {item,timestamp} of summary.recent){
 const row=document.createElement('article');row.className='job-card';
 const content=document.createElement('div');content.className='job-main';const heading=text('h3',item.job.title||'Título não disponível');const link=document.createElement('a');link.href=archivedRecordHref(item);link.append(heading);content.append(link,text('p',item.job.company||'Empresa não indicada'),text('p',item.state+(item.favorite?' · Favorito':'')),text('p',item.job.source+(item.job.isDemo?' · Exemplo fictício':'')));row.append(content);opportunities.append(row);
 const event=document.createElement('div');event.className='activity-item';const info=document.createElement('div');const destination=document.createElement('a');destination.href=appPath('candidaturas/?record='+encodeURIComponent(item.key));destination.append(text('p',item.job.title||'Título não disponível'));info.append(destination,text('span',item.state));const date=document.createElement('time');if(timestamp!==null){date.dateTime=new Date(timestamp).toISOString();date.textContent=new Date(timestamp).toLocaleDateString('pt-PT');}else date.textContent='Data não disponível';event.append(info,date);activity.append(event);
 }
 if(!summary.total){opportunities.append(text('p','Ainda não guardou oportunidades. Explore a pesquisa e guarde os anúncios que pretende acompanhar.'));const link=document.createElement('a');link.href=appPath('procurar/');link.className='all-jobs-link';link.textContent='Procurar oportunidades →';opportunities.append(link);activity.append(text('p','Ainda não há actividade registada.'));}
 }catch{document.querySelectorAll('[data-metric]').forEach(el=>el.textContent='—');opportunities.replaceChildren();activity.replaceChildren();feedback.textContent='Não foi possível ler o arquivo local. Os dados foram preservados. Consulte Guardados ou Candidaturas para verificar o problema.';}}
window.addEventListener('pageshow',render);window.addEventListener('storage',render);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')render();});render();
