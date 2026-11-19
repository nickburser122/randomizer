import {copy} from '../core/clipboard.js';
import {$,el} from '../core/dom.js';
import {t,nf} from '../core/i18n.js';
import {getSaver,saveMessage} from '../core/download.js';
import {announce} from '../core/live.js';
import {rnd,pick,rf,isSeeded,seeded} from '../core/rng.js';
import {loadJSON,saveJSON} from '../core/storage.js';
import {AL,AN} from '../data/alphabets.js';
import {FN,LN,DM} from '../data/names.js';
import {CITIES} from '../data/places.js';
import {W} from '../data/words.js';
import {plan,fill,renameRefs,key} from '../features/template.js';
import {fld,txt,chip,dd,slider,spin,label,icon} from '../ui/controls.js';

export const T={
int:{n:t('Integer'),p:[[t('Min'),0],[t('Max'),100]]},
float:{n:t('Decimal, uniform'),p:[[t('Min'),0],[t('Max'),1],[t('Decimals'),2]]},
choice:{n:t('Pick from list'),p:[[t('Values, comma separated'),'red,green,blue']]},
bool:{n:t('True or false'),p:[[t('Chance of true, %'),50]]},
date:{n:t('Date'),p:[[t('From'),'2020-01-01'],[t('To'),'2026-12-31']]},
word:{n:t('Word'),p:[]},
uuid:{n:t('UUID'),p:[]},
seq:{n:t('Counter'),p:[[t('Start'),1],[t('Step'),1]]},
pat:{n:t('Pattern'),p:[[t('# digit, ? letter, * either'),'ID-####-??']]},
name:{n:t('Full name'),p:[]},
email:{n:t('Email'),p:[]},
phone:{n:t('Phone'),p:[[t('Pattern, # is a digit'),'+1 555-###-####']]},
normal:{n:t('Normal curve'),p:[[t('Mean'),50],[t('Std dev'),10],[t('Decimals'),1]]},
exp:{n:t('Exponential'),p:[[t('Mean'),1],[t('Decimals'),2]]},
lognormal:{n:t('Log-normal'),p:[[t('Log mean'),0],[t('Log std dev'),1],[t('Decimals'),2]]},
wchoice:{n:t('Weighted list'),p:[[t('Values, like a*5,b*1'),'yes*3,no*1']]},
city:{n:t('City'),p:[]},
tpl:{n:t('Built from columns'),p:[[t('Template'),'{name|first|lower}.{name|last|lower}@example.com']]}
};
export const NUM=new Set(['int','float','seq','normal','exp','lognormal']);
const dec=x=>Math.max(0,Math.min(10,Math.round(+x)||0));
const items=v=>String(v).split(',').map(x=>x.trim()).filter(Boolean);
const weighted=v=>items(v).map(x=>{const m=x.match(/^(.*?)\s*\*\s*(\d+(?:\.\d+)?)$/);return m&&m[1]?{t:m[1],w:+m[2]||1}:{t:x,w:1}});
export const G={
int:v=>{const a=Math.ceil(Math.min(+v[0],+v[1])||0),b=Math.floor(Math.max(+v[0],+v[1])||0);return String(a+rnd(b-a+1))},
float:v=>{const a=+v[0]||0,b=+v[1]||0;return(a+(b-a)*rf()).toFixed(dec(v[2]))},
choice:v=>{const o=items(v[0]);return o.length?pick(o):''},
bool:v=>rf()*100<(+v[0]||0)?'true':'false',
date:v=>{const a=Date.parse(v[0]),b=Date.parse(v[1]);if(isNaN(a)||isNaN(b))return'';const lo=Math.min(a,b),hi=Math.max(a,b);return new Date(lo+Math.floor(rf()*(hi-lo+864e5))).toISOString().slice(0,10)},
word:()=>pick(W),
uuid:()=>isSeeded()?'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=rnd(16);return(c==='x'?r:r&3|8).toString(16)}):crypto.randomUUID(),
seq:(v,i)=>String((+v[0]||0)+i*(+v[1]||0)),
pat:v=>String(v[0]).replace(/[#?*]/g,m=>m==='#'?rnd(10):m==='?'?pick(AL):pick(AN)),
name:()=>pick(FN)+' '+pick(LN),
email:()=>pick(FN).toLowerCase()+'.'+pick(LN).toLowerCase()+rnd(100)+'@'+pick(DM),
phone:v=>String(v[0]).replace(/#/g,()=>rnd(10)),
normal:v=>{const z=Math.sqrt(-2*Math.log(1-rf()))*Math.cos(2*Math.PI*rf());return((+v[0]||0)+z*(+v[1]||0)).toFixed(dec(v[2]))},
exp:v=>{const m=+v[0]>0?+v[0]:1;return(-m*Math.log(1-rf())).toFixed(dec(v[1]))},
lognormal:v=>{const z=Math.sqrt(-2*Math.log(1-rf()))*Math.cos(2*Math.PI*rf());return Math.exp((+v[0]||0)+z*Math.abs(+v[1]||0)).toFixed(dec(v[2]))},
wchoice:v=>{const o=weighted(v[0]);if(!o.length)return'';let r=rf()*o.reduce((q,x)=>q+x.w,0);for(const x of o){r-=x.w;if(r<0)return x.t}return o[o.length-1].t},
city:()=>pick(CITIES)
};
export const MAX_ROWS=100000,MAX_COLS=60,SCHEMA_MAX=100000,SYNC_ROWS=2000,CHUNK=250,DOMAIN_MAX=200000,RETRIES=100;
export const defv=x=>T[type(x)].p.map(p=>String(p[1]));
export const mk=(name,x)=>({name,t:type(x),v:defv(x),nul:'',u:0});
export const clampRows=n=>Math.max(1,Math.min(MAX_ROWS,Math.round(+n)||1));
export const FORMATS=['tsv','csv','json','md','sql'];
export const EXT={tsv:'txt',csv:'csv',json:'json',md:'md',sql:'txt'};
export const type=x=>Object.prototype.hasOwnProperty.call(T,x)?x:'word';
const str=(x,max)=>typeof x==='string'?x.slice(0,max):typeof x==='number'&&Number.isFinite(x)?String(x):'';
export function readSaved(o){
const r={tb:{}};if(!o||typeof o!=='object')return r;
if(Array.isArray(o.cols))r.cols=o.cols.slice(0,MAX_COLS).filter(c=>c&&typeof c==='object').map(c=>{const x=type(c.t),v=Array.isArray(c.v)?c.v:[];return{name:str(c.name,80),t:x,v:defv(x).map((d,j)=>typeof v[j]==='string'||typeof v[j]==='number'?str(v[j],2000):d),nul:str(c.nul,6),u:c.u===1||c.u===true?1:0}});
if(typeof o.n==='number'&&o.n>=1&&o.n<=MAX_ROWS)r.tb.n=Math.round(o.n);
if(o.hdr===0||o.hdr===1)r.tb.hdr=o.hdr;
if(FORMATS.includes(o.fmt))r.tb.fmt=o.fmt;
if(typeof o.seed==='string')r.tb.seed=o.seed.slice(0,200);
return r}
export const snapshot=(cols,tb)=>({cols:cols.map(c=>({name:c.name,t:c.t,v:c.v,nul:c.nul||'',u:c.u?1:0})),n:tb.n,hdr:tb.hdr,fmt:tb.fmt,seed:tb.seed});
export const exportSchema=(cols,tb)=>JSON.stringify(snapshot(cols,tb),null,2);
export function importSchema(text){
if(typeof text!=='string'||!text.trim())return{error:t('Paste a schema first.')};
if(text.length>SCHEMA_MAX)return{error:t('That is too large to be a schema. The limit is {max} characters.',{max:nf(SCHEMA_MAX)})};
let o;try{o=JSON.parse(text)}catch(e){return{error:t('That is not valid JSON.')}}
if(!o||typeof o!=='object'||Array.isArray(o)||!Array.isArray(o.cols))return{error:t('No columns found. Copy a schema from this page, then paste it here.')};
if(!o.cols.length)return{error:t('The schema has no columns.')};
if(o.cols.length>MAX_COLS)return{error:t('Too many columns. The limit is {max}.',{max:MAX_COLS})};
const s=readSaved(o);
if(!s.cols.length)return{error:t('The schema has no usable columns.')};
return s}
export function moveCol(cols,i,d){
const j=i+d;
if(!Number.isInteger(i)||i<0||i>=cols.length||j<0||j>=cols.length)return cols;
const n=cols.slice();[n[i],n[j]]=[n[j],n[i]];return n}
export function uniqueName(cols,name){
const base=String(name).trim()||t('column'),used=new Set(cols.map(c=>key(c.name)));
let n=t('{name} copy',{name:base}),k=2;
while(used.has(key(n)))n=t('{name} copy {n}',{name:base,n:k++});
return n.slice(0,80)}
export function dupCol(cols,i){
if(!cols[i])return{cols};
if(cols.length>=MAX_COLS)return{error:t('A table can have up to {max} columns.',{max:MAX_COLS})};
const c=cols[i],n=cols.slice();
n.splice(i+1,0,{...c,v:c.v.slice(),name:uniqueName(cols,c.name)});
return{cols:n,at:i+1}}
const slots=pat=>[...String(pat)].filter(c=>c==='#'||c==='?'||c==='*').map(c=>c==='#'?10:c==='?'?AL.length:AN.length);
export function capacity(c){
const v=c.v||[];
switch(c.t){
case'int':{const a=Math.ceil(Math.min(+v[0],+v[1])||0),b=Math.floor(Math.max(+v[0],+v[1])||0);return Math.max(0,b-a+1)}
case'float':{const a=+v[0]||0,b=+v[1]||0;return Math.floor(Math.abs(b-a)*10**dec(v[2])+1e-9)+1}
case'choice':return new Set(items(v[0])).size;
case'wchoice':return new Set(weighted(v[0]).map(x=>x.t)).size;
case'bool':return 2;
case'date':{const a=Date.parse(v[0]),b=Date.parse(v[1]);return isNaN(a)||isNaN(b)?1:Math.floor(Math.abs(b-a)/864e5)+1}
case'word':return W.length;
case'name':return FN.length*LN.length;
case'city':return CITIES.length;
case'pat':return slots(v[0]).reduce((q,x)=>q*x,1);
case'phone':return 10**(String(v[0]).split('#').length-1);
case'seq':return(+v[1]||0)===0?1:Infinity;
case'email':return FN.length*LN.length*100*DM.length;
default:return Infinity}}
function domain(c){
const cap=capacity(c),v=c.v;
if(!Number.isFinite(cap)||cap<1||cap>DOMAIN_MAX)return null;
switch(c.t){
case'int':{const a=Math.ceil(Math.min(+v[0],+v[1])||0);return{size:cap,at:i=>String(a+i)}}
case'float':{const a=+v[0]||0,b=+v[1]||0,d=dec(v[2]),base=Math.round(Math.min(a,b)*10**d);return{size:cap,at:i=>((base+i)/10**d).toFixed(d)}}
case'choice':{const o=[...new Set(items(v[0]))];return{size:o.length,at:i=>o[i]}}
case'wchoice':{const o=[...new Set(weighted(v[0]).map(x=>x.t))];return{size:o.length,at:i=>o[i]}}
case'bool':return{size:2,at:i=>i?'false':'true'};
case'date':{const lo=Math.min(Date.parse(v[0]),Date.parse(v[1]));return isNaN(lo)?null:{size:cap,at:i=>new Date(lo+i*864e5).toISOString().slice(0,10)}}
case'word':return{size:cap,at:i=>W[i]};
case'name':return{size:cap,at:i=>FN[Math.floor(i/LN.length)]+' '+LN[i%LN.length]};
case'city':return{size:cap,at:i=>CITIES[i]};
case'pat':{const src=String(v[0]),sz=slots(src);return{size:cap,at:i=>{const d=sz.slice().reverse().map(n=>{const r=i%n;i=Math.floor(i/n);return r}).reverse();let k=0;return src.replace(/[#?*]/g,m=>m==='#'?String(d[k++]):m==='?'?AL[d[k++]]:AN[d[k++]])}}}
case'phone':{const src=String(v[0]),n=cap===1?0:Math.round(Math.log10(cap));return{size:cap,at:i=>{const d=String(i).padStart(n,'0');let k=0;return src.replace(/#/g,()=>d[k++])}}}
default:return null}}
function uniqueSource(c){
const d=domain(c);
if(d){
const pool=Uint32Array.from({length:d.size},(_,i)=>i);let left=d.size;
return{take(){if(!left)return null;const k=rnd(left),x=pool[k];pool[k]=pool[--left];return d.at(x)}}}
const seen=new Set();let dead=false;
return{take(gen){
if(dead)return null;
for(let a=0;a<RETRIES;a++){const x=gen();if(!seen.has(x)){seen.add(x);return x}}
dead=true;return null}}}
export function rowStream(cols,seed){
const pl=plan(cols),run=seeded(seed),U=[],issues={};let i=0;
return{pl,issues,step:k=>run(()=>{const out=[];
for(let q=0;q<k;q++,i++){
const r=cols.map(()=>'');
for(const j of pl.order){
const c=cols[j];
if(+c.nul>0&&rf()*100<+c.nul)continue;
const gen=()=>c.t==='tpl'?fill(pl.P[j],r):G[c.t](c.v,i);
if(c.u&&c.t!=='seq'&&c.t!=='uuid'){
const u=U[j]||(U[j]=uniqueSource(c));
let x=u.take(gen);
if(x===null){if(!issues[j])issues[j]={at:i};x=gen()}
r[j]=x}
else r[j]=gen()}
out.push(r)}
return out})}}
export const makeRows=(cols,n,seed)=>rowStream(cols,seed).step(n);
export function uniqueNotes(cols,n,issues){
const out={};
cols.forEach((c,j)=>{
if(!c.u||c.t==='seq'||c.t==='uuid')return;
const cap=capacity(c);
if(Number.isFinite(cap)&&cap<n)out[j]=t('Only {cap} different values are possible, but the table has {n} rows, so some repeat. Widen the range or add values.',{cap:nf(cap),n:nf(n)});
else if(issues&&issues[j])out[j]=t('Ran out of different values after {n} rows, so later rows repeat. Widen the range or add values.',{n:nf(issues[j].at)})});
return out}
export function format(f,cols,rows,hdr){
if(!FORMATS.includes(f))f='tsv';
const h=cols.map(c=>c.name||t('column'));
if(f==='json')return JSON.stringify(rows.map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]===''?null:NUM.has(cols[i].t)?+r[i]:cols[i].t==='bool'?r[i]==='true':r[i]]))),null,2);
if(f==='sql'){const q=v=>"'"+String(v).replace(/'/g,"''")+"'",id=x=>'"'+String(x).replace(/"/g,'""')+'"';return rows.map(r=>'INSERT INTO data ('+h.map(id).join(', ')+') VALUES ('+r.map((v,i)=>v===''?'NULL':NUM.has(cols[i].t)||cols[i].t==='bool'?v:q(v)).join(', ')+');').join('\n')}
const cl=s=>String(s).replace(/[\t\r\n]+/g,' ');
const L=f==='tsv'?r=>r.map(cl).join('\t'):f==='csv'?r=>r.map(v=>/[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v).join(','):r=>'| '+r.map(v=>String(v).replace(/\|/g,'\\|')).join(' | ')+' |';
const o=[];
if(hdr||f==='md')o.push(L(h));
if(f==='md')o.push('|'+h.map(()=>' --- |').join(''));
rows.forEach(r=>o.push(L(r)));return o.join('\n')}
export function init(){
const tb={n:20,hdr:1,fmt:'tsv',seed:''};
const saveT=()=>saveJSON('rz-t',snapshot(cols,tb));
let cols=[mk('id','seq'),mk('name','name'),mk('email','tpl'),mk('score','int'),mk('status','choice')],rows=[],busy=false,run=0;
cols[4].v[0]='new,active,paused';
{const sv=readSaved(loadJSON('rz-t',null));if(sv.cols)cols=sv.cols;Object.assign(tb,sv.tb)}
let tplIn=[],notes=[],refRows=[];
const fmt=n=>nf(n);
const colErr=m=>{const e=$('#col-er');e.textContent=m;e.hidden=!m};
const focusOp=(i,op)=>{const c=$('#cols').children[i];if(!c)return;const b=c.querySelector('[data-op="'+op+'"]:not(:disabled)')||c.querySelector('[data-op]:not(:disabled)');if(b)b.focus()};
function buildCols(){
const w=$('#cols');w.textContent='';tplIn=[];notes=[];refRows=[];
cols.forEach((c,i)=>{
const r=el('div','col'),ops=el('div','ops');
const op=(d,k,fn,off)=>{const b=el('button','rm');b.type='button';b.dataset.op=k;b.append(icon(d));b.disabled=!!off;b.onclick=fn;ops.append(b);return b};
const up=op('M12 19V5M6 11l6-6 6 6','up',()=>{colErr('');cols=moveCol(cols,i,-1);buildCols();make();focusOp(i-1,'up')},i===0);
const dn=op('M12 5v14M6 13l6 6 6-6','down',()=>{colErr('');cols=moveCol(cols,i,1);buildCols();make();focusOp(i+1,'down')},i===cols.length-1);
const dp=op('M9 9h10v10H9zM5 15V5h10','dup',()=>{const d=dupCol(cols,i);if(d.error){colErr(d.error);announce(d.error);return}colErr('');cols=d.cols;buildCols();make();focusOp(d.at,'dup')});
const x=el('button','rm','\u00d7');x.type='button';x.dataset.op='remove';ops.append(x);
const tag=()=>{const nm=c.name.trim(),v={n:i+1,name:nm};r.setAttribute('aria-label',nm?t('Column {n}, {name}',v):t('Column {n}',v));up.setAttribute('aria-label',nm?t('Move column {n} up, {name}',v):t('Move column {n} up',v));dn.setAttribute('aria-label',nm?t('Move column {n} down, {name}',v):t('Move column {n} down',v));dp.setAttribute('aria-label',nm?t('Duplicate column {n}, {name}',v):t('Duplicate column {n}',v));x.setAttribute('aria-label',nm?t('Remove column {n}, {name}',v):t('Remove column {n}',v))};
r.setAttribute('role','group');tag();
const nm=fld(t('Name'),txt(c.name,v=>{const o=c.name;c.name=v;tag();renameRefs(cols,o,v).forEach(j=>{if(tplIn[j])tplIn[j].value=cols[j].v[0]});drawRefs();if(cols.some(q=>q.t==='tpl'))make();else render()},t('column')));nm.classList.add('nm');r.append(nm);
r.append(fld(t('Type'),dd(Object.entries(T).map(([k,v])=>[k,v.n]),c.t,v=>{c.t=v;c.v=defv(v);buildCols();make()})));
const spec=T[c.t]||T.word;spec.p.forEach((p,j)=>{const inp=txt(c.v[j],v=>{c.v[j]=v;make()}),f=fld(p[0],inp);if(c.t==='choice'||c.t==='wchoice'||c.t==='pat'||c.t==='tpl')f.classList.add('wide');if(c.t==='tpl')tplIn[i]=inp;r.append(f)});
r.append(fld(t('Empty %'),txt(c.nul||'',v=>{c.nul=v;make()},'0')));
if(c.t!=='seq'&&c.t!=='uuid')r.append(fld(t('Unique values'),chip(t('No repeats'),c,'u',()=>make())));
x.onclick=()=>{colErr('');cols.splice(i,1);buildCols();make()};
r.append(ops);
const nt=el('p','sub note');nt.setAttribute('role','status');nt.hidden=true;notes[i]=nt;
if(c.t==='tpl'){const b=el('div','blk'),rr=el('div','row refs');b.append(rr,el('p','sub',t('Tap a column to insert it. Add filters with a bar, like {name|first|lower}. Filters: first, last, initial, lower, upper, cap, slug, lookup (city to country), num, fixed:2, pad:5, addDays:7, addMonths:1, addYears:1, year, month, day, weekday. {#} adds a random digit, {?} a random letter.')),nt);refRows.push([i,rr]);r.append(b)}
else r.append(nt);
w.append(r)});drawRefs()}
function drawRefs(){refRows.forEach(([i,rr])=>{rr.textContent='';cols.forEach((o,j)=>{if(j===i||!key(o.name))return;const b=el('button','chip ref','{'+o.name.trim()+'}');b.type='button';b.onclick=()=>{const q=tplIn[i],s='{'+o.name.trim()+'}',a=q.selectionStart??q.value.length,z=q.selectionEnd??a;q.value=q.value.slice(0,a)+s+q.value.slice(z);q.focus();q.setSelectionRange(a+s.length,a+s.length);q.oninput()};rr.append(b)})})}
function setBusy(b){busy=b;$('#tb-cp').disabled=b;$('#tb-dl').disabled=b;$('.tw').setAttribute('aria-busy',b?'true':'false')}
function showNotes(stream,n){
const un=uniqueNotes(cols,n,stream.issues);
notes.forEach((nt,j)=>{
if(!nt)return;
const e=stream.pl.P[j]?[...new Set(stream.pl.P[j].errs)]:[],parts=[];
if(e.length)parts.push(t('Check this: {errs}.',{errs:e.join('; ')}));
if(un[j])parts.push(un[j]);
nt.textContent=parts.join(' ');nt.hidden=!parts.length})}
const rowsLine=(n,c)=>t('{n} {n|row|rows}, {c} {c|column|columns}',{n,c});
function finish(out,n,stream){
rows=out;setBusy(false);showNotes(stream,n);render();
announce(t('{line} ready',{line:rowsLine(n,cols.length)}))}
function make(){
const n=clampRows(tb.n),stream=rowStream(cols,tb.seed),id=++run;
showNotes(stream,n);
saveT();
if(n<=SYNC_ROWS){finish(stream.step(n),n,stream);return}
const out=[];setBusy(true);
(function tick(){
if(id!==run)return;
const t0=performance.now();
while(out.length<n&&performance.now()-t0<12)out.push(...stream.step(Math.min(CHUNK,n-out.length)));
if(out.length<n){$('#tb-info').textContent=t('Generating {a} of {b} rows ({p}%)',{a:fmt(out.length),b:fmt(n),p:Math.floor(out.length/n*100)});setTimeout(tick,0);return}
finish(out,n,stream)})()}
function render(){
const tbl=$('#tb-t');tbl.textContent='';
if(tb.hdr&&cols.length){const th=el('thead'),tr=el('tr');cols.forEach(c=>{const h=el('th',NUM.has(c.t)?'n':'',c.name||t('column'));h.scope='col';tr.append(h)});th.append(tr);tbl.append(th)}
const bd=el('tbody');
rows.slice(0,100).forEach(r=>{const tr=el('tr');r.forEach((v,j)=>tr.append(el('td',NUM.has(cols[j].t)?'n':'',v)));bd.append(tr)});
tbl.append(bd);
if(!busy)$('#tb-info').textContent=cols.length?rowsLine(rows.length,cols.length)+(rows.length>100?'. '+t('Showing the first 100; copy and save include all rows.'):''):t('Add a column to start.')}
function buildTb(){
const rw=$('#tb-rows'),sd=$('#tb-seed'),hd=$('#tb-hdr'),fm=$('#tb-fm');
[rw,sd,hd,fm].forEach(c=>c.textContent='');
const sl=slider(tb,'n',1,1000,()=>make(),MAX_ROWS);rw.append(sl);label(sl,'lb-rows',$('#lb-rows').textContent);
const si=txt(tb.seed,v=>{tb.seed=v;make()},t('leave empty for random'));sd.append(si);label(si,'lb-seed',$('#lb-seed').textContent);
hd.append(chip(t('Include header'),tb,'hdr',()=>{saveT();render()}));label(hd,'lb-hdr',$('#lb-hdr').textContent);
fm.append(dd([['tsv',t('Copy as TSV')],['csv',t('Copy as CSV')],['json',t('Copy as JSON')],['md',t('Copy as Markdown')],['sql',t('Copy as SQL')]],tb.fmt,v=>{tb.fmt=v;saveT();const c=$('#tb-cp');c.dataset.l=c.textContent=t('Copy')}))}
function schemaError(m){const e=$('#sc-er');e.textContent=m;e.hidden=!m}
function applySchema(){
const s=importSchema($('#sc-ta').value);
if(s.error){schemaError(s.error);return}
schemaError('');cols=s.cols;Object.assign(tb,s.tb);
$('#sc-ta').value='';$('#sc-box').hidden=true;$('#sc-pa').setAttribute('aria-expanded','false');
buildTb();buildCols();make();announce(t('Schema applied, {n} {n|column|columns}',{n:cols.length}))}
buildTb();
$('#add').onclick=()=>{if(cols.length>=MAX_COLS){const m=t('A table can have up to {max} columns.',{max:MAX_COLS});colErr(m);announce(m);return}colErr('');cols.push(mk(t('column {n}',{n:cols.length+1}),'int'));buildCols();make()};
$('#tb-g').onclick=function(){spin(this);make()};
$('#tb-cp').onclick=function(){if(!busy)copy(format(tb.fmt,cols,rows,tb.hdr),this)};
$('#sc-cp').onclick=function(){copy(exportSchema(cols,tb),this)};
$('#sc-pa').onclick=function(){const box=$('#sc-box'),open=box.hidden;box.hidden=!open;this.setAttribute('aria-expanded',open?'true':'false');schemaError('');if(open)$('#sc-ta').focus()};
$('#sc-ap').onclick=applySchema;
$('#sc-ta').oninput=()=>schemaError('');
buildCols();
let saver=null;
const dlErr=m=>{const e=$('#dl-er');e.textContent=m;e.hidden=!m;if(m)announce(m)};
getSaver().then(s=>{saver=s;$('#tb-dl').hidden=!s});
$('#tb-dl').onclick=async()=>{
if(busy||!saver)return;
dlErr('');
const data=format(tb.fmt,cols,rows,tb.hdr),name='randomizer.'+EXT[tb.fmt];
try{await saver(name,data.length>1e6?new Blob([data]):data)}catch(e){dlErr(saveMessage(e))}};
return{refresh:()=>make()}}
