import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {resolve,dirname,join,extname} from 'node:path';
import http from 'node:http';
import {readFileSync,existsSync,statSync} from 'node:fs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const file='file://'+join(root,'dist/randomizer.html');
const artifactFile='file://'+join(root,'dist/artifact.html');
const browser=await puppeteer.launch({args:chromium.args,executablePath:await chromium.executablePath(),headless:'shell'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const TABS=['pw','tb','pk','rl','tk'];

async function open({width=390,height=844,scheme='light',storage={},langs=null,url=file,claude=null}={}){
  const page=await browser.newPage(),errors=[],external=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.setRequestInterception(true);
  page.on('request',r=>{const u=r.url();if(u.startsWith('file:')||u.startsWith('data:')||u.startsWith('blob:'))r.continue();else{external.push(u);r.abort()}});
  await page.evaluateOnNewDocument((s,l)=>{if(!sessionStorage.getItem('__init')){localStorage.clear();for(const[k,v]of Object.entries(s))localStorage.setItem(k,v);sessionStorage.setItem('__init','1')}if(l)Object.defineProperty(navigator,'languages',{get:()=>l})},storage,langs);
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:scheme},{name:'prefers-reduced-motion',value:'reduce'}]);
  if(claude)await page.evaluateOnNewDocument(mode=>{
    window.__saves=[];
    const mk=m=>({save:async r=>{window.__saves.push({filename:r.filename,kind:r.data instanceof Blob?'blob':typeof r.data,size:r.data instanceof Blob?r.data.size:r.data.length,head:typeof r.data==='string'?r.data.slice(0,80):''});const codes={declined:'declined',rate:'rate_limited',large:'too_large',unavailable:'unavailable'};if(codes[m])throw{code:codes[m],message:'x'};return{status:'saved'}}});
    if(mode!=='none')window.claude={use:n=>mode==='null'?Promise.resolve(null):mode==='pending'?new Promise(()=>{}):Promise.resolve(n==='downloads'?mk(mode):null)};
  },claude);
  await page.setViewport({width,height});
  await page.goto(url);await sleep(300);
  return{page,errors,external};
}
const tab=async(page,t)=>{await page.click(`.nv[data-t="${t}"]`);await sleep(80)};
const away=page=>page.evaluate(()=>document.activeElement&&document.activeElement.blur());
const text=(page,sel)=>page.$eval(sel,e=>e.textContent);
const clickText=(page,sel,t)=>page.evaluate((sel,t)=>{const e=[...document.querySelectorAll(sel)].find(x=>x.textContent.trim()===t);if(!e)throw new Error('no '+sel+' with text '+t);e.click()},sel,t);
const setValue=(page,sel,v)=>page.$eval(sel,(e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}))},v);

const tests=[];const test=(n,f)=>tests.push([n,f]);

