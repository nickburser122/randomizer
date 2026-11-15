import {el} from './dom.js';
import {announce} from './live.js';
export async function copy(t,b){
try{await navigator.clipboard.writeText(t)}catch(e){const a=el('textarea');a.value=t;a.style.cssText='position:fixed;opacity:0';document.body.append(a);a.select();try{document.execCommand('copy')}catch(_){}a.remove()}
if(!b.dataset.l)b.dataset.l=b.textContent;
b.textContent='Copied';b.classList.add('ok');clearTimeout(b._t);announce('Copied');
b._t=setTimeout(()=>{b.textContent=b.dataset.l;b.classList.remove('ok')},1100)}
let timer=0;
export function scheduleClear(ms){clearTimeout(timer);timer=setTimeout(()=>{navigator.clipboard.writeText(' ').catch(()=>{})},ms)}
