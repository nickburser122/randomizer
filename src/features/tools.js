import {copy} from '../core/clipboard.js';
import {$,el} from '../core/dom.js';
import {hist} from '../core/history.js';
import {t,nf} from '../core/i18n.js';
import {announce} from '../core/live.js';
import {rnd,pick,withSeed} from '../core/rng.js';
import {saveJSON,restore} from '../core/storage.js';
import {W} from '../data/words.js';
import {fld,txt,dd,seg,slider,spin,icon,label} from '../ui/controls.js';
import {paint} from '../ui/paint.js';

export const AZ='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',AB={hex:'0123456789abcdef',b64:AZ+'-_',nanoid:AZ+'-_',b62:AZ};
export const CROCKFORD='0123456789ABCDEFGHJKMNPQRSTVWXYZ',B62='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',KSUID_EPOCH=14e8;
export const FIXED=new Set(['uuid','ulid','ksuid']);
export const hx=(h,s,l)=>{s/=100;l/=100;const k=n=>(n+h/30)%12,a=s*Math.min(l,1-l),f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));return'#'+[f(0),f(8),f(4)].map(x=>Math.round(x*255).toString(16).padStart(2,'0')).join('')};
export function makeUlid(ms=Date.now(),r=rnd){
let time='',x=Math.floor(ms);
for(let i=0;i<10;i++){time=CROCKFORD[x%32]+time;x=Math.floor(x/32)}
let rest='';for(let i=0;i<16;i++)rest+=CROCKFORD[r(32)];
return time+rest}
export function makeKsuid(sec=Math.floor(Date.now()/1000),r=rnd){
const bytes=[],ts=Math.max(0,Math.min(0xFFFFFFFF,Math.floor(sec)-KSUID_EPOCH));
for(let i=3;i>=0;i--)bytes.push(Math.floor(ts/2**(8*i))%256);
for(let i=0;i<16;i++)bytes.push(r(256));
let n=bytes.reduce((a,b)=>(a<<8n)|BigInt(b),0n),s='';
while(n>0n){s=B62[Number(n%62n)]+s;n/=62n}
return s.padStart(27,'0')}
export function makeTokens(Tk,now=Date.now()){
const r=[];
for(let i=0;i<Tk.count;i++){
let s='';
if(Tk.kind==='uuid')s=crypto.randomUUID();
else if(Tk.kind==='ulid')s=makeUlid(now);
else if(Tk.kind==='ksuid')s=makeKsuid(now/1000);
else{const a=AB[Tk.kind];for(let j=0;j<Tk.len;j++)s+=a[rnd(a.length)]}
r.push(Tk.pre+s)}
return r}
export const tokenBits=Tk=>Tk.kind==='uuid'?122:Tk.kind==='ulid'?80:Tk.kind==='ksuid'?128:Tk.len*Math.log2(AB[Tk.kind].length);
export const hexRgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
export function rgbHsl([r,g,b]){
r/=255;g/=255;b/=255;
const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2,d=mx-mn;
let h=0,s=0;
if(d){s=d/(1-Math.abs(2*l-1));h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;h*=60;if(h<0)h+=360}
return[Math.round(h)%360,Math.round(s*100),Math.round(l*100)]}
export function formatColor(hex,f,i=0){
if(f==='rgb')return'rgb('+hexRgb(hex).join(', ')+')';
if(f==='hsl'){const[h,s,l]=rgbHsl(hexRgb(hex));return'hsl('+h+', '+s+'%, '+l+'%)'}
if(f==='css')return'--color-'+(i+1)+': '+hex+';';
return hex}
export const formatPalette=(cs,f)=>f==='css'?':root {\n'+cs.map((c,i)=>'  '+formatColor(c,'css',i)).join('\n')+'\n}':cs.map(c=>formatColor(c,f)).join('\n');
const lin=c=>{c/=255;return c<=.03928?c/12.92:((c+.055)/1.055)**2.4};
export const lum=h=>{const[r,g,b]=hexRgb(h);return .2126*lin(r)+.7152*lin(g)+.0722*lin(b)};
export const contrast=(a,b)=>{const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
export function textOn(hex){
const w=contrast(hex,'#ffffff'),k=contrast(hex,'#000000');
return w>=k?{color:'#ffffff',ratio:w}:{color:'#000000',ratio:k}}
export const grade=r=>r>=7?t('AAA'):r>=4.5?t('AA'):t('AA large');
export function makePalette(Tk,keep){
const lk=keep||[],ok=x=>x&&x.locked&&/^#[0-9a-f]{6}$/i.test(x.c),first=lk.findIndex(ok);
const base=first>=0?rgbHsl(hexRgb(lk[first].c))[0]:rnd(360),vv=Tk.style==='vivid',cs=[];
for(let i=0;i<Tk.n;i++){
if(ok(lk[i])){cs.push(lk[i].c.toLowerCase());continue}
const h=Tk.harm==='analogous'?base+i*26:Tk.harm==='complement'?base+(i%2?180:0)+Math.floor(i/2)*22:rnd(360);
cs.push(hx(h%360,vv?60+rnd(26):22+rnd(20),vv?42+rnd(26):38+rnd(42)))}
return cs}
export const LOREM_UNITS=['paragraphs','sentences','words'];
export const LOREM_MAX={paragraphs:50,sentences:200,words:1000};
export function makeLorem(o,seed){
const unit=LOREM_UNITS.includes(o.unit)?o.unit:'paragraphs',n=Math.max(1,Math.min(LOREM_MAX[unit],Math.round(+o.n)||1));
return withSeed(seed,()=>{
const word=()=>pick(W);
const sentence=()=>{const len=6+rnd(9),w=Array.from({length:len},word);if(len>=8&&rnd(3)===0)w[3+rnd(len-5)]+=',';const s=w.join(' ');return s[0].toUpperCase()+s.slice(1)+'.'};
const paragraph=()=>Array.from({length:3+rnd(4)},sentence).join(' ');
if(unit==='words')return Array.from({length:n},word).join(' ');
if(unit==='sentences')return Array.from({length:n},sentence).join(' ');
return Array.from({length:n},paragraph).join('\n\n')})}
export const countWords=s=>s.trim()?s.trim().split(/\s+/).length:0;
const LOCK='M7 11V8a5 5 0 0110 0v3M5 11h14v9H5z',OPEN='M7 11V8a5 5 0 019.4-2.4M5 11h14v9H5z';
export function init(){
const Tk={mode:'token',kind:'b62',len:32,pre:'',count:1,harm:'analogous',style:'calm',n:5,cf:'hex',ul:'paragraphs',ln:3,seed:''};
restore(Tk,'rz-tk',{mode:['token','color','lorem'],kind:['b62','hex','b64','nanoid','uuid','ulid','ksuid'],harm:['analogous','complement','random'],style:['calm','vivid'],cf:['hex','rgb','hsl','css'],ul:LOREM_UNITS,count:[1,5,10]});
let tkcur='',pal=[];
function drawSwatches(){
const sw=$('#tk-sw'),cs=pal.map(x=>x.c);
sw.textContent='';
pal.forEach((x,i)=>{
const c=el('div','c'),b=el('button','cp'),k=el('button','lk'),tx=textOn(x.c),g=grade(tx.ratio),v=formatColor(x.c,Tk.cf==='css'?'hex':Tk.cf,i),one=formatColor(x.c,Tk.cf,i);
b.type=k.type='button';
b.style.background=x.c;b.style.color=tx.color;
const cap=t('{ratio}:1 {grade}',{ratio:tx.ratio.toFixed(1),grade:g});
b.append(el('span','',v),' ',el('small','',cap));
b.setAttribute('aria-label',t('{value} {caption}. Copy.',{value:v,caption:cap}));
b.onclick=()=>copy(one,b);
k.setAttribute('aria-pressed',x.locked?'true':'false');k.setAttribute('aria-label',t('Lock color {n}',{n:i+1}));
k.append(icon(x.locked?LOCK:OPEN));
k.onclick=()=>{x.locked=!x.locked;drawSwatches();$('#tk-sw .c:nth-child('+(i+1)+') .lk').focus()};
c.append(b,k);sw.append(c)});
tkcur=formatPalette(cs,Tk.cf)}
function runTk(keepLocks){
saveJSON('rz-tk',Tk);
const o=$('#tk-out'),l=$('#tk-list'),sw=$('#tk-sw'),e=$('#tk-e');
l.textContent='';
if(Tk.mode==='token'){
sw.hidden=true;o.hidden=false;o.className='big';
const r=makeTokens(Tk);
tkcur=r.join('\n');o.innerHTML=paint(r[0]);o.style.fontSize=r[0].length>60?'16px':r[0].length>36?'19px':'';
r.slice(1).forEach(s=>{const x=el('button','li');x.innerHTML=paint(s);x.onclick=()=>copy(s,x);l.append(x)});
e.textContent=Tk.kind==='uuid'?t('122 random bits'):Tk.kind==='ulid'?t('80 random bits, sortable by time'):Tk.kind==='ksuid'?t('128 random bits, sortable by time'):t('{n} bits of entropy',{n:Math.round(tokenBits(Tk))});
hist('tk',tkcur);announce(r.length>1?t('{n} tokens generated, {s}',{n:r.length,s:e.textContent}):t('Token generated, {s}',{s:e.textContent}))}
else if(Tk.mode==='color'){
o.hidden=true;sw.hidden=false;
const cs=makePalette(Tk,pal);
pal=cs.map((c,i)=>({c,locked:!!(pal[i]&&pal[i].locked)}));
drawSwatches();
e.textContent=t('{n} colors, tap one to copy it',{n:cs.length});hist('tk',tkcur);announce(t('{n} colors: {list}',{n:cs.length,list:cs.join(', ')}))}
else{
sw.hidden=true;o.hidden=false;o.style.fontSize='';
const s=makeLorem({unit:Tk.ul,n:Tk.ln},Tk.seed.trim());
o.className='big txt sm';o.textContent=s;tkcur=s;
const w=countWords(s);
e.textContent=t('{n} {n|word|words}',{n:w});hist('tk',tkcur);announce(t('Text generated, {s}',{s:e.textContent}))}}
(function(){
const c=$('#tk-ctl'),gp=(m,l,x,full)=>{const g=fld(l,x);g.dataset.m=m;if(full)g.classList.add('full');c.append(g)};
const sy=()=>{const act=Tk.mode==='color'?['color']:Tk.mode==='lorem'?['lorem']:FIXED.has(Tk.kind)?['token']:['token','len'];c.querySelectorAll('[data-m]').forEach(g=>g.hidden=!g.dataset.m.split(' ').some(x=>act.includes(x)))};
const sw=fld(t('What to make'),seg([['token',t('Token')],['color',t('Color palette')],['lorem',t('Lorem text')]],Tk.mode,k=>{Tk.mode=k;sy();runTk()}));sw.classList.add('full');c.append(sw);
const lenBox=el('div'),lg=fld(t('Length'),lenBox);
const drawLen=()=>{lenBox.textContent='';const s=slider(Tk,'len',8,128,()=>runTk());lenBox.append(s);label(s,lg.querySelector('.lb').id,t('Length'))};
drawLen();
gp('token',t('Kind'),dd([['b62',t('Alphanumeric')],['hex',t('Hex')],['b64',t('Base64, URL-safe')],['nanoid',t('NanoID')],['uuid',t('UUID v4')],['ulid',t('ULID, sortable')],['ksuid',t('KSUID, sortable')]],Tk.kind,v=>{Tk.kind=v;if(v==='nanoid'){Tk.len=21;drawLen()}sy();runTk()}));
lg.dataset.m='len';c.append(lg);
gp('token',t('Prefix, like sk_live_'),txt(Tk.pre,v=>{Tk.pre=v;runTk()},t('optional')));
gp('token',t('How many'),dd([['1',t('One')],['5',t('{n} at once',{n:5})],['10',t('{n} at once',{n:10})]],String(Tk.count),v=>{Tk.count=+v;runTk()}));
gp('color',t('Harmony'),dd([['analogous',t('Analogous')],['complement',t('Complementary')],['random',t('Random')]],Tk.harm,v=>{Tk.harm=v;runTk()}));
gp('color',t('Mood'),dd([['calm',t('Calm')],['vivid',t('Vivid')]],Tk.style,v=>{Tk.style=v;runTk()}));
gp('color',t('Colors'),slider(Tk,'n',3,8,()=>runTk()));
gp('color',t('Copy as'),dd([['hex',t('Hex')],['rgb',t('RGB')],['hsl',t('HSL')],['css',t('CSS variables')]],Tk.cf,v=>{Tk.cf=v;saveJSON('rz-tk',Tk);if(pal.length)drawSwatches()}));
gp('color',t('Locked colors'),el('p','sub',t('Lock a color with the padlock to keep it when you generate again. New colors are built around it.')),1);
gp('lorem',t('Unit'),dd([['paragraphs',t('Paragraphs')],['sentences',t('Sentences')],['words',t('Words')]],Tk.ul,v=>{Tk.ul=v;runTk()}));
gp('lorem',t('Amount'),slider(Tk,'ln',1,50,()=>runTk(),1000));
gp('lorem',t('Seed, optional: the same seed repeats the same text'),txt(Tk.seed,v=>{Tk.seed=v;runTk()},t('leave empty for random')));
sy()})();
$('#tk-g').onclick=function(){spin(this);runTk()};
$('#tk-cp').onclick=function(){if(tkcur)copy(tkcur,this)};
return{refresh:()=>runTk()}}