test('boots on phone, tablet and desktop without errors, outside requests or sideways scroll',async()=>{
  for(const [width,height] of [[390,844],[768,1024],[1280,800]]){
    const {page,errors,external}=await open({width,height});
    for(const t of TABS){await tab(page,t);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow on ${t} at ${width}`)}
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await page.close();
  }
});
test('survives corrupt or hostile saved state',async()=>{
  for(const storage of [
    {'rz-p':'{nope','rz-t':'{"cols":[{"name":1,"t":"zzz"}],"n":"x"}','rz-k':'null','rz-tk':'[]','rz-h':'7','rz-mode':'neon','rz-tab':'nope','rz-list':'\u0000'},
    {'rz-p':'{"mode":"zzz","count":7,"len":"x","sep":5}','rz-k':'{"mode":"zzz","n":-5}','rz-tk':'{"kind":"zzz","mode":9}','rz-h':'[{"t":"pw","v":1},null]'}
  ]){
    const {page,errors}=await open({storage});
    assert.deepEqual(errors,[]);assert.equal(await text(page,'#mode'),'System');
    assert.ok((await page.$$('#tb-t tbody tr')).length>0);assert.ok((await text(page,'#pw-out')).length>0);await page.close();
  }
});
test('theme follows the system, the toggle overrides it, and the icon follows the theme',async()=>{
  const {page,errors}=await open({scheme:'dark'});
  const theme=()=>page.evaluate(()=>document.documentElement.dataset.theme),icon=()=>page.$eval('#ico',e=>e.href);
  assert.equal(await theme(),'dark');const dark=await icon();
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);await sleep(150);
  assert.equal(await theme(),'light');assert.notEqual(await icon(),dark);
  await page.click('#mode');assert.equal(await text(page,'#mode'),'Light');
  await page.click('#mode');assert.equal(await text(page,'#mode'),'Dark');assert.equal(await theme(),'dark');
  await page.click('#mode');assert.equal(await text(page,'#mode'),'System');assert.equal(await theme(),'light');
  assert.deepEqual(errors,[]);await page.close();
});
test('password: presets, modes and hiding',async()=>{
  const {page,errors}=await open();
  assert.equal([...await text(page,'#pw-out')].length,32);
  await clickText(page,'.chip','Maximum, 128 characters');assert.equal([...await text(page,'#pw-out')].length,128);
  await clickText(page,'#pw-ctl .tab','Memorable words');assert.match(await text(page,'#pw-out'),/^([A-Za-z-]+-){5}[A-Za-z-]+-\d{4}$/);
  await clickText(page,'#pw-ctl .tab','PIN');assert.match(await text(page,'#pw-out'),/^\d{6}$/);
  await clickText(page,'#pw-ctl .tab','Characters');
  await page.click('#pw-hd');assert.ok(await page.$eval('#pw-out',e=>getComputedStyle(e).filter!=='none'));
  assert.deepEqual(errors,[]);await page.close();
});
test('table: template columns, renaming, errors and every export format',async()=>{
  const {page,errors}=await open();await tab(page,'tb');
  const tplValue=()=>page.$eval('.col:nth-child(3) .f:nth-child(3) input',e=>e.value);
  assert.match(await tplValue(),/\{name\|first\|lower\}/);
  await setValue(page,'.col:nth-child(2) input','person');
  assert.match(await tplValue(),/\{person\|first\|lower\}/);
  const email=await page.$eval('#tb-t tbody tr td:nth-child(3)',e=>e.textContent);assert.match(email,/^[a-z]+\.[a-z]+@example\.com$/);
  await setValue(page,'.col:nth-child(3) .f:nth-child(3) input','{ghost}');await sleep(80);
  assert.match(await page.$eval('.col:nth-child(3) .note',e=>e.textContent),/no column named/);
  await setValue(page,'.col:nth-child(3) .f:nth-child(3) input','{person|upper}');
  await page.click('#add');assert.equal((await page.$$('.col')).length,6);
  for(const f of ['Copy as CSV','Copy as JSON','Copy as Markdown','Copy as SQL','Copy as TSV']){
    await page.click('#tb-fm .dd-b');await clickText(page,'#tb-fm .dd-o',f);await page.click('#tb-cp');
  }
  await page.click('#tb-dl');await sleep(100);
  await page.$eval('#tb-seed input',e=>{e.value='s';e.dispatchEvent(new Event('input',{bubbles:true}))});
  const a=await page.$eval('#tb-t',e=>e.textContent);await page.click('#tb-g');assert.equal(await page.$eval('#tb-t',e=>e.textContent),a);
  assert.deepEqual(errors,[]);await page.close();
});
test('pick, roll and tools',async()=>{
  const {page,errors}=await open();
  await tab(page,'pk');await page.type('#pk-t','Ana\nBen\nCy');await page.click('#pk-g');assert.match(await text(page,'#pk-out'),/^(Ana|Ben|Cy)$/);
  await clickText(page,'#pk-ctl .tab','Teams');assert.match(await text(page,'#pk-out'),/^Team 1: .*\nTeam 2: /);
  await clickText(page,'#pk-ctl .tab','Shuffle');assert.match(await text(page,'#pk-out'),/^1\. /);
  await tab(page,'rl');assert.match(await text(page,'#rl-out'),/^\d+$/);
  await setValue(page,'#rl-ctl input.in:not(.num)','oops');await page.focus('#rl-ctl input.in:not(.num)');await page.keyboard.press('Enter');
  assert.ok(await page.$('#rl-out.empty'));
  await clickText(page,'#rl-ctl .chip','d20');assert.ok(await page.$('#rl-out:not(.empty)'));
  await clickText(page,'#rl-ctl .tab','Coin');await page.click('#rl-g');assert.match(await text(page,'#rl-out'),/^(Heads|Tails)$/);
  await tab(page,'tk');assert.match(await text(page,'#tk-out'),/^[A-Za-z0-9]{32}$/);
  await clickText(page,'#tk-ctl .tab','Color palette');assert.equal((await page.$$('#tk-sw .cp')).length,5);assert.equal((await page.$$('#tk-sw .lk')).length,5);
  assert.deepEqual(errors,[]);await page.close();
});
test('history drawer records, clears and closes with Escape; passwords are not kept by default',async()=>{
  const {page,errors}=await open();
  await tab(page,'rl');await page.click('#rl-g');await page.click('#rl-g');
  await page.click('#sh-o');await sleep(100);
  const n=(await page.$$('#sh-l .li')).length;assert.ok(n>=1);
  assert.ok(!(await text(page,'#sh-l')).includes('Password'));
  await page.keyboard.press('Escape');assert.ok(!(await page.$('#sh.on')));
  await page.click('#sh-o');await page.click('#sh-cl');assert.match(await text(page,'#sh-l'),/Nothing here yet/);
  assert.deepEqual(errors,[]);await page.close();
});

const waitFor=async(page,fn,arg,ms=20000)=>{
  const t=Date.now();
  for(;;){
    const v=await page.evaluate(fn,arg);
    if(v)return v;
    if(Date.now()-t>ms)throw new Error('timed out waiting for '+fn);
    await sleep(25);
  }
};
const trapClipboard=page=>page.evaluate(()=>{window.__clip=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async t=>{window.__clip.push(t)}}})});
const info=page=>text(page,'#tb-info');
const press=async(page,sel)=>{await page.$eval(sel,e=>e.scrollIntoView({block:'center'}));await page.click(sel)};

test('password: pronounceable mode shows its controls and a strength reading',async()=>{
  const {page,errors}=await open();
  await clickText(page,'#pw-ctl .tab','Pronounceable');
  assert.match(await text(page,'#pw-out'),/^[A-Z][a-z]{5}(-[A-Z][a-z]{5}){3}-\d{4}$/);
  assert.match(await text(page,'#pw-e'),/^(fair|good|strong|very strong), \d+ bits of entropy$/);
  const visible=await page.evaluate(()=>[...document.querySelectorAll('#pw-ctl .f')].filter(f=>!f.hidden).map(f=>f.querySelector('.lb').textContent));
  assert.deepEqual(visible,['Type','Quick start','Syllables','Grouping','Style','Privacy','How many','Site presets']);
  await clickText(page,'#pw-ctl .chip','Add 4 digits');await clickText(page,'#pw-ctl .chip','Capitalize');
  assert.match(await text(page,'#pw-out'),/^[a-z]{6}(-[a-z]{6}){3}$/);
  await page.evaluate(()=>{const g=[...document.querySelectorAll('#pw-ctl .f')].find(f=>f.querySelector('.lb').textContent==='Grouping');g.querySelector('.dd-b').click();[...g.querySelectorAll('.dd-o')].find(o=>o.textContent==='None').click()});
  assert.match(await text(page,'#pw-out'),/^[a-z]{24}$/);
  await page.evaluate(()=>{localStorage.getItem('rz-p')});
  assert.equal(JSON.parse(await page.evaluate(()=>localStorage.getItem('rz-p'))).mode,'pron');
  assert.deepEqual(errors,[]);await page.close();
  const again=await open({storage:{'rz-p':JSON.stringify({mode:'pron',syl:5,gs:0,cap:0,num:0})}});
  assert.match(await text(again.page,'#pw-out'),/^[a-z]{10}$/);await again.page.close();
});
test('password: the pronounceable tabs fit a narrow phone',async()=>{
  const {page,errors}=await open({width:320,height:640});
  await clickText(page,'#pw-ctl .tab','Pronounceable');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.ok(await page.evaluate(()=>{const r=document.querySelector('#pw-ctl .tabs').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth}));
  assert.deepEqual(errors,[]);await page.close();
});
test('roll: several dice terms, exploding dice and a clear breakdown',async()=>{
  const {page,errors}=await open();await tab(page,'rl');
  const roll=async f=>{await setValue(page,'#rl-ctl input.in:not(.num)',f);await page.focus('#rl-ctl input.in:not(.num)');await page.keyboard.press('Enter')};
  await roll('2d6+1d4+3');
  assert.match(await text(page,'#rl-out'),/^\d+$/);assert.match(await text(page,'#rl-e'),/^2d6 \[\d, \d\] = \d+ \+ 1d4 \[\d\] = \d \+ 3$/);
  const n=+await text(page,'#rl-out');assert.ok(n>=6&&n<=19);
  await roll('4d6!kh3');assert.match(await text(page,'#rl-e'),/^4d6!kh3 \[[\d, !]+\] keep \d+(, \d+){2}$/);
  await roll('1d6!7');assert.ok(await page.$('#rl-out.empty'));assert.match(await text(page,'#rl-out'),/Explode/);
  await roll('2d6+');assert.match(await text(page,'#rl-out'),/Try a formula like 2d6\+1d4\+3/);
  await roll('2d6kh1');assert.ok(await page.$('#rl-out:not(.empty)'));
  assert.deepEqual(errors,[]);await page.close();
});
test('table: more than 1,000 rows are generated in chunks with progress, a 100 row preview and exact totals',async()=>{
  const {page,errors}=await open();await tab(page,'tb');
  const rows=async v=>setValue(page,'#tb-rows input.num',String(v));
  await rows(30000);
  await waitFor(page,()=>/^Generating [\d,]+ of 30,000 rows \(\d+%\)$/.test(document.querySelector('#tb-info').textContent)||/^30,000 rows/.test(document.querySelector('#tb-info').textContent));
  await waitFor(page,()=>/^30,000 rows, 5 columns\. Showing the first 100/.test(document.querySelector('#tb-info').textContent));
  assert.equal((await page.$$('#tb-t tbody tr')).length,100);
  assert.equal(await page.$eval('#tb-cp',e=>e.disabled),false);
  await trapClipboard(page);await page.click('#tb-cp');await sleep(100);
  const tsv=await page.evaluate(()=>window.__clip[0]);assert.equal(tsv.split('\n').length,30001);
  assert.equal(tsv.split('\n')[30000].split('\t')[0],'30000');
  await rows(999999);await waitFor(page,()=>/^100,000 rows/.test(document.querySelector('#tb-info').textContent),null,60000);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('rz-t')).n),100000);
  assert.deepEqual(errors,[]);await page.close();
});
test('table: a newer setting cancels an unfinished large run, and large tables repeat for a seed',async()=>{
  const {page,errors}=await open();await tab(page,'tb');
  await setValue(page,'#tb-rows input.num','100000');await setValue(page,'#tb-rows input.num','12');
  await waitFor(page,()=>/^12 rows, 5 columns/.test(document.querySelector('#tb-info').textContent));
  await sleep(400);assert.match(await info(page),/^12 rows, 5 columns$/);assert.equal((await page.$$('#tb-t tbody tr')).length,12);
  await page.$eval('#tb-seed input',e=>{e.value='repeat';e.dispatchEvent(new Event('input',{bubbles:true}))});
  await setValue(page,'#tb-rows input.num','4000');
  await waitFor(page,()=>/^4,000 rows/.test(document.querySelector('#tb-info').textContent));
  const big=await page.$eval('#tb-t',e=>e.textContent);
  await setValue(page,'#tb-rows input.num','100');
  await waitFor(page,()=>/^100 rows/.test(document.querySelector('#tb-info').textContent));
  assert.equal(await page.$eval('#tb-t',e=>e.textContent),big);
  assert.deepEqual(errors,[]);await page.close();
});
test('table: copy schema and paste schema reproduce the table, and bad input shows a message',async()=>{
  const a=await open();await tab(a.page,'tb');await trapClipboard(a.page);
  await setValue(a.page,'.col:nth-child(2) input','person');
  await a.page.$eval('#tb-seed input',e=>{e.value='abc';e.dispatchEvent(new Event('input',{bubbles:true}))});
  await setValue(a.page,'#tb-rows input.num','7');
  await press(a.page,'#tb-hdr .chip');
  await press(a.page,'#sc-cp');await sleep(100);
  const schema=await a.page.evaluate(()=>window.__clip[0]),parsed=JSON.parse(schema);
  assert.equal(parsed.cols[1].name,'person');assert.equal(parsed.n,7);assert.equal(parsed.seed,'abc');assert.equal(parsed.hdr,0);
  const before=await a.page.$eval('#tb-t',e=>e.textContent);
  const b=await open();await tab(b.page,'tb');
  assert.equal(await b.page.$eval('#sc-box',e=>e.hidden),true);
  await press(b.page,'#sc-pa');assert.equal(await b.page.$eval('#sc-box',e=>e.hidden),false);
  assert.equal(await b.page.$eval('#sc-pa',e=>e.getAttribute('aria-expanded')),'true');
  assert.equal(await b.page.evaluate(()=>document.activeElement.id),'sc-ta');
  for(const [bad,msg] of [['','Paste a schema first.'],['nope',/not valid JSON/],['{"cols":[]}',/no columns/],['[1]',/No columns found/],['x'.repeat(100001),/too large/]]){
    await setValue(b.page,'#sc-ta',bad);await press(b.page,'#sc-ap');
    const t=await text(b.page,'#sc-er');assert.ok(await b.page.$eval('#sc-er',e=>!e.hidden));
    typeof msg==='string'?assert.equal(t,msg):assert.match(t,msg);
    assert.equal((await b.page.$$('.col')).length,5);
  }
  await setValue(b.page,'#sc-ta','{"cols":[]}');await press(b.page,'#sc-ap');assert.ok(await b.page.$eval('#sc-er',e=>!e.hidden));
  await b.page.focus('#sc-ta');await b.page.keyboard.type('x');assert.ok(await b.page.$eval('#sc-er',e=>e.hidden));
  await setValue(b.page,'#sc-ta',schema);await press(b.page,'#sc-ap');await sleep(150);
  assert.equal(await b.page.$eval('#sc-box',e=>e.hidden),true);
  assert.equal(await b.page.$eval('.col:nth-child(2) input',e=>e.value),'person');
  assert.equal(await b.page.$eval('#tb-seed input',e=>e.value),'abc');
  assert.equal(await b.page.$eval('#tb-rows input.num',e=>e.value),'7');
  assert.equal(await b.page.$eval('#tb-hdr .chip',e=>e.getAttribute('aria-pressed')),'false');
  assert.match(await info(b.page),/^7 rows, 5 columns$/);
  assert.equal(await b.page.$eval('#tb-t',e=>e.textContent),before);
  await press(b.page,'#sc-pa');await setValue(b.page,'#sc-ta','{"cols":[{"name":"z","t":"constructor"},{"name":"y","t":"int","v":["1","1"]}]}');await press(b.page,'#sc-ap');await sleep(150);
  assert.equal((await b.page.$$('.col')).length,2);assert.equal(await b.page.$eval('.col:nth-child(1) .f:nth-child(2) .dd-b',e=>e.textContent),'Word');
  assert.deepEqual(a.errors,[]);assert.deepEqual(b.errors,[]);await a.page.close();await b.page.close();
});
test('table: hostile saved columns do not break the page',async()=>{
  const {page,errors}=await open({storage:{'rz-t':JSON.stringify({cols:[{name:'a',t:'constructor'},{name:'b',t:'__proto__',v:[{x:1}],nul:{}},{name:'c',t:'toString'}],n:'x'})}});
  await tab(page,'tb');assert.deepEqual(errors,[]);
  assert.equal((await page.$$('.col')).length,3);assert.ok((await page.$$('#tb-t tbody tr')).length>0);await page.close();
});

const nameOf=`(()=>{const nm=e=>{const l=e.getAttribute('aria-labelledby');if(l)return l.split(' ').map(i=>{const x=document.getElementById(i);return x?x.textContent:''}).join(' ').trim();return(e.getAttribute('aria-label')||(e.labels?[...e.labels].map(x=>x.textContent).join(' '):'')||e.textContent||'').trim()};return[...document.querySelectorAll('button,input,textarea,select,[role=region][tabindex]')].filter(e=>e.offsetParent!==null&&!e.closest('[hidden]')).filter(e=>!nm(e)).map(e=>e.tagName+'.'+e.className+'#'+e.id)})()`;
test('accessibility: every visible control in every view has an accessible name',async()=>{
  const {page,errors}=await open();
  const bad=[];
  for(const t of TABS){
    await tab(page,t);
    if(t==='pw')for(const m of ['Characters','Memorable words','PIN','Pronounceable','Pattern']){await clickText(page,'#pw-ctl .tab',m);bad.push(...(await page.evaluate(nameOf)).map(x=>m+' '+x))}
    else if(t==='tb'){
      await press(page,'#sc-pa');
      bad.push(...(await page.evaluate(nameOf)).map(x=>t+' '+x))
    }
    else if(t==='pk'){for(const m of ['Pick','Shuffle','Teams']){await clickText(page,'#pk-ctl .tab',m);bad.push(...(await page.evaluate(nameOf)).map(x=>m+' '+x))}}
    else if(t==='rl'){for(const m of ['Dice','Coin','Number']){await clickText(page,'#rl-ctl .tab',m);bad.push(...(await page.evaluate(nameOf)).map(x=>m+' '+x))}}
    else {for(const m of ['Token','Color palette','Lorem text']){await clickText(page,'#tk-ctl .tab',m);bad.push(...(await page.evaluate(nameOf)).map(x=>m+' '+x))}}
  }
  await page.click('#sh-o');bad.push(...(await page.evaluate(nameOf)).map(x=>'history '+x));
  assert.deepEqual(bad,[]);assert.deepEqual(errors,[]);await page.close();
});
test('accessibility: segmented controls, nav, theme and history buttons expose their state',async()=>{
  const {page,errors}=await open();
  const pressed=sel=>page.$$eval(sel,b=>b.map(x=>x.getAttribute('aria-pressed')));
  assert.deepEqual(await pressed('#pw-ctl .tab'),['true','false','false','false','false']);
  await clickText(page,'#pw-ctl .tab','PIN');assert.deepEqual(await pressed('#pw-ctl .tab'),['false','false','true','false','false']);
  assert.deepEqual(await page.$$eval('.nv',b=>b.map(x=>x.getAttribute('aria-current'))),['page','false','false','false','false']);
  await tab(page,'rl');assert.deepEqual(await page.$$eval('.nv',b=>b.map(x=>x.getAttribute('aria-current'))),['false','false','false','page','false']);
  assert.match(await page.$eval('#mode',e=>e.getAttribute('aria-label')),/^Theme: System\. /);
  await page.click('#mode');assert.match(await page.$eval('#mode',e=>e.getAttribute('aria-label')),/^Theme: Light\. /);
  assert.equal(await page.$eval('#sh-o',e=>e.getAttribute('aria-expanded')),'false');
  assert.equal(await page.$eval('.tw',e=>e.tabIndex),0);
  const labelled=await page.$$eval('#rl-ctl .f',fs=>fs.every(f=>{const id=f.querySelector('.lb').id;return id&&[...f.querySelectorAll('input,[role=group]')].every(c=>c.getAttribute('aria-labelledby')===id||c.getAttribute('aria-label'))}));
  assert.ok(labelled);
  assert.deepEqual(errors,[]);await page.close();
});
test('accessibility: dropdowns work from the keyboard and announce their state',async()=>{
  const {page,errors}=await open();await tab(page,'tb');
  const state=()=>page.evaluate(()=>({exp:document.querySelector('#tb-fm .dd-b').getAttribute('aria-expanded'),on:document.activeElement.className,val:document.activeElement.dataset&&document.activeElement.dataset.v,id:document.activeElement.id,btn:document.querySelector('#tb-fm .dd-b').textContent}));
  assert.equal(await page.$eval('#tb-fm .dd-b',e=>e.getAttribute('aria-haspopup')),'listbox');
  assert.equal(await page.$eval('#tb-fm .dd-m',e=>e.getAttribute('role')),'listbox');
  await page.focus('#tb-fm .dd-b');await page.keyboard.press('ArrowDown');
  let s=await state();assert.equal(s.exp,'true');assert.match(s.on,/dd-o/);assert.equal(s.val,'tsv');
  await page.keyboard.press('ArrowDown');assert.equal((await state()).val,'csv');
  await page.keyboard.press('ArrowDown');assert.equal((await state()).val,'json');await page.keyboard.press('ArrowUp');assert.equal((await state()).val,'csv');
  await page.keyboard.press('End');assert.equal((await state()).val,'sql');
  await page.keyboard.press('ArrowDown');assert.equal((await state()).val,'tsv');
  await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
  s=await state();assert.equal(s.exp,'false');assert.equal(s.btn,'Copy as CSV');assert.match(s.on,/dd-b/);
  assert.equal(await page.$eval('#tb-fm .dd-o.on',e=>e.getAttribute('aria-selected')),'true');
  await page.keyboard.press('ArrowUp');await page.keyboard.press('Escape');
  s=await state();assert.equal(s.exp,'false');assert.match(s.on,/dd-b/);
  await page.keyboard.press('Enter');assert.equal((await state()).exp,'true');await page.keyboard.press('Escape');
  assert.deepEqual(errors,[]);await page.close();
});
test('accessibility: the history drawer takes focus when opened and returns it when closed',async()=>{
  const {page,errors}=await open();
  const active=()=>page.evaluate(()=>document.activeElement.id);
  await page.focus('#sh-o');await page.keyboard.press('Enter');await sleep(80);
  assert.equal(await active(),'sh');assert.equal(await page.$eval('#sh',e=>e.getAttribute('role')),'dialog');
  assert.equal(await page.$eval('#sh-o',e=>e.getAttribute('aria-expanded')),'true');assert.equal(await page.$eval('#sh',e=>e.getAttribute('aria-hidden')),'false');
  await page.keyboard.press('Tab');assert.equal(await active(),'sh-cp');
  await page.keyboard.press('Escape');await sleep(50);
  assert.equal(await active(),'sh-o');assert.equal(await page.$eval('#sh-o',e=>e.getAttribute('aria-expanded')),'false');assert.equal(await page.$eval('#sh',e=>e.getAttribute('aria-hidden')),'true');
  await page.keyboard.press('Escape');assert.equal(await active(),'sh-o');
  await page.click('#sh-o');await page.click('#sh-x');await sleep(50);assert.equal(await active(),'sh-o');
  assert.deepEqual(errors,[]);await page.close();
});
test('accessibility: results are announced in a live region without reading out secrets',async()=>{
  const {page,errors}=await open();
  const live=()=>text(page,'#live');
  assert.equal(await page.$eval('#live',e=>e.getAttribute('aria-live')),'polite');assert.equal(await live(),'');
  await page.click('#pw-g');await sleep(150);
  const pw=await text(page,'#pw-out'),said=await live();
  assert.match(said,/^Password generated, [a-z ]+, \d+ bits of entropy$/);assert.ok(!said.includes(pw));
  await tab(page,'tk');await page.click('#tk-g');await sleep(150);
  const tk=await text(page,'#tk-out'),saidT=await live();assert.match(saidT,/^Token generated, \d+ bits of entropy$/);assert.ok(!saidT.includes(tk));
  await tab(page,'rl');await page.click('#rl-g');await sleep(150);assert.match(await live(),/^Rolled \d+\. /);
  await clickText(page,'#rl-ctl .tab','Coin');await sleep(150);assert.match(await live(),/^(Heads|Tails)$/);
  await page.click('#rl-cp');await sleep(150);assert.equal(await live(),'Copied');
  await tab(page,'pk');await page.type('#pk-t','Ana\nBen');await page.click('#pk-g');await sleep(150);assert.match(await live(),/^(Ana|Ben)$/);
  await tab(page,'tb');await setValue(page,'#tb-rows input.num','9');await sleep(200);assert.equal(await live(),'9 rows, 5 columns ready');
  await press(page,'#sc-pa');await setValue(page,'#sc-ta','oops');await press(page,'#sc-ap');
  assert.equal(await page.$eval('#sc-er',e=>e.getAttribute('role')),'alert');
  assert.deepEqual(errors,[]);await page.close();
});
test('accessibility: keyboard focus is visible in both themes and the page can be tabbed through',async()=>{
  for(const scheme of ['light','dark']){
    const {page,errors}=await open({scheme});
    await page.evaluate(()=>{window.__seen=new Set()});
    for(let i=0;i<14;i++){
      await page.keyboard.press('Tab');
      const r=await page.evaluate(()=>{const e=document.activeElement;window.__seen.add(e);const c=getComputedStyle(e),root=getComputedStyle(document.documentElement).getPropertyValue('--ac').trim(),n=parseInt(root.slice(1),16);return{tag:e.tagName+'#'+e.id+'.'+e.className,style:c.outlineStyle,w:parseFloat(c.outlineWidth),color:c.outlineColor,ac:'rgb('+[n>>16,n>>8&255,n&255].join(', ')+')'}});
      assert.equal(r.style,'solid',scheme+' '+r.tag);assert.ok(r.w>=2,scheme+' '+r.tag);assert.equal(r.color,r.ac,scheme+' '+r.tag);
    }
    assert.equal(await page.evaluate(()=>window.__seen.size),14);assert.deepEqual(errors,[]);await page.close();
  }
});

const field=(page,root,label,code,arg)=>page.evaluate(({root,label,code,arg})=>{const f=[...document.querySelectorAll(root+' .f')].find(x=>x.querySelector('.lb').textContent===label);if(!f)throw new Error('no field '+label);return new Function('f','arg',code)(f,arg)},{root,label,code,arg});
const setField=(page,root,label,v)=>field(page,root,label,'const i=f.querySelector("input.num")||f.querySelector("input");i.value=arg;i.dispatchEvent(new Event("input",{bubbles:true}))',v);
const choose=(page,root,label,v)=>field(page,root,label,'f.querySelector(".dd-b").click();[...f.querySelectorAll(".dd-o")].find(o=>o.dataset.v===arg||o.textContent===arg).click()',v);
const labels=(page,root)=>page.evaluate(root=>[...document.querySelectorAll(root+' .f')].filter(f=>!f.hidden).map(f=>f.querySelector('.lb').textContent),root);
const btn=(page,sel,t)=>page.evaluate((sel,t)=>{const e=[...document.querySelectorAll(sel)].find(x=>x.textContent.trim()===t);if(!e)throw new Error('no '+t);e.scrollIntoView({block:'center'});e.click()},sel,t);
const store=(page,k)=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),k);

test('tools: every control shows in token mode and each kind makes its shape',async()=>{
  const {page,errors}=await open();await tab(page,'tk');
  assert.deepEqual(await labels(page,'#tk-ctl'),['What to make','Kind','Length','Prefix, like sk_live_','How many']);
  for(const [k,re,len,note] of [['hex',/^[0-9a-f]{32}$/,true,/^128 bits/],['b64',/^[A-Za-z0-9_-]{32}$/,true,/^192 bits/],['nanoid',/^[A-Za-z0-9_-]{21}$/,true,/^126 bits/],['uuid',/^[0-9a-f-]{36}$/,false,/^122 random bits$/],['ulid',/^[0-9A-HJKMNP-TV-Z]{26}$/,false,/^80 random bits, sortable by time$/],['ksuid',/^[0-9A-Za-z]{27}$/,false,/^128 random bits, sortable by time$/]]){
    await choose(page,'#tk-ctl','Kind',k);
    assert.match(await text(page,'#tk-out'),re,k);assert.match(await text(page,'#tk-e'),note,k);assert.equal((await labels(page,'#tk-ctl')).includes('Length'),len,k);
  }
  await choose(page,'#tk-ctl','Kind','b62');await setField(page,'#tk-ctl','Prefix, like sk_live_','sk_');assert.match(await text(page,'#tk-out'),/^sk_[A-Za-z0-9]{21}$/);
  await choose(page,'#tk-ctl','How many','5');assert.equal((await page.$$('#tk-list .li')).length,4);
  assert.deepEqual(errors,[]);await page.close();
});
test('tools: lorem text is seeded, sized by its unit and counted',async()=>{
  const {page,errors}=await open();await tab(page,'tk');await clickText(page,'#tk-ctl .tab','Lorem text');
  assert.deepEqual(await labels(page,'#tk-ctl'),['What to make','Unit','Amount','Seed, optional: the same seed repeats the same text']);
  const out=()=>text(page,'#tk-out');
  assert.equal((await out()).split('\n\n').length,3);assert.match(await text(page,'#tk-e'),/^\d+ words$/);
  await setField(page,'#tk-ctl','Seed, optional: the same seed repeats the same text','abc');const a=await out();await page.click('#tk-g');assert.equal(await out(),a);
  await setField(page,'#tk-ctl','Seed, optional: the same seed repeats the same text','abd');assert.notEqual(await out(),a);
  await choose(page,'#tk-ctl','Unit','words');await setField(page,'#tk-ctl','Amount','40');assert.equal((await out()).split(' ').length,40);assert.equal(await text(page,'#tk-e'),'40 words');
  await setField(page,'#tk-ctl','Amount','999999');assert.equal((await out()).split(' ').length,1000);
  await setField(page,'#tk-ctl','Amount','1');await choose(page,'#tk-ctl','Unit','sentences');assert.match(await out(),/^[A-Z][^.]*\.$/);
  assert.deepEqual(errors,[]);await page.close();
});
test('tools: palettes show contrast, keep locked colors, and copy in the chosen format',async()=>{
  const {page,errors}=await open();await tab(page,'tk');await clickText(page,'#tk-ctl .tab','Color palette');
  const colors=()=>page.$$eval('#tk-sw .cp',b=>b.map(x=>x.querySelector('span').textContent));
  const cp=await page.$$eval('#tk-sw .cp',b=>b.map(x=>x.textContent));cp.forEach(x=>assert.match(x,/^#[0-9a-f]{6} \d+\.\d:1 (AAA|AA)$/));
  assert.match(await page.$eval('#tk-sw .cp',b=>b.getAttribute('aria-label')),/^#[0-9a-f]{6} \d+\.\d:1 (AAA|AA)\. Copy\.$/);
  assert.equal(await page.$eval('#tk-sw .c:nth-child(2) .lk',b=>b.getAttribute('aria-pressed')),'false');
  const before=await colors();
  await page.$eval('#tk-sw .c:nth-child(2) .lk',b=>b.click());
  assert.equal(await page.$eval('#tk-sw .c:nth-child(2) .lk',b=>b.getAttribute('aria-pressed')),'true');assert.equal(await page.evaluate(()=>document.activeElement.className),'lk');assert.deepEqual(await colors(),before);
  let moved=0;for(let i=0;i<6;i++){await page.click('#tk-g');const c=await colors();assert.equal(c[1],before[1]);if(c[0]!==before[0])moved++}
  assert.ok(moved>=4);
  await page.$eval('#tk-sw .c:nth-child(2) .lk',b=>b.click());let changed=false;for(let i=0;i<6&&!changed;i++){await page.click('#tk-g');changed=(await colors())[1]!==before[1]}assert.ok(changed);
  await trapClipboard(page);
  await choose(page,'#tk-ctl','Copy as','css');await page.click('#tk-cp');await sleep(100);
  assert.match(await page.evaluate(()=>window.__clip.at(-1)),/^:root \{\n  --color-1: #[0-9a-f]{6};\n  --color-2: #[0-9a-f]{6};\n  --color-3: #[0-9a-f]{6};\n  --color-4: #[0-9a-f]{6};\n  --color-5: #[0-9a-f]{6};\n\}$/);
  await choose(page,'#tk-ctl','Copy as','rgb');assert.match((await colors())[0],/^rgb\(\d+, \d+, \d+\)$/);
  await page.click('#tk-cp');await sleep(100);assert.equal((await page.evaluate(()=>window.__clip.at(-1))).split('\n').length,5);
  await page.click('#tk-sw .cp');await sleep(100);assert.match(await page.evaluate(()=>window.__clip.at(-1)),/^rgb\(\d+, \d+, \d+\)$/);
  await choose(page,'#tk-ctl','Copy as','hsl');assert.match((await colors())[2],/^hsl\(\d+, \d+%, \d+%\)$/);
  await choose(page,'#tk-ctl','Copy as','css');assert.match((await colors())[0],/^#[0-9a-f]{6}$/);await page.click('#tk-sw .cp');await sleep(100);assert.match(await page.evaluate(()=>window.__clip.at(-1)),/^--color-1: #[0-9a-f]{6};$/);
  await setField(page,'#tk-ctl','Colors','8');assert.equal((await page.$$('#tk-sw .cp')).length,8);await setField(page,'#tk-ctl','Colors','3');assert.equal((await page.$$('#tk-sw .cp')).length,3);
  assert.deepEqual(errors,[]);await page.close();
});

test('password: pattern mode follows the pattern, explains mistakes and reports entropy',async()=>{
  const {page,errors}=await open();await clickText(page,'#pw-ctl .tab','Pattern');
  assert.deepEqual(await labels(page,'#pw-ctl'),['Type','Quick start','Pattern','Examples','Classes','Privacy','How many','Site presets']);
  assert.match(await text(page,'#pw-out'),/^[BCDFGHJKLMNPQRSTVWXYZ][aeiou][a-z]{2}-[BCDFGHJKLMNPQRSTVWXYZ][aeiou][a-z]{2}-\d{4}$/);
  await setField(page,'#pw-ctl','Pattern','LLLL-9999');assert.match(await text(page,'#pw-out'),/^[A-Z]{4}-\d{4}$/);assert.equal(await text(page,'#pw-e'),'weak, 32 bits of entropy');
  await setField(page,'#pw-ctl','Pattern','x');assert.ok(await page.$('#pw-out.empty'));assert.match(await text(page,'#pw-out'),/^Fix the pattern below/);
  assert.match(await field(page,'#pw-ctl','Pattern','return f.querySelector(".err").textContent'),/Unknown class “x”/);assert.equal(await field(page,'#pw-ctl','Pattern','return f.querySelector(".err").hidden'),false);assert.equal(await text(page,'#pw-e'),'');
  await btn(page,'#pw-ctl .chip','hhhh-hhhh');assert.match(await text(page,'#pw-out'),/^[0-9a-f]{4}-[0-9a-f]{4}$/);assert.equal(await field(page,'#pw-ctl','Pattern','return f.querySelector(".err").hidden'),true);assert.equal(await field(page,'#pw-ctl','Pattern','return f.querySelector("input").value'),'hhhh-hhhh');
  await setField(page,'#pw-ctl','Pattern','');assert.ok(await page.$('#pw-out.empty'));
  await setField(page,'#pw-ctl','Pattern','c{3}\\9s');assert.match(await text(page,'#pw-out'),/^[a-z]{3}9[!@#$%&*\-_=+?]$/);
  await choose(page,'#pw-ctl','How many','5');assert.equal((await page.$$('#pw-list .li')).length,4);
  assert.equal((await store(page,'rz-p')).pat,'c{3}\\9s');assert.equal((await store(page,'rz-p')).mode,'pat');
  assert.deepEqual(errors,[]);await page.close();
  const again=await open({storage:{'rz-p':JSON.stringify({mode:'pat',pat:'99'})}});assert.match(await text(again.page,'#pw-out'),/^\d\d$/);await again.page.close();
});
test('password: short word list shows honest bits per word',async()=>{
  const {page,errors}=await open();await clickText(page,'#pw-ctl .tab','Memorable words');
  assert.equal(await field(page,'#pw-ctl','Per word','return f.querySelector(".sub").textContent'),'12.9 bits per word. Add words to make up for a shorter list.');
  const longBits=+(await text(page,'#pw-e')).match(/(\d+) bits/)[1];
  await choose(page,'#pw-ctl','Word list','short');
  assert.equal(await field(page,'#pw-ctl','Per word','return f.querySelector(".sub").textContent'),'10.5 bits per word. Add words to make up for a shorter list.');
  assert.match(await text(page,'#pw-out'),/^([A-Za-z]{3,5}-){5}[A-Za-z]{3,5}-\d{4}$/);assert.ok(+(await text(page,'#pw-e')).match(/(\d+) bits/)[1]<longBits);
  assert.equal((await store(page,'rz-p')).wl,'short');
  assert.deepEqual(errors,[]);await page.close();
});
test('password: site presets save, apply, replace, delete and survive bad storage',async()=>{
  const {page,errors}=await open();
  await btn(page,'#pw-ctl .btn','Save settings');assert.equal(await field(page,'#pw-ctl','Site presets','return f.querySelector(".err").hidden'),false);
  assert.equal(await field(page,'#pw-ctl','Site presets','return f.querySelector(".err").textContent'),'Give the preset a name.');
  await setField(page,'#pw-ctl','Length','12');assert.equal((await text(page,'#pw-out')).length,12);
  await page.evaluate(()=>{const i=document.querySelector('[aria-label="Preset name"]');i.value='Bank, max 12';i.dispatchEvent(new Event('input',{bubbles:true}))});
  assert.equal(await field(page,'#pw-ctl','Site presets','return f.querySelector(".err").hidden'),true);
  await btn(page,'#pw-ctl .btn','Save settings');
  assert.deepEqual((await store(page,'rz-pp')).map(x=>[x.name,x.s.len]),[['Bank, max 12',12]]);
  assert.equal(await page.$eval('[aria-label="Preset name"]',e=>e.value),'');
  await setField(page,'#pw-ctl','Length','40');assert.equal((await text(page,'#pw-out')).length,40);
  await btn(page,'#pw-ctl .pre .chip:not(.x)','Bank, max 12');assert.equal((await text(page,'#pw-out')).length,12);assert.equal(await field(page,'#pw-ctl','Length','return f.querySelector("input.num").value'),'12');
  await setField(page,'#pw-ctl','Length','20');
  await page.evaluate(()=>{const i=document.querySelector('[aria-label="Preset name"]');i.value='bank, MAX 12';i.dispatchEvent(new Event('input',{bubbles:true}))});await btn(page,'#pw-ctl .btn','Save settings');
  const list=await store(page,'rz-pp');assert.equal(list.length,1);assert.equal(list[0].s.len,20);assert.equal(list[0].name,'bank, MAX 12');
  assert.equal(await page.$eval('#pw-ctl .pre .chip.x',e=>e.getAttribute('aria-label')),'Delete preset bank, MAX 12');
  await page.$eval('#pw-ctl .pre .chip.x',e=>e.click());assert.deepEqual(await store(page,'rz-pp'),[]);assert.equal((await page.$$('#pw-ctl .pre')).length,0);
  assert.match(await field(page,'#pw-ctl','Site presets','return f.querySelector(".sub").textContent'),/^Save the settings a site accepts/);
  assert.deepEqual(errors,[]);await page.close();
  const w=await open({storage:{'rz-pp':JSON.stringify([{name:'Wiki',s:{mode:'pin',pin:9}},{name:'bad',s:{len:'x',mode:'nope'}},5,null])}});
  assert.equal((await w.page.$$('#pw-ctl .pre')).length,2);await btn(w.page,'#pw-ctl .pre .chip:not(.x)','Wiki');assert.match(await text(w.page,'#pw-out'),/^\d{9}$/);
  assert.deepEqual(w.errors,[]);await w.page.close();
  const h=await open({storage:{'rz-pp':'{"not":"a list"}'}});assert.equal((await h.page.$$('#pw-ctl .pre')).length,0);assert.deepEqual(h.errors,[]);await h.page.close();
});

test('roll: odds are shown and update with the formula, and the rolled value is marked',async()=>{
  const {page,errors}=await open();await tab(page,'rl');
  const odds=()=>page.$eval('#rl-ctl .odds .sub',e=>e.textContent),bars=()=>page.$$eval('#rl-ctl .hist i',b=>b.length);
  assert.equal(await odds(),'Range 2 to 12, average 7, spread 2.42. Most likely 7.');assert.equal(await bars(),11);
  assert.equal(await page.$eval('#rl-ctl .hist',e=>e.getAttribute('role')),'img');assert.equal(await page.$eval('#rl-ctl .hist',e=>e.getAttribute('aria-label')),await odds());
  await page.click('#rl-g');assert.equal((await page.$$('#rl-ctl .hist i.on')).length,1);
  const rolled=+await text(page,'#rl-out');assert.equal(await page.$eval('#rl-ctl .hist i.on',e=>+e.dataset.lo),rolled);
  await setValue(page,'#rl-ctl input.in:not(.num)','4d6kh3');await waitFor(page,()=>/Estimated from 20,000 simulated rolls\.$/.test(document.querySelector('#rl-ctl .odds .sub').textContent));
  assert.match(await odds(),/^Range 3 to 18, average 12\.\d+, spread 2\.\d+\. Estimated from 20,000 simulated rolls\.$/);
  await setValue(page,'#rl-ctl input.in:not(.num)','1d6!');await waitFor(page,()=>/1 or more/.test(document.querySelector('#rl-ctl .odds .sub').textContent));
  await setValue(page,'#rl-ctl input.in:not(.num)','oops');await waitFor(page,()=>/Try a formula/.test(document.querySelector('#rl-ctl .odds .sub').textContent));assert.equal(await page.$eval('#rl-ctl .hist',e=>e.hidden),true);
  await setValue(page,'#rl-ctl input.in:not(.num)','d20+5');await waitFor(page,()=>/^Range 6 to 25/.test(document.querySelector('#rl-ctl .odds .sub').textContent));assert.equal(await page.$eval('#rl-ctl .hist',e=>e.hidden),false);
  assert.deepEqual(errors,[]);await page.close();
});
test('roll: the coin tally is kept, shown and can be reset',async()=>{
  const {page,errors}=await open();await tab(page,'rl');await clickText(page,'#rl-ctl .tab','Coin');
  const tally=()=>field(page,'#rl-ctl','Tally','return f.querySelector(".sub").textContent');
  assert.match(await tally(),/^Heads [01], Tails [01]$/);
  for(let i=0;i<5;i++)await page.click('#rl-g');
  const m=(await tally()).match(/^Heads (\d+), Tails (\d+)$/);assert.equal(+m[1]+ +m[2],6);assert.equal(await text(page,'#rl-e'),await tally());
  const saved=await store(page,'rz-rt');assert.equal(saved.h+saved.t,6);
  const b=await open({storage:{'rz-rt':JSON.stringify({h:12,t:8})}});await tab(b.page,'rl');await clickText(b.page,'#rl-ctl .tab','Coin');
  assert.match(await field(b.page,'#rl-ctl','Tally','return f.querySelector(".sub").textContent'),/^Heads (12|13), Tails (8|9)$/);
  await btn(b.page,'#rl-ctl .btn','Reset tally');assert.equal(await field(b.page,'#rl-ctl','Tally','return f.querySelector(".sub").textContent'),'Heads 0, Tails 0');assert.deepEqual(await store(b.page,'rz-rt'),{h:0,t:0});
  assert.equal(await text(b.page,'#rl-e'),'Heads 0, Tails 0');
  await b.page.click('#rl-g');assert.match(await text(b.page,'#rl-e'),/^Heads [01], Tails [01]$/);
  const h=await open({storage:{'rz-rt':'{"h":-5,"t":"x"}'}});await tab(h.page,'rl');await clickText(h.page,'#rl-ctl .tab','Coin');assert.match(await field(h.page,'#rl-ctl','Tally','return f.querySelector(".sub").textContent'),/^Heads [01], Tails [01]$/);
  assert.deepEqual(errors,[]);assert.deepEqual(b.errors,[]);assert.deepEqual(h.errors,[]);await page.close();await b.page.close();await h.page.close();
});

test('pick: several named lists can be created, switched, renamed and deleted',async()=>{
  const {page,errors}=await open({storage:{'rz-list':'Ana\nBen'}});await tab(page,'pk');
  assert.equal(await page.$eval('#pk-t',e=>e.value),'Ana\nBen');assert.equal(await page.$eval('[aria-label="List name"]',e=>e.value),'List 1');
  await btn(page,'#pk-ctl .btn','New list');
  assert.equal(await page.$eval('#pk-t',e=>e.value),'');assert.equal(await page.$eval('[aria-label="List name"]',e=>e.value),'List 2');assert.equal(await page.evaluate(()=>document.activeElement.id),'pk-t');
  await page.type('#pk-t','x,y,z');await setValue(page,'[aria-label="List name"]','Team');
  assert.equal(await page.$eval('#pk-ctl [aria-label="Saved list: Team"]',e=>e.textContent),'Team');
  let s=await store(page,'rz-list');assert.deepEqual(s.lists,[{name:'List 1',text:'Ana\nBen'},{name:'Team',text:'x,y,z'}]);assert.equal(s.cur,1);
  await choose(page,'#pk-ctl','Saved lists','0');assert.equal(await page.$eval('#pk-t',e=>e.value),'Ana\nBen');assert.equal(await page.$eval('[aria-label="List name"]',e=>e.value),'List 1');
  await page.click('#pk-g');assert.match(await text(page,'#pk-out'),/^(Ana|Ben)$/);assert.equal((await store(page,'rz-list')).cur,0);
  await btn(page,'#pk-ctl .btn','Delete list');assert.equal(await page.evaluate(()=>[...document.querySelectorAll('#pk-ctl .btn')].map(b=>b.textContent).includes('Tap again to delete')),true);assert.equal((await store(page,'rz-list')).lists.length,2);
  await btn(page,'#pk-ctl .btn','Tap again to delete');s=await store(page,'rz-list');assert.deepEqual(s.lists,[{name:'Team',text:'x,y,z'}]);assert.equal(await page.$eval('#pk-t',e=>e.value),'x,y,z');
  await btn(page,'#pk-ctl .btn','Delete list');await btn(page,'#pk-ctl .btn','Tap again to delete');s=await store(page,'rz-list');assert.deepEqual(s.lists,[{name:'List 1',text:''}]);assert.equal(await page.$eval('#pk-t',e=>e.value),'');
  await btn(page,'#pk-ctl .btn','Delete list');await sleep(3200);assert.equal(await page.evaluate(()=>[...document.querySelectorAll('#pk-ctl .btn')].map(b=>b.textContent).includes('Delete list')),true);assert.equal((await store(page,'rz-list')).lists.length,1);
  assert.deepEqual(errors,[]);await page.close();
});
test('pick: the list limit is explained and bad stored lists are ignored',async()=>{
  const many=JSON.stringify({lists:Array.from({length:20},(_,i)=>({name:'l'+i,text:'a'+i})),cur:3});
  const {page,errors}=await open({storage:{'rz-list':many}});await tab(page,'pk');
  assert.equal(await page.$eval('#pk-t',e=>e.value),'a3');await btn(page,'#pk-ctl .btn','New list');
  assert.equal(await field(page,'#pk-ctl','Saved lists','return f.querySelector(".err").textContent'),'You can keep up to 20 lists. Delete one first.');assert.equal(await field(page,'#pk-ctl','Saved lists','return f.querySelector(".err").hidden'),false);
  assert.equal((await store(page,'rz-list')).lists.length,20);assert.deepEqual(errors,[]);await page.close();
  const h=await open({storage:{'rz-list':'{"lists":[null,5,{"text":7}],"cur":"x"}'}});await tab(h.page,'pk');assert.equal(await h.page.$eval('#pk-t',e=>e.value),'');assert.deepEqual(h.errors,[]);await h.page.close();
});

test('table: unique values come out different and the table says when they cannot',async()=>{
  const {page,errors}=await open();await tab(page,'tb');
  const cell=(r,c)=>page.$eval(`#tb-t tbody tr:nth-child(${r}) td:nth-child(${c})`,e=>e.textContent);
  await page.$eval('.col:nth-child(4) input:nth-of-type(1)',()=>{});
  await page.evaluate(()=>{const c=document.querySelectorAll('#cols .col')[3],ins=c.querySelectorAll('input.in');ins[1].value='1';ins[1].dispatchEvent(new Event('input',{bubbles:true}));ins[2].value='5';ins[2].dispatchEvent(new Event('input',{bubbles:true}))});
  await setValue(page,'#tb-rows input.num','5');
  await page.evaluate(()=>[...document.querySelectorAll('#cols .col')][3].querySelector('.chip').click());
  const vals=[];for(let r=1;r<=5;r++)vals.push(await cell(r,4));assert.equal(new Set(vals).size,5);vals.forEach(v=>assert.match(v,/^[1-5]$/));
  assert.equal(await page.$$eval('#cols .col',c=>c[3].querySelector('.note').hidden),true);
  await setValue(page,'#tb-rows input.num','20');
  assert.match(await page.$$eval('#cols .col',c=>c[3].querySelector('.note').textContent),/^Only 5 different values are possible, but the table has 20 rows, so some repeat\./);
  assert.equal(await page.$$eval('#cols .col',c=>c[2].querySelector('.note').hidden),true);
  await page.evaluate(()=>[...document.querySelectorAll('#cols .col')][3].querySelector('.chip').click());assert.equal(await page.$$eval('#cols .col',c=>c[3].querySelector('.note').hidden),true);
  assert.deepEqual(errors,[]);await page.close();
});
test('table: columns can be moved up and down and duplicated, and the table follows',async()=>{
  const {page,errors}=await open();await tab(page,'tb');
  const names=()=>page.$$eval('#cols .col',cs=>cs.map(c=>c.querySelector('input.in').value)),heads=()=>page.$$eval('#tb-t thead th',h=>h.map(x=>x.textContent)),op=(i,o)=>page.$$eval('#cols .col',(cs,i,o)=>{const b=cs[i].querySelector(`[data-op="${o}"]`);b.click()},i,o);
  assert.deepEqual(await names(),['id','name','email','score','status']);
  assert.deepEqual(await page.$$eval('#cols .col',cs=>cs.map(c=>[c.querySelector('[data-op=up]').disabled,c.querySelector('[data-op=down]').disabled])),[[true,false],[false,false],[false,false],[false,false],[false,true]]);
  await op(1,'up');assert.deepEqual(await names(),['name','id','email','score','status']);assert.deepEqual(await heads(),['name','id','email','score','status']);
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.op+':'+[...document.querySelectorAll('#cols .col')].indexOf(document.activeElement.closest('.col'))),'down:0');
  await op(0,'down');assert.deepEqual(await names(),['id','name','email','score','status']);assert.equal(await page.evaluate(()=>[...document.querySelectorAll('#cols .col')].indexOf(document.activeElement.closest('.col'))),1);
  await op(1,'dup');assert.deepEqual(await names(),['id','name','name copy','email','score','status']);assert.deepEqual(await heads(),['id','name','name copy','email','score','status']);assert.equal(await page.evaluate(()=>[...document.querySelectorAll('#cols .col')].indexOf(document.activeElement.closest('.col'))),2);
  await op(1,'dup');assert.deepEqual(await names(),['id','name','name copy 2','name copy','email','score','status']);
  assert.match(await page.$$eval('#cols .col',cs=>cs[2].getAttribute('aria-label')),/^Column 3, name copy 2$/);assert.equal(await page.$$eval('#cols .col',cs=>cs[2].querySelector('[data-op=up]').getAttribute('aria-label')),'Move column 3 up, name copy 2');
  const emails=await page.$$eval('#tb-t tbody tr',r=>r.slice(0,5).map(x=>x.children[4].textContent));emails.forEach(e=>assert.match(e,/^[a-z]+\.[a-z]+@example\.com$/));
  assert.deepEqual((await store(page,'rz-t')).cols.map(c=>c.name),['id','name','name copy 2','name copy','email','score','status']);
  await op(2,'remove');assert.deepEqual(await names(),['id','name','name copy','email','score','status']);
  assert.deepEqual(errors,[]);await page.close();
  const cols=Array.from({length:60},(_,i)=>({name:'c'+i,t:'int',v:['0','9']}));
  const f=await open({storage:{'rz-t':JSON.stringify({cols,n:3})}});await tab(f.page,'tb');
  assert.equal((await f.page.$$('#cols .col')).length,60);
  await press(f.page,'#add');assert.equal(await text(f.page,'#col-er'),'A table can have up to 60 columns.');assert.equal((await f.page.$$('#cols .col')).length,60);
  await f.page.$$eval('#cols .col',cs=>cs[0].querySelector('[data-op=dup]').click());assert.equal(await text(f.page,'#col-er'),'A table can have up to 60 columns.');
  await f.page.$$eval('#cols .col',cs=>cs[0].querySelector('[data-op=remove]').click());assert.equal(await f.page.$eval('#col-er',e=>e.hidden),true);
  assert.deepEqual(f.errors,[]);await f.page.close();
});
test('table: new column types, city lookups and date arithmetic work from a schema',async()=>{
  const {page,errors}=await open();await tab(page,'tb');
  const opts=await page.$$eval('#cols .col:nth-child(1) .dd-o',o=>o.map(x=>x.textContent));
  for(const t of ['Decimal, uniform','Exponential','Log-normal','City','Weighted list','Built from columns'])assert.ok(opts.includes(t),t);
  const schema=JSON.stringify({cols:[{name:'city',t:'city'},{name:'country',t:'tpl',v:['{city|lookup}']},{name:'when',t:'date',v:['2024-02-28','2024-02-28']},{name:'later',t:'tpl',v:['{when|addDays:2|weekday} {when|addMonths:12}']},{name:'amount',t:'lognormal',v:['8','1','2']},{name:'wait',t:'exp',v:['5','1']},{name:'big',t:'int',v:['1234567','1234567']},{name:'fmt',t:'tpl',v:['{big|num} {wait|pad:6}']}],n:60,hdr:1,fmt:'tsv',seed:'schema'});
  await press(page,'#sc-pa');await setValue(page,'#sc-ta',schema);await press(page,'#sc-ap');await sleep(200);
  const rows=await page.$$eval('#tb-t tbody tr',r=>r.map(x=>[...x.children].map(c=>c.textContent)));
  assert.equal(rows.length,60);
  for(const r of rows){assert.ok(r[0]);assert.ok(r[1],r[0]);assert.equal(r[3],'Friday 2025-02-28');assert.match(r[4],/^\d+\.\d\d$/);assert.ok(+r[4]>0);assert.match(r[5],/^\d+\.\d$/);assert.match(r[7],/^1,234,567 [\d.]+$/)}
  const known={Tokyo:'Japan',Paris:'France',London:'United Kingdom','New York':'United States',Madrid:'Spain'};for(const r of rows)if(known[r[0]])assert.equal(r[1],known[r[0]]);
  assert.ok(new Set(rows.map(r=>r[0])).size>20);
  assert.ok(await page.$eval('#tb-t thead th:nth-child(5)',e=>e.classList.contains('n')));
  assert.deepEqual(errors,[]);await page.close();
});

