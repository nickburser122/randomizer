import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';

const file='file://'+resolve(dirname(fileURLToPath(import.meta.url)),'../dist/randomizer.html');
const browser=await puppeteer.launch({args:chromium.args,executablePath:await chromium.executablePath(),headless:'shell'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const TABS=['pw','tb','pk','rl','tk'];

async function open({width=390,height=844,scheme='light',storage={}}={}){
  const page=await browser.newPage(),errors=[],external=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.setRequestInterception(true);
  page.on('request',r=>{const u=r.url();if(u.startsWith('file:')||u.startsWith('data:')||u.startsWith('blob:'))r.continue();else{external.push(u);r.abort()}});
  await page.evaluateOnNewDocument(s=>{localStorage.clear();for(const[k,v]of Object.entries(s))localStorage.setItem(k,v)},storage);
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:scheme},{name:'prefers-reduced-motion',value:'reduce'}]);
  await page.setViewport({width,height});
  await page.goto(file);await sleep(300);
  return{page,errors,external};
}
const tab=async(page,t)=>{await page.click(`.nv[data-t="${t}"]`);await sleep(80)};
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
  await clickText(page,'#tk-ctl .tab','Color palette');assert.equal((await page.$$('#tk-sw button')).length,5);
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
  assert.deepEqual(visible,['Type','Quick start','Syllables','Grouping','Style','Privacy','How many']);
  await clickText(page,'#pw-ctl .chip','Add 4 digits');await clickText(page,'#pw-ctl .chip','Capitalize');
  assert.match(await text(page,'#pw-out'),/^[a-z]{6}(-[a-z]{6}){3}$/);
  await page.click('#pw-ctl .dd-b');await clickText(page,'#pw-ctl .dd-o','None');
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
    if(t==='pw')for(const m of ['Characters','Memorable words','PIN','Pronounceable']){await clickText(page,'#pw-ctl .tab',m);bad.push(...(await page.evaluate(nameOf)).map(x=>m+' '+x))}
    else if(t==='tb'){
      await press(page,'#sc-pa');
      bad.push(...(await page.evaluate(nameOf)).map(x=>t+' '+x))
    }
    else if(t==='pk'){for(const m of ['Pick','Shuffle','Teams']){await clickText(page,'#pk-ctl .tab',m);bad.push(...(await page.evaluate(nameOf)).map(x=>m+' '+x))}}
    else if(t==='rl'){for(const m of ['Dice','Coin','Number']){await clickText(page,'#rl-ctl .tab',m);bad.push(...(await page.evaluate(nameOf)).map(x=>m+' '+x))}}
    else {for(const m of ['Token','Color palette']){await clickText(page,'#tk-ctl .tab',m);bad.push(...(await page.evaluate(nameOf)).map(x=>m+' '+x))}}
  }
  await page.click('#sh-o');bad.push(...(await page.evaluate(nameOf)).map(x=>'history '+x));
  assert.deepEqual(bad,[]);assert.deepEqual(errors,[]);await page.close();
});
test('accessibility: segmented controls, nav, theme and history buttons expose their state',async()=>{
  const {page,errors}=await open();
  const pressed=sel=>page.$$eval(sel,b=>b.map(x=>x.getAttribute('aria-pressed')));
  assert.deepEqual(await pressed('#pw-ctl .tab'),['true','false','false','false']);
  await clickText(page,'#pw-ctl .tab','PIN');assert.deepEqual(await pressed('#pw-ctl .tab'),['false','false','true','false']);
  assert.deepEqual(await page.$$eval('.nv',b=>b.map(x=>x.getAttribute('aria-current'))),['page','false','false','false','false']);
  await tab(page,'rl');assert.deepEqual(await page.$$eval('.nv',b=>b.map(x=>x.getAttribute('aria-current'))),['false','false','false','page','false']);
  assert.match(await page.$eval('#mode',e=>e.getAttribute('aria-label')),/^Theme: system\. /);
  await page.click('#mode');assert.match(await page.$eval('#mode',e=>e.getAttribute('aria-label')),/^Theme: light\. /);
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

let failed=0;
for(const [name,fn] of tests){
  try{await fn();console.log('ok   ',name)}
  catch(e){failed++;console.log('FAIL ',name,'\n     ',String(e.message).split('\n').slice(0,6).join('\n      '))}
}
await browser.close();
console.log(failed?`${failed} of ${tests.length} failed`:`all ${tests.length} passed`);
process.exit(failed?1:0);
