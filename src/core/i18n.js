import {get} from './storage.js';
import {es} from '../lang/es.js';
import {fr} from '../lang/fr.js';
import {de} from '../lang/de.js';

export const LANGS=[['en','English'],['es','Español'],['fr','Français'],['de','Deutsch']];
const CATS={es,fr,de};
export const supported=l=>LANGS.some(x=>x[0]===l)||l==='xx';
export function pickLang(pref,navLangs){
if(pref&&pref!=='auto'&&supported(pref))return pref;
for(const n of navLangs||[]){const b=String(n).toLowerCase().split('-')[0];if(LANGS.some(x=>x[0]===b))return b}
return 'en'}
let lang='en',cat=null;
export function setLang(l){
lang=supported(l)?l:'en';cat=CATS[lang]||null;
if(typeof document!=='undefined')document.documentElement.lang=lang==='xx'?'en':lang}
export const getLang=()=>lang;
export const nf=n=>Number(n).toLocaleString(lang==='xx'?'en':lang);
const many=n=>lang==='fr'?!(n>=0&&n<2):n!==1;
export function fmt(s,v){
return s.replace(/\{(\w+)(?:\|([^|{}]*)\|([^|{}]*))?\}/g,(m,k,a,b)=>{
if(!v||!Object.prototype.hasOwnProperty.call(v,k))return m;
const x=v[k];
if(a!==undefined)return many(+x)?b:a;
return typeof x==='number'&&Number.isFinite(x)?nf(x):String(x)})}
export const tt=(s,v)=>{
let m=cat&&Object.prototype.hasOwnProperty.call(cat,s)?cat[s]:s;
if(v)m=fmt(m,v);
return lang==='xx'?'\u27e6'+m+'\u27e7':m};
export const t=tt;
export function translateDom(root){
const r=root||document;
r.querySelectorAll('[data-i]').forEach(e=>{e.textContent=tt(e.dataset.i||e.textContent.trim())});
for(const[a,n]of [['aria','aria-label'],['ph','placeholder'],['title','title']])r.querySelectorAll('[data-i-'+a+']').forEach(e=>e.setAttribute(n,tt(e.getAttribute('data-i-'+a))))}
export function initI18n(){
setLang(pickLang(get('rz-lang','auto'),typeof navigator!=='undefined'?navigator.languages:[]))}
initI18n();