const RAW='#pw-out,#pw-list,#tb-t,#pk-out,#rl-out,#tk-out,#tk-list,#sh-l,.ref,.raw,#tk-sw .cp>span,#rl-e,.hist,#lang .dd-o:not([data-v=auto])';
const untranslated=page=>page.evaluate(raw=>{
  const bad=[],skip=e=>e.closest(raw)||e.closest('script,style')||e.closest('.brand'),w=s=>/[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F]/.test(s),ok=s=>/^\u27e6[\s\S]*\u27e7$/.test(s);
  const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  for(let n=walk.nextNode();n;n=walk.nextNode()){const s=n.textContent.trim();if(s&&w(s)&&!skip(n.parentElement)&&!ok(s))bad.push('text: '+s)}
  for(const e of document.querySelectorAll('*')){if(skip(e))continue;for(const a of ['aria-label','placeholder','title']){const v=e.getAttribute(a);if(v&&w(v)&&!ok(v)&&!(a==='placeholder'&&e.matches('input.in')&&!e.closest('#pk-ctl')&&['Cvcc-999','2d6+3','1','100','0'].includes(v)))bad.push(a+': '+v+' ('+e.tagName+'.'+e.className+')')}}
  return bad},RAW);
test('translation: with a pseudo language every interface string goes through the table',async()=>{
  const {page,errors}=await open({storage:{'rz-lang':'xx'}});
  assert.equal(await page.evaluate(()=>document.documentElement.lang),'en');
  const bad=[];
  for(const t of TABS){await tab(page,t);bad.push(...(await untranslated(page)).map(x=>t+' '+x))}
  assert.deepEqual([...new Set(bad)],[]);
  assert.match(await text(page,'#mode'),/^\u27e6System\u27e7$/);assert.match(await page.$eval('#mode',e=>e.getAttribute('aria-label')),/^\u27e6Theme: \u27e6System\u27e7\. Press to change\.\u27e7$/);
  assert.deepEqual(errors,[]);await page.close();
});
test('translation: messages, errors and empty states are translated too',async()=>{
  const {page,errors}=await open({storage:{'rz-lang':'xx'}});
  const seen=[];const check=async w=>{seen.push(...(await untranslated(page)).map(x=>w+' '+x))};
  await clickText(page,'#pw-ctl .tab','⟦Pattern⟧');await setField(page,'#pw-ctl','⟦Pattern⟧','x');await check('pattern error');
  await setField(page,'#pw-ctl','⟦Pattern⟧','');await check('pattern empty');
  await clickText(page,'#pw-ctl .tab','⟦Characters⟧');await page.evaluate(()=>[...document.querySelectorAll('#pw-ctl .chip')].filter(c=>/Lowercase|Uppercase|Digits|Symbols/.test(c.textContent)).forEach(c=>c.click()));await check('no character types');
  await btn(page,'#pw-ctl .btn','⟦Save settings⟧');await check('preset error');
  await tab(page,'tb');await press(page,'#sc-pa');await setValue(page,'#sc-ta','nope');await press(page,'#sc-ap');await check('schema error');
  await setValue(page,'#tb-rows input.num','30000');await sleep(30);await check('progress');
  await waitFor(page,()=>/30[.,\u202f\u00a0]?000/.test(document.querySelector('#tb-info').textContent)&&!/Generating/.test(document.querySelector('#tb-info').textContent));await check('table info');
  await page.evaluate(()=>{const c=document.querySelectorAll('#cols .col')[3],i=c.querySelectorAll('input.in');i[1].value='1';i[1].dispatchEvent(new Event('input',{bubbles:true}));i[2].value='3';i[2].dispatchEvent(new Event('input',{bubbles:true}));c.querySelector('.chip').click()});await sleep(500);await check('unique note');
  await page.evaluate(()=>{const c=document.querySelectorAll('#cols .col')[2],i=c.querySelector('input:not(.num)');});
  await tab(page,'pk');await setValue(page,'#pk-t','');await page.click('#pk-g');await check('pick empty');
  await btn(page,'#pk-ctl .btn','⟦Delete list⟧');await check('delete armed');
  await tab(page,'rl');await setValue(page,'#rl-ctl input.in:not(.num)','oops');await sleep(300);await check('dice error');
  await setValue(page,'#rl-ctl input.in:not(.num)','4d6kh3');await sleep(500);await check('dice odds estimate');
  await clickText(page,'#rl-ctl .tab','⟦Coin⟧');await check('coin');
  await clickText(page,'#rl-ctl .tab','⟦Number⟧');await check('number');
  await tab(page,'tk');await clickText(page,'#tk-ctl .tab','⟦Color palette⟧');await check('palette');await clickText(page,'#tk-ctl .tab','⟦Lorem text⟧');await check('lorem');
  await page.click('#sh-o');await sleep(100);await check('history');
  assert.deepEqual([...new Set(seen)],[]);assert.deepEqual(errors,[]);await page.close();
});

