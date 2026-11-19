import {t} from './i18n.js';

export async function getSaver(target=typeof RZ_TARGET==='undefined'?'web':RZ_TARGET,env=globalThis){
if(target==='artifact'){
const c=env&&env.claude;
if(!c||typeof c.use!=='function')return null;
let d=null;
try{d=await c.use('downloads')}catch(e){d=null}
return d&&typeof d.save==='function'?(name,data)=>d.save({filename:name,data}):null}
return async(name,data)=>{
const a=document.createElement('a'),u=URL.createObjectURL(new Blob([data],{type:'text/plain;charset=utf-8'}));
a.href=u;a.download=name;document.body.append(a);a.click();a.remove();
setTimeout(()=>URL.revokeObjectURL(u),2000);
return{status:'saved'}}}
export function saveMessage(e){
const c=e&&typeof e==='object'?e.code:'';
if(c==='declined')return'';
if(c==='rate_limited')return t('Another save is waiting for an answer. Try again in a moment.');
if(c==='too_large')return t('That file is too large to save here. Try fewer rows.');
return t('The file could not be saved.')}
