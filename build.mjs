import {build} from 'esbuild';
import {readFileSync,readdirSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const FONTS={
  'instrument-sans':'Instrument Sans',
  'geist-mono':'Geist Mono',
  'instrument-serif':'Instrument Serif'
};
const arg=process.argv.find(a=>a.startsWith('--target='));
const targets=arg?[arg.slice(9)]:['web','artifact'];
for(const t of targets)if(!['web','artifact'].includes(t))throw new Error('Unknown target '+t+', use web or artifact');
const budget=JSON.parse(readFileSync('budget.json','utf8'));
const kb=n=>Math.round(n/1024);

const cssFiles=readdirSync('src/styles').filter(f=>f.endsWith('.css')).sort();
const css=cssFiles.map(f=>readFileSync('src/styles/'+f,'utf8').trim()).join('\n');
const tokens=readFileSync('src/styles/01-tokens.css','utf8');
const bgOf=re=>{const m=tokens.match(re);if(!m)throw new Error('Token block not found: '+re);const b=m[1].match(/--bg:(#[0-9a-fA-F]{6})/);if(!b)throw new Error('--bg missing in '+re);return b[1].toLowerCase()};
const BG={light:bgOf(/:root\{([^}]*)\}/),dark:bgOf(/:root\[data-theme="dark"\]\{([^}]*)\}/)};

const faces=readdirSync('assets/fonts').filter(f=>f.endsWith('.woff2')).sort().map(f=>{
  const m=f.match(/^(.+)-(\d+)\.woff2$/);
  if(!m||!FONTS[m[1]])throw new Error('Unrecognised font file '+f);
  const data=readFileSync('assets/fonts/'+f).toString('base64');
  return `@font-face{font-family:'${FONTS[m[1]]}';font-style:normal;font-weight:${m[2]};font-display:swap;src:url(data:font/woff2;base64,${data}) format('woff2')}`;
}).join('\n');

const tpl=readFileSync('src/index.html','utf8');
for(const t of ['/*CSS*/','/*JS*/'])if(tpl.split(t).length!==2)throw new Error('Template placeholder '+t+' must appear exactly once');

const HEAD={
  web:`<meta name="theme-color" media="(prefers-color-scheme: light)" content="${BG.light}">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="${BG.dark}">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="randomizer">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
`,
  artifact:''
};

const ICONS=readdirSync('assets/icons').filter(f=>f.endsWith('.png')).sort();
const manifest=JSON.stringify({
  id:'./',name:'randomizer',short_name:'randomizer',
  description:'Passwords, fake data tables, picks, dice, tokens and colors, made on your device.',
  start_url:'./',scope:'./',display:'standalone',
  background_color:BG.light,theme_color:BG.light,categories:['utilities','productivity'],
  icons:[
    {src:'icons/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},
    {src:'icons/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},
    {src:'icons/icon-maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}
  ]
},null,2)+'\n';

const worker=(cache,files)=>`const CACHE='${cache}';
const FILES=${JSON.stringify(files)};
self.addEventListener('install',e=>{
e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES.map(u=>new Request(u,{cache:'reload'})))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{
e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x.startsWith('rz-')&&x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
const r=e.request;
if(r.method!=='GET'||new URL(r.url).origin!==location.origin)return;
if(r.mode==='navigate'){e.respondWith(caches.match('./').then(c=>c||fetch(r)));return}
e.respondWith(caches.match(r).then(c=>c||fetch(r)))});
`;

mkdirSync('dist',{recursive:true});
const over=[];
for(const target of targets){
  const bundle=await build({entryPoints:['src/main.js'],bundle:true,minify:true,format:'iife',target:'es2020',write:false,legalComments:'none',define:{RZ_TARGET:JSON.stringify(target)}});
  const js=bundle.outputFiles[0].text.trim();
  let html=tpl.split('/*CSS*/').join(faces+'\n'+css).split('/*JS*/').join(js);
  if(HEAD[target])html=html.replace('</head>',HEAD[target]+'</head>');
  const external=(html.replace(/data:[^)"']+/g,'').match(/https?:\/\/[^\s"')<>]+/g)||[]).filter(u=>u!=='http://www.w3.org/2000/svg');
  if(external.length)throw new Error('External URLs found: '+external.join(', '));
  if(/<\/script>/i.test(js))throw new Error('Bundle contains a closing script tag');
  const sizes={html:html.length,js:js.length,css:css.length};
  for(const k of Object.keys(sizes))if(sizes[k]>budget[k]*1024)over.push(`${target} ${k} is ${kb(sizes[k])} KB, over the ${budget[k]} KB budget`);
  if(target==='web'){
    writeFileSync('dist/randomizer.html',html);
    writeFileSync('dist/index.html',html);
    writeFileSync('dist/manifest.webmanifest',manifest);
    mkdirSync('dist/icons',{recursive:true});
    for(const f of ICONS)copyFileSync('assets/icons/'+f,'dist/icons/'+f);
    const hash=createHash('sha256').update(html).update(manifest);
    for(const f of ICONS)hash.update(readFileSync('assets/icons/'+f));
    const files=['./','manifest.webmanifest',...ICONS.map(f=>'icons/'+f)];
    writeFileSync('dist/sw.js',worker('rz-'+hash.digest('hex').slice(0,12),files));
    console.log('web      dist/randomizer.html, index.html, sw.js, manifest.webmanifest, icons/',kb(html.length)+' KB, js '+kb(js.length)+' KB, css '+kb(css.length)+' KB');
  }else{
    writeFileSync('dist/artifact.html',html);
    console.log('artifact dist/artifact.html',kb(html.length)+' KB, js '+kb(js.length)+' KB, css '+kb(css.length)+' KB');
  }
}
if(over.length)throw new Error('Size budget exceeded:\n  '+over.join('\n  ')+'\nShrink the build, or raise budget.json on purpose.');