const nav=page=>page.$$eval('.nv span',s=>s.map(x=>x.textContent));
test('language: the browser language chooses the interface and the page language',async()=>{
  for(const [langs,html,labels,sample] of [[['fr-CA','en'],'fr',['Mot de passe','Tableau','Choisir','Lancer','Outils'],/^(faible|correct|bon|fort|très fort|hors de portée de la force brute), \d+ bits d’entropie$/],[['de-DE'],'de',['Passwort','Tabelle','Auswahl','Würfeln','Werkzeuge'],/^(schwach|mittel|gut|stark|sehr stark|jenseits von Brute Force), \d+ Bit Entropie$/],[['es-ES','en'],'es',['Contraseña','Tabla','Elegir','Tirar','Utilidades'],/^(débil|aceptable|buena|fuerte|muy fuerte|a prueba de fuerza bruta), \d+ bits de entropía$/],[['ja'],'en',['Password','Table','Pick','Roll','Tools'],/^(weak|fair|good|strong|very strong|beyond brute force), \d+ bits of entropy$/]]){
    const {page,errors}=await open({langs});
    assert.equal(await page.evaluate(()=>document.documentElement.lang),html);assert.deepEqual(await nav(page),labels);assert.match(await text(page,'#pw-e'),sample);
    assert.equal(await page.$eval('.nav',e=>e.getAttribute('aria-label')),{fr:'Sections',de:'Bereiche',es:'Secciones',en:'Sections'}[html]);
    assert.deepEqual(errors,[]);await page.close();
  }
});
test('language: choosing a language in the header switches the interface and is remembered',async()=>{
  const {page,errors}=await open();
  assert.equal(await page.$eval('#lang .dd-b',e=>e.getAttribute('aria-label')),'Language: Auto');assert.equal(await text(page,'#lang .dd-b'),'Auto');
  assert.deepEqual(await page.$$eval('#lang .dd-o',o=>o.map(x=>x.textContent)),['Auto','English','Español','Français','Deutsch']);
  const go=page.waitForNavigation();await clickText(page,'#lang .dd-o','Español');await go;await sleep(300);
  assert.equal(await page.evaluate(()=>localStorage.getItem('rz-lang')),'es');assert.equal(await page.evaluate(()=>document.documentElement.lang),'es');
  assert.deepEqual(await nav(page),['Contraseña','Tabla','Elegir','Tirar','Utilidades']);assert.equal(await text(page,'#lang .dd-b'),'Español');assert.equal(await page.$eval('#lang .dd-b',e=>e.getAttribute('aria-label')),'Idioma: Español');
  assert.equal(await text(page,'#sh-o'),'Historial');assert.equal(await text(page,'#pw-cp'),'Copiar');assert.match(await page.$eval('#mode',e=>e.getAttribute('aria-label')),/^Tema: /);
  await tab(page,'tb');assert.match(await text(page,'#tb-info'),/^20 filas, 5 columnas$/);assert.equal(await text(page,'#tb-dl'),'Guardar archivo');
  await setValue(page,'#tb-rows input.num','1');await sleep(100);assert.equal(await text(page,'#tb-info'),'1 fila, 5 columnas');
  await setValue(page,'#tb-rows input.num','12345');await waitFor(page,()=>/12\.?345 filas|12 345 filas|12345 filas/.test(document.querySelector('#tb-info').textContent));
  await tab(page,'rl');assert.match(await text(page,'#rl-e'),/^2d6 \[\d, \d\]$/);await clickText(page,'#rl-ctl .tab','Moneda');assert.match(await text(page,'#rl-out'),/^(Cara|Cruz)$/);assert.match(await text(page,'#rl-e'),/^Cara \d+, Cruz \d+$/);
  const back=page.waitForNavigation();await page.evaluate(()=>{const g=document.querySelector('#lang');g.querySelector('.dd-b').click();[...g.querySelectorAll('.dd-o')].find(o=>o.dataset.v==='auto').click()});await back;await sleep(300);
  assert.equal(await page.evaluate(()=>localStorage.getItem('rz-lang')),'auto');assert.deepEqual(await nav(page),['Password','Table','Pick','Roll','Tools']);
  assert.deepEqual(errors,[]);await page.close();
});
test('language: the language menu works from the keyboard',async()=>{
  const {page,errors}=await open();
  await page.focus('#lang .dd-b');await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.v),'auto');
  await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.dataset.v),'fr');
  const go=page.waitForNavigation();await page.keyboard.press('Enter');await go;await sleep(300);
  assert.equal(await page.evaluate(()=>document.documentElement.lang),'fr');assert.deepEqual(await nav(page),['Mot de passe','Tableau','Choisir','Lancer','Outils']);
  assert.deepEqual(errors,[]);await page.close();
});
test('language: results, plurals and messages read correctly in each language',async()=>{
  const expectFor={
    fr:{tb:/^20 lignes, 5 colonnes$/,count:'1 ligne, 5 colonnes',coin:/^Face \d+, Pile \d+$/,odds:/^Plage 2 à 12, moyenne 7, écart 2,42\. Le plus probable\u00a0: 7\.$/,pat:/^Corrigez le motif/,perr:/^Classe inconnue «\u00a0x\u00a0»/},
    de:{tb:/^20 Zeilen, 5 Spalten$/,count:'1 Zeile, 5 Spalten',coin:/^Kopf \d+, Zahl \d+$/,odds:/^Bereich 2 bis 12, Durchschnitt 7, Streuung 2,42\. Am wahrscheinlichsten: 7\.$/,pat:/^Korrigiere das Muster/,perr:/^Unbekannte Klasse „x“/},
    es:{tb:/^20 filas, 5 columnas$/,count:'1 fila, 5 columnas',coin:/^Cara \d+, Cruz \d+$/,odds:/^Rango 2 a 12, media 7, dispersión 2,42\. Lo más probable: 7\.$/,pat:/^Corrige el patrón/,perr:/^Clase desconocida «x»/}
  };
  for(const [l,e] of Object.entries(expectFor)){
    const {page,errors}=await open({storage:{'rz-lang':l}});
    await tab(page,'tb');assert.match(await text(page,'#tb-info'),e.tb,l);await setValue(page,'#tb-rows input.num','1');await sleep(100);assert.equal(await text(page,'#tb-info'),e.count,l);
    await tab(page,'rl');assert.match(await page.$eval('#rl-ctl .odds .sub',x=>x.textContent),e.odds,l);
    await page.evaluate(()=>[...document.querySelectorAll('#rl-ctl .tab')][1].click());assert.match(await text(page,'#rl-e'),e.coin,l);
    await tab(page,'pw');await page.evaluate(()=>[...document.querySelectorAll('#pw-ctl .tab')][4].click());
    await setField(page,'#pw-ctl',await page.evaluate(()=>[...document.querySelectorAll('#pw-ctl .f')].find(f=>!f.hidden&&f.querySelector('input.in'))&&[...document.querySelectorAll('#pw-ctl .f')].filter(f=>!f.hidden&&f.querySelector('input.in'))[0].querySelector('.lb').textContent),'x');
    assert.match(await text(page,'#pw-out'),e.pat,l);assert.match(await page.$eval('#pw-ctl .err:not([hidden])',x=>x.textContent),e.perr,l);
    assert.deepEqual(errors,[],l);await page.close();
  }
});
test('language: every language fits a narrow phone on every tab',async()=>{
  for(const l of ['de','fr','es']){
    const {page,errors}=await open({width:320,height:640,storage:{'rz-lang':l}});
    for(const t of TABS){
      await tab(page,t);
      const r=await page.evaluate(()=>({wide:document.documentElement.scrollWidth>innerWidth+1,clip:[...document.querySelectorAll('.nv span,.btn,.tab,.chip,.lb,.ball')].filter(e=>e.offsetParent&&e.scrollWidth>e.clientWidth+1&&getComputedStyle(e).overflow!=='visible').map(e=>e.className+':'+e.textContent.slice(0,30))}));
      assert.equal(r.wide,false,l+' '+t);assert.deepEqual(r.clip,[],l+' '+t);
    }
    assert.deepEqual(errors,[],l);await page.close();
  }
});

