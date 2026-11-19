export function initPwa(onChange,env=globalThis){
if(typeof RZ_TARGET!=='undefined'&&RZ_TARGET!=='web')return{install:async()=>{}};
const loc=env.location,nav=env.navigator;
const standalone=()=>!!(env.matchMedia&&env.matchMedia('(display-mode: standalone)').matches);
if(loc&&/^https?:$/.test(loc.protocol)){
const doc=env.document,l=doc.createElement('link');
l.rel='manifest';l.href='manifest.webmanifest';doc.head.append(l);
if(nav&&'serviceWorker' in nav)env.addEventListener('load',()=>{nav.serviceWorker.register('sw.js').catch(()=>{})})}
let ev=null;
env.addEventListener('beforeinstallprompt',e=>{e.preventDefault();if(standalone())return;ev=e;onChange(true)});
env.addEventListener('appinstalled',()=>{ev=null;onChange(false)});
return{install:async()=>{
if(!ev)return false;
const e=ev;ev=null;onChange(false);
try{await e.prompt();return true}catch(err){return false}}}}
