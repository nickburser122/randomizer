import {copy} from '../core/clipboard.js';
import {$,el} from '../core/dom.js';
import {hist} from '../core/history.js';
import {announce} from '../core/live.js';
import {rnd,rf} from '../core/rng.js';
import {get,set,saveJSON,restore} from '../core/storage.js';
import {fld,chip,seg,slider,spin} from '../ui/controls.js';

export function parseItems(text,dedupe){let a=text.split(/[\n,]+/).map(x=>x.trim()).filter(Boolean).map(x=>{const m=x.match(/^(.*?)\s*\*\s*(\d+(?:\.\d+)?)$/);return m&&m[1]?{t:m[1],w:+m[2]||1}:{t:x,w:1}});if(dedupe){const z=new Set();a=a.filter(x=>!z.has(x.t)&&z.add(x.t))}return a}
export function draw(a,n){const pool=a.slice(),out=[];while(out.length<n&&pool.length){let r=rf()*pool.reduce((q,x)=>q+x.w,0),i=0;for(;i<pool.length-1;i++){r-=pool[i].w;if(r<0)break}out.push(pool.splice(i,1)[0])}return out}
export function pickResult(a,K,used){
let lines=[],note=a.length+' items';
if(K.mode==='pick'){let pool=K.norep?a.filter(x=>!used.has(x.t)):a,fresh='';if(!pool.length){used.clear();pool=a;fresh='List used up, starting over. '}const d=draw(pool,K.n);if(K.norep){d.forEach(x=>used.add(x.t));note=fresh+used.size+' of '+a.length+' drawn'}lines=d.map(x=>x.t)}
else{const s=a.map(x=>x.t);for(let i=s.length-1;i>0;i--){const j=rnd(i+1);[s[i],s[j]]=[s[j],s[i]]}
if(K.mode==='shuffle')lines=s.map((t,i)=>(i+1)+'. '+t);
else{const g=Array.from({length:K.teams},()=>[]);s.forEach((t,i)=>g[i%K.teams].push(t));lines=g.map((m,i)=>'Team '+(i+1)+': '+m.join(', '))}}
return{lines,note}}
export function init(){
const K={mode:'pick',n:1,teams:2,dedupe:1,norep:0};
restore(K,'rz-k',{mode:['pick','shuffle','teams']});
const pkc=$('#pk-ctl'),pkt=$('#pk-t');
pkt.value=get('rz-list','');
let used=new Set(),pkcur='';
const saveK=()=>saveJSON('rz-k',K);
const kSync=()=>pkc.querySelectorAll('[data-k]').forEach(g=>g.hidden=!g.dataset.k.split(' ').includes(K.mode));
function runPk(){
const a=parseItems(pkt.value,K.dedupe),o=$('#pk-out'),e=$('#pk-e');
o.className='big txt';
if(!a.length){pkcur='';o.className='big empty';o.textContent='Paste or type a list below, then press the ball.';e.textContent='';return}
const {lines,note}=pickResult(a,K,used);
pkcur=lines.join('\n');o.textContent=pkcur;o.classList.toggle('sm',lines.length>1);e.textContent=note;hist('pk',pkcur);announce(lines.join('. '))}
(function(){
const sw=fld('What to do',seg([['pick','Pick'],['shuffle','Shuffle'],['teams','Teams']],K.mode,k=>{K.mode=k;kSync();saveK();runPk()}));sw.classList.add('full');pkc.append(sw);
const gp=(k,l,c,full)=>{const g=fld(l,c);g.dataset.k=k;if(full)g.classList.add('full');pkc.append(g)};
gp('pick','Items to pick',slider(K,'n',1,20,()=>{saveK();runPk()}));
gp('teams','Number of teams',slider(K,'teams',2,12,()=>{saveK();runPk()}));
const r=el('div','row');
r.append(chip('Ignore duplicates',K,'dedupe',()=>{saveK();runPk()}),chip('Never repeat until used up',K,'norep',()=>{used.clear();saveK()}));
gp('pick shuffle teams','Options',r,1);
gp('pick','Weights',el('p','sub','Add *3 after an item to make it three times as likely, like Chloe*3.'),1);
kSync()})();
pkt.oninput=()=>{used.clear();set('rz-list',pkt.value);$('#pk-e').textContent=parseItems(pkt.value,K.dedupe).length+' items'};
$('#pk-g').onclick=function(){spin(this);runPk()};
$('#pk-cp').onclick=function(){if(pkcur)copy(pkcur,this)};
return{refresh:()=>runPk()}}