const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.webmanifest':'application/manifest+json'};
function serve({headers,patch=null}={}){
  const rules=headers||JSON.parse(readFileSync(join(root,'vercel.json'),'utf8')).headers,state={patch,hits:[]},dir=join(root,'dist');
  const srv=http.createServer((req,res)=>{
    const path=new URL(req.url,'http://x').pathname;state.hits.push(path);
    const name=path==='/'?'index.html':path.slice(1),full=join(dir,name);
    if(!full.startsWith(dir)||!existsSync(full)||!statSync(full).isFile()){res.writeHead(404);res.end('not found');return}
    let body=readFileSync(full);
    if(state.patch){const p=state.patch(name,body.toString('utf8'));if(typeof p==='string')body=Buffer.from(p)}
    const h={'Content-Type':TYPES[extname(name)]||'application/octet-stream'};
    for(const r of rules)if(new RegExp('^'+r.source+'$').test(path))for(const x of r.headers)h[x.key]=x.value;
    res.writeHead(200,h);res.end(body)});
  return new Promise(ok=>srv.listen(0,'127.0.0.1',()=>ok({url:'http://127.0.0.1:'+srv.address().port,state,close:()=>new Promise(r=>srv.close(r))})));
}
let strictBrowser=null;
const strict=async()=>strictBrowser||(strictBrowser=await puppeteer.launch({args:chromium.args.filter(a=>!/disable-web-security/.test(a)),executablePath:await chromium.executablePath(),headless:'shell'}));
async function openHttp(url,{width=390,height=844}={}){
  const page=await (await strict()).newPage(),errors=[],outside=[],origin=new URL(url).origin;
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  page.on('request',r=>{const u=r.url();if(!u.startsWith(origin)&&!u.startsWith('data:')&&!u.startsWith('blob:'))outside.push(u)});
  await page.evaluateOnNewDocument(()=>{window.__v=[];document.addEventListener('securitypolicyviolation',e=>window.__v.push(e.violatedDirective+' '+e.blockedURI))});
  await page.setViewport({width,height});await page.goto(url);await sleep(500);
  return{page,errors,outside};
}
const cacheKeys=page=>page.evaluate(()=>caches.keys());
const fontCheck=page=>page.evaluate(async()=>{const r={};for(const f of ['500 14px "Instrument Sans"','500 14px "Geist Mono"','20px "Instrument Serif"']){await document.fonts.load(f).catch(()=>[]);r[f]=document.fonts.check(f)}return r});

