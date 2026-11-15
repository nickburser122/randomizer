import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import {resolve} from 'node:path';
if(!process.argv[2]){console.log('usage: node test/parity.mjs <baseline.html> [candidate.html]');process.exit(2)}
const b=await puppeteer.launch({args:chromium.args,executablePath:await chromium.executablePath(),headless:'shell'});
const w=ms=>new Promise(r=>setTimeout(r,ms));
const det=()=>{try{localStorage.clear()}catch(e){}
let s=12345;const nx=()=>(s=(Math.imul(s,1664525)+1013904223)>>>0);
crypto.getRandomValues=a=>{for(let i=0;i<a.length;i++)a[i]=nx();return a};
let u=0;crypto.randomUUID=()=>'00000000-0000-4000-8000-'+String(++u).padStart(12,'0');
Math.random=()=>nx()/4294967296};
const dump=()=>[...document.querySelectorAll('body *')].filter(e=>e.offsetParent!==null||e.tagName==='svg').map(e=>{const c=getComputedStyle(e),r=e.getBoundingClientRect();return e.tagName+'.'+(e.className.baseVal??e.className)+'#'+e.id+'|'+(e.children.length?'':e.textContent.slice(0,40))+'|'+[...c].map(k=>k+':'+c.getPropertyValue(k)).join(';')+'|'+[r.x,r.y,r.width,r.height].map(Math.round)});
async function snap(file,scheme,vp){
const p=await b.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.evaluateOnNewDocument(det);
await p.emulateMediaFeatures([{name:'prefers-color-scheme',value:scheme},{name:'prefers-reduced-motion',value:'reduce'}]);
await p.setViewport(vp);await p.goto('file://'+file);await p.addStyleTag({content:'*{transition:none!important;animation:none!important}'});await w(500);
const out={};
for(const t of ['pw','tb','pk','rl','tk']){await p.click(`.nv[data-t="${t}"]`);await w(150);out[t]=await p.evaluate(dump)}
await p.click('#tk-ctl .tabs .tab:nth-child(2)');await w(150);out.color=await p.evaluate(dump);
await p.click('.nv[data-t="pw"]');await p.click('#pw-g');await p.click('.nv[data-t="rl"]');await p.click('#rl-g');await p.click('#rl-g');
await p.click('#sh-o');await w(250);out.hist=await p.evaluate(dump);
await p.close();return{out,errs}}
let bad=0;
for(const scheme of ['light','dark'])for(const vp of [{width:390,height:844},{width:1100,height:900}]){
const A=await snap(resolve(process.argv[2]),scheme,vp),B=await snap(resolve(process.argv[3]||new URL('../dist/randomizer.html',import.meta.url).pathname),scheme,vp);
for(const t of Object.keys(A.out)){
const a=A.out[t],c=B.out[t];
if(a.length!==c.length){console.log(scheme,vp.width,t,'element count',a.length,c.length);bad++;continue}
for(let i=0;i<a.length;i++)if(a[i]!==c[i]){bad++;if(bad>10)break;const x=a[i].split('|'),y=c[i].split('|'),px=x[2].split(';'),py=y[2].split(';');console.log(scheme,vp.width,t,x[0],'text:',x[1]===y[1]?'same':x[1]+' / '+y[1],'style:',px.map((v,j)=>v!==py[j]?v+' => '+py[j]:null).filter(Boolean).slice(0,4),'box',x[3],y[3])}}
if(A.errs.length||B.errs.length)console.log('errs',A.errs,B.errs)}
console.log('differences:',bad);await b.close();
