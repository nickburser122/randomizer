import {el} from './dom.js';
import {t} from './i18n.js';
import {announce} from './live.js';
export async function copy(text,b){
try{await navigator.clipboard.writeText(text)}catch(e){const a=el('textarea');a.value=text;a.style.cssText='position:fixed;opacity:0';document.body.append(a);a.select();try{document.execCommand('copy')}catch(_){}a.remove()}
if(!b.classList.contains('ok'))b._o=[...b.childNodes];
b.textContent=t('Copied');b.classList.add('ok');clearTimeout(b._t);announce(t('Copied'));
b._t=setTimeout(()=>{if(b.dataset.l!=null)b.textContent=b.dataset.l;else b.replaceChildren(...b._o);b.classList.remove('ok')},1100)}
let timer=0;
export function scheduleClear(ms){clearTimeout(timer);timer=setTimeout(()=>{navigator.clipboard.writeText(' ').catch(()=>{})},ms)}
