import {$} from './core/dom.js';
import {get,set} from './core/storage.js';
import {t,LANGS} from './core/i18n.js';
import {dd} from './ui/controls.js';
import {initPwa} from './core/pwa.js';

export function initShell(){
const TABS=['pw','tb','pk','rl','tk'];
const go=t=>{document.querySelectorAll('.nv').forEach(x=>{const on=x.dataset.t===t;x.classList.toggle('on',on);x.setAttribute('aria-current',on?'page':'false')});TABS.forEach(k=>$('#'+k+'-v').hidden=k!==t);set('rz-tab',t);scrollTo(0,0)};
document.querySelectorAll('.nv').forEach(b=>b.onclick=()=>go(b.dataset.t));
const lg=$('#lang');lg.append(dd([['auto',t('Auto')],...LANGS],get('rz-lang','auto'),v=>{set('rz-lang',v);location.reload()}));lg.querySelector('.dd-b').setAttribute('aria-label',t('Language: {value}',{value:lg.querySelector('.dd-b').textContent}));
{const t=get('rz-tab');go(TABS.includes(t)?t:'pw')}
const pwa=initPwa(show=>{$('#install').hidden=!show});
$('#install').onclick=()=>pwa.install();
document.addEventListener('keydown',e=>{
if(e.target!==document.body||e.ctrlKey||e.metaKey||e.altKey)return;
const v=TABS.find(k=>!$('#'+k+'-v').hidden);
if(e.key===' '){e.preventDefault();$('#'+v+'-g').click()}else if(e.key==='c')$('#'+v+'-cp').click()});
}