test('hosting: the real security headers are applied and the page, fonts and files all work under them',async()=>{
  const s=await serve();
  try{
    const {page,errors,outside}=await openHttp(s.url+'/');
    assert.deepEqual(await nav(page),['Password','Table','Pick','Roll','Tools']);assert.match(await text(page,'#pw-e'),/bits of entropy$/);
    await page.click('#pw-g');await tab(page,'tb');assert.match(await text(page,'#tb-info'),/^20 rows, 5 columns$/);await tab(page,'tk');await clickText(page,'#tk-ctl .tab','Color palette');assert.equal((await page.$$('#tk-sw .cp')).length,5);
    assert.deepEqual(await fontCheck(page),{'500 14px "Instrument Sans"':true,'500 14px "Geist Mono"':true,'20px "Instrument Serif"':true});
    assert.deepEqual(await page.evaluate(()=>window.__v),[]);assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
    await page.close();
    const p2=await serve({patch:(name,body)=>name==='index.html'?body.replace('</body>','<script>try{eval("1");window.__ev="allowed"}catch(e){window.__ev=e.name}fetch("https://example.com/x").then(()=>{window.__net="allowed"},()=>{window.__net="blocked"});new Image().src="https://example.com/i.png"</script></body>'):null});
    const probe=await openHttp(p2.url+'/');
    assert.equal(await probe.page.evaluate(()=>window.__ev),'EvalError');assert.equal(await probe.page.evaluate(()=>window.__net),'blocked');
    const v=await probe.page.evaluate(()=>window.__v);assert.ok(v.some(x=>x.startsWith('script-src')),JSON.stringify(v));assert.ok(v.some(x=>x.startsWith('connect-src')),JSON.stringify(v));assert.ok(v.some(x=>x.startsWith('img-src')),JSON.stringify(v));
    assert.deepEqual(await nav(probe.page),['Password','Table','Pick','Roll','Tools']);await probe.page.close();await p2.close();
  }finally{await s.close()}
});
test('install: the service worker caches the app, it works offline, and it updates in place',async()=>{
  const s=await serve();
  try{
    const {page,errors}=await openHttp(s.url+'/');
    await page.evaluate(()=>navigator.serviceWorker.ready);
    assert.match(await page.evaluate(()=>navigator.serviceWorker.getRegistration().then(r=>r.active.scriptURL)),/\/sw\.js$/);
    const want=readFileSync(join(root,'dist/sw.js'),'utf8').match(/const CACHE='([^']+)'/)[1];
    await waitFor(page,w=>caches.keys().then(k=>k.includes(w)),want).catch(()=>{});
    await sleep(300);assert.deepEqual(await cacheKeys(page),[want]);
    assert.equal(await page.evaluate(async n=>(await (await caches.open(n)).keys()).length,want),6);
    const m=await page.evaluate(()=>{const l=document.querySelector('link[rel=manifest]');return fetch(l.href).then(r=>r.json()).then(j=>({href:l.getAttribute('href'),name:j.name,icons:j.icons.length}))});
    assert.deepEqual(m,{href:'manifest.webmanifest',name:'randomizer',icons:3});
    assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('meta[name=theme-color]')].map(e=>e.media+'|'+e.content)),['(prefers-color-scheme: light)|#e9ebec','(prefers-color-scheme: dark)|#141518']);
    const cdp=await page.createCDPSession();
    const inst=await cdp.send('Page.getInstallabilityErrors');
    assert.ok(Array.isArray(inst.installabilityErrors),JSON.stringify(inst));assert.deepEqual(inst.installabilityErrors,[],JSON.stringify(inst));
    await page.setOfflineMode(true);await page.reload();await sleep(500);
    assert.deepEqual(await nav(page),['Password','Table','Pick','Roll','Tools']);await page.click('#pw-g');assert.match(await text(page,'#pw-e'),/bits of entropy$/);
    assert.equal(await page.evaluate(()=>!!navigator.serviceWorker.controller),true);
    await page.setOfflineMode(false);
    s.state.patch=(name,body)=>name==='index.html'?body.replace('<title>randomizer</title>','<title>randomizer v2</title>'):name==='sw.js'?body.replace(/rz-[0-9a-f]{12}/,'rz-0000updated'):null;
    await page.evaluate(()=>navigator.serviceWorker.getRegistration().then(r=>r.update()));
    await waitFor(page,()=>caches.keys().then(k=>k.length===1&&k[0]==='rz-0000updated')).catch(()=>{});
    await sleep(500);assert.deepEqual(await cacheKeys(page),['rz-0000updated']);
    await page.setOfflineMode(true);await page.reload();await sleep(500);
    assert.equal(await page.title(),'randomizer v2');assert.deepEqual(await nav(page),['Password','Table','Pick','Roll','Tools']);
    await page.setOfflineMode(false);
    assert.deepEqual(errors.filter(e=>!/Failed to load resource|net::ERR_INTERNET_DISCONNECTED/.test(e)),[]);await page.close();
  }finally{await s.close()}
});
test('install: opening the file directly adds no worker or manifest, and the install button follows the browser prompt',async()=>{
  const {page,errors,external}=await open();
  assert.equal(await page.evaluate(()=>document.querySelector('link[rel=manifest]')),null);assert.equal(await page.evaluate(()=>navigator.serviceWorker?navigator.serviceWorker.controller:null),null);
  assert.equal(await page.$eval('#install',e=>e.hidden),true);assert.equal(await text(page,'#install'),'Install app');
  const fire=()=>page.evaluate(()=>{const ev=new Event('beforeinstallprompt',{cancelable:true});ev.prompt=()=>{window.__prompted=(window.__prompted||0)+1;return Promise.resolve()};window.dispatchEvent(ev);return ev.defaultPrevented});
  assert.equal(await fire(),true);assert.equal(await page.$eval('#install',e=>e.hidden),false);
  await page.click('#install');await sleep(50);assert.equal(await page.evaluate(()=>window.__prompted),1);assert.equal(await page.$eval('#install',e=>e.hidden),true);
  await fire();assert.equal(await page.$eval('#install',e=>e.hidden),false);await page.evaluate(()=>window.dispatchEvent(new Event('appinstalled')));assert.equal(await page.$eval('#install',e=>e.hidden),true);
  assert.deepEqual(await page.$$eval('.hr > *',e=>e.map(x=>x.id)),['lang','install','sh-o','mode']);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await page.close();
  const g=await open({langs:['de']});
  await g.page.evaluate(()=>{const ev=new Event('beforeinstallprompt',{cancelable:true});ev.prompt=()=>Promise.resolve();window.dispatchEvent(ev)});assert.equal(await text(g.page,'#install'),'App installieren');assert.deepEqual(g.errors,[]);await g.page.close();
});

