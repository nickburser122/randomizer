import {readFileSync,readdirSync,statSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const walk=d=>readdirSync(new URL(d,root)).flatMap(f=>{const p=d+'/'+f;return statSync(new URL(p,root)).isDirectory()?walk(p):[p]});
const lit=s=>new Function('return '+s)();
const CALL=/(?<![\w$.])t\(\s*(['"])((?:\\[\s\S]|(?!\1)[^\\\n])*)\1/g;
const BAD=/(?<![\w$.])t\(\s*(?!['"\s])/g;
export function sourceFiles(){return walk('src').filter(f=>f.endsWith('.js')&&!f.startsWith('src/lang/')&&f!=='src/core/i18n.js'&&f!=='src/data/words.js')}
export function jsKeys(){
const keys=new Map(),dynamic=[];
for(const f of sourceFiles()){
const s=readFileSync(new URL(f,root),'utf8');
for(const m of s.matchAll(CALL)){const k=lit(m[1]+m[2]+m[1]);if(!keys.has(k))keys.set(k,[]);keys.get(k).push(f)}
for(const m of s.matchAll(BAD))dynamic.push(f+':'+s.slice(0,m.index).split('\n').length)}
return{keys,dynamic}}
export function htmlKeys(){
const s=readFileSync(new URL('src/index.html',root),'utf8'),keys=new Set(),dec=x=>x.replace(/&#10;/g,'\n').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"');
for(const m of s.matchAll(/<(\w+)\b[^>]*\bdata-i(?:\s[^>]*)?>([^<]*)<\/\1>/g))keys.add(dec(m[2]).trim());
for(const m of s.matchAll(/data-i-(?:aria|ph|title)="([^"]*)"/g))keys.add(dec(m[1]));
return keys}
export function allKeys(){const j=jsKeys(),h=htmlKeys(),all=new Set([...j.keys.keys(),...h]);return{all:[...all],dynamic:j.dynamic}}
