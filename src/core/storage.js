export const get=(k,d=null)=>{try{const v=localStorage.getItem(k);return v==null?d:v}catch(e){return d}};
export const set=(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}};
export const loadJSON=(k,d)=>{try{const v=JSON.parse(get(k));return v&&typeof v==='object'?v:d}catch(e){return d}};
export const saveJSON=(k,o)=>set(k,JSON.stringify(o));
export function pickValid(defaults,o,rules={}){
const r={};
if(!o||typeof o!=='object')return r;
for(const k in defaults){
if(!Object.prototype.hasOwnProperty.call(o,k)||typeof o[k]!==typeof defaults[k]||Number.isNaN(o[k]))continue;
if(rules[k]&&!rules[k].includes(o[k]))continue;
r[k]=o[k]}
return r}
export function restore(target,key,rules={}){Object.assign(target,pickValid(target,loadJSON(key,null),rules))}
