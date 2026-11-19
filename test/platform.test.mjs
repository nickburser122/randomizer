import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';

const store=new Map();
globalThis.localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v))};

const {getSaver,saveMessage}=await import('../src/core/download.js');
const {initPwa}=await import('../src/core/pwa.js');
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('platform: without a build target the code behaves as the web build',async()=>{assert.equal(typeof RZ_TARGET,'undefined');const h=fakeEnv();initPwa(()=>{},h.env);assert.equal(h.links.length,1)});

test('hosted download: no capability means no save button',async()=>{
  assert.equal(await getSaver('artifact',{}),null);assert.equal(await getSaver('artifact',undefined),null);assert.equal(await getSaver('artifact',null),null);
  assert.equal(await getSaver('artifact',{claude:{}}),null);assert.equal(await getSaver('artifact',{claude:{use:5}}),null);
  assert.equal(await getSaver('artifact',{claude:{use:async()=>null}}),null);assert.equal(await getSaver('artifact',{claude:{use:async()=>undefined}}),null);
  assert.equal(await getSaver('artifact',{claude:{use:async()=>{throw new Error('no')}}}),null);assert.equal(await getSaver('artifact',{claude:{use:()=>{throw new Error('sync')}}}),null);
  assert.equal(await getSaver('artifact',{claude:{use:async()=>({})}}),null);assert.equal(await getSaver('artifact',{claude:{use:async()=>({save:1})}}),null);
});
test('hosted download: a granted capability is asked for the downloads namespace and handed the file',async()=>{
  const calls=[],asked=[];
  const env={claude:{use:async n=>{asked.push(n);return{save:async r=>{calls.push(r);return{status:'saved'}}}}}};
  const s=await getSaver('artifact',env);
  assert.equal(typeof s,'function');assert.deepEqual(asked,['downloads']);
  assert.deepEqual(await s('randomizer.csv','a,b\n1,2'),{status:'saved'});assert.deepEqual(calls,[{filename:'randomizer.csv',data:'a,b\n1,2'}]);
  const blob=new Blob(['x']);await s('randomizer.txt',blob);assert.equal(calls[1].data,blob);
  const rejecting=await getSaver('artifact',{claude:{use:async()=>({save:async()=>{throw{code:'declined',message:'no'}}})}});
  await assert.rejects(()=>rejecting('f.txt','x'),{code:'declined'});
});
test('hosted download: every rejection code gets the right message',()=>{
  assert.equal(saveMessage({code:'declined',message:'x'}),'');
  assert.equal(saveMessage({code:'rate_limited'}),'Another save is waiting for an answer. Try again in a moment.');
  assert.equal(saveMessage({code:'too_large'}),'That file is too large to save here. Try fewer rows.');
  for(const c of ['rejected_extension','extension_not_enabled','bad_request','request_unknown','not_signed','unavailable','not_granted','capability_disabled','capability_removed','transform_error','something_new'])assert.equal(saveMessage({code:c}),'The file could not be saved.',c);
  for(const e of [undefined,null,'x',5,{},new Error('boom'),[]])assert.equal(saveMessage(e),'The file could not be saved.');
});