test('hosted: the page has no worker or install code and shows Save only when the downloads capability is granted',async()=>{
  for(const [mode,visible] of [['none',false],['null',false],['pending',false],['ok',true]]){
    const {page,errors}=await open({url:artifactFile,claude:mode});await tab(page,'tb');
    assert.equal(await page.$eval('#tb-dl',e=>e.hidden),!visible,mode);
    assert.equal(await page.evaluate(()=>document.querySelector('link[rel=manifest]')),null);assert.equal(await page.evaluate(()=>navigator.serviceWorker?navigator.serviceWorker.controller:null),null);
    await page.evaluate(()=>window.dispatchEvent(new Event('beforeinstallprompt',{cancelable:true})));assert.equal(await page.$eval('#install',e=>e.hidden),true);
    assert.match(await text(page,'#tb-info'),/^20 rows, 5 columns$/);await page.click('#tb-cp');assert.deepEqual(errors,[],mode);await page.close();
  }
  const w=await open();await tab(w.page,'tb');assert.equal(await w.page.$eval('#tb-dl',e=>e.hidden),false);await w.page.close();
});
test('hosted: saving hands the file to the host with an allowed name, and every refusal is explained',async()=>{
  const {page,errors}=await open({url:artifactFile,claude:'ok'});await tab(page,'tb');
  const saves=()=>page.evaluate(()=>window.__saves);
  await press(page,'#tb-dl');await sleep(100);
  let a=await saves();assert.equal(a.length,1);assert.equal(a[0].filename,'randomizer.txt');assert.equal(a[0].kind,'string');assert.match(a[0].head,/^id\tname\temail\tscore\tstatus\n1\t/);
  for(const [fmt,name,head] of [['csv','randomizer.csv',/^id,name,email,score,status\n1,/],['json','randomizer.json',/^\[\n?\s*\{/],['md','randomizer.md',/^\| id \| name/],['sql','randomizer.txt',/^INSERT|^CREATE|^--/i]]){
    await page.evaluate(f=>{const g=document.querySelector('#tb-fm');g.querySelector('.dd-b').click();[...g.querySelectorAll('.dd-o')].find(o=>o.dataset.v===f).click()},fmt);
    await press(page,'#tb-dl');await sleep(100);a=await saves();const last=a.at(-1);assert.equal(last.filename,name);assert.match(last.head,head,fmt);assert.ok(['txt','csv','json','md'].includes(last.filename.split('.').pop()));
  }
  assert.equal(await page.$eval('#dl-er',e=>e.hidden),true);
  await setValue(page,'#tb-rows input.num','60000');await waitFor(page,()=>/^60,000 rows/.test(document.querySelector('#tb-info').textContent),null,40000);
  await page.evaluate(()=>{const g=document.querySelector('#tb-fm');g.querySelector('.dd-b').click();[...g.querySelectorAll('.dd-o')].find(o=>o.dataset.v==='csv').click()});
  await press(page,'#tb-dl');await sleep(300);const big=(await saves()).at(-1);assert.equal(big.kind,'blob');assert.ok(big.size>1e6,String(big.size));
  assert.deepEqual(errors,[]);await page.close();
  for(const [mode,want] of [['declined',''],['rate','Another save is waiting for an answer. Try again in a moment.'],['large','That file is too large to save here. Try fewer rows.'],['unavailable','The file could not be saved.']]){
    const r=await open({url:artifactFile,claude:mode});await tab(r.page,'tb');await press(r.page,'#tb-dl');await sleep(150);
    const hidden=await r.page.$eval('#dl-er',e=>e.hidden),msg=await text(r.page,'#dl-er');
    if(want===''){assert.equal(hidden,true,mode);assert.equal(msg,'')}else{assert.equal(hidden,false,mode);assert.equal(msg,want);assert.equal(await r.page.$eval('#dl-er',e=>e.getAttribute('role')),'alert');assert.equal(await text(r.page,'#live'),want)}
    await r.page.$eval('#tb-g',e=>e.click());await press(r.page,'#tb-dl');await sleep(100);assert.deepEqual(r.errors,[],mode);await r.page.close();
  }
});
test('hosted: the page works under a host policy modelled on the documented limits, and degrades cleanly if fonts are blocked',async()=>{
  const HOST="default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://cdn.tailwindcss.com https://code.jquery.com; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src data:; connect-src 'none'; base-uri 'none'";
  const s=await serve({headers:[{source:'/(.*)',headers:[{key:'Content-Security-Policy',value:HOST}]}]});
  try{
    const {page,errors,outside}=await openHttp(s.url+'/artifact.html');
    assert.deepEqual(await nav(page),['Password','Table','Pick','Roll','Tools']);
    await tab(page,'tb');await setValue(page,'#tb-rows input.num','3000');await waitFor(page,()=>/^3,000 rows/.test(document.querySelector('#tb-info').textContent));
    await tab(page,'rl');await page.click('#rl-g');await tab(page,'tk');await page.click('#tk-g');
    assert.deepEqual(await fontCheck(page),{'500 14px "Instrument Sans"':true,'500 14px "Geist Mono"':true,'20px "Instrument Serif"':true});
    assert.deepEqual(await page.evaluate(()=>window.__v),[]);assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);await page.close();
    const f=await openHttp(s.url+'/artifact.html');await f.page.close();
  }finally{await s.close()}
  const blocked=await serve({headers:[{source:'/(.*)',headers:[{key:'Content-Security-Policy',value:HOST.replace("font-src https://fonts.gstatic.com data:","font-src 'none'")}]}]});
  try{
    const {page,errors}=await openHttp(blocked.url+'/artifact.html');
    const v=await page.evaluate(()=>window.__v);assert.ok(v.some(x=>x.startsWith('font-src')),JSON.stringify(v));
    assert.equal((await fontCheck(page))['500 14px "Instrument Sans"'],false);
    assert.deepEqual(await nav(page),['Password','Table','Pick','Roll','Tools']);await page.click('#pw-g');assert.match(await text(page,'#pw-e'),/bits of entropy$/);
    const fams=await page.evaluate(()=>[getComputedStyle(document.body).fontFamily,getComputedStyle(document.querySelector('#pw-out')).fontFamily]);
    assert.match(fams[0],/system-ui|sans-serif/);assert.match(fams[1],/monospace/);
    assert.ok(errors.every(e=>/font|Content Security Policy/i.test(e)),errors.join('|'));await page.close();
  }finally{await blocked.close()}
});

test('shell: Space generates and c copies on every tab, and neither gets in the way of typing or other shortcuts',async()=>{
  const {page,errors}=await open();await trapClipboard(page);
  const clips=()=>page.evaluate(()=>window.__clip.length),last=()=>page.evaluate(()=>window.__clip.at(-1));
  await page.keyboard.press('Space');await sleep(50);const a=await text(page,'#pw-out');await page.keyboard.press('Space');await sleep(50);assert.notEqual(await text(page,'#pw-out'),a);
  await page.keyboard.press('c');await sleep(100);assert.equal(await last(),(await text(page,'#pw-out')));assert.equal(await text(page,'#pw-cp'),'Copied');
  const n=await clips();
  await page.keyboard.down('Control');await page.keyboard.press('c');await page.keyboard.up('Control');
  await page.keyboard.down('Meta');await page.keyboard.press('c');await page.keyboard.up('Meta');
  await page.keyboard.down('Alt');await page.keyboard.press('Space');await page.keyboard.up('Alt');await sleep(100);assert.equal(await clips(),n);
  const sym=await page.evaluateHandle(()=>[...document.querySelectorAll('#pw-ctl .f')].find(f=>f.querySelector('.lb').textContent==='Symbols to use').querySelector('input'));
  await sym.asElement().focus();await page.keyboard.press('Space');await page.keyboard.press('c');await sleep(100);assert.equal(await clips(),n);assert.match(await sym.asElement().evaluate(e=>e.value),/ c$/);
  await sym.asElement().evaluate(e=>e.blur());
  await tab(page,'rl');await away(page);const r=await text(page,'#rl-e');await page.keyboard.press('Space');await sleep(60);await page.keyboard.press('Space');await sleep(60);await page.keyboard.press('c');await sleep(100);assert.equal(await last(),await text(page,'#rl-out'));
  await tab(page,'pk');await away(page);await page.type('#pk-t','Ana\nBen');await page.$eval('#pk-t',e=>e.blur());await page.keyboard.press('Space');await sleep(60);assert.match(await text(page,'#pk-out'),/^(Ana|Ben)$/);await page.keyboard.press('c');await sleep(100);assert.equal(await last(),await text(page,'#pk-out'));
  await tab(page,'tb');await away(page);await page.keyboard.press('c');await sleep(100);assert.match(await last(),/^id\tname\temail\tscore\tstatus\n1\t/);
  await tab(page,'tk');await away(page);await page.keyboard.press('Space');await sleep(60);await page.keyboard.press('c');await sleep(100);assert.equal(await last(),await text(page,'#tk-out'));
  await page.focus('#mode');await page.keyboard.press('Space');await sleep(100);assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme!==undefined),true);
  await page.evaluate(()=>{document.activeElement.blur();window.scrollTo(0,0)});await page.evaluate(()=>{document.body.style.minHeight='3000px'});await page.keyboard.press('Space');await sleep(100);assert.equal(await page.evaluate(()=>scrollY),0);
  assert.deepEqual(errors,[]);await page.close();
});
test('shell: the chosen tab and theme are remembered, and the theme cycles in order',async()=>{
  const {page,errors}=await open();
  assert.equal(await text(page,'#mode'),'System');
  const mode=async()=>({label:await text(page,'#mode'),theme:await page.evaluate(()=>document.documentElement.dataset.theme),saved:await page.evaluate(()=>localStorage.getItem('rz-mode')),aria:await page.$eval('#mode',e=>e.getAttribute('aria-label'))});
  assert.deepEqual(await mode(),{label:'System',theme:'light',saved:null,aria:'Theme: System. Press to change.'});
  await page.click('#mode');assert.deepEqual(await mode(),{label:'Light',theme:'light',saved:'light',aria:'Theme: Light. Press to change.'});
  await page.click('#mode');assert.deepEqual(await mode(),{label:'Dark',theme:'dark',saved:'dark',aria:'Theme: Dark. Press to change.'});
  const ico=decodeURIComponent((await page.$eval('#ico',e=>e.href)).replace('data:image/svg+xml,',''));const ac=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--ac').trim());assert.ok(ico.includes(ac),ico);
  await page.click('#mode');assert.deepEqual(await mode(),{label:'System',theme:'light',saved:'system',aria:'Theme: System. Press to change.'});
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'dark'}]);await sleep(100);assert.equal((await mode()).theme,'dark');
  await page.click('#mode');await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);await sleep(100);assert.equal((await mode()).theme,'light');
  assert.deepEqual(errors,[]);await page.close();
  const d=await open({storage:{'rz-mode':'dark','rz-tab':'rl'}});
  assert.equal(await text(d.page,'#mode'),'Dark');assert.equal(await d.page.evaluate(()=>document.documentElement.dataset.theme),'dark');assert.equal(await d.page.$eval('#rl-v',e=>e.hidden),false);assert.equal(await d.page.$eval('#pw-v',e=>e.hidden),true);assert.equal(await d.page.$eval('.nv.on',e=>e.dataset.t),'rl');
  await tab(d.page,'tk');assert.equal(await d.page.evaluate(()=>localStorage.getItem('rz-tab')),'tk');assert.deepEqual(d.errors,[]);await d.page.close();
  const h=await open({storage:{'rz-mode':'neon','rz-tab':'nope'}});assert.equal(await text(h.page,'#mode'),'System');assert.equal(await h.page.$eval('#pw-v',e=>e.hidden),false);assert.deepEqual(h.errors,[]);await h.page.close();
});
test('clipboard: copied passwords are cleared after the delay unless that is turned off, and failures fall back',async()=>{
  const fast=page=>page.evaluate(()=>{const st=window.setTimeout;window.setTimeout=(f,ms,...a)=>st(f,ms>=40000?60:ms,...a)});
  const {page,errors}=await open();await trapClipboard(page);await fast(page);
  const clips=()=>page.evaluate(()=>window.__clip.slice());
  await page.click('#pw-cp');await sleep(250);let c=await clips();assert.equal(c.length,2);assert.equal(c[0],await text(page,'#pw-out'));assert.equal(c[1],' ');
  await page.click('#pw-cp');await sleep(20);await page.click('#pw-cp');await sleep(300);c=await clips();assert.equal(c.slice(2).filter(x=>x===' ').length,1,JSON.stringify(c.map(x=>x.length)));assert.equal(c.length,5);
  await tab(page,'rl');await page.click('#rl-cp');await sleep(250);c=await clips();assert.equal(c.length,6);assert.notEqual(c.at(-1),' ');
  await tab(page,'pw');await clickText(page,'#pw-ctl .chip','Clear clipboard after 45 seconds');assert.equal(await page.evaluate(()=>[...document.querySelectorAll('#pw-ctl .chip')].find(c=>c.textContent==='Clear clipboard after 45 seconds').getAttribute('aria-pressed')),'false');
  await page.click('#pw-cp');await sleep(250);c=await clips();assert.equal(c.length,7);assert.notEqual(c.at(-1),' ');assert.equal((await store(page,'rz-p')).clr,0);
  assert.deepEqual(errors,[]);await page.close();
  const f=await open();await f.page.evaluate(()=>{window.__exec=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('denied')}}});const e=document.execCommand.bind(document);document.execCommand=c=>{window.__exec.push(c+':'+document.activeElement.tagName+':'+(window.getSelection().toString()||document.activeElement.value||''));return true}});
  await f.page.click('#pw-cp');await sleep(100);const ex=await f.page.evaluate(()=>window.__exec);assert.equal(ex.length,1);assert.match(ex[0],/^copy:TEXTAREA:/);assert.equal(await text(f.page,'#pw-cp'),'Copied');assert.equal(await f.page.evaluate(()=>document.querySelectorAll('body > textarea').length),0);
  await sleep(1250);assert.equal(await text(f.page,'#pw-cp'),'Copy');assert.deepEqual(f.errors,[]);await f.page.close();
});
test('clipboard: a copied history entry keeps its label, and copy buttons get their text back',async()=>{
  const {page,errors}=await open();await trapClipboard(page);
  await page.click('#pw-g');await sleep(60);await tab(page,'rl');await page.click('#rl-g');await sleep(60);
  await page.click('#sh-o');await sleep(100);
  const items=()=>page.$$eval('#sh-l .li',l=>l.map(x=>({label:x.querySelector('.h-t')&&x.querySelector('.h-t').textContent,text:x.textContent})));
  const before=await items();assert.ok(before.length>=2);before.forEach(i=>assert.ok(i.label,JSON.stringify(i)));
  await page.$eval('#sh-l .li',b=>b.click());await sleep(80);assert.equal(await page.$eval('#sh-l .li',b=>b.textContent),'Copied');
  await sleep(1250);const after=await items();assert.deepEqual(after,before);assert.equal(await page.$eval('#sh-l .li',b=>b.classList.contains('ok')),false);
  await page.$eval('#sh-cp',b=>b.click());await sleep(80);assert.equal(await text(page,'#sh-cp'),'Copied');await sleep(1250);assert.equal(await text(page,'#sh-cp'),'Copy all');
  assert.deepEqual(errors,[]);await page.close();
});

