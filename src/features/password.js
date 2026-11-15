import {copy,scheduleClear} from '../core/clipboard.js';
import {$,el} from '../core/dom.js';
import {hist} from '../core/history.js';
import {announce} from '../core/live.js';
import {rnd,pick} from '../core/rng.js';
import {saveJSON,restore} from '../core/storage.js';
import {CS,VW} from '../data/alphabets.js';
import {W} from '../data/words.js';
import {fld,txt,chip,dd,seg,slider,spin} from '../ui/controls.js';
import {paint} from '../ui/paint.js';

export const DEFAULTS={mode:'chars',len:32,lo:1,up:1,di:1,sy:1,amb:0,each:1,norep:0,hist:0,syms:'!@#$%^&*()-_=+[]{};:,.<>?/~',words:6,sep:'-',cap:1,num:1,pin:6,syl:12,gs:3,count:1,clr:1};
export function genChars(P){
const ex=P.amb?/[Il1O0o|`'"]/g:null,sets=[];
const add=(on,s)=>{if(!on)return;if(ex)s=s.replace(ex,'');s=[...new Set(s)];if(s.length)sets.push(s)};
add(P.lo,'abcdefghijklmnopqrstuvwxyz');add(P.up,'ABCDEFGHIJKLMNOPQRSTUVWXYZ');add(P.di,'0123456789');add(P.sy,P.syms.replace(/\s/g,''));
if(!sets.length)return null;
const pool=[...new Set(sets.flat())],avail=pool.slice(),out=[];
const n=P.norep?Math.min(P.len,pool.length):P.len;
const take=a=>{const f=P.norep?a.filter(x=>avail.includes(x)):a;if(!f.length)return;const c=pick(f);out.push(c);if(P.norep)avail.splice(avail.indexOf(c),1)};
if(P.each&&n>=sets.length)sets.forEach(take);
while(out.length<n)take(pool);
for(let i=out.length-1;i>0;i--){const j=rnd(i+1);[out[i],out[j]]=[out[j],out[i]]}
return{t:out.join(''),b:out.length*Math.log2(pool.length)}}
export function genWords(P){
const a=[];for(let i=0;i<P.words;i++){const x=pick(W);a.push(P.cap?x[0].toUpperCase()+x.slice(1):x)}
const S='-.:_!@#$%&*+=?';let t='',b=P.words*Math.log2(W.length);
a.forEach((x,i)=>{if(i){if(P.sep==='rnd'){t+=pick(S);b+=Math.log2(S.length)}else t+=P.sep}t+=x});
if(P.num){if(P.sep==='rnd'){t+=pick(S);b+=Math.log2(S.length)}else t+=P.sep;t+=String(rnd(10000)).padStart(4,'0');b+=Math.log2(10000)}
return{t,b}}
export function genPron(P){
const n=CS.length*VW.length,len=Math.max(1,Math.min(64,Math.round(+P.syl)||1)),sy=[];let prev=-1,b=0;
for(let i=0;i<len;i++){
let x;
if(prev<0){x=rnd(n);b+=Math.log2(n)}else{x=rnd(n-1);if(x>=prev)x++;b+=Math.log2(n-1)}
sy.push(CS[Math.floor(x/VW.length)]+VW[x%VW.length]);prev=x}
const g=P.gs>0?Math.round(P.gs):len,parts=[];
for(let i=0;i<sy.length;i+=g)parts.push(sy.slice(i,i+g).join(''));
const j=P.gs>0?'-':'';
let t=parts.map(q=>P.cap?q[0].toUpperCase()+q.slice(1):q).join(j);
if(P.num){t+=j+String(rnd(10000)).padStart(4,'0');b+=Math.log2(10000)}
return{t,b}}
export function genPin(P){let t='';for(let i=0;i<P.pin;i++)t+=rnd(10);return{t,b:P.pin*Math.log2(10)}}
function reveal(o,t){
if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
const C='abcdefghijklmnopqrstuvwxyz0123456789!@#$%&*',a=[...t],N=9;let f=0;
o._iv=setInterval(()=>{f++;if(f>=N){clearInterval(o._iv);o.innerHTML=paint(t);return}const k=Math.floor(a.length*f/N);o.innerHTML=paint(a.map((c,i)=>i<k?c:C[rnd(C.length)]).join(''))},32)}
export function init(){
const P={...DEFAULTS};
restore(P,'rz-p',{mode:['chars','words','pin','pron'],sep:['-','.','_',' ','','rnd'],gs:[0,2,3,4],count:[1,5,10,20]});
const pc=$('#pw-ctl');
const grp=(m,l,c,full)=>{const g=fld(l,c);g.dataset.m=m;if(full)g.classList.add('full');pc.append(g);return g};
const sync=()=>{pc.querySelectorAll('[data-m]').forEach(g=>g.hidden=!g.dataset.m.split(' ').includes(P.mode))};
function buildPw(){pc.textContent='';
const sw=fld('Type',seg([['chars','Characters'],['words','Memorable words'],['pin','PIN'],['pron','Pronounceable']],P.mode,k=>{P.mode=k;sync();gen()}));sw.classList.add('full');pc.append(sw);
const ps=el('div','row');[['Strong, 24 characters',24],['Maximum, 128 characters',128]].forEach(([l,n])=>{const b=el('button','chip',l);b.type='button';b.onclick=()=>{Object.assign(P,{mode:'chars',len:n,lo:1,up:1,di:1,sy:1,amb:0,each:1,norep:0});buildPw();gen(1)};ps.append(b)});
const pf=fld('Quick start',ps);pf.classList.add('full');pc.append(pf);
grp('chars','Length',slider(P,'len',4,128,()=>gen()));
grp('words','Number of words',slider(P,'words',2,16,()=>gen()));
grp('pin','Digits',slider(P,'pin',3,24,()=>gen()));
grp('pron','Syllables',slider(P,'syl',3,24,()=>gen()));
grp('pron','Grouping',dd([['0','None'],['2','2 syllables'],['3','3 syllables'],['4','4 syllables']],String(P.gs),v=>{P.gs=+v;gen()}));
const r=el('div','row');
[['Lowercase','lo'],['Uppercase','up'],['Digits','di'],['Symbols','sy'],['No look-alikes','amb'],['One of each','each'],['No repeats','norep']].forEach(([l,k])=>r.append(chip(l,P,k,()=>gen())));
grp('chars','Include',r,1);
grp('chars','Symbols to use',txt(P.syms,v=>{P.syms=v;gen()}));
grp('words','Separator',dd([['-','Hyphen'],['.','Dot'],['_','Underscore'],[' ','Space'],['','None'],['rnd','Random symbol']],P.sep,v=>{P.sep=v;gen()}));
const w=el('div','row');w.append(chip('Capitalize',P,'cap',()=>gen()),chip('Add 4 digits',P,'num',()=>gen()));
grp('words pron','Style',w);
const pv=el('div','row');pv.append(chip('Clear clipboard after 45 seconds',P,'clr',()=>{}),chip('Keep password history',P,'hist',()=>{}));grp('chars words pin pron','Privacy',pv);
grp('chars words pin pron','How many',dd([['1','One'],['5','5 at once'],['10','10 at once'],['20','20 at once']],String(P.count),v=>{P.count=+v;gen()}));
sync()}buildPw();

let cur=[];
function gen(anim){
saveJSON('rz-p',P);
const f={chars:genChars,words:genWords,pin:genPin,pron:genPron}[P.mode],r=[];let b=0;
for(let i=0;i<P.count;i++){const x=f(P);if(!x){cur=[];const o=$('#pw-out');o.className='big empty';o.textContent='Turn on at least one character type to generate.';$('#pw-list').textContent='';$('#pw-e').textContent='';$('#pw-m').style.width='0';return}r.push(x.t);b=x.b}
cur=r;
if(P.hist)hist('pw',r[0]);
const o=$('#pw-out');o.className='big';clearInterval(o._iv);o.innerHTML=paint(r[0]);if(anim)reveal(o,r[0]);
o.style.fontSize=r[0].length>96?'15px':r[0].length>52?'19px':'';
const l=$('#pw-list');l.textContent='';
r.slice(1).forEach(t=>{const x=el('button','li');x.innerHTML=paint(t);x.onclick=()=>copy(t,x);l.append(x)});
const cb=$('#pw-cp');cb.dataset.l=cb.textContent=r.length>1?'Copy all':'Copy';
const w=b<40?'weak':b<60?'fair':b<80?'good':b<110?'strong':b<128?'very strong':'beyond brute force';
$('#pw-e').textContent=w+', '+Math.round(b)+' bits of entropy';announce((r.length>1?r.length+' passwords':'Password')+' generated, '+w+', '+Math.round(b)+' bits of entropy');
const m=$('#pw-m');m.style.width=Math.min(100,b/128*100)+'%';m.className=b>=60?'g1':''}
$('#pw-g').onclick=function(){spin(this);gen(1)};
$('#pw-cp').onclick=function(){if(!cur.length)return;copy(cur.join('\n'),this);if(P.clr)scheduleClear(45000)};
$('#pw-hd').onclick=function(){this.textContent=this.closest('.out').classList.toggle('hid')?'Show':'Hide'};
return{refresh:()=>gen()}}
