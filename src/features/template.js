import {t} from '../core/i18n.js';
import {rnd,pick} from '../core/rng.js';
import {AL} from '../data/alphabets.js';
import {COUNTRY_OF,normPlace} from '../data/places.js';

const numOf=s=>{const n=Number(s);return String(s).trim()!==''&&Number.isFinite(n)?n:null};
const intArg=a=>{const n=parseInt(a,10);return Number.isFinite(n)?Math.max(-1e6,Math.min(1e6,n)):0};
const toDate=s=>{
const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s).trim());
if(!m)return null;
const d=new Date(0);d.setUTCFullYear(+m[1],+m[2]-1,+m[3]);d.setUTCHours(0,0,0,0);
return d.getUTCFullYear()===+m[1]&&d.getUTCMonth()===+m[2]-1&&d.getUTCDate()===+m[3]?d:null};
const toIso=d=>{const y=d.getUTCFullYear();return y>=0&&y<=9999?String(y).padStart(4,'0')+d.toISOString().slice(4,10):''};
const shiftDays=(d,k)=>{const r=new Date(d.getTime());r.setUTCDate(r.getUTCDate()+k);return r};
const shiftMonths=(d,k)=>{
const m=d.getUTCMonth()+k,y=d.getUTCFullYear()+Math.floor(m/12),mo=((m%12)+12)%12,last=new Date(0);
last.setUTCFullYear(y,mo+1,0);
const r=new Date(0);r.setUTCFullYear(y,mo,Math.min(d.getUTCDate(),last.getUTCDate()));r.setUTCHours(0,0,0,0);return r};
const onDate=(s,f)=>{const d=toDate(s);return d?f(d):s};
export const FX={
lower:s=>s.toLowerCase(),upper:s=>s.toUpperCase(),
cap:s=>s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu,(m,a,b)=>a+b.toUpperCase()),
first:s=>s.trim().split(/\s+/)[0]||'',
last:s=>{const a=s.trim().split(/\s+/);return a[a.length-1]||''},
initial:s=>[...s.trim()].slice(0,1).join(''),
slug:s=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''),
lookup:s=>COUNTRY_OF.get(normPlace(s))||'',
num:s=>{const n=numOf(s);return n===null?s:n.toLocaleString('en-US',{maximumFractionDigits:20})},
fixed:(s,a)=>{const n=numOf(s);return n===null?s:n.toFixed(Math.max(0,Math.min(20,intArg(a))))},
pad:(s,a)=>s===''?s:String(s).padStart(Math.max(0,Math.min(50,intArg(a))),'0'),
addDays:(s,a)=>onDate(s,d=>toIso(shiftDays(d,intArg(a)))||s),
addMonths:(s,a)=>onDate(s,d=>toIso(shiftMonths(d,intArg(a)))||s),
addYears:(s,a)=>onDate(s,d=>toIso(shiftMonths(d,12*intArg(a)))||s),
year:s=>onDate(s,d=>String(d.getUTCFullYear())),
month:s=>onDate(s,d=>String(d.getUTCMonth()+1).padStart(2,'0')),
day:s=>onDate(s,d=>String(d.getUTCDate()).padStart(2,'0')),
weekday:s=>onDate(s,d=>d.toLocaleDateString('en-US',{weekday:'long',timeZone:'UTC'}))};
const hasFx=n=>Object.prototype.hasOwnProperty.call(FX,n);
export const key=s=>String(s).trim().toLowerCase();
const escR=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function compile(src){
const s=String(src),out=[],errs=[];let at=0;
for(const m of s.matchAll(/\{([^{}]*)\}/g)){
if(m.index>at)out.push(s.slice(at,m.index));at=m.index+m[0].length;
const[r,...raw]=m[1].split('|').map(x=>x.trim());
if(r==='#'||r==='?'){out.push({r});continue}
const f=raw.map(x=>{const i=x.indexOf(':');return i<0?{n:x,a:''}:{n:x.slice(0,i).trim(),a:x.slice(i+1).trim()}});
const bad=f.filter(x=>!hasFx(x.n));if(bad.length)errs.push(t('unknown filter {names}',{names:bad.map(x=>x.n).join(', ')}));
out.push({ref:key(r),f:f.filter(x=>hasFx(x.n))})}
if(at<s.length)out.push(s.slice(at));
return{out,errs}}
export function plan(cols){
const idx=new Map();cols.forEach((c,i)=>{const k=key(c.name);if(k&&!idx.has(k))idx.set(k,i)});
const C=cols.map(c=>c.t==='tpl'?compile(c.v&&c.v[0]!=null?c.v[0]:''):null);
C.forEach(p=>p&&p.out.forEach(x=>{if(x.ref==null)return;x.i=idx.get(x.ref);if(x.i==null)p.errs.push(x.ref?t('no column named \u201c{ref}\u201d',{ref:x.ref}):t('empty reference {}'))}));
C.forEach((p,i)=>{const k=key(cols[i].name);if(p&&k&&idx.get(k)!==i)p.errs.push(t('two columns share the name \u201c{name}\u201d, references use the first one',{name:cols[i].name.trim()}))});
const deps=C.map(p=>p?[...new Set(p.out.filter(x=>x.i!=null).map(x=>x.i))]:[]),done=new Set(),order=[];
for(let moved=true;moved;){moved=false;cols.forEach((_,i)=>{if(!done.has(i)&&deps[i].every(d=>done.has(d))){done.add(i);order.push(i);moved=true}})}
cols.forEach((_,i)=>{if(!done.has(i))C[i].errs.push(t('circular reference, this column depends on itself'))});
return{P:C,order}}
export const fill=(p,r)=>p.out.map(x=>typeof x==='string'?x:x.r?(x.r==='#'?String(rnd(10)):pick(AL)):x.f.reduce((s,f)=>FX[f.n](s,f.a),String(r[x.i]??''))).join('');
export function renameRefs(cols,from,to){const ch=[];if(!key(from)||!key(to)||key(from)===key(to))return ch;const re=new RegExp('\\{\\s*'+escR(from.trim())+'\\s*(?=[|}])','gi');cols.forEach((c,j)=>{if(c.t!=='tpl')return;const v=String(c.v[0]).replace(re,'{'+to.trim());if(v!==c.v[0]){c.v[0]=v;ch.push(j)}});return ch}
