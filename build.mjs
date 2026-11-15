import {build} from 'esbuild';
import {readFileSync,readdirSync,writeFileSync,mkdirSync} from 'node:fs';

const FONTS={
  'instrument-sans':'Instrument Sans',
  'geist-mono':'Geist Mono',
  'instrument-serif':'Instrument Serif'
};

const bundle=await build({entryPoints:['src/main.js'],bundle:true,minify:true,format:'iife',target:'es2020',write:false,legalComments:'none'});
const js=bundle.outputFiles[0].text.trim();

const css=readdirSync('src/styles').filter(f=>f.endsWith('.css')).sort().map(f=>readFileSync('src/styles/'+f,'utf8').trim()).join('\n');

const faces=readdirSync('assets/fonts').filter(f=>f.endsWith('.woff2')).sort().map(f=>{
  const m=f.match(/^(.+)-(\d+)\.woff2$/);
  if(!m||!FONTS[m[1]])throw new Error('Unrecognised font file '+f);
  const data=readFileSync('assets/fonts/'+f).toString('base64');
  return `@font-face{font-family:'${FONTS[m[1]]}';font-style:normal;font-weight:${m[2]};font-display:swap;src:url(data:font/woff2;base64,${data}) format('woff2')}`;
}).join('\n');

const tpl=readFileSync('src/index.html','utf8');
for(const t of ['/*CSS*/','/*JS*/'])if(tpl.split(t).length!==2)throw new Error('Template placeholder '+t+' must appear exactly once');
const html=tpl.split('/*CSS*/').join(faces+'\n'+css).split('/*JS*/').join(js);

const external=(html.replace(/data:[^)"']+/g,'').match(/https?:\/\/[^\s"')<>]+/g)||[]).filter(u=>u!=='http://www.w3.org/2000/svg');
if(external.length)throw new Error('External URLs found: '+external.join(', '));
if(/<\/script>/i.test(js))throw new Error('Bundle contains a closing script tag');

mkdirSync('dist',{recursive:true});
writeFileSync('dist/randomizer.html',html);
writeFileSync('dist/index.html',html);
console.log('dist/randomizer.html and dist/index.html',Math.round(html.length/1024)+' KB, js '+Math.round(js.length/1024)+' KB, css '+Math.round(css.length/1024)+' KB');
