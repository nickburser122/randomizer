import {copy} from '../core/clipboard.js';
import {$,el} from '../core/dom.js';
import {hist} from '../core/history.js';
import {rnd} from '../core/rng.js';
import {fld,txt,chip,slider,spin} from '../ui/controls.js';

export function parseDice(text){
const f=text.replace(/\s/g,''),m=f.match(/^(\d{0,3})d(\d{1,4})(?:k([hl])(\d{1,3}))?([+-]\d{1,6})?$/i);
if(!m||+m[2]<2||m[1]==='0')return{error:'Try a formula like 2d6+3, d20 or 4d6kh3.'};
const n=+m[1]||1,r=[];for(let i=0;i<n;i++)r.push(1+rnd(+m[2]));
let kept=r;if(m[3]){const k=Math.min(n,Math.max(1,+m[4]||1));kept=r.slice().sort((x,y)=>m[3].toLowerCase()==='h'?y-x:x-y).slice(0,k)}
const mod=+m[5]||0,tot=kept.reduce((x,y)=>x+y,0)+mod;
return{total:tot,detail:f+': ['+r.join(', ')+']'+(m[3]?', keep '+kept.join(', '):'')+(mod?', '+(mod>0?'+':'-')+Math.abs(mod):'')}}
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
const bad=m=>{const o=$('#rl-out');o.className='big empty';o.textContent=m;$('#rl-e').textContent='';rlcur=''};
function runRl(){
const o=$('#rl-out'),e=$('#rl-e');o.className='big txt';
if(R.mode==='coin'){const h=rnd(2);tally[h?'h':'t']++;rlcur=h?'Heads':'Tails';o.textContent=rlcur;e.textContent='Heads '+tally.h+', Tails '+tally.t;hist('rl',rlcur);return}
if(R.mode==='dice'){const r=parseDice(R.f);if(r.error)return bad(r.error);rlcur=String(r.total);o.textContent=rlcur;e.textContent=r.detail;hist('rl',rlcur);return}
const r=rollNumber(R);if(r.error)return bad(r.error);rlcur=r.text;o.textContent=rlcur;o.classList.toggle('sm',r.multi);e.textContent=r.detail;hist('rl',rlcur)}
(function(){
const c=$('#rl-ctl'),gp=(m,l,x,full)=>{const g=fld(l,x);g.dataset.r=m;if(full)g.classList.add('full');c.append(g)};
const sy=()=>c.querySelectorAll('[data-r]').forEach(g=>g.hidden=!g.dataset.r.split(' ').includes(R.mode));
const seg=el('div','tabs');
[['dice','Dice'],['coin','Coin'],['number','Number']].forEach(([k,l])=>{const b=el('button','tab'+(k===R.mode?' on':''),l);b.onclick=()=>{R.mode=k;seg.childNodes.forEach(x=>x.classList.toggle('on',x===b));sy();runRl()};seg.append(b)});
const sw=el('div','f full');sw.append(el('span','lb','What to roll'),seg);c.append(sw);
const fi=txt(R.f,v=>{R.f=v},'2d6+3');fi.onkeydown=e=>{if(e.key==='Enter')runRl()};
gp('dice','Dice formula, like 2d6+3 or 4d6kh3',fi);
const q=el('div','row');
[['d4','1d4'],['d6','1d6'],['d8','1d8'],['d10','1d10'],['d12','1d12'],['d20','1d20'],['d100','1d100'],['Advantage','2d20kh1'],['Disadvantage','2d20kl1']].forEach(([l,f])=>{const b=el('button','chip',l);b.type='button';b.onclick=()=>{R.f=f;fi.value=f;runRl()};q.append(b)});
gp('dice','Quick roll',q,1);
gp('number','Smallest',txt(R.min,v=>{R.min=v},'1'));
gp('number','Largest',txt(R.max,v=>{R.max=v},'100'));
gp('number','How many',slider(R,'cnt',1,50,()=>runRl()));
const u=el('div','row');u.append(chip('No repeats',R,'uni',()=>runRl()));
gp('number','Options',u);
sy()})();
$('#rl-g').onclick=function(){spin(this);runRl()};
$('#rl-cp').onclick=function(){if(rlcur)copy(rlcur,this)};
return{refresh:()=>runRl()}}
