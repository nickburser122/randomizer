import {copy} from '../core/clipboard.js';
import {$,el} from '../core/dom.js';
import {hist} from '../core/history.js';
import {announce} from '../core/live.js';
import {rnd} from '../core/rng.js';
import {fld,txt,chip,seg,slider,spin} from '../ui/controls.js';

export const DICE_HELP='Try a formula like 2d6+1d4+3, d20, 4d6kh3 or 3d6!.';
const LIM={len:200,terms:20,dice:1000,chain:100};
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
const digits=max=>{const t=tk[i];if(!t||t.k!=='n'||t.r.length>max)return undefined;i++;return +t.r};
if(is('+')||is('-'))neg=tk[i++].k==='-';
for(;;){
const a=i,t={neg};
if(is('n')&&!(tk[i+1]&&tk[i+1].k==='d')){const v=digits(6);if(v===undefined)return null;t.c=v}
else{
t.n=1;
if(is('n')){const v=digits(3);if(v===undefined)return null;t.n=v}
if(!is('d'))return null;
i++;
const sd=digits(4);if(sd===undefined)return null;t.s=sd;
for(;;){
if(is('!')&&t.x===undefined){i++;t.x=t.s;if(is('n')){const v=digits(4);if(v===undefined)return null;t.x=v}}
else if(is('k')&&t.keep===undefined){const h=tk[i++].h,v=digits(3);if(v===undefined)return null;t.keep=v;t.high=h}
else break}}
t.raw=tk.slice(a,i).map(x=>x.r).join('');
terms.push(t);
if(i>=tk.length)break;
if(is('+')||is('-'))neg=tk[i++].k==='-';else return null;
if(i>=tk.length)return null}
return terms}
export function rollTerm(t){
const rolls=[],exploded=[];
for(let q=0;q<t.n;q++){
let v=1+rnd(t.s);rolls.push(v);
for(let e=0;t.x&&v>=t.x&&e<LIM.chain;e++){exploded.push(rolls.length-1);v=1+rnd(t.s);rolls.push(v)}}
let kept=rolls;
if(t.keep!==undefined){const k=Math.min(rolls.length,Math.max(1,t.keep));kept=rolls.slice().sort((x,y)=>t.high?y-x:x-y).slice(0,k)}
return{rolls,exploded,kept,sum:kept.reduce((x,y)=>x+y,0)}}
export function parseDice(text){
const terms=parseTerms(tokenize(text));
if(!terms)return{error:DICE_HELP};
const dice=terms.filter(t=>t.s!==undefined);
if(!dice.length)return{error:DICE_HELP};
if(terms.length>LIM.terms)return{error:'Use at most '+LIM.terms+' terms in one formula.'};
for(const t of dice){
if(t.n<1||t.s<2)return{error:DICE_HELP};
if(t.x!==undefined&&(t.x<2||t.x>t.s))return{error:'Explode on a number from 2 up to the number of sides, like 3d6!5.'}}
if(dice.reduce((q,t)=>q+t.n,0)>LIM.dice)return{error:'Use at most '+LIM.dice+' dice in one formula.'};
const multi=terms.length>1,subs=multi&&(dice.length>1||dice.some(t=>t.keep!==undefined||t.x!==undefined));
let total=0,detail='';
const parts=terms.map((t,i)=>{
const sg=t.neg?-1:1,op=i?(t.neg?' - ':' + '):(t.neg?'-':'');
if(t.c!==undefined){total+=sg*t.c;detail+=op+t.c;return{raw:t.raw,neg:t.neg,sum:t.c}}
const r=rollTerm(t);total+=sg*r.sum;
const list=r.rolls.map((v,j)=>v+(r.exploded.includes(j)?'!':'')).join(', ');
detail+=op+t.raw+' ['+list+']'+(t.keep!==undefined?' keep '+r.kept.join(', '):'')+(subs?' = '+r.sum:'');
return{raw:t.raw,neg:t.neg,...r}});
return{total,detail,parts}}
export function rollNumber(R){
const a=Math.round(+R.min),b=Math.round(+R.max);
if(Math.abs(a)>1e15||Math.abs(b)>1e15)return{error:'Use numbers below one quadrillion.'};
if(isNaN(a)||isNaN(b))return{error:'Enter whole numbers for the smallest and largest value.'};
const lo=Math.min(a,b),span=Math.abs(b-a)+1,c=R.uni?Math.min(R.cnt,span):R.cnt,out=[],z=new Set();
while(out.length<c){const x=lo+rnd(span);if(R.uni){if(z.has(x))continue;z.add(x)}out.push(x)}
return{text:out.join(', '),multi:c>1,detail:R.uni&&R.cnt>span?'Only '+span+' unique numbers fit in that range':lo+' to '+(lo+span-1)}}
export function init(){
const R={mode:'dice',f:'2d6',min:'1',max:'100',cnt:1,uni:0},tally={h:0,t:0};
let rlcur='';
const bad=m=>{const o=$('#rl-out');o.className='big empty';o.textContent=m;$('#rl-e').textContent='';rlcur='';announce(m)};
function runRl(){
const o=$('#rl-out'),e=$('#rl-e');o.className='big txt';
if(R.mode==='coin'){const h=rnd(2);tally[h?'h':'t']++;rlcur=h?'Heads':'Tails';o.textContent=rlcur;e.textContent='Heads '+tally.h+', Tails '+tally.t;hist('rl',rlcur);announce(rlcur);return}
if(R.mode==='dice'){const r=parseDice(R.f);if(r.error)return bad(r.error);rlcur=String(r.total);o.textContent=rlcur;e.textContent=r.detail;hist('rl',rlcur);announce('Rolled '+rlcur+'. '+r.detail);return}
const r=rollNumber(R);if(r.error)return bad(r.error);rlcur=r.text;o.textContent=rlcur;o.classList.toggle('sm',r.multi);e.textContent=r.detail;hist('rl',rlcur);announce('Rolled '+rlcur)}
(function(){
const c=$('#rl-ctl'),gp=(m,l,x,full)=>{const g=fld(l,x);g.dataset.r=m;if(full)g.classList.add('full');c.append(g)};
const sy=()=>c.querySelectorAll('[data-r]').forEach(g=>g.hidden=!g.dataset.r.split(' ').includes(R.mode));
const sw=fld('What to roll',seg([['dice','Dice'],['coin','Coin'],['number','Number']],R.mode,k=>{R.mode=k;sy();runRl()}));sw.classList.add('full');c.append(sw);
const fi=txt(R.f,v=>{R.f=v},'2d6+3');fi.onkeydown=e=>{if(e.key==='Enter')runRl()};
gp('dice','Dice formula, like 2d6+1d4+3 or 4d6kh3',fi);
const q=el('div','row');
[['d4','1d4'],['d6','1d6'],['d8','1d8'],['d10','1d10'],['d12','1d12'],['d20','1d20'],['d100','1d100'],['Advantage','2d20kh1'],['Disadvantage','2d20kl1']].forEach(([l,f])=>{const b=el('button','chip',l);b.type='button';b.onclick=()=>{R.f=f;fi.value=f;runRl()};q.append(b)});
gp('dice','Quick roll',q,1);
gp('dice','Notation',el('p','sub','Add terms with + or -. kh3 keeps the highest 3 dice and kl3 the lowest 3. A ! after the dice rolls another die whenever one lands on the highest value; !5 does it on 5 or more. Exploded dice are marked with ! in the breakdown.'),1);
gp('number','Smallest',txt(R.min,v=>{R.min=v},'1'));
gp('number','Largest',txt(R.max,v=>{R.max=v},'100'));
gp('number','How many',slider(R,'cnt',1,50,()=>runRl()));
const u=el('div','row');u.append(chip('No repeats',R,'uni',()=>runRl()));
gp('number','Options',u);
sy()})();
$('#rl-g').onclick=function(){spin(this);runRl()};
$('#rl-cp').onclick=function(){if(rlcur)copy(rlcur,this)};
return{refresh:()=>runRl()}}
