import {resetDemo} from '../lib/demo-reset';
const message=document.querySelector<HTMLElement>('#demo-status')!;
const storage={getItem:(k:string)=>localStorage.getItem(k),setItem:(k:string,v:string)=>localStorage.setItem(k,v),removeItem:(k:string)=>localStorage.removeItem(k)};
const dialog=document.querySelector<HTMLDialogElement>('#demo-confirm')!;
let pendingEmpty=false;
for(const [id,empty] of [['demo-reset',false],['demo-empty',true]] as const)document.querySelector('#'+id)?.addEventListener('click',()=>{pendingEmpty=empty;dialog.returnValue='';document.querySelector('#demo-confirm-message')!.textContent=empty?'Retirar os anúncios fictícios do arquivo desta demonstração, incluindo estados e notas associados? O perfil e as pesquisas não serão apagados.':'Repor quatro anúncios fictícios? Os estados e notas dos exemplos existentes serão substituídos. O perfil e as pesquisas não serão apagados.';dialog.showModal();});
dialog.addEventListener('close',()=>{if(dialog.returnValue!=='confirm')return;try{if(resetDemo(storage,()=>true,pendingEmpty))location.reload();}catch{message.textContent='Não foi possível actualizar os exemplos. Verifique as permissões ou o espaço do armazenamento. Os dados anteriores foram preservados.';}});
try{const key='myjobs:demo:storage-check';localStorage.setItem(key,'1');localStorage.removeItem(key);}catch{message.textContent='O armazenamento local está bloqueado ou sem espaço. Pode explorar a pesquisa, mas guardar e repor dados pode não funcionar.';}
