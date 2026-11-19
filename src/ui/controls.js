import {el} from '../core/dom.js';
import {t} from '../core/i18n.js';

let uid=0;
export function label(c,id,l){
if(c.matches('input,textarea')){c.setAttribute('aria-labelledby',id);return}
if(c.classList.contains('sl')){const[r,n]=c.children;r.setAttribute('aria-labelledby',id);n.setAttribute('aria-label',t('{label}, typed value',{label:l}));return}
if(c.classList.contains('dd')){const b=c.querySelector('.dd-b');b.setAttribute('aria-labelledby',id+' '+b.id);c.querySelector('[role=listbox]').setAttribute('aria-labelledby',id);return}
if(c.tagName==='P')return;
if(c.tagName==='BUTTON'){c.id=c.id||'c'+ ++uid;c.setAttribute('aria-labelledby',id+' '+c.id);return}
c.setAttribute('role','group');c.setAttribute('aria-labelledby',id)}
export const fld=(l,c)=>{const f=el('div','f'),s=el('span','lb',l),id='lb'+ ++uid;s.id=id;f.append(s,c);label(c,id,l);return f};
export const txt=(v,on,ph)=>{const i=el('input','in');i.value=v;if(ph)i.placeholder=ph;i.autocomplete='off';i.spellcheck=false;i.oninput=()=>on(i.value);return i};
export const chip=(l,o,k,on)=>{const b=el('button','chip',l);b.type='button';const s=()=>b.setAttribute('aria-pressed',o[k]?'true':'false');b.onclick=()=>{o[k]=o[k]?0:1;s();on()};s();return b};
export function seg(opts,val,on){
const w=el('div','tabs');
const set=v=>w.childNodes.forEach(b=>{const s=b.dataset.v===v;b.classList.toggle('on',s);b.setAttribute('aria-pressed',s?'true':'false')});
opts.forEach(([v,l])=>{const b=el('button','tab',l);b.type='button';b.dataset.v=v;b.onclick=()=>{set(v);on(v)};w.append(b)});
set(val);return w}
const shut=d=>{d.classList.remove('open');d.firstChild.setAttribute('aria-expanded','false')};
const closeDD=x=>document.querySelectorAll('.dd.open').forEach(d=>d!==x&&shut(d));
export function installDropdownClose(){
document.addEventListener('click',()=>closeDD());
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDD()});
}
export function dd(opts,val,on){
const w=el('div','dd'),b=el('button','dd-b'),m=el('div','dd-m');
b.type='button';b.id='dd'+ ++uid;b.setAttribute('aria-haspopup','listbox');b.setAttribute('aria-expanded','false');m.setAttribute('role','listbox');m.setAttribute('aria-labelledby',b.id);
const set=v=>{const f=opts.find(o=>o[0]===v)||opts[0];b.textContent=f[1];b.title=f[1];m.childNodes.forEach(d=>{const s=d.dataset.v===f[0];d.classList.toggle('on',s);d.setAttribute('aria-selected',s?'true':'false')})};
const open=()=>{closeDD(w);w.classList.add('open');b.setAttribute('aria-expanded','true')};
opts.forEach(([v,l])=>{
const d=el('div','dd-o',l);d.dataset.v=v;d.tabIndex=-1;d.setAttribute('role','option');
d.onclick=()=>{set(v);shut(w);b.focus();on(v)};
d.onkeydown=e=>{
const k=[...m.children],i=k.indexOf(d),go=j=>{e.preventDefault();k[(j+k.length)%k.length].focus()};
if(e.key==='ArrowDown')go(i+1);else if(e.key==='ArrowUp')go(i-1);else if(e.key==='Home')go(0);else if(e.key==='End')go(-1);
else if(e.key==='Enter'||e.key===' '){e.preventDefault();d.click()}
else if(e.key==='Escape'){e.preventDefault();shut(w);b.focus()}
else if(e.key==='Tab')shut(w)};
m.append(d)});
b.onclick=e=>{e.stopPropagation();if(w.classList.contains('open'))shut(w);else open()};
b.onkeydown=e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();open();(m.querySelector('.on')||m.firstChild).focus()}};
w.append(b,m);set(val);return w}
export function slider(o,k,min,max,on,cap=max){
const w=el('div','sl'),r=el('input'),n=el('input','in num');
r.type='range';r.min=min;r.max=max;n.type='number';n.min=min;n.max=cap;n.inputMode='numeric';
const s=v=>{v=Math.max(min,Math.min(cap,Math.round(+v)||min));o[k]=v;const p=Math.min(v,max);r.value=p;r.style.setProperty('--p',(p-min)/(max-min)*100+'%');return v};
r.oninput=()=>{n.value=s(r.value);on()};
n.oninput=()=>{if(n.value==='')return;s(n.value);on()};
n.onblur=()=>{n.value=o[k]};
n.value=s(o[k]);w.append(r,n);return w}
export const spin=b=>{b.classList.remove('spin');void b.offsetWidth;b.classList.add('spin')};
export function icon(d){
const ns='http://www.w3.org/2000/svg',s=document.createElementNS(ns,'svg'),p=document.createElementNS(ns,'path');
for(const[k,v]of Object.entries({viewBox:'0 0 24 24','aria-hidden':'true',focusable:'false',fill:'none',stroke:'currentColor','stroke-width':'1.8','stroke-linecap':'round','stroke-linejoin':'round'}))s.setAttribute(k,v);
p.setAttribute('d',d);s.append(p);return s}
