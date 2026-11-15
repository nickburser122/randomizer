import {copy} from '../core/clipboard.js';
import {$,el} from '../core/dom.js';
import {loadJSON,saveJSON} from '../core/storage.js';

export const TABN={pw:'Password',tb:'Table',pk:'Pick',rl:'Roll',tk:'Tools'};
export const cleanItems=(o,max)=>Array.isArray(o)?o.filter(x=>x&&TABN[x.t]&&typeof x.v==='string').slice(0,max):[];
export function pushItem(items,t,v,max){
v=String(v||'');if(!v)return items;
const a=items[0];if(a&&a.t===t&&a.v===v)return items;
return[{t,v:v.length>2000?v.slice(0,2000)+'…':v},...items].slice(0,max)}
const H={max:40,items:[]};
const saveH=()=>saveJSON('rz-h',H.items);
function drawH(){
const l=$('#sh-l');l.textContent='';
if(!H.items.length){l.append(el('p','empty','Nothing here yet. Results appear as you generate them, on this device only.'));return}
H.items.forEach(x=>{const b=el('button','li');b.append(el('span','h-t',TABN[x.t]),document.createTextNode(x.v));b.onclick=()=>copy(x.v,b);l.append(b)})}
export function hist(t,v){
const n=pushItem(H.items,t,v,H.max);if(n===H.items)return;
H.items=n;saveH();if($('#sh').classList.contains('on'))drawH()}
function shToggle(on){
const s=$('#sh');s.classList.toggle('on',on);s.setAttribute('aria-hidden',on?'false':'true');if(on)drawH()}
export function initHistory(){
H.items=cleanItems(loadJSON('rz-h',null),H.max);
$('#sh-o').onclick=()=>shToggle(!$('#sh').classList.contains('on'));
$('#sh-x').onclick=()=>shToggle(false);
$('#sh-cp').onclick=function(){if(!H.items.length)return;copy(H.items.map(x=>x.v).join('\n\n'),this)};
$('#sh-cl').onclick=()=>{H.items=[];saveH();drawH()};
document.addEventListener('keydown',e=>{if(e.key==='Escape')shToggle(false)})}
