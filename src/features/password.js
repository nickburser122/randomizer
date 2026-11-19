import {copy,scheduleClear} from '../core/clipboard.js';
import {$,el} from '../core/dom.js';
import {hist} from '../core/history.js';
import {t,nf} from '../core/i18n.js';
import {announce} from '../core/live.js';
import {rnd,pick} from '../core/rng.js';
import {saveJSON,loadJSON,restore,pickValid} from '../core/storage.js';
import {AL,AN,CS,VW} from '../data/alphabets.js';
import {W,WS} from '../data/words.js';
import {fld,txt,chip,dd,seg,slider,spin} from '../ui/controls.js';
import {paint} from '../ui/paint.js';

export const DEFAULTS={mode:'chars',len:32,lo:1,up:1,di:1,sy:1,amb:0,each:1,norep:0,hist:0,syms:'!@#$%^&*()-_=+[]{};:,.<>?/~',words:6,sep:'-',cap:1,num:1,wl:'long',pin:6,syl:12,gs:3,pat:'Cvcc-Cvcc-9999',count:1,clr:1};
export const RULES={mode:['chars','words','pin','pron','pat'],sep:['-','.','_',' ','','rnd'],wl:['long','short'],gs:[0,2,3,4],count:[1,5,10,20]};
export const RANGE={len:[4,128],words:[2,16],pin:[3,24],syl:[3,24]};
export const PATTERN_MAX=128;
export const PATTERN_SYMBOLS='!@#$%&*-_=+?';
const BASE={c:'bcdfghjklmnpqrstvwxyz',v:'aeiou',l:AL,a:AN,h:'0123456789abcdef'};
export const PATTERN_CLASSES={...BASE,...Object.fromEntries(Object.entries(BASE).map(([k,v])=>[k.toUpperCase(),v.toUpperCase()])),'9':'0123456789',s:PATTERN_SYMBOLS,'*':AL+AL.toUpperCase()+'0123456789'+PATTERN_SYMBOLS};
export const PRESET_KEYS=['mode','len','lo','up','di','sy','amb','each','norep','syms','words','sep','cap','num','wl','pin','syl','gs','pat'];
export const MAX_PRESETS=12;

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
const L=P.wl==='short'?WS:W,a=[];for(let i=0;i<P.words;i++){const x=pick(L);a.push(P.cap?x[0].toUpperCase()+x.slice(1):x)}
const S='-.:_!@#$%&*+=?';let s='',b=P.words*Math.log2(L.length);
a.forEach((x,i)=>{if(i){if(P.sep==='rnd'){s+=pick(S);b+=Math.log2(S.length)}else s+=P.sep}s+=x});
if(P.num){if(P.sep==='rnd'){s+=pick(S);b+=Math.log2(S.length)}else s+=P.sep;s+=String(rnd(10000)).padStart(4,'0');b+=Math.log2(10000)}
return{t:s,b}}
export function genPron(P){
const n=CS.length*VW.length,len=Math.max(1,Math.min(64,Math.round(+P.syl)||1)),sy=[];let prev=-1,b=0;
for(let i=0;i<len;i++){
let x;
if(prev<0){x=rnd(n);b+=Math.log2(n)}else{x=rnd(n-1);if(x>=prev)x++;b+=Math.log2(n-1)}
sy.push(CS[Math.floor(x/VW.length)]+VW[x%VW.length]);prev=x}
const g=P.gs>0?Math.round(P.gs):len,parts=[];
for(let i=0;i<sy.length;i+=g)parts.push(sy.slice(i,i+g).join(''));
const j=P.gs>0?'-':'';
let s=parts.map(q=>P.cap?q[0].toUpperCase()+q.slice(1):q).join(j);
if(P.num){s+=j+String(rnd(10000)).padStart(4,'0');b+=Math.log2(10000)}
return{t:s,b}}
export function genPin(P){let s='';for(let i=0;i<P.pin;i++)s+=rnd(10);return{t:s,b:P.pin*Math.log2(10)}}
export function parsePattern(src){
const s=String(src),items=[];let rep=false;
for(let i=0;i<s.length;i++){
const c=s[i];
if(c==='{'){
const m=/^\{(\d{1,3})\}/.exec(s.slice(i)),last=items[items.length-1];
if(!m||!last||rep)return{error:t('Use a repeat count right after one item, like c{3}.')};
const n=+m[1];
if(n<1||n>PATTERN_MAX)return{error:t('A repeat count must be between 1 and {max}.',{max:PATTERN_MAX})};
for(let k=1;k<n;k++)items.push(last);
i+=m[0].length-1;rep=true;continue}
rep=false;
if(c==='\\'){
if(i+1>=s.length)return{error:t('A backslash must be followed by the character you want.')};
items.push({lit:s[++i]});continue}
if(Object.prototype.hasOwnProperty.call(PATTERN_CLASSES,c)){items.push({cls:c});continue}
if(/[A-Za-z0-9]/.test(c))return{error:t('Unknown class \u201c{c}\u201d. Put a backslash before it to use it as it is.',{c})};
items.push({lit:c})}
if(items.length>PATTERN_MAX)return{error:t('A pattern can make at most {max} characters.',{max:PATTERN_MAX})};
return{items}}
export function genPattern(P){
const r=parsePattern(P.pat);
if(r.error)return{error:r.error};
let s='',b=0;
for(const x of r.items){if(x.lit!==undefined)s+=x.lit;else{const a=PATTERN_CLASSES[x.cls];s+=a[rnd(a.length)];b+=Math.log2(a.length)}}
if(!r.items.length)return{error:t('Type a pattern, like Cvcc-999.')};
if(!b)return{error:t('Add at least one class, like c or 9, so the result is random.')};
return{t:s,b}}
export function readPreset(o){
const s=pickValid(DEFAULTS,o,RULES);
for(const k of Object.keys(s))if(!PRESET_KEYS.includes(k))delete s[k];
for(const k of Object.keys(RANGE))if(k in s)s[k]=Math.max(RANGE[k][0],Math.min(RANGE[k][1],Math.round(s[k])));
for(const k of ['syms','pat'])if(k in s)s[k]=s[k].slice(0,200);
return s}
export function cleanPresets(raw){
if(!Array.isArray(raw))return[];
const seen=new Set(),out=[];
for(const x of raw){
if(out.length>=MAX_PRESETS)break;
if(!x||typeof x!=='object'||typeof x.name!=='string')continue;
const name=x.name.trim().slice(0,40),k=name.toLowerCase();
if(!name||seen.has(k))continue;
seen.add(k);out.push({name,s:readPreset(x.s)})}
return out}
export function savePreset(list,name,P){
name=String(name).trim().slice(0,40);
if(!name)return{error:t('Give the preset a name.')};
const item={name,s:readPreset(Object.fromEntries(PRESET_KEYS.map(k=>[k,P[k]])))},i=list.findIndex(x=>x.name.toLowerCase()===name.toLowerCase());
if(i<0&&list.length>=MAX_PRESETS)return{error:t('You can keep up to {max} presets. Delete one first.',{max:MAX_PRESETS})};
const next=list.slice();
if(i<0)next.push(item);else next[i]=item;
return{list:next,name}}
export const deletePreset=(list,name)=>list.filter(x=>x.name!==name);
export const strength=b=>b<40?t('weak'):b<60?t('fair'):b<80?t('good'):b<110?t('strong'):b<128?t('very strong'):t('beyond brute force');
function reveal(o,s){
if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
const C='abcdefghijklmnopqrstuvwxyz0123456789!@#$%&*',a=[...s],N=9;let f=0;
o._iv=setInterval(()=>{f++;if(f>=N){clearInterval(o._iv);o.innerHTML=paint(s);return}const k=Math.floor(a.length*f/N);o.innerHTML=paint(a.map((c,i)=>i<k?c:C[rnd(C.length)]).join(''))},32)}
export function init(){
const P={...DEFAULTS};
restore(P,'rz-p',RULES);
let presets=cleanPresets(loadJSON('rz-pp',null));
const pc=$('#pw-ctl');
let perr=null,wnote=null;
const grp=(m,l,c,full)=>{const g=fld(l,c);g.dataset.m=m;if(full)g.classList.add('full');pc.append(g);return g};
const sync=()=>{pc.querySelectorAll('[data-m]').forEach(g=>g.hidden=!g.dataset.m.split(' ').includes(P.mode))};
const all='chars words pin pron pat';
const bits=()=>(Math.log2((P.wl==='short'?WS:W).length)).toFixed(1);
function drawPresets(box){
box.textContent='';
if(!presets.length)box.append(el('p','sub',t('Save the settings a site accepts, like a length limit or banned symbols, and apply them in one tap.')));
const row=el('div','row');
presets.forEach(x=>{
const g=el('span','pre'),a=el('button','chip',x.name),d=el('button','chip x','\u00d7');
a.type=d.type='button';
a.onclick=()=>{Object.assign(P,x.s);buildPw();gen(1);announce(t('Preset \u201c{name}\u201d applied',{name:x.name}))};
d.setAttribute('aria-label',t('Delete preset {name}',{name:x.name}));
d.onclick=()=>{presets=deletePreset(presets,x.name);saveJSON('rz-pp',presets);drawPresets(box);announce(t('Preset \u201c{name}\u201d deleted',{name:x.name}))};
g.append(a,d);row.append(g)});
if(presets.length)box.append(row)}
function buildPw(){pc.textContent='';
const sw=fld(t('Type'),seg([['chars',t('Characters')],['words',t('Memorable words')],['pin',t('PIN')],['pron',t('Pronounceable')],['pat',t('Pattern')]],P.mode,k=>{P.mode=k;sync();gen()}));sw.classList.add('full');pc.append(sw);
const ps=el('div','row');[[t('Strong, 24 characters'),24],[t('Maximum, 128 characters'),128]].forEach(([l,n])=>{const b=el('button','chip',l);b.type='button';b.onclick=()=>{Object.assign(P,{mode:'chars',len:n,lo:1,up:1,di:1,sy:1,amb:0,each:1,norep:0});buildPw();gen(1)};ps.append(b)});
const pf=fld(t('Quick start'),ps);pf.classList.add('full');pc.append(pf);
grp('chars',t('Length'),slider(P,'len',RANGE.len[0],RANGE.len[1],()=>gen()));
grp('words',t('Number of words'),slider(P,'words',RANGE.words[0],RANGE.words[1],()=>gen()));
wnote=el('p','sub');
const upd=()=>{wnote.textContent=t('{b} bits per word. Add words to make up for a shorter list.',{b:bits()})};
grp('words',t('Word list'),dd([['long',t('Long list, {n} words',{n:nf(W.length)})],['short',t('Short list, {n} words, easier to type',{n:nf(WS.length)})]],P.wl,v=>{P.wl=v;upd();gen()}));
grp('words',t('Per word'),wnote);upd();
grp('pin',t('Digits'),slider(P,'pin',RANGE.pin[0],RANGE.pin[1],()=>gen()));
grp('pron',t('Syllables'),slider(P,'syl',RANGE.syl[0],RANGE.syl[1],()=>gen()));
grp('pron',t('Grouping'),dd([['0',t('None')],['2',t('{n} syllables',{n:2})],['3',t('{n} syllables',{n:3})],['4',t('{n} syllables',{n:4})]],String(P.gs),v=>{P.gs=+v;gen()}));
const pi=txt(P.pat,v=>{P.pat=v;gen()},'Cvcc-999');pi.maxLength=200;pi.autocapitalize='off';
perr=el('p','err');perr.setAttribute('role','alert');perr.hidden=true;
grp('pat',t('Pattern'),pi).append(perr);
const ex=el('div','row');['Cvcc-999','CvcCvc-99','LLLL-9999','hhhh-hhhh','Cvc{3}-9{4}'].forEach(p=>{const b=el('button','chip raw',p);b.type='button';b.onclick=()=>{P.pat=p;pi.value=p;gen()};ex.append(b)});
grp('pat',t('Examples'),ex,1);
grp('pat',t('Classes'),el('p','sub',t('c consonant, v vowel, l letter, a letter or digit, h hex digit, 9 digit, s symbol (!@#$%&*-_=+?), * anything. A capital letter makes the class uppercase. Add {3} to repeat an item, and a backslash to use a character as it is.')),1);
const r=el('div','row');
[[t('Lowercase'),'lo'],[t('Uppercase'),'up'],[t('Digits'),'di'],[t('Symbols'),'sy'],[t('No look-alikes'),'amb'],[t('One of each'),'each'],[t('No repeats'),'norep']].forEach(([l,k])=>r.append(chip(l,P,k,()=>gen())));
grp('chars',t('Include'),r,1);
grp('chars',t('Symbols to use'),txt(P.syms,v=>{P.syms=v;gen()}));
grp('words',t('Separator'),dd([['-',t('Hyphen')],['.',t('Dot')],['_',t('Underscore')],[' ',t('Space')],['',t('None')],['rnd',t('Random symbol')]],P.sep,v=>{P.sep=v;gen()}));
const w=el('div','row');w.append(chip(t('Capitalize'),P,'cap',()=>gen()),chip(t('Add 4 digits'),P,'num',()=>gen()));
grp('words pron',t('Style'),w);
const pv=el('div','row');pv.append(chip(t('Clear clipboard after 45 seconds'),P,'clr',()=>saveJSON('rz-p',P)),chip(t('Keep password history'),P,'hist',()=>saveJSON('rz-p',P)));grp('chars words pin pron pat',t('Privacy'),pv);
grp(all,t('How many'),dd([['1',t('One')],['5',t('{n} at once',{n:5})],['10',t('{n} at once',{n:10})],['20',t('{n} at once',{n:20})]],String(P.count),v=>{P.count=+v;gen()}));
const sp=el('div','sc'),pr=el('div'),nm=txt('',()=>{},t('Name, like Bank, max 16')),sv=el('button','btn',t('Save settings')),pe=el('p','err');
nm.maxLength=40;nm.setAttribute('aria-label',t('Preset name'));sv.type='button';pe.hidden=true;pe.setAttribute('role','alert');
nm.oninput=()=>{pe.hidden=true};
sv.onclick=()=>{const r=savePreset(presets,nm.value,P);if(r.error){pe.textContent=r.error;pe.hidden=false;return}presets=r.list;saveJSON('rz-pp',presets);nm.value='';pe.hidden=true;drawPresets(pr);announce(t('Preset \u201c{name}\u201d saved',{name:r.name}))};
const nr=el('div','row');nr.append(nm,sv);sp.append(pr,nr,pe);drawPresets(pr);
grp(all,t('Site presets'),sp,1);
sync()}buildPw();

let cur=[];
function gen(anim){
saveJSON('rz-p',P);
const f={chars:genChars,words:genWords,pin:genPin,pron:genPron,pat:genPattern}[P.mode],r=[];let b=0;
const o=$('#pw-out');
if(perr)perr.hidden=true;
for(let i=0;i<P.count;i++){const x=f(P);if(!x||x.error){cur=[];o.className='big empty';clearInterval(o._iv);
if(x&&x.error){o.textContent=t('Fix the pattern below to generate a password.');if(perr){perr.textContent=x.error;perr.hidden=false}}else o.textContent=t('Turn on at least one character type to generate.');
$('#pw-list').textContent='';$('#pw-e').textContent='';$('#pw-m').style.width='0';return}r.push(x.t);b=x.b}
cur=r;
if(P.hist)hist('pw',r[0]);
o.className='big';clearInterval(o._iv);o.innerHTML=paint(r[0]);if(anim)reveal(o,r[0]);
o.style.fontSize=r[0].length>96?'15px':r[0].length>52?'19px':'';
const l=$('#pw-list');l.textContent='';
r.slice(1).forEach(s=>{const x=el('button','li');x.innerHTML=paint(s);x.onclick=()=>copy(s,x);l.append(x)});
const cb=$('#pw-cp');cb.dataset.l=cb.textContent=r.length>1?t('Copy all'):t('Copy');
const msg=t('{w}, {b} bits of entropy',{w:strength(b),b:Math.round(b)});
$('#pw-e').textContent=msg;announce(r.length>1?t('{n} passwords generated, {s}',{n:r.length,s:msg}):t('Password generated, {s}',{s:msg}));
const m=$('#pw-m');m.style.width=Math.min(100,b/128*100)+'%';m.className=b>=60?'g1':''}
$('#pw-g').onclick=function(){spin(this);gen(1)};
$('#pw-cp').onclick=function(){if(!cur.length)return;copy(cur.join('\n'),this);if(P.clr)scheduleClear(45000)};
$('#pw-hd').onclick=function(){this.textContent=this.closest('.out').classList.toggle('hid')?t('Show'):t('Hide')};
return{refresh:()=>gen()}}
