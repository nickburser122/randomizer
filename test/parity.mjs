import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {brotliCompressSync,brotliDecompressSync,constants} from 'node:zlib';

const here=dirname(fileURLToPath(import.meta.url));
const BASELINE=join(here,'baseline.json.br');
const DIST=join(here,'../dist/randomizer.html');
const PROPS=['display','position','top','right','bottom','left','z-index','visibility','opacity','overflow-x','overflow-y','box-sizing','width','height','min-width','min-height','max-width','max-height','margin-top','margin-right','margin-bottom','margin-left','padding-top','padding-right','padding-bottom','padding-left','border-top-width','border-right-width','border-bottom-width','border-left-width','border-top-style','border-top-color','border-right-color','border-bottom-color','border-left-color','border-top-left-radius','border-top-right-radius','border-bottom-left-radius','border-bottom-right-radius','color','background-color','background-image','box-shadow','outline-style','outline-width','outline-color','font-family','font-size','font-weight','font-style','line-height','letter-spacing','text-align','text-transform','text-decoration-line','text-overflow','white-space','word-break','flex-direction','flex-wrap','flex-grow','flex-shrink','flex-basis','align-items','align-self','justify-content','gap','grid-template-columns','grid-column-start','grid-column-end','transform','cursor','pointer-events','fill','stroke','stroke-width','aspect-ratio','appearance'];
const RUNS=[
  {id:'light-390-en',scheme:'light',width:390,height:844,lang:'en',views:'all'},
  {id:'light-1100-en',scheme:'light',width:1100,height:900,lang:'en',views:'all'},
  {id:'dark-390-en',scheme:'dark',width:390,height:844,lang:'en',views:'all'},
  {id:'dark-1100-en',scheme:'dark',width:1100,height:900,lang:'en',views:'all'},
  {id:'light-390-de',scheme:'light',width:390,height:844,lang:'de',views:'tabs'},
  {id:'dark-320-fr',scheme:'dark',width:320,height:700,lang:'fr',views:'tabs'}
];
const det=lang=>{try{localStorage.clear();localStorage.setItem('rz-lang',lang)}catch(e){}
let s=12345;const nx=()=>(s=(Math.imul(s,1664525)+1013904223)>>>0);
crypto.getRandomValues=a=>{for(let i=0;i<a.length;i++)a[i]=nx();return a};
let u=0;crypto.randomUUID=()=>'00000000-0000-4000-8000-'+String(++u).padStart(12,'0');
Math.random=()=>nx()/4294967296};
const dump=props=>{
const dict=[],index=new Map(),els=[];
for(const e of document.querySelectorAll('body *')){
if(e.offsetParent===null&&e.tagName!=='svg'&&e.tagName!=='SVG')continue;
const c=getComputedStyle(e),r=e.getBoundingClientRect(),st=JSON.stringify(props.map(k=>c.getPropertyValue(k)));
if(!index.has(st)){index.set(st,dict.length);dict.push(JSON.parse(st))}
els.push([e.tagName+'.'+(e.className.baseVal??e.className)+'#'+e.id,e.children.length?'':e.textContent.slice(0,40),index.get(st),Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)])}
return{s:dict,e:els}};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let browser=null;
async function collect(file){
browser=browser||await puppeteer.launch({args:chromium.args,executablePath:await chromium.executablePath(),headless:'shell'});
const result={version:1,props:PROPS,runs:{}},errors=[];
for(const run of RUNS){
const p=await browser.newPage();
p.on('pageerror',e=>errors.push(String(e)));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await p.evaluateOnNewDocument(det,run.lang);
await p.emulateMediaFeatures([{name:'prefers-color-scheme',value:run.scheme},{name:'prefers-reduced-motion',value:'reduce'}]);
await p.setViewport({width:run.width,height:run.height});
await p.goto('file://'+file);
await p.addStyleTag({content:'*{transition:none!important;animation:none!important}'});
await wait(500);
const out={},grab=async name=>{await wait(150);out[name]=await p.evaluate(dump,PROPS)},go=async t=>{await p.click(`.nv[data-t="${t}"]`);await p.evaluate(()=>document.activeElement&&document.activeElement.blur())},seg=async(root,i)=>{await p.evaluate((r,i)=>document.querySelectorAll(r+' .tabs .tab')[i].click(),root,i)};
for(const t of ['pw','tb','pk','rl','tk']){await go(t);await grab(t)}
if(run.views==='all'){
await go('pw');await seg('#pw-ctl',4);await grab('pw-pattern');await seg('#pw-ctl',2);await grab('pw-pin');
await go('rl');await seg('#rl-ctl',1);await grab('rl-coin');await seg('#rl-ctl',2);await grab('rl-number');await seg('#rl-ctl',0);
await go('tk');await seg('#tk-ctl',1);await grab('tk-color');await seg('#tk-ctl',2);await grab('tk-lorem');
await go('pw');await p.click('#pw-g');await go('rl');await p.click('#rl-g');await p.click('#rl-g');
await p.click('#sh-o');await grab('hist')}
result.runs[run.id]=out;await p.close()}
return{result,errors}}
function diff(A,B,limit=15){
let bad=0;
const names=PROPS;
for(const id of new Set([...Object.keys(A.runs),...Object.keys(B.runs)])){
const a=A.runs[id],b=B.runs[id];
if(!a||!b){console.log(id,'run missing in',a?'candidate':'baseline');bad++;continue}
for(const v of new Set([...Object.keys(a),...Object.keys(b)])){
const x=a[v],y=b[v];
if(!x||!y){console.log(id,v,'view missing in',x?'candidate':'baseline');bad++;continue}
if(x.e.length!==y.e.length){console.log(id,v,'element count',x.e.length,'=>',y.e.length);bad++;continue}
for(let i=0;i<x.e.length;i++){
const p=x.e[i],q=y.e[i],ps=x.s[p[2]],qs=y.s[q[2]],sd=ps.map((val,j)=>val!==qs[j]?names[j]+' '+val+' => '+qs[j]:null).filter(Boolean);
const box=p.slice(3).join(',')!==q.slice(3).join(',');
if(p[0]!==q[0]||p[1]!==q[1]||sd.length||box){bad++;if(bad<=limit)console.log(id,v,p[0]===q[0]?p[0]:p[0]+' => '+q[0],p[1]===q[1]?'':'text '+JSON.stringify(p[1])+' => '+JSON.stringify(q[1]),sd.length?'style '+sd.slice(0,4).join('; '):'',box?'box '+p.slice(3)+' => '+q.slice(3):'')}}}}
return bad}
const args=process.argv.slice(2),write=args.includes('--write'),files=args.filter(a=>!a.startsWith('--'));
let code=0;
if(write){
const {result,errors}=await collect(DIST);
if(errors.length){console.log('page errors',errors);code=1}
else{const raw=JSON.stringify(result);const packed=brotliCompressSync(Buffer.from(raw),{params:{[constants.BROTLI_PARAM_QUALITY]:11,[constants.BROTLI_PARAM_LGWIN]:24,[constants.BROTLI_PARAM_SIZE_HINT]:raw.length}});writeFileSync(BASELINE,packed);console.log('wrote',BASELINE,Object.keys(result.runs).length,'runs',Math.round(raw.length/1024)+' KB json,',Math.round(packed.length/1024)+' KB compressed')}
}else if(files.length){
const A=await collect(resolve(files[0])),B=await collect(resolve(files[1]||DIST));
if(A.errors.length||B.errors.length)console.log('errors',A.errors,B.errors);
const bad=diff(A.result,B.result);console.log('differences:',bad);code=bad?1:0;
}else{
if(!existsSync(BASELINE)){console.log('No baseline yet. Run npm run baseline.');process.exit(2)}
const A=JSON.parse(brotliDecompressSync(readFileSync(BASELINE)).toString()),{result,errors}=await collect(DIST);
if(errors.length){console.log('page errors',errors);code=1}
if(A.version!==1||A.props.join()!==PROPS.join()){console.log('Baseline was made with other settings. Run npm run baseline.');code=1}
else{const bad=diff(A,result);console.log('differences:',bad,bad?'\nIf the change is intended, run npm run baseline and commit test/baseline.json.br.':'');if(bad)code=1}
}
if(browser)await browser.close();
process.exit(code);