function fakeEnv({protocol='https:',standalone=false,sw=true}={}){
  const listeners={},links=[],registered=[];
  const env={
    location:{protocol},
    navigator:sw?{serviceWorker:{register:async u=>{registered.push(u);return{}}}}:{},
    matchMedia:q=>({matches:standalone&&q==='(display-mode: standalone)'}),
    document:{createElement:()=>({}),head:{append:l=>links.push(l)}},
    addEventListener:(n,f)=>{(listeners[n]=listeners[n]||[]).push(f)},
    fire:(n,e)=>(listeners[n]||[]).forEach(f=>f(e))
  };
  return{env,links,registered,listeners};
}
test('install: a service worker and manifest are only added over http, and the worker waits for load',()=>{
  for(const protocol of ['file:','about:','blob:','data:'])assert.deepEqual((({env,links,registered})=>{initPwa(()=>{},env);env.fire('load');return[links.length,registered.length]})(fakeEnv({protocol})),[0,0],protocol);
  const h=fakeEnv();initPwa(()=>{},h.env);
  assert.equal(h.links.length,1);assert.equal(h.links[0].rel,'manifest');assert.equal(h.links[0].href,'manifest.webmanifest');assert.deepEqual(h.registered,[]);
  h.env.fire('load');assert.deepEqual(h.registered,['sw.js']);
  const http=fakeEnv({protocol:'http:'});initPwa(()=>{},http.env);http.env.fire('load');assert.deepEqual(http.registered,['sw.js']);
  const none=fakeEnv({sw:false});assert.doesNotThrow(()=>{initPwa(()=>{},none.env);none.env.fire('load')});assert.deepEqual(none.registered,[]);
  const failing=fakeEnv();failing.env.navigator.serviceWorker.register=async()=>{throw new Error('blocked')};initPwa(()=>{},failing.env);assert.doesNotThrow(()=>failing.env.fire('load'));
});
test('install: the install prompt is kept until the person asks for it',async()=>{
  const seen=[],h=fakeEnv();let prevented=0,prompted=0;
  const p=initPwa(v=>seen.push(v),h.env);
  assert.equal(await p.install(),false);assert.deepEqual(seen,[]);
  const ev={preventDefault:()=>{prevented++},prompt:async()=>{prompted++}};
  h.env.fire('beforeinstallprompt',ev);assert.equal(prevented,1);assert.deepEqual(seen,[true]);assert.equal(prompted,0);
  assert.equal(await p.install(),true);assert.equal(prompted,1);assert.deepEqual(seen,[true,false]);
  assert.equal(await p.install(),false);assert.equal(prompted,1);
  h.env.fire('beforeinstallprompt',{preventDefault(){},prompt:async()=>{throw new Error('dismissed')}});assert.equal(await p.install(),false);
  h.env.fire('beforeinstallprompt',ev);h.env.fire('appinstalled');assert.deepEqual(seen.slice(-1),[false]);assert.equal(await p.install(),false);
  const s=fakeEnv({standalone:true}),seen2=[];initPwa(v=>seen2.push(v),s.env);s.env.fire('beforeinstallprompt',{preventDefault(){},prompt:async()=>{}});assert.deepEqual(seen2,[]);
});