const axeSource=readFileSync(join(root,'node_modules/axe-core/axe.min.js'),'utf8');
const axeRun=async(page,where)=>{
  await sleep(450);
  await page.evaluate(src=>{if(!window.axe)(0,eval)(src)},axeSource);
  const r=await page.evaluate(()=>axe.run(document,{resultTypes:['violations']}));
  return r.violations.flatMap(v=>v.nodes.map(n=>`${where} ${v.id} (${v.impact}) ${n.target.join(' ')}: ${((n.any[0]||n.all[0]||n.none[0]||{}).message||'').slice(0,120)}`));
};
test('accessibility: an automated audit finds no violations on any tab, in either theme, or in the main states',async()=>{
  const bad=[];
  for(const scheme of ['light','dark']){
    const {page,errors}=await open({scheme,width:390,height:900});
    for(const t of TABS){await tab(page,t);bad.push(...await axeRun(page,`${scheme} ${t}`))}
    await tab(page,'pw');
    for(const m of ['Memorable words','PIN','Pronounceable','Pattern','Characters']){await clickText(page,'#pw-ctl .tab',m);bad.push(...await axeRun(page,`${scheme} pw ${m}`))}
    await clickText(page,'#pw-ctl .tab','Pattern');await setField(page,'#pw-ctl','Pattern','x');bad.push(...await axeRun(page,`${scheme} pattern error`));
    await clickText(page,'#pw-ctl .tab','Characters');await choose(page,'#pw-ctl','How many','5');bad.push(...await axeRun(page,`${scheme} five passwords`));
    await page.evaluate(()=>{const i=document.querySelector('[aria-label="Preset name"]');i.value='Bank';i.dispatchEvent(new Event('input',{bubbles:true}))});await btn(page,'#pw-ctl .btn','Save settings');bad.push(...await axeRun(page,`${scheme} presets`));
    await tab(page,'tb');await press(page,'#sc-pa');await setValue(page,'#sc-ta','nope');await press(page,'#sc-ap');bad.push(...await axeRun(page,`${scheme} schema error`));
    await page.evaluate(()=>{const c=document.querySelectorAll('#cols .col')[3],i=c.querySelectorAll('input.in');i[1].value='1';i[1].dispatchEvent(new Event('input',{bubbles:true}));i[2].value='3';i[2].dispatchEvent(new Event('input',{bubbles:true}));c.querySelector('.chip').click()});await sleep(200);bad.push(...await axeRun(page,`${scheme} unique note`));
    await tab(page,'pk');await btn(page,'#pk-ctl .btn','New list');await page.type('#pk-t','a,b,c,d');await clickText(page,'#pk-ctl .tab','Teams');bad.push(...await axeRun(page,`${scheme} teams`));
    await tab(page,'rl');await page.click('#rl-g');bad.push(...await axeRun(page,`${scheme} dice odds`));await clickText(page,'#rl-ctl .tab','Coin');bad.push(...await axeRun(page,`${scheme} coin`));await clickText(page,'#rl-ctl .tab','Number');bad.push(...await axeRun(page,`${scheme} number`));
    await tab(page,'tk');await clickText(page,'#tk-ctl .tab','Color palette');await page.$eval('#tk-sw .c:nth-child(2) .lk',b=>b.click());bad.push(...await axeRun(page,`${scheme} palette`));
    await clickText(page,'#tk-ctl .tab','Lorem text');bad.push(...await axeRun(page,`${scheme} lorem`));await clickText(page,'#tk-ctl .tab','Token');await choose(page,'#tk-ctl','Kind','ulid');bad.push(...await axeRun(page,`${scheme} ulid`));
    await page.evaluate(()=>{const g=document.querySelector('#lang');g.querySelector('.dd-b').click()});bad.push(...await axeRun(page,`${scheme} language menu`));await page.keyboard.press('Escape');
    await page.click('#sh-o');await sleep(120);bad.push(...await axeRun(page,`${scheme} history`));
    assert.deepEqual(errors,[]);await page.close();
  }
  assert.deepEqual([...new Set(bad)],[]);
});
test('accessibility: the audit is clean in each language on a narrow phone',async()=>{
  const bad=[];
  for(const l of ['de','fr','es']){
    const {page,errors}=await open({width:320,height:700,storage:{'rz-lang':l}});
    for(const t of TABS){await tab(page,t);bad.push(...await axeRun(page,`${l} ${t}`))}
    assert.deepEqual(errors,[]);await page.close();
  }
  const d=await open({scheme:'dark',width:1200,height:800});for(const t of TABS){await tab(d.page,t);bad.push(...await axeRun(d.page,`desktop dark ${t}`))}await d.page.close();
  assert.deepEqual([...new Set(bad)],[]);
});

let failed=0;
for(const [name,fn] of tests){
  try{await fn();console.log('ok   ',name)}
  catch(e){failed++;console.log('FAIL ',name,'\n     ',String(e.message).split('\n').slice(0,40).join('\n      '))}
}
await browser.close();
if(strictBrowser)await strictBrowser.close();
console.log(failed?`${failed} of ${tests.length} failed`:`all ${tests.length} passed`);
process.exit(failed?1:0);
