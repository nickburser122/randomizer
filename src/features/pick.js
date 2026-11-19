import {copy} from '../core/clipboard.js';
import {$,el} from '../core/dom.js';
import {hist} from '../core/history.js';
import {t} from '../core/i18n.js';
import {announce} from '../core/live.js';
import {rnd,rf} from '../core/rng.js';
import {get,saveJSON,restore} from '../core/storage.js';
import {fld,txt,chip,dd,seg,slider,spin} from '../ui/controls.js';

export const MAX_LISTS=20,MAX_NAME=40,MAX_TEXT=20000;
export const listName=n=>t('List {n}',{n});
export function readLists(raw){
let o=null;
if(typeof raw==='string'){try{o=JSON.parse(raw)}catch(e){o=null}}else o=raw;
let lists=[],cur=0;
if(o&&typeof o==='object'&&!Array.isArray(o)&&Array.isArray(o.lists)){
lists=o.lists.filter(x=>x&&typeof x==='object'&&typeof x.text==='string').slice(0,MAX_LISTS).map((x,i)=>({name:typeof x.name==='string'&&x.name.trim()?x.name.trim().slice(0,MAX_NAME):listName(i+1),text:x.text.slice(0,MAX_TEXT)}));
cur=Number.isInteger(o.cur)?o.cur:0}
else if(typeof raw==='string'&&raw.trim())lists=[{name:listName(1),text:raw.slice(0,MAX_TEXT)}];
if(!lists.length)lists=[{name:listName(1),text:''}];
return{lists,cur:Math.max(0,Math.min(lists.length-1,cur))}}
export function addList(L){
if(L.lists.length>=MAX_LISTS)return{error:t('You can keep up to {max} lists. Delete one first.',{max:MAX_LISTS})};
let n=L.lists.length+1;const names=new Set(L.lists.map(x=>x.name));
while(names.has(listName(n)))n++;
return{lists:[...L.lists,{name:listName(n),text:''}],cur:L.lists.length}}
export function removeList(L,i){
if(!L.lists[i])return L;
const lists=L.lists.filter((_,j)=>j!==i);
if(!lists.length)return{lists:[{name:listName(1),text:''}],cur:0};
return{lists,cur:Math.max(0,Math.min(lists.length-1,L.cur>i?L.cur-1:L.cur))}}
export function parseItems(text,dedupe){let a=text.split(/[\n,]+/).map(x=>x.trim()).filter(Boolean).map(x=>{const m=x.match(/^(.*?)\s*\*\s*(\d+(?:\.\d+)?)$/);return m&&m[1]?{t:m[1],w:+m[2]||1}:{t:x,w:1}});if(dedupe){const z=new Set();a=a.filter(x=>!z.has(x.t)&&z.add(x.t))}return a}
export function draw(a,n){const pool=a.slice(),out=[];while(out.length<n&&pool.length){let r=rf()*pool.reduce((q,x)=>q+x.w,0),i=0;for(;i<pool.length-1;i++){r-=pool[i].w;if(r<0)break}out.push(pool.splice(i,1)[0])}return out}
export const itemsNote=n=>t('{n} {n|item|items}',{n});
export function pickResult(a,K,used){
let lines=[],note=itemsNote(a.length);
if(K.mode==='pick'){let pool=K.norep?a.filter(x=>!used.has(x.t)):a,fresh='';if(!pool.length){used.clear();pool=a;fresh=t('List used up, starting over.')+' '}const d=draw(pool,K.n);if(K.norep){d.forEach(x=>used.add(x.t));note=fresh+t('{a} of {b} drawn',{a:used.size,b:a.length})}lines=d.map(x=>x.t)}
else{const s=a.map(x=>x.t);for(let i=s.length-1;i>0;i--){const j=rnd(i+1);[s[i],s[j]]=[s[j],s[i]]}
if(K.mode==='shuffle')lines=s.map((x,i)=>(i+1)+'. '+x);
else{const g=Array.from({length:K.teams},()=>[]);s.forEach((x,i)=>g[i%K.teams].push(x));lines=g.map((m,i)=>t('Team {n}: {members}',{n:i+1,members:m.join(', ')}))}}
return{lines,note}}
export function init(){
const K={mode:'pick',n:1,teams:2,dedupe:1,norep:0};
restore(K,'rz-k',{mode:['pick','shuffle','teams']});
const pkc=$('#pk-ctl'),pkt=$('#pk-t');
let L=readLists(get('rz-list',''));
pkt.maxLength=MAX_TEXT;
let used=new Set(),pkcur='',armed=0,ls=null,nameIn=null,delB=null;
const saveK=()=>saveJSON('rz-k',K),saveL=()=>saveJSON('rz-list',L);
const kSync=()=>pkc.querySelectorAll('[data-k]').forEach(g=>g.hidden=!g.dataset.k.split(' ').includes(K.mode));
function runPk(){
const a=parseItems(pkt.value,K.dedupe),o=$('#pk-out'),e=$('#pk-e');
o.className='big txt';
if(!a.length){pkcur='';o.className='big empty';o.textContent=t('Paste or type a list below, then press the ball.');e.textContent='';return}
const {lines,note}=pickResult(a,K,used);
pkcur=lines.join('\n');o.textContent=pkcur;o.classList.toggle('sm',lines.length>1);e.textContent=note;hist('pk',pkcur);announce(lines.join('. '))}
function drawLists(){
ls.textContent='';
const d=dd(L.lists.map((x,i)=>[String(i),x.name]),String(L.cur),v=>{L.cur=+v;saveL();pkt.value=L.lists[L.cur].text;nameIn.value=L.lists[L.cur].name;used.clear();pkt.oninput();});
ls.append(d);
d.querySelector('.dd-b').setAttribute('aria-label',t('Saved list: {name}',{name:L.lists[L.cur].name}))}
function disarm(){armed=0;if(delB)delB.textContent=t('Delete list')}
(function(){
const sw=fld(t('What to do'),seg([['pick',t('Pick')],['shuffle',t('Shuffle')],['teams',t('Teams')]],K.mode,k=>{K.mode=k;kSync();saveK();runPk()}));sw.classList.add('full');pkc.append(sw);
const gp=(k,l,c,full)=>{const g=fld(l,c);g.dataset.k=k;if(full)g.classList.add('full');pkc.append(g)};
gp('pick',t('Items to pick'),slider(K,'n',1,20,()=>{saveK();runPk()}));
gp('teams',t('Number of teams'),slider(K,'teams',2,12,()=>{saveK();runPk()}));
const r=el('div','row');
r.append(chip(t('Ignore duplicates'),K,'dedupe',()=>{saveK();runPk()}),chip(t('Never repeat until used up'),K,'norep',()=>{used.clear();saveK()}));
gp('pick shuffle teams',t('Options'),r,1);
gp('pick',t('Weights'),el('p','sub',t('Add *3 after an item to make it three times as likely, like Chloe*3.')),1);
kSync();
const box=el('div','sc');
ls=el('div');
const row=el('div','row'),nb=el('button','btn',t('New list'));
delB=el('button','btn',t('Delete list'));nb.type=delB.type='button';
nameIn=txt(L.lists[L.cur].name,v=>{L.lists[L.cur].name=v.trim()?v.slice(0,MAX_NAME):listName(L.cur+1);saveL();drawLists()},'');
nameIn.maxLength=MAX_NAME;nameIn.setAttribute('aria-label',t('List name'));
nameIn.onblur=()=>{nameIn.value=L.lists[L.cur].name};
nb.onclick=()=>{disarm();const n=addList(L);if(n.error){announce(n.error);box.querySelector('.err').textContent=n.error;box.querySelector('.err').hidden=false;return}box.querySelector('.err').hidden=true;L=n;saveL();pkt.value='';nameIn.value=L.lists[L.cur].name;used.clear();drawLists();pkt.oninput();pkt.focus();announce(t('List “{name}” created',{name:L.lists[L.cur].name}))};
delB.onclick=()=>{
if(!armed){armed=1;delB.textContent=t('Tap again to delete');setTimeout(disarm,3000);return}
disarm();const gone=L.lists[L.cur].name;L=removeList(L,L.cur);saveL();pkt.value=L.lists[L.cur].text;nameIn.value=L.lists[L.cur].name;used.clear();drawLists();pkt.oninput();announce(t('List “{name}” deleted',{name:gone}))};
const er=el('p','err');er.hidden=true;er.setAttribute('role','alert');
row.append(nb,delB);
box.append(ls,nameIn,row,er);
const f=fld(t('Saved lists'),box);f.classList.add('full');
pkt.closest('.f').before(f);
drawLists()})();
pkt.value=L.lists[L.cur].text;
pkt.oninput=()=>{used.clear();L.lists[L.cur].text=pkt.value;saveL();$('#pk-e').textContent=itemsNote(parseItems(pkt.value,K.dedupe).length)};
$('#pk-g').onclick=function(){spin(this);runPk()};
$('#pk-cp').onclick=function(){if(pkcur)copy(pkcur,this)};
return{refresh:()=>runPk()}}
