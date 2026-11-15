import {copy} from '../core/clipboard.js';
import {$,el} from '../core/dom.js';
import {hist} from '../core/history.js';
import {rnd} from '../core/rng.js';
import {saveJSON,restore} from '../core/storage.js';
import {fld,txt,dd,slider,spin} from '../ui/controls.js';
import {paint} from '../ui/paint.js';

export const AZ='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',AB={hex:'0123456789abcdef',b64:AZ+'-_',b62:AZ};
export const hx=(h,s,l)=>{s/=100;l/=100;const k=n=>(n+h/30)%12,a=s*Math.min(l,1-l),f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));return'#'+[f(0),f(8),f(4)].map(x=>Math.round(x*255).toString(16).padStart(2,'0')).join('')};
export function makeTokens(Tk){
const r=[];for(let i=0;i<Tk.count;i++){let t='';if(Tk.kind==='uuid')t=crypto.randomUUID();else{const a=AB[Tk.kind];for(let j=0;j<Tk.len;j++)t+=a[rnd(a.length)]}r.push(Tk.pre+t)}
return r}
export function makePalette(Tk){
const base=rnd(360),vv=Tk.style==='vivid',cs=[];
for(let i=0;i<Tk.n;i++){const h=Tk.harm==='analogous'?base+i*26:Tk.harm==='complement'?base+(i%2?180:0)+Math.floor(i/2)*22:rnd(360);cs.push(hx(h%360,vv?60+rnd(26):22+rnd(20),vv?42+rnd(26):38+rnd(42)))}
return cs}
export function init(){
const Tk={mode:'token',kind:'b62',len:32,pre:'',count:1,harm:'analogous',style:'calm',n:5};
restore(Tk,'rz-tk',{mode:['token','color'],kind:['b62','hex','b64','uuid'],harm:['analogous','complement','random'],style:['calm','vivid'],count:[1,5,10]});
let tkcur='';
function runTk(){
saveJSON('rz-tk',Tk);
const o=$('#tk-out'),l=$('#tk-list'),sw=$('#tk-sw'),e=$('#tk-e');
l.textContent='';
if(Tk.mode==='token'){
sw.hidden=true;o.hidden=false;
const r=makeTokens(Tk);
tkcur=r.join('\n');o.innerHTML=paint(r[0]);o.style.fontSize=r[0].length>60?'16px':r[0].length>36?'19px':'';
r.slice(1).forEach(t=>{const x=el('button','li');x.innerHTML=paint(t);x.onclick=()=>copy(t,x);l.append(x)});
e.textContent=Tk.kind==='uuid'?'122 random bits':Math.round(Tk.len*Math.log2(AB[Tk.kind].length))+' bits of entropy';hist('tk',tkcur)}
else{
o.hidden=true;sw.hidden=false;sw.textContent='';
const cs=makePalette(Tk);
cs.forEach(c=>{const b=el('button','',c),n=[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));b.style.background=c;b.style.color=(.299*n[0]+.587*n[1]+.114*n[2])/255>.6?'#111':'#fff';b.onclick=()=>copy(c,b);sw.append(b)});
tkcur=cs.join('\n');e.textContent=cs.length+' colors, tap one to copy it';hist('tk',tkcur)}}
(function(){
const c=$('#tk-ctl'),gp=(m,l,x,full)=>{const g=fld(l,x);g.dataset.m=m;if(full)g.classList.add('full');c.append(g)};
const sy=()=>c.querySelectorAll('[data-m]').forEach(g=>g.hidden=!g.dataset.m.split(' ').includes(Tk.mode==='color'?'color':Tk.kind==='uuid'?'token':'token len'));
const seg=el('div','tabs');
[['token','Token'],['color','Color palette']].forEach(([k,l])=>{const b=el('button','tab'+(k===Tk.mode?' on':''),l);b.onclick=()=>{Tk.mode=k;seg.childNodes.forEach(x=>x.classList.toggle('on',x===b));sy();runTk()};seg.append(b)});
const sw=el('div','f full');sw.append(el('span','lb','What to make'),seg);c.append(sw);
gp('token len','Kind',dd([['b62','Alphanumeric'],['hex','Hex'],['b64','Base64, URL-safe'],['uuid','UUID v4']],Tk.kind,v=>{Tk.kind=v;sy();runTk()}));
gp('token len','Length',slider(Tk,'len',8,128,()=>runTk()));
gp('token len','Prefix, like sk_live_',txt(Tk.pre,v=>{Tk.pre=v;runTk()},'optional'));
gp('token len','How many',dd([['1','One'],['5','5 at once'],['10','10 at once']],String(Tk.count),v=>{Tk.count=+v;runTk()}));
gp('color','Harmony',dd([['analogous','Analogous'],['complement','Complementary'],['random','Random']],Tk.harm,v=>{Tk.harm=v;runTk()}));
gp('color','Mood',dd([['calm','Calm'],['vivid','Vivid']],Tk.style,v=>{Tk.style=v;runTk()}));
gp('color','Colors',slider(Tk,'n',3,8,()=>runTk()));
sy()})();
$('#tk-g').onclick=function(){spin(this);runTk()};
$('#tk-cp').onclick=function(){if(tkcur)copy(tkcur,this)};
return{refresh:()=>runTk()}}
