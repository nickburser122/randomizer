export const get=(k,d=null)=>{try{const v=localStorage.getItem(k);return v==null?d:v}catch(e){return d}};
export const set=(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}};
export const loadJSON=(k,d)=>{try{const v=JSON.parse(get(k));return v&&typeof v==='object'?v:d}catch(e){return d}};
export const saveJSON=(k,o)=>set(k,JSON.stringify(o));
export function restore(target,key,rules={}){
const o=loadJSON(key,null);if(!o)return;
for(const k in target){
if(!(k in o)||typeof o[k]!==typeof target[k]||Number.isNaN(o[k]))continue;
if(rules[k]&&!rules[k].includes(o[k]))continue;
target[k]=o[k]}}