test('build: the web and hosted pages are produced within budget with the right parts',()=>{
  execFileSync('node',['build.mjs'],{cwd:new URL('../',import.meta.url)});
  const web=read('dist/randomizer.html'),art=read('dist/artifact.html'),idx=read('dist/index.html');
  assert.equal(web,idx);
  const budget=JSON.parse(read('budget.json'));assert.ok(web.length<=budget.html*1024);assert.ok(art.length<=budget.html*1024);
  assert.deepEqual(Object.keys(budget).sort(),['css','html','js']);
  assert.ok(web.includes('manifest.webmanifest')&&web.includes('serviceWorker')&&web.includes('sw.js'));
  for(const s of ['serviceWorker','manifest.webmanifest','sw.js','beforeinstallprompt','apple-touch-icon','theme-color'])assert.ok(!art.includes(s),'artifact has '+s);
  assert.doesNotMatch(web,/<link[^>]*rel="manifest"/);
  const tokens=read('src/styles/01-tokens.css'),light=tokens.match(/:root\{[^}]*--bg:(#[0-9a-f]{6})/i)[1].toLowerCase(),dark=tokens.match(/data-theme="dark"\]\{[^}]*--bg:(#[0-9a-f]{6})/i)[1].toLowerCase();
  assert.ok(web.includes(`media="(prefers-color-scheme: light)" content="${light}"`));assert.ok(web.includes(`media="(prefers-color-scheme: dark)" content="${dark}"`));
  assert.equal(JSON.parse(read('dist/manifest.webmanifest')).theme_color,light);
  for(const h of [web,art]){assert.doesNotMatch(h.replace(/data:[^)"']+/g,''),/https?:\/\/(?!www\.w3\.org\/2000\/svg)/);assert.ok(h.includes('data:font/woff2;base64,'))}
  assert.ok(web.includes('<html lang="en">'));assert.ok(art.includes('window.claude')||art.includes('claude'));
});
const png=p=>{const b=readFileSync(new URL('../'+p,import.meta.url));assert.equal(b.subarray(1,4).toString(),'PNG');return[b.readUInt32BE(16),b.readUInt32BE(20)]};
test('build: the manifest describes an installable app whose icons exist at their stated sizes',()=>{
  const m=JSON.parse(read('dist/manifest.webmanifest'));
  assert.equal(m.name,'randomizer');assert.equal(m.short_name,'randomizer');assert.equal(m.display,'standalone');assert.equal(m.start_url,'./');assert.equal(m.scope,'./');assert.equal(m.id,'./');
  assert.match(m.background_color,/^#[0-9a-f]{6}$/);assert.match(m.theme_color,/^#[0-9a-f]{6}$/);assert.ok(m.description.length>20);
  const any=m.icons.filter(i=>i.purpose==='any'),mask=m.icons.filter(i=>i.purpose==='maskable');
  assert.deepEqual(any.map(i=>i.sizes).sort(),['192x192','512x512']);assert.equal(mask.length,1);assert.equal(mask[0].sizes,'512x512');
  for(const i of m.icons){assert.equal(i.type,'image/png');assert.ok(existsSync(new URL('../dist/'+i.src,import.meta.url)),i.src);assert.deepEqual(png('dist/'+i.src),i.sizes.split('x').map(Number),i.src)}
  assert.deepEqual(png('dist/icons/apple-touch-icon.png'),[180,180]);
  const web=read('dist/randomizer.html');assert.ok(web.includes('href="icons/apple-touch-icon.png"'));
  for(const f of ['icon-192.png','icon-512.png','icon-maskable-512.png','apple-touch-icon.png'])assert.deepEqual(readFileSync(new URL('../assets/icons/'+f,import.meta.url)),readFileSync(new URL('../dist/icons/'+f,import.meta.url)));
});

function worker(files){
  const src=read('dist/sw.js'),caches=new Map(),listeners={},log=[];
  const cacheFor=n=>{if(!caches.has(n))caches.set(n,new Map());const m=caches.get(n);return{addAll:async reqs=>{for(const r of reqs){assert.equal(r.cache,'reload');m.set(new URL(r.url,'https://x.test/').href,'body:'+r.url)}},match:async r=>m.get(typeof r==='string'?r:r.url)}};
  class Request{constructor(u,o={}){this.url=u;Object.assign(this,o)}}
  const self={location:{origin:'https://x.test'},addEventListener:(n,f)=>{listeners[n]=f},skipWaiting:async()=>{log.push('skip')},clients:{claim:async()=>{log.push('claim')}}};
  const ctx={self,Request,URL,location:self.location,caches:{open:async n=>cacheFor(n),keys:async()=>[...caches.keys()],delete:async n=>{log.push('delete '+n);return caches.delete(n)},match:async r=>{for(const m of caches.values()){const hit=m.get(new URL(typeof r==='string'?r:r.url,'https://x.test/').href);if(hit)return hit}}},fetch:async r=>{log.push('net '+r.url);return'net:'+r.url}};
  vm.runInNewContext(src,ctx);
  const run=async(n,extra={})=>{let p;await listeners[n]({waitUntil:x=>{p=x},...extra});await p};
  const fetchEvent=r=>{let out;listeners.fetch({request:r,respondWith:p=>{out=p}});return out};
  return{src,caches,log,run,fetchEvent,cacheName:src.match(/const CACHE='([^']+)'/)[1],files:JSON.parse(src.match(/const FILES=(\[.*\]);/)[1])};
}
test('worker: installing stores the shell and icons and takes over without waiting',async()=>{
  const w=worker();assert.match(w.cacheName,/^rz-[0-9a-f]{12}$/);
  assert.deepEqual(w.files,['./','manifest.webmanifest','icons/apple-touch-icon.png','icons/icon-192.png','icons/icon-512.png','icons/icon-maskable-512.png']);
  await w.run('install');assert.deepEqual([...w.caches.keys()],[w.cacheName]);assert.equal(w.caches.get(w.cacheName).size,6);assert.deepEqual(w.log,['skip']);
});
test('worker: activating removes only older randomizer caches',async()=>{
  const w=worker();await w.run('install');
  w.caches.set('rz-old000000000',new Map());w.caches.set('rz-older',new Map());w.caches.set('other-app',new Map());
  await w.run('activate');
  assert.deepEqual([...w.caches.keys()].sort(),['other-app',w.cacheName].sort());assert.ok(w.log.includes('claim'));assert.ok(w.log.includes('delete rz-old000000000'));assert.ok(!w.log.includes('delete other-app'));
});
test('worker: pages and assets come from the cache, anything else is left alone',async()=>{
  const w=worker();await w.run('install');
  const nav=await w.fetchEvent({method:'GET',mode:'navigate',url:'https://x.test/randomizer.html'});assert.equal(nav,'body:./');
  assert.equal(await w.fetchEvent({method:'GET',mode:'navigate',url:'https://x.test/'}),'body:./');
  assert.equal(await w.fetchEvent({method:'GET',mode:'cors',url:'https://x.test/icons/icon-192.png'}),'body:icons/icon-192.png');
  assert.equal(await w.fetchEvent({method:'GET',mode:'cors',url:'https://x.test/manifest.webmanifest'}),'body:manifest.webmanifest');
  assert.equal(await w.fetchEvent({method:'GET',mode:'cors',url:'https://x.test/not-cached.json'}),'net:https://x.test/not-cached.json');
  assert.equal(w.fetchEvent({method:'POST',mode:'cors',url:'https://x.test/'}),undefined);
  assert.equal(w.fetchEvent({method:'GET',mode:'cors',url:'https://elsewhere.test/a.js'}),undefined);
  assert.equal(w.fetchEvent({method:'GET',mode:'navigate',url:'https://elsewhere.test/'}),undefined);
  const empty=worker();assert.equal(await empty.fetchEvent({method:'GET',mode:'navigate',url:'https://x.test/'}),'net:https://x.test/');
});
test('worker: the cache name changes when the page does',()=>{
  const a=read('dist/sw.js').match(/const CACHE='([^']+)'/)[1];
  const before=read('dist/randomizer.html');
  const b=execFileSync('node',['-e',`
    const {createHash}=require('node:crypto');const fs=require('node:fs');
    const h=(x)=>{const k=createHash('sha256').update(x).update(fs.readFileSync('dist/manifest.webmanifest','utf8'));for(const f of fs.readdirSync('assets/icons').filter(f=>f.endsWith('.png')).sort())k.update(fs.readFileSync('assets/icons/'+f));return 'rz-'+k.digest('hex').slice(0,12)};
    console.log(h(fs.readFileSync('dist/randomizer.html','utf8')),h(fs.readFileSync('dist/randomizer.html','utf8')+' '))`],{cwd:new URL('../',import.meta.url),encoding:'utf8'}).trim().split(' ');
  assert.equal(b[0],a);assert.notEqual(b[1],a);assert.ok(before.length>1e5);
});
test('hosting: the security headers are present and the policy allows only what the page needs',()=>{
  const v=JSON.parse(read('vercel.json')),all=v.headers.find(h=>h.source==='/(.*)').headers,get=k=>all.find(h=>h.key===k).value;
  const csp=Object.fromEntries(get('Content-Security-Policy').split(';').map(x=>x.trim().split(/\s+(.*)/)).map(([k,val])=>[k,val]));
  assert.equal(csp['default-src'],"'none'");assert.equal(csp['script-src'],"'unsafe-inline'");assert.equal(csp['style-src'],"'unsafe-inline'");assert.equal(csp['font-src'],'data:');assert.equal(csp['img-src'],"'self' data:");
  assert.equal(csp['connect-src'],"'self'");assert.equal(csp['worker-src'],"'self'");assert.equal(csp['manifest-src'],"'self'");assert.equal(csp['base-uri'],"'none'");assert.equal(csp['form-action'],"'none'");assert.equal(csp['frame-ancestors'],"'none'");
  assert.doesNotMatch(get('Content-Security-Policy'),/unsafe-eval|https?:/);
  assert.equal(get('X-Content-Type-Options'),'nosniff');assert.equal(get('Referrer-Policy'),'no-referrer');assert.match(get('Permissions-Policy'),/camera=\(\)/);
  const sw=v.headers.find(h=>h.source==='/sw.js').headers;assert.equal(sw.find(h=>h.key==='Cache-Control').value,'no-cache');
  assert.equal(v.headers.find(h=>h.source==='/manifest.webmanifest').headers.find(h=>h.key==='Content-Type').value,'application/manifest+json');
  assert.match(v.headers.find(h=>h.source==='/icons/(.*)').headers[0].value,/immutable/);
  assert.equal(v.outputDirectory,'dist');assert.equal(v.buildCommand,'npm run build');
});
