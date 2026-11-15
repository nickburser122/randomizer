import {rnd,pick} from '../core/rng.js';
import {AL} from '../data/alphabets.js';

export const FX={lower:s=>s.toLowerCase(),upper:s=>s.toUpperCase(),cap:s=>s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu,(m,a,b)=>a+b.toUpperCase()),first:s=>s.trim().split(/\s+/)[0]||'',last:s=>{const a=s.trim().split(/\s+/);return a[a.length-1]||''},initial:s=>[...s.trim()].slice(0,1).join(''),slug:s=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')};
export const key=s=>String(s).trim().toLowerCase();
const escR=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function compile(src){
const s=String(src),out=[],errs=[];let at=0;
for(const m of s.matchAll(/\{([^{}]*)\}/g)){
if(m.index>at)out.push(s.slice(at,m.index));at=m.index+m[0].length;
const[r,...f]=m[1].split('|').map(x=>x.trim());
if(r==='#'||r==='?'){out.push({r});continue}
const bad=f.filter(x=>!FX[x]);if(bad.length)errs.push('unknown filter '+bad.join(', '));
out.push({ref:key(r),f:f.filter(x=>FX[x])})}
if(at<s.length)out.push(s.slice(at));
return{out,errs}}
export function plan(cols){
const idx=new Map();cols.forEach((c,i)=>{const k=key(c.name);if(k&&!idx.has(k))idx.set(k,i)});
const C=cols.map(c=>c.t==='tpl'?compile(c.v&&c.v[0]!=null?c.v[0]:''):null);
C.forEach(p=>p&&p.out.forEach(x=>{if(x.ref==null)return;x.i=idx.get(x.ref);if(x.i==null)p.errs.push(x.ref?'no column named \u201c'+x.ref+'\u201d':'empty reference {}')}));
C.forEach((p,i)=>{const k=key(cols[i].name);if(p&&k&&idx.get(k)!==i)p.errs.push('two columns share the name \u201c'+cols[i].name.trim()+'\u201d, references use the first one')});
const deps=C.map(p=>p?[...new Set(p.out.filter(x=>x.i!=null).map(x=>x.i))]:[]),done=new Set(),order=[];
for(let moved=true;moved;){moved=false;cols.forEach((_,i)=>{if(!done.has(i)&&deps[i].every(d=>done.has(d))){done.add(i);order.push(i);moved=true}})}
cols.forEach((_,i)=>{if(!done.has(i))C[i].errs.push('circular reference, this column depends on itself')});
return{P:C,order}}
export const fill=(p,r)=>p.out.map(x=>typeof x==='string'?x:x.r?(x.r==='#'?String(rnd(10)):pick(AL)):x.f.reduce((s,f)=>FX[f](s),String(r[x.i]??''))).join('');
export function renameRefs(cols,from,to){const ch=[];if(!key(from)||!key(to)||key(from)===key(to))return ch;const re=new RegExp('\\{\\s*'+escR(from.trim())+'\\s*(?=[|}])','gi');cols.forEach((c,j)=>{if(c.t!=='tpl')return;const v=String(c.v[0]).replace(re,'{'+to.trim());if(v!==c.v[0]){c.v[0]=v;ch.push(j)}});return ch}
