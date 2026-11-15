import {$} from './core/dom.js';
import {get,set} from './core/storage.js';

export function initShell(){
const TABS=['pw','tb','pk','rl','tk'];
const go=t=>{document.querySelectorAll('.nv').forEach(x=>x.classList.toggle('on',x.dataset.t===t));TABS.forEach(k=>$('#'+k+'-v').hidden=k!==t);set('rz-tab',t);scrollTo(0,0)};
document.querySelectorAll('.nv').forEach(b=>b.onclick=()=>go(b.dataset.t));
{const t=get('rz-tab');if(TABS.includes(t))go(t)}
document.addEventListener('keydown',e=>{
if(e.target!==document.body||e.ctrlKey||e.metaKey||e.altKey)return;
const v=TABS.find(k=>!$('#'+k+'-v').hidden);
if(e.key===' '){e.preventDefault();$('#'+v+'-g').click()}else if(e.key==='c')$('#'+v+'-cp').click()});
}
