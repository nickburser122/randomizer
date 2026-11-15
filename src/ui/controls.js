import {el} from '../core/dom.js';

export const fld=(l,c)=>{const f=el('div','f');f.append(el('span','lb',l),c);return f};
export const txt=(v,on,ph)=>{const i=el('input','in');i.value=v;if(ph)i.placeholder=ph;i.autocomplete='off';i.spellcheck=false;i.oninput=()=>on(i.value);return i};
export const chip=(l,o,k,on)=>{const b=el('button','chip',l);b.type='button';const s=()=>b.setAttribute('aria-pressed',o[k]?'true':'false');b.onclick=()=>{o[k]=o[k]?0:1;s();on()};s();return b};
const closeDD=x=>document.querySelectorAll('.dd.open').forEach(d=>d!==x&&d.classList.remove('open'));
export function installDropdownClose(){
document.addEventListener('click',()=>closeDD());
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDD()});
}
export function dd(opts,val,on){
const w=el('div','dd'),b=el('button','dd-b'),m=el('div','dd-m');b.type='button';
const set=v=>{const f=opts.find(o=>o[0]===v)||opts[0];b.textContent=f[1];m.childNodes.forEach(d=>d.classList.toggle('on',d.dataset.v===f[0]))};
opts.forEach(([v,l])=>{const d=el('div','dd-o',l);d.dataset.v=v;d.onclick=()=>{set(v);w.classList.remove('open');on(v)};m.append(d)});
b.onclick=e=>{e.stopPropagation();closeDD(w);w.classList.toggle('open')};
w.append(b,m);set(val);return w}
export function slider(o,k,min,max,on){
const w=el('div','sl'),r=el('input'),n=el('input','in num');
r.type='range';r.min=min;r.max=max;n.type='number';n.min=min;n.max=max;n.inputMode='numeric';
const s=v=>{v=Math.max(min,Math.min(max,Math.round(+v)||min));o[k]=v;r.value=v;r.style.setProperty('--p',(v-min)/(max-min)*100+'%');return v};
r.oninput=()=>{n.value=s(r.value);on()};
n.oninput=()=>{if(n.value==='')return;s(n.value);on()};
n.onblur=()=>{n.value=o[k]};
n.value=s(o[k]);w.append(r,n);return w}
export const spin=b=>{b.classList.remove('spin');void b.offsetWidth;b.classList.add('spin')};
