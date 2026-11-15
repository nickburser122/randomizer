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

let failed=0;
for(const [name,fn] of tests){
  try{await fn();console.log('ok   ',name)}
  catch(e){failed++;console.log('FAIL ',name,'\n     ',String(e.message).split('\n').slice(0,6).join('\n      '))}
}
await browser.close();
console.log(failed?`${failed} of ${tests.length} failed`:`all ${tests.length} passed`);
process.exit(failed?1:0);
