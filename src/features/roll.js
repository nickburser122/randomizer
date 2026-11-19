import {copy} from '../core/clipboard.js';
import {$,el} from '../core/dom.js';
import {hist} from '../core/history.js';
import {t,nf} from '../core/i18n.js';
import {announce} from '../core/live.js';
import {rnd,withSeed} from '../core/rng.js';
import {loadJSON,saveJSON} from '../core/storage.js';
import {fld,txt,chip,seg,slider,spin} from '../ui/controls.js';

export const DICE_HELP=t('Try a formula like 2d6+1d4+3, d20, 4d6kh3 or 3d6!.');
const LIM={len:200,terms:20,dice:1000,chain:100};
export const STATS={samples:20000,bins:24,cells:20000,work:4e7};
export function tokenize(src){
const f=String(src).replace(/\s/g,'').toLowerCase(),out=[];
if(f.length>LIM.len)return null;
for(let i=0;i<f.length;){
const c=f[i];
if(c>='0'&&c<='9'){let j=i;while(f[j]>='0'&&f[j]<='9')j++;out.push({k:'n',r:f.slice(i,j)});i=j}
else if(c==='d'||c==='!'||c==='+'||c==='-'){out.push({k:c,r:c});i++}
else if(c==='k'&&(f[i+1]==='h'||f[i+1]==='l')){out.push({k:'k',h:f[i+1]==='h',r:f.slice(i,i+2)});i+=2}
else return null}
return out}
export function parseTerms(tk){
if(!tk||!tk.length)return null;
const terms=[];let i=0,neg=false;
const is=k=>tk[i]&&tk[i].k===k;
const digits=max=>{const x=tk[i];if(!x||x.k!=='n'||x.r.length>max)return undefined;i++;return +x.r};
if(is('+')||is('-'))neg=tk[i++].k==='-';
for(;;){
const a=i,x={neg};
if(is('n')&&!(tk[i+1]&&tk[i+1].k==='d')){const v=digits(6);if(v===undefined)return null;x.c=v}
else{
x.n=1;
if(is('n')){const v=digits(3);if(v===undefined)return null;x.n=v}
if(!is('d'))return null;
i++;
const sd=digits(4);if(sd===undefined)return null;x.s=sd;
for(;;){
if(is('!')&&x.x===undefined){i++;x.x=x.s;if(is('n')){const v=digits(4);if(v===undefined)return null;x.x=v}}
else if(is('k')&&x.keep===undefined){const h=tk[i++].h,v=digits(3);if(v===undefined)return null;x.keep=v;x.high=h}
else break}}
x.raw=tk.slice(a,i).map(y=>y.r).join('');
terms.push(x);
if(i>=tk.length)break;
if(is('+')||is('-'))neg=tk[i++].k==='-';else return null;
if(i>=tk.length)return null}
return terms}
export function rollTerm(x){
const rolls=[],exploded=[];
for(let q=0;q<x.n;q++){
let v=1+rnd(x.s);rolls.push(v);
for(let e=0;x.x&&v>=x.x&&e<LIM.chain;e++){exploded.push(rolls.length-1);v=1+rnd(x.s);rolls.push(v)}}
let kept=rolls;
if(x.keep!==undefined){const k=Math.min(rolls.length,Math.max(1,x.keep));kept=rolls.slice().sort((a,b)=>x.high?b-a:a-b).slice(0,k)}
return{rolls,exploded,kept,sum:kept.reduce((a,b)=>a+b,0)}}
export function compileDice(text){
const terms=parseTerms(tokenize(text));
if(!terms)return{error:DICE_HELP};
const dice=terms.filter(x=>x.s!==undefined);
if(!dice.length)return{error:DICE_HELP};
if(terms.length>LIM.terms)return{error:t('Use at most {max} terms in one formula.',{max:LIM.terms})};
for(const x of dice){
if(x.n<1||x.s<2)return{error:DICE_HELP};
if(x.x!==undefined&&(x.x<2||x.x>x.s))return{error:t('Explode on a number from 2 up to the number of sides, like 3d6!5.')}}
if(dice.reduce((q,x)=>q+x.n,0)>LIM.dice)return{error:t('Use at most {max} dice in one formula.',{max:LIM.dice})};
return{terms,dice}}
export function parseDice(text){
const c=compileDice(text);
if(c.error)return{error:c.error};
const {terms,dice}=c,multi=terms.length>1,subs=multi&&(dice.length>1||dice.some(x=>x.keep!==undefined||x.x!==undefined));
let total=0,detail='';
const parts=terms.map((x,i)=>{
const sg=x.neg?-1:1,op=i?(x.neg?' - ':' + '):(x.neg?'-':'');
if(x.c!==undefined){total+=sg*x.c;detail+=op+x.c;return{raw:x.raw,neg:x.neg,sum:x.c}}
const r=rollTerm(x);total+=sg*r.sum;
const list=r.rolls.map((v,j)=>v+(r.exploded.includes(j)?'!':'')).join(', ');
detail+=op+x.raw+' ['+list+']'+(x.keep!==undefined?t(' keep {dice}',{dice:r.kept.join(', ')}):'')+(subs?' = '+r.sum:'');
return{raw:x.raw,neg:x.neg,...r}});
return{total,detail,parts}}
const uniform=(n,s)=>{
let d=Float64Array.of(1);
for(let i=0;i<n;i++){
const L=d.length,P=new Float64Array(L+1),o=new Float64Array(L+s-1);
for(let j=0;j<L;j++)P[j+1]=P[j]+d[j];
for(let j=0;j<o.length;j++)o[j]=(P[Math.min(j,L-1)+1]-P[Math.max(0,j-s+1)])/s;
d=o}
return d};
const flip=d=>Float64Array.from(d).reverse();
function exactDist(terms){
let cur={lo:0,p:Float64Array.of(1)},work=0;
for(const x of terms){
let lo,p;
if(x.c!==undefined){lo=x.c;p=Float64Array.of(1)}
else{
if(x.keep!==undefined||x.x!==undefined)return null;
work+=x.n*x.n*x.s;if(work>STATS.work)return null;
lo=x.n;p=uniform(x.n,x.s)}
if(x.neg){lo=-(lo+p.length-1);p=flip(p)}
if(cur.p.length*p.length>STATS.work/4||cur.p.length+p.length>STATS.cells)return null;
const o=new Float64Array(cur.p.length+p.length-1);
for(let i=0;i<cur.p.length;i++)if(cur.p[i])for(let j=0;j<p.length;j++)o[i+j]+=cur.p[i]*p[j];
cur={lo:cur.lo+lo,p:o}}
return cur}
export function binsOf(lo,p,count){
const span=p.length,w=Math.max(1,Math.ceil(span/count)),out=[];
for(let i=0;i<span;i+=w){let q=0;for(let j=i;j<Math.min(span,i+w);j++)q+=p[j];out.push({lo:lo+i,hi:lo+Math.min(span,i+w)-1,p:q})}
return out}
export function diceStats(text){
const c=compileDice(text);
if(c.error)return{error:c.error};
const {terms}=c,ex=exactDist(terms);
const mm=(()=>{let lo=0,hi=0;for(const x of terms){const sg=x.neg?-1:1;let a,b;
if(x.c!==undefined)a=b=x.c;
else{const k=x.keep!==undefined?Math.min(x.n,Math.max(1,x.keep)):x.n;a=k;b=x.x!==undefined?Infinity:k*x.s}
if(sg>0){lo+=a;hi+=b}else{lo-=b;hi-=a}}
return{lo,hi}})();
if(ex){
let mean=0,m2=0,best=0;
ex.p.forEach((q,i)=>{const v=ex.lo+i;mean+=q*v;m2+=q*v*v;if(q>ex.p[best])best=i});
return{exact:true,min:ex.lo,max:ex.lo+ex.p.length-1,mean,sd:Math.sqrt(Math.max(0,m2-mean*mean)),mode:ex.lo+best,bins:binsOf(ex.lo,ex.p,STATS.bins)}}
const r=withSeed('stats:'+text,()=>{
const tot=new Array(STATS.samples);let a=Infinity,b=-Infinity,sum=0,sq=0;
for(let i=0;i<STATS.samples;i++){let v=0;for(const x of terms){v+=(x.neg?-1:1)*(x.c!==undefined?x.c:rollTerm(x).sum)}tot[i]=v;sum+=v;sq+=v*v;if(v<a)a=v;if(v>b)b=v}
return{tot,a,b,sum,sq}});
const n=STATS.samples,mean=r.sum/n,lo=Math.min(r.a,mm.lo),hi=Math.max(r.b,Number.isFinite(mm.hi)?mm.hi:r.b),w=Math.max(1,Math.ceil((hi-lo+1)/STATS.bins)),cnt=new Float64Array(Math.ceil((hi-lo+1)/w));
for(const v of r.tot)cnt[Math.floor((v-lo)/w)]++;
const bins=Array.from(cnt,(q,i)=>({lo:lo+i*w,hi:Math.min(hi,lo+(i+1)*w-1),p:q/n}));
return{exact:false,min:mm.lo,max:Number.isFinite(mm.hi)?mm.hi:null,mean,sd:Math.sqrt(Math.max(0,r.sq/n-mean*mean)),mode:null,bins}}
export const readTally=o=>{const f=v=>Number.isInteger(v)&&v>=0&&v<=1e9?v:0;return o&&typeof o==='object'?{h:f(o.h),t:f(o.t)}:{h:0,t:0}};
export function rollNumber(R){
const a=Math.round(+R.min),b=Math.round(+R.max);
if(Math.abs(a)>1e15||Math.abs(b)>1e15)return{error:t('Use numbers below one quadrillion.')};
if(isNaN(a)||isNaN(b))return{error:t('Enter whole numbers for the smallest and largest value.')};
const lo=Math.min(a,b),span=Math.abs(b-a)+1,c=R.uni?Math.min(R.cnt,span):R.cnt,out=[],z=new Set();
while(out.length<c){const x=lo+rnd(span);if(R.uni){if(z.has(x))continue;z.add(x)}out.push(x)}
return{text:out.join(', '),multi:c>1,detail:R.uni&&R.cnt>span?t('Only {n} unique numbers fit in that range',{n:span}):t('{a} to {b}',{a:lo,b:lo+span-1})}}
export function init(){
const R={mode:'dice',f:'2d6',min:'1',max:'100',cnt:1,uni:0},tally=readTally(loadJSON('rz-rt',null));
let rlcur='',lastTotal=null,tl=null,hs=null,hb=null;
const bad=m=>{const o=$('#rl-out');o.className='big empty';o.textContent=m;$('#rl-e').textContent='';rlcur='';announce(m)};
const tallyText=()=>t('Heads {h}, Tails {t}',{h:tally.h,t:tally.t});
function drawOdds(){
if(!hs)return;
const s=diceStats(R.f);
hb.textContent='';
if(s.error){hs.textContent=s.error;hb.hidden=true;return}
hb.hidden=false;
const top=Math.max(...s.bins.map(b=>b.p));
s.bins.forEach(b=>{const i=el('i');i.style.height=Math.max(2,Math.round(b.p/top*100))+'%';i.dataset.lo=b.lo;i.dataset.hi=b.hi;if(lastTotal!==null&&lastTotal>=b.lo&&lastTotal<=b.hi)i.className='on';hb.append(i)});
const f=x=>nf(Math.round(x*100)/100),range=s.max===null?t('{a} or more',{a:nf(s.min)}):t('{a} to {b}',{a:nf(s.min),b:nf(s.max)});
const line=t('Range {r}, average {m}, spread {sd}.',{r:range,m:f(s.mean),sd:f(s.sd)})+(s.mode!==null?' '+t('Most likely {v}.',{v:nf(s.mode)}):'')+(s.exact?'':' '+t('Estimated from {n} simulated rolls.',{n:nf(STATS.samples)}));
hs.textContent=line;hb.setAttribute('aria-label',line)}
let oddsT=0;
const odds=()=>{clearTimeout(oddsT);oddsT=setTimeout(drawOdds,200)};
function runRl(){
const o=$('#rl-out'),e=$('#rl-e');o.className='big txt';
if(R.mode==='coin'){const h=rnd(2);tally[h?'h':'t']++;saveJSON('rz-rt',tally);rlcur=h?t('Heads'):t('Tails');o.textContent=rlcur;e.textContent=tallyText();if(tl)tl.textContent=tallyText();hist('rl',rlcur);announce(rlcur);return}
if(R.mode==='dice'){const r=parseDice(R.f);if(r.error)return bad(r.error);rlcur=String(r.total);lastTotal=r.total;o.textContent=rlcur;e.textContent=r.detail;hist('rl',rlcur);announce(t('Rolled {n}. {detail}',{n:rlcur,detail:r.detail}));drawOdds();return}
const r=rollNumber(R);if(r.error)return bad(r.error);rlcur=r.text;o.textContent=rlcur;o.classList.toggle('sm',r.multi);e.textContent=r.detail;hist('rl',rlcur);announce(t('Rolled {n}',{n:rlcur}))}
(function(){
const c=$('#rl-ctl'),gp=(m,l,x,full)=>{const g=fld(l,x);g.dataset.r=m;if(full)g.classList.add('full');c.append(g)};
const sy=()=>c.querySelectorAll('[data-r]').forEach(g=>g.hidden=!g.dataset.r.split(' ').includes(R.mode));
const sw=fld(t('What to roll'),seg([['dice',t('Dice')],['coin',t('Coin')],['number',t('Number')]],R.mode,k=>{R.mode=k;sy();runRl()}));sw.classList.add('full');c.append(sw);
const fi=txt(R.f,v=>{R.f=v;lastTotal=null;odds()},'2d6+3');fi.onkeydown=e=>{if(e.key==='Enter')runRl()};
gp('dice',t('Dice formula, like 2d6+1d4+3 or 4d6kh3'),fi);
const q=el('div','row');
[['d4','1d4'],['d6','1d6'],['d8','1d8'],['d10','1d10'],['d12','1d12'],['d20','1d20'],['d100','1d100'],[t('Advantage'),'2d20kh1'],[t('Disadvantage'),'2d20kl1']].forEach(([l,f])=>{const b=el('button',/^d\d+$/.test(l)?'chip raw':'chip',l);b.type='button';b.onclick=()=>{R.f=f;fi.value=f;lastTotal=null;drawOdds();runRl()};q.append(b)});
gp('dice',t('Quick roll'),q,1);
hs=el('p','sub');hb=el('div','hist');hb.setAttribute('role','img');
const od=el('div','odds');od.append(hs,hb);
gp('dice',t('Odds'),od,1);
gp('dice',t('Notation'),el('p','sub',t('Add terms with + or -. kh3 keeps the highest 3 dice and kl3 the lowest 3. A ! after the dice rolls another die whenever one lands on the highest value; !5 does it on 5 or more. Exploded dice are marked with ! in the breakdown.')),1);
tl=el('p','sub',tallyText());
const rs=el('button','btn',t('Reset tally'));rs.type='button';
rs.onclick=()=>{tally.h=0;tally.t=0;saveJSON('rz-rt',tally);tl.textContent=tallyText();if(R.mode==='coin')$('#rl-e').textContent=tallyText();announce(t('Tally reset'))};
const tw=el('div','sc');tw.append(tl,rs);
gp('coin',t('Tally'),tw);
gp('number',t('Smallest'),txt(R.min,v=>{R.min=v},'1'));
gp('number',t('Largest'),txt(R.max,v=>{R.max=v},'100'));
gp('number',t('How many'),slider(R,'cnt',1,50,()=>runRl()));
const u=el('div','row');u.append(chip(t('No repeats'),R,'uni',()=>runRl()));
gp('number',t('Options'),u);
sy();drawOdds()})();
$('#rl-g').onclick=function(){spin(this);runRl()};
$('#rl-cp').onclick=function(){if(rlcur)copy(rlcur,this)};
return{refresh:()=>runRl()}}
