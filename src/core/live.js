import {$} from './dom.js';
let timer=0,on=false;
export const liveOn=()=>{on=true};
export function announce(msg){
if(!on)return;
const r=$('#live');if(!r)return;
clearTimeout(timer);r.textContent='';
timer=setTimeout(()=>{r.textContent=msg},60)}
