import test from 'node:test';
import assert from 'node:assert/strict';
import {allKeys,jsKeys,htmlKeys,sourceFiles} from './i18n-keys.mjs';

const store=new Map();
globalThis.localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v))};

const {pickLang,setLang,getLang,tt,t,fmt,nf,LANGS,supported}=await import('../src/core/i18n.js');
const {es}=await import('../src/lang/es.js');
const {fr}=await import('../src/lang/fr.js');
const {de}=await import('../src/lang/de.js');
const CATS={es,fr,de};
const {all,dynamic}=allKeys();
const ph=s=>[...s.matchAll(/\{(\w*)(\|[^|{}]*\|[^|{}]*)?\}/g)].map(m=>m[1]+(m[2]?'|plural':'')).sort().join(',');
test.afterEach(()=>setLang('en'));

test('translation: every string is a literal handed to t(), found in the code or the page',()=>{
  assert.deepEqual(dynamic,[]);
  assert.ok(all.length>250,String(all.length));
  assert.ok(sourceFiles().length>15);
  assert.ok(jsKeys().keys.has('Copied'));assert.ok(htmlKeys().has('Save file'));assert.ok(htmlKeys().has('Table preview'));assert.ok(htmlKeys().has('Anna\nBen\nChloe'));
});
for(const [l,cat] of Object.entries(CATS)){
  test(`translation: ${l} has exactly the strings the code uses`,()=>{
    const have=new Set(Object.keys(cat)),want=new Set(all);
    assert.deepEqual(all.filter(k=>!have.has(k)),[],'missing');
    assert.deepEqual([...have].filter(k=>!want.has(k)),[],'unused');
    assert.equal(have.size,want.size);
  });
  test(`translation: ${l} keeps every placeholder, plural form and edge space`,()=>{
    for(const [k,v] of Object.entries(cat)){
      assert.equal(typeof v,'string',k);assert.ok(v.trim().length>0,k);
      assert.equal(ph(v),ph(k),`${l}: ${k}`);
      assert.equal(v.startsWith(' '),k.startsWith(' '),`${l}: leading space ${k}`);assert.equal(v.endsWith(' '),k.endsWith(' '),`${l}: trailing space ${k}`);
      assert.doesNotMatch(v,/\u27e6|\u27e7/,k);
      if(/\{n\|/.test(k))assert.match(v,/\{n\|[^|{}]+\|[^|{}]+\}/,`${l}: plural ${k}`);
      for(const m of k.matchAll(/\{[^{}\s|]*\}/g))if(/\{[#?]\}|\{3\}|\{\}/.test(m[0]))assert.ok(v.includes(m[0]),`${l}: ${m[0]} in ${k}`);
    }
  });
  test(`translation: ${l} translates nearly everything`,()=>{
    const same=Object.entries(cat).filter(([k,v])=>k===v).map(([k])=>k);
    assert.ok(same.length<=22,`${l} leaves ${same.length}: ${same.join(' | ')}`);
    for(const k of ['Password','Table','Copy','Generate','History','Heads','Tails','Language','Hide','Show'])assert.notEqual(cat[k],k,`${l}: ${k}`);
  });
}
test('translation: the strings that stay the same in every language are technical',()=>{
  const same=all.filter(k=>es[k]===k&&fr[k]===k&&de[k]===k).sort();
  assert.deepEqual(same,['AA','AAA','NanoID','PIN','UUID','UUID v4','{ratio}:1 {grade}']);
});
test('translation: the placeholders in the English text are all filled by the code',()=>{
  const used=new Map();
  for(const f of sourceFiles()){
    const src=(await_read(f));
    for(const m of src.matchAll(/(?<![\w$.])t\(\s*(['"])((?:\\[\s\S]|(?!\1)[^\\\n])*)\1\s*,\s*\{([^}]*)\}/g)){
      const key=new Function('return '+m[1]+m[2]+m[1])(),vars=[...m[3].matchAll(/(?:^|,)\s*(\w+)\s*(?::|(?=,|$))/g)].map(x=>x[1]);
      used.set(key,vars);
    }
  }
  assert.ok(used.size>50,String(used.size));
  for(const [k,vars] of used){
    const want=[...new Set([...k.matchAll(/\{(\w+)/g)].map(m=>m[1]))].filter(x=>!/^\d+$/.test(x)).sort();
    assert.deepEqual([...new Set(vars)].sort(),want,k);
  }
});
import {readFileSync} from 'node:fs';
function await_read(f){return readFileSync(new URL('../'+f,import.meta.url),'utf8')}

test('language: the browser language picks a supported one and a saved choice wins',()=>{
  assert.deepEqual(LANGS.map(x=>x[0]),['en','es','fr','de']);
  assert.equal(pickLang('auto',['fr-CA','en']),'fr');assert.equal(pickLang(undefined,['de-AT']),'de');assert.equal(pickLang(null,['es-MX','de']),'es');assert.equal(pickLang('auto',['pt-BR','de']),'de');
  assert.equal(pickLang('auto',['ja','zh-CN']),'en');assert.equal(pickLang('auto',[]),'en');assert.equal(pickLang('auto',undefined),'en');assert.equal(pickLang('auto',['EN-us']),'en');assert.equal(pickLang('auto',['FR']),'fr');
  assert.equal(pickLang('de',['fr']),'de');assert.equal(pickLang('en',['fr']),'en');assert.equal(pickLang('xx',['fr']),'xx');
  for(const bad of ['klingon','','constructor','__proto__',5,{},[]])assert.equal(pickLang(bad,['es']),'es',String(bad));
  assert.equal(pickLang('auto',[null,5,'fr']),'fr');
  assert.ok(supported('xx')&&supported('es')&&!supported('zz')&&!supported('constructor'));
});
test('language: strings fall back to English and never read inherited keys',()=>{
  setLang('es');assert.equal(tt('Password'),'Contraseña');assert.equal(tt('Not in any catalog'),'Not in any catalog');
  for(const k of ['constructor','__proto__','toString','hasOwnProperty'])assert.equal(tt(k),k);
  setLang('zz');assert.equal(getLang(),'en');assert.equal(tt('Password'),'Password');
  setLang('de');assert.equal(t('Heads'),'Kopf');setLang('en');assert.equal(t('Heads'),'Heads');
});
test('language: placeholders are filled and unknown ones are left alone',()=>{
  assert.equal(fmt('{a} to {b}',{a:1,b:2}),'1 to 2');assert.equal(fmt('{a} {zzz}',{a:'x'}),'x {zzz}');assert.equal(fmt('{3} {?} {#} {}',{a:1}),'{3} {?} {#} {}');assert.equal(fmt('no vars'),'no vars');
  assert.equal(fmt('{name|first|lower}'),'{name|first|lower}');assert.equal(fmt('{n}',{n:0}),'0');assert.equal(fmt('{n}',{n:''}),'');assert.equal(fmt('{n}',{n:undefined}),'undefined');
  assert.equal(fmt('{constructor}',{}),'{constructor}');assert.equal(fmt('{toString}',{}),'{toString}');
  assert.equal(tt('Theme: {mode}. Press to change.',{mode:'X'}),'Theme: X. Press to change.');
  setLang('fr');assert.equal(tt('Unknown class “{c}”. Put a backslash before it to use it as it is.',{c:'q'}),'Classe inconnue «\u00a0q\u00a0». Placez une barre oblique inverse devant pour l’utiliser telle quelle.');
});
test('language: plurals follow each language and use the number, not its formatted text',()=>{
  const S='{n} {n|row|rows}, {c} {c|column|columns}';
  assert.equal(tt(S,{n:1,c:1}),'1 row, 1 column');assert.equal(tt(S,{n:0,c:2}),'0 rows, 2 columns');assert.equal(tt(S,{n:1.5,c:-1}),'1.5 rows, -1 columns');assert.equal(tt(S,{n:1000,c:1}),'1,000 rows, 1 column');
  setLang('es');assert.equal(tt(S,{n:1,c:5}),'1 fila, 5 columnas');assert.equal(tt(S,{n:0,c:1}),'0 filas, 1 columna');assert.equal(tt(S,{n:1000,c:1}),'1000 filas, 1 columna'.replace('1000',nf(1000)));
  setLang('fr');assert.equal(tt(S,{n:0,c:1}),'0 ligne, 1 colonne');assert.equal(tt(S,{n:1,c:2}),'1 ligne, 2 colonnes');assert.equal(tt(S,{n:1.5,c:2}),'1,5 ligne, 2 colonnes');assert.equal(tt(S,{n:2,c:1}),'2 lignes, 1 colonne');assert.equal(tt(S,{n:1000,c:1}),nf(1000)+' lignes, 1 colonne');
  setLang('de');assert.equal(tt(S,{n:1000,c:1}),'1.000 Zeilen, 1 Spalte');assert.equal(tt(S,{n:1,c:1}),'1 Zeile, 1 Spalte');assert.equal(tt(S,{n:0,c:3}),'0 Zeilen, 3 Spalten');
  assert.equal(tt('{n} {n|item|items}',{n:1}),'1 Eintrag');assert.equal(tt('{n} {n|item|items}',{n:2}),'2 Einträge');
  assert.equal(tt('{n} {n|word|words}',{n:1}),'1 Wort');assert.equal(tt('{n} {n|word|words}',{n:2}),'2 Wörter');
  for(const l of ['en','es','fr','de']){setLang(l);for(const n of [0,1,2,5,100,1000,1000000])for(const k of ['{n} {n|item|items}','{n} {n|row|rows}, {c} {c|column|columns}','{n} {n|word|words}','Schema applied, {n} {n|column|columns}']){const s=tt(k,{n,c:1});assert.ok(!/[{}|]/.test(s),`${l} ${k} ${n}: ${s}`)}}
});
test('language: numbers are written the way the language writes them',()=>{
  assert.equal(nf(1234567.5),'1,234,567.5');setLang('de');assert.equal(nf(1234567.5),'1.234.567,5');assert.equal(tt('Row limit {max}',{max:100000}),'Row limit 100.000');
  setLang('fr');assert.equal(nf(0.5),'0,5');assert.match(nf(1234),/^1[\u202f\u00a0]234$/);setLang('es');assert.equal(nf(0.5),'0,5');assert.equal(tt('{a} to {b}',{a:5,b:'x'}),'5 a x');
  assert.equal(tt('{b} bits per word. Add words to make up for a shorter list.',{b:'10.5'}),'10.5 bits por palabra. Añade palabras para compensar una lista más corta.');
});
test('language: the test language wraps every string and leaves page language alone',()=>{
  setLang('xx');assert.equal(tt('Password'),'\u27e6Password\u27e7');assert.equal(tt('{n} {n|row|rows}',{n:1}),'\u27e61 row\u27e7');assert.equal(tt('{n} {n|row|rows}',{n:1000}),'\u27e61,000 rows\u27e7');assert.equal(getLang(),'xx');
});
