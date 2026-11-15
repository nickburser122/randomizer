import {copy} from '../core/clipboard.js';
import {$,el} from '../core/dom.js';
import {rnd,pick,rf,isSeeded,withSeed} from '../core/rng.js';
import {loadJSON,saveJSON} from '../core/storage.js';
import {AL,AN} from '../data/alphabets.js';
import {FN,LN,DM} from '../data/names.js';
import {W} from '../data/words.js';
import {plan,fill,renameRefs,key} from '../features/template.js';
import {fld,txt,chip,dd,slider,spin} from '../ui/controls.js';

export const T={
int:{n:'Integer',p:[['Min',0],['Max',100]]},
float:{n:'Decimal',p:[['Min',0],['Max',1],['Decimals',2]]},
choice:{n:'Pick from list',p:[['Values, comma separated','red,green,blue']]},
bool:{n:'True or false',p:[['Chance of true, %',50]]},
date:{n:'Date',p:[['From','2020-01-01'],['To','2026-12-31']]},
word:{n:'Word',p:[]},
uuid:{n:'UUID',p:[]},
seq:{n:'Counter',p:[['Start',1],['Step',1]]},
pat:{n:'Pattern',p:[['# digit, ? letter, * either','ID-####-??']]},
name:{n:'Full name',p:[]},
email:{n:'Email',p:[]},
phone:{n:'Phone',p:[['Pattern, # is a digit','+1 555-###-####']]},
normal:{n:'Normal curve',p:[['Mean',50],['Std dev',10],['Decimals',1]]},
wchoice:{n:'Weighted list',p:[['Values, like a*5,b*1','yes*3,no*1']]},
tpl:{n:'Built from columns',p:[['Template','{name|first|lower}.{name|last|lower}@example.com']]}
};
export const NUM=new Set(['int','float','seq','normal']);
export const G={
int:v=>{const a=Math.ceil(Math.min(+v[0],+v[1])||0),b=Math.floor(Math.max(+v[0],+v[1])||0);return String(a+rnd(b-a+1))},
float:v=>{const a=+v[0]||0,b=+v[1]||0,d=Math.max(0,Math.min(10,Math.round(+v[2])||0));return(a+(b-a)*rf()).toFixed(d)},
choice:v=>{const o=String(v[0]).split(',').map(s=>s.trim()).filter(Boolean);return o.length?pick(o):''},
bool:v=>rf()*100<(+v[0]||0)?'true':'false',
date:v=>{const a=Date.parse(v[0]),b=Date.parse(v[1]);if(isNaN(a)||isNaN(b))return'';const lo=Math.min(a,b),hi=Math.max(a,b);return new Date(lo+Math.floor(rf()*(hi-lo+864e5))).toISOString().slice(0,10)},
word:()=>pick(W),
uuid:()=>isSeeded()?'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=rnd(16);return(c==='x'?r:r&3|8).toString(16)}):crypto.randomUUID(),
seq:(v,i)=>String((+v[0]||0)+i*(+v[1]||0)),
pat:v=>String(v[0]).replace(/[#?*]/g,m=>m==='#'?rnd(10):m==='?'?pick(AL):pick(AN)),
name:()=>pick(FN)+' '+pick(LN),
email:()=>pick(FN).toLowerCase()+'.'+pick(LN).toLowerCase()+rnd(100)+'@'+pick(DM),
phone:v=>String(v[0]).replace(/#/g,()=>rnd(10)),
normal:v=>{const z=Math.sqrt(-2*Math.log(1-rf()))*Math.cos(2*Math.PI*rf());return((+v[0]||0)+z*(+v[1]||0)).toFixed(Math.max(0,Math.min(10,Math.round(+v[2])||0)))},
wchoice:v=>{const o=String(v[0]).split(',').map(x=>x.trim()).filter(Boolean).map(x=>{const m=x.match(/^(.*?)\s*\*\s*(\d+(?:\.\d+)?)$/);return m&&m[1]?{t:m[1],w:+m[2]||1}:{t:x,w:1}});if(!o.length)return'';let r=rf()*o.reduce((q,x)=>q+x.w,0);for(const x of o){r-=x.w;if(r<0)return x.t}return o[o.length-1].t}
};
export const mk=(name,t)=>({name,t:type(t),v:T[type(t)].p.map(p=>p[1])});
export const FORMATS=['tsv','csv','json','md','sql'];
export const EXT={tsv:'txt',csv:'csv',json:'json',md:'md',sql:'txt'};
export const type=t=>T[t]?t:'word';
export function readSaved(o){
const r={tb:{}};if(!o||typeof o!=='object')return r;
if(Array.isArray(o.cols))r.cols=o.cols.filter(c=>c&&typeof c==='object').map(c=>({name:String(c.name??''),t:type(c.t),v:Array.isArray(c.v)?c.v.slice():mk('','word').v,nul:c.nul}));
if(o.n>=1&&o.n<=1000)r.tb.n=Math.round(o.n);
if(o.hdr===0||o.hdr===1)r.tb.hdr=o.hdr;
if(FORMATS.includes(o.fmt))r.tb.fmt=o.fmt;
if(typeof o.seed==='string')r.tb.seed=o.seed;
return r}
export function format(f,cols,rows,hdr){
if(!FORMATS.includes(f))f='tsv';
const h=cols.map(c=>c.name||'column');
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
const saveT=()=>saveJSON('rz-t',{cols,n:tb.n,hdr:tb.hdr,fmt:tb.fmt,seed:tb.seed});
let cols=[mk('id','seq'),mk('name','name'),mk('email','tpl'),mk('score','int'),mk('status','choice')],rows=[];
cols[4].v[0]='new,active,paused';
{const sv=readSaved(loadJSON('rz-t',null));if(sv.cols)cols=sv.cols;Object.assign(tb,sv.tb)}
let tplIn=[],notes=[],refRows=[];
function buildCols(){
const w=$('#cols');w.textContent='';tplIn=[];notes=[];refRows=[];
cols.forEach((c,i)=>{
const r=el('div','col'),nm=fld('Name',txt(c.name,v=>{const o=c.name;c.name=v;renameRefs(cols,o,v).forEach(j=>{if(tplIn[j])tplIn[j].value=cols[j].v[0]});drawRefs();if(cols.some(x=>x.t==='tpl'))make();else render()},'column'));nm.classList.add('nm');r.append(nm);
r.append(fld('Type',dd(Object.entries(T).map(([k,v])=>[k,v.n]),c.t,v=>{c.t=v;c.v=T[v].p.map(p=>p[1]);buildCols();make()})));
const spec=T[c.t]||T.word;spec.p.forEach((p,j)=>{const inp=txt(c.v[j],v=>{c.v[j]=v;make()}),f=fld(p[0],inp);if(c.t==='choice'||c.t==='pat'||c.t==='tpl')f.classList.add('wide');if(c.t==='tpl')tplIn[i]=inp;r.append(f)});
r.append(fld('Empty %',txt(c.nul||'',v=>{c.nul=v;make()},'0')));
const x=el('button','rm','×');x.setAttribute('aria-label','Remove column');x.onclick=()=>{cols.splice(i,1);buildCols();make()};r.append(x);
if(c.t==='tpl'){const b=el('div','blk'),rr=el('div','row refs'),nt=el('p','sub note');b.append(rr,el('p','sub','Tap a column to insert it. Add filters with a bar: {name|first|lower}. Filters: first, last, initial, lower, upper, cap, slug. {#} adds a random digit, {?} a random letter.'),nt);refRows.push([i,rr]);notes[i]=nt;r.append(b)}
w.append(r)});drawRefs()}
function drawRefs(){refRows.forEach(([i,rr])=>{rr.textContent='';cols.forEach((o,j)=>{if(j===i||!key(o.name))return;const b=el('button','chip ref','{'+o.name.trim()+'}');b.type='button';b.onclick=()=>{const t=tplIn[i],s='{'+o.name.trim()+'}',a=t.selectionStart??t.value.length,z=t.selectionEnd??a;t.value=t.value.slice(0,a)+s+t.value.slice(z);t.focus();t.setSelectionRange(a+s.length,a+s.length);t.oninput()};rr.append(b)})})}
function make(){
const n=Math.max(1,Math.min(10000,Math.round(+tb.n)||1)),pl=plan(cols);
rows=withSeed(tb.seed,()=>{const out=[];
for(let i=0;i<n;i++){const r=cols.map(()=>'');for(const j of pl.order){const c=cols[j];if(+c.nul>0&&rf()*100<+c.nul)continue;r[j]=c.t==='tpl'?fill(pl.P[j],r):G[c.t](c.v,i)}out.push(r)}
return out});
notes.forEach((nt,j)=>{if(!nt)return;const e=pl.P[j]?[...new Set(pl.P[j].errs)]:[];nt.textContent=e.length?'Check this: '+e.join('; ')+'.':'';nt.hidden=!e.length});
saveT();render()}
function render(){
const t=$('#tb-t');t.textContent='';
if(tb.hdr&&cols.length){const th=el('thead'),tr=el('tr');cols.forEach(c=>tr.append(el('th',NUM.has(c.t)?'n':'',c.name||'column')));th.append(tr);t.append(th)}
const bd=el('tbody');
rows.slice(0,100).forEach(r=>{const tr=el('tr');r.forEach((v,j)=>tr.append(el('td',NUM.has(cols[j].t)?'n':'',v)));bd.append(tr)});
t.append(bd);
$('#tb-info').textContent=cols.length?rows.length+' rows, '+cols.length+' columns'+(rows.length>100?'. Showing the first 100; copy and save include all rows.':''):'Add a column to start.'}
(function(){
$('#tb-rows').append(slider(tb,'n',1,1000,()=>make()));
$('#tb-seed').append(txt(tb.seed,v=>{tb.seed=v;make()},'leave empty for random'));
$('#tb-hdr').append(chip('Include header',tb,'hdr',()=>{saveT();render()}));
$('#tb-fm').append(dd([['tsv','Copy as TSV'],['csv','Copy as CSV'],['json','Copy as JSON'],['md','Copy as Markdown'],['sql','Copy as SQL']],tb.fmt,v=>{tb.fmt=v;saveT();const c=$('#tb-cp');c.dataset.l=c.textContent='Copy'}));
$('#add').onclick=()=>{cols.push(mk('column '+(cols.length+1),'int'));buildCols();make()};
$('#tb-g').onclick=function(){spin(this);make()};
$('#tb-cp').onclick=function(){copy(format(tb.fmt,cols,rows,tb.hdr),this)};
buildCols()})();
$('#tb-dl').hidden=false;
let DL=null;
if(window.claude&&claude.use)claude.use('downloads').then(d=>{DL=d}).catch(()=>{});
$('#tb-dl').onclick=()=>{
const data=format(tb.fmt,cols,rows,tb.hdr),name='randomizer.'+EXT[tb.fmt];
if(DL){DL.save({filename:name,data}).catch(()=>{});return}
const a=el('a'),u=URL.createObjectURL(new Blob([data],{type:'text/plain;charset=utf-8'}));
a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000)};
return{refresh:()=>make()}}
