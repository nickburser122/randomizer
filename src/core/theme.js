import {$} from '../core/dom.js';
import {get,set} from '../core/storage.js';
import {t} from '../core/i18n.js';

export function initTheme(){
const mq=matchMedia('(prefers-color-scheme: dark)');
let mode='system';
mode=get('rz-mode','system');if(!['system','light','dark'].includes(mode))mode='system';
function setIcon(){
const c=getComputedStyle(document.documentElement),g=k=>c.getPropertyValue(k).trim();
const v="<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect x='1.5' y='1.5' width='61' height='61' rx='17' fill='"+g('--sf')+"' stroke='"+g('--mut')+"' stroke-width='3'/><circle cx='32' cy='32' r='22' fill='"+g('--ac')+"'/><g fill='"+g('--acx')+"'><circle cx='24' cy='27' r='6'/><circle cx='42' cy='24' r='3.8'/><circle cx='38' cy='42' r='5'/></g></svg>";
$('#ico').href='data:image/svg+xml,'+encodeURIComponent(v)}
function applyTheme(){
document.documentElement.dataset.theme=mode==='system'?(mq.matches?'dark':'light'):mode;
const nm={system:t('System'),light:t('Light'),dark:t('Dark')}[mode];$('#mode').textContent=nm;$('#mode').setAttribute('aria-label',t('Theme: {mode}. Press to change.',{mode:nm}));setIcon()}
mq.addEventListener('change',()=>{if(mode==='system')applyTheme()});
$('#mode').onclick=()=>{mode={system:'light',light:'dark',dark:'system'}[mode];set('rz-mode',mode);applyTheme()};
applyTheme()}
