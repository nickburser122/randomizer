import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {findComments,findCssComments} from './lint.mjs';

const store=new Map();
globalThis.localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v))};

const {rnd,rf,pick,withSeed,isSeeded,seeded}=await import('../src/core/rng.js');
const {restore,get,set,loadJSON}=await import('../src/core/storage.js');
const {genChars,genWords,genPin,genPron,DEFAULTS}=await import('../src/features/password.js');
const {CS,VW}=await import('../src/data/alphabets.js');
const {parseItems,draw,pickResult}=await import('../src/features/pick.js');
const {parseDice,rollNumber,tokenize,rollTerm}=await import('../src/features/roll.js');
const {T,G,mk,NUM,format,readSaved,exportSchema,importSchema,rowStream,makeRows,clampRows,type,MAX_ROWS,MAX_COLS,SCHEMA_MAX}=await import('../src/features/table.js');
const {plan,fill}=await import('../src/features/template.js');
const {makeTokens,makePalette}=await import('../src/features/tools.js');
const {W}=await import('../src/data/words.js');
const {FX,compile,renameRefs}=await import('../src/features/template.js');
const {pushItem,cleanItems}=await import('../src/core/history.js');

const chars=t=>[...t];
const GENERATED=Object.keys(T).filter(t=>t!=='tpl');

test('rng: ranges, huge ranges terminate, floats in [0,1)',()=>{
  for(let i=0;i<2000;i++){const v=rnd(7);assert.ok(Number.isInteger(v)&&v>=0&&v<7)}
  for(let i=0;i<50;i++){const v=rnd(2**40);assert.ok(v>=0&&v<2**40)}
  for(let i=0;i<500;i++){const f=rf();assert.ok(f>=0&&f<1)}
  assert.equal(rnd(1),0);assert.equal(rnd(0),0);
});
test('rng: unbiased over a small range',()=>{
  const c=Array(10).fill(0);for(let i=0;i<20000;i++)c[rnd(10)]++;
  c.forEach(n=>assert.ok(Math.abs(n-2000)<250,'count '+n));
});
test('rng: seeding is deterministic, scoped and always released',()=>{
  const a=withSeed('s1',()=>[rnd(1e6),rnd(1e6),rf()]),b=withSeed('s1',()=>[rnd(1e6),rnd(1e6),rf()]);
  assert.deepEqual(a,b);
  assert.notDeepEqual(a,withSeed('s2',()=>[rnd(1e6),rnd(1e6),rf()]));
  assert.equal(isSeeded(),false);
  assert.throws(()=>withSeed('x',()=>{throw new Error('boom')}));
  assert.equal(isSeeded(),false);
  assert.notDeepEqual([1,2,3,4,5].map(()=>rnd(2**20)),[1,2,3,4,5].map(()=>rnd(2**20)));
});

test('storage: restore keeps only known keys of the right type and allowed values',()=>{
  const t={mode:'a',n:3,on:1,s:'x'};
  set('k',JSON.stringify({mode:'b',n:'7',on:0,s:5,extra:1}));
  restore(t,'k',{mode:['a','b']});
  assert.deepEqual(t,{mode:'b',n:3,on:0,s:'x'});
  const u={mode:'a'};set('k',JSON.stringify({mode:'zzz'}));restore(u,'k',{mode:['a','b']});
  assert.equal(u.mode,'a');
  for(const bad of ['{nope','null','7','"x"','[]'])
    {const v={mode:'a'};set('k',bad);restore(v,'k');assert.equal(v.mode,'a')}
  assert.equal(loadJSON('missing',123),123);assert.equal(get('missing','d'),'d');
});

test('password: characters respect length, classes and one-of-each',()=>{
  for(let i=0;i<200;i++){
    const r=genChars({...DEFAULTS});
    assert.equal(chars(r.t).length,32);
    assert.match(r.t,/[a-z]/);assert.match(r.t,/[A-Z]/);assert.match(r.t,/\d/);assert.match(r.t,/[^a-zA-Z0-9]/);
    assert.ok(r.b>150);
  }
  for(const len of [4,64,128])assert.equal(chars(genChars({...DEFAULTS,len}).t).length,len);
});
test('password: only-digits, no look-alikes, no repeats, empty selection',()=>{
  assert.match(genChars({...DEFAULTS,lo:0,up:0,sy:0,len:50}).t,/^\d{50}$/);
  for(let i=0;i<50;i++)assert.doesNotMatch(genChars({...DEFAULTS,amb:1,len:128}).t,/[Il1O0o|`'"]/);
  const u=genChars({...DEFAULTS,norep:1,len:40}).t;assert.equal(new Set(u).size,40);
  const all=genChars({...DEFAULTS,norep:1,len:128}).t;assert.equal(new Set(all).size,all.length);assert.ok(all.length<128);
  assert.equal(genChars({...DEFAULTS,lo:0,up:0,di:0,sy:0}),null);
});
test('password: characters are uniformly distributed',()=>{
  const c={};for(let i=0;i<400;i++)for(const ch of genChars({...DEFAULTS,lo:0,up:0,sy:0,each:0,len:50}).t)c[ch]=(c[ch]||0)+1;
  Object.values(c).forEach(n=>assert.ok(Math.abs(n-2000)<260,'count '+n));
});
test('password: passphrases from the 7,776 word list with exact entropy',()=>{
  assert.equal(W.length,7776);
  const r=genWords({...DEFAULTS,words:5,cap:1,sep:'-',num:1}),p=r.t.split('-');
  assert.equal(p.length,6);assert.match(p[5],/^\d{4}$/);
  p.slice(0,5).forEach(w=>assert.ok(W.includes(w.toLowerCase())&&w[0]===w[0].toUpperCase()));
  assert.ok(Math.abs(r.b-(5*Math.log2(7776)+Math.log2(10000)))<1e-9);
  const n=genWords({...DEFAULTS,words:4,cap:0,sep:'',num:0});
  assert.ok(Math.abs(n.b-4*Math.log2(7776))<1e-9);
  const s=genWords({...DEFAULTS,words:4,cap:0,sep:'rnd',num:0});
  assert.ok(Math.abs(s.b-(4*Math.log2(7776)+3*Math.log2(14)))<1e-9);
});
test('password: pins',()=>{
  assert.match(genPin({pin:6}).t,/^\d{6}$/);assert.ok(Math.abs(genPin({pin:8}).b-8*Math.log2(10))<1e-9);
});

test('pick: parsing, weights and duplicates',()=>{
  const a=parseItems('Anna\nBen, Chloe*3\n  \nAnna*2',true);
  assert.deepEqual(a.map(x=>x.t),['Anna','Ben','Chloe']);assert.equal(a[2].w,3);
  const b=parseItems('Anna\nBen, Chloe*3\n  \nAnna*2',false);
  assert.equal(b.length,4);assert.equal(b[3].w,2);
  assert.deepEqual(parseItems('*5',true).map(x=>x.t),['*5']);
  assert.deepEqual(parseItems('',true),[]);
});
test('pick: draws never repeat and follow weights',()=>{
  const a=parseItems('a\nb\nc',true);
  for(let i=0;i<100;i++){const d=draw(a,5);assert.equal(new Set(d.map(x=>x.t)).size,3)}
  let heavy=0;const w=parseItems('light\nheavy*50',true);
  for(let i=0;i<2000;i++)if(draw(w,1)[0].t==='heavy')heavy++;
  assert.ok(heavy>1850&&heavy<2000,'heavy '+heavy);
});
test('pick: shuffle, teams and draw-until-used-up',()=>{
  const a=parseItems('a,b,c,d,e,f,g',true);
  const s=pickResult(a,{mode:'shuffle'},new Set()).lines.map(l=>l.replace(/^\d+\. /,''));
  assert.deepEqual([...s].sort(),['a','b','c','d','e','f','g']);
  const t=pickResult(a,{mode:'teams',teams:3},new Set()).lines;
  assert.equal(t.length,3);assert.deepEqual(t.map(l=>l.split(', ').length),[3,2,2]);
  const used=new Set(),K={mode:'pick',n:1,norep:1},seen=[];
  for(let i=0;i<3;i++)seen.push(pickResult(parseItems('x,y,z',true),K,used).lines[0]);
  assert.equal(new Set(seen).size,3);
  assert.match(pickResult(parseItems('x,y,z',true),K,used).note,/^List used up/);
});

test('roll: dice formulas',()=>{
  for(let i=0;i<300;i++){const r=parseDice('2d6+3');assert.ok(r.total>=5&&r.total<=15)}
  const k=parseDice('4d6kh3');assert.match(k.detail,/keep \d, \d, \d$/);assert.ok(k.total>=3&&k.total<=18);
  const l=parseDice(' 2D20 kl1 ');assert.ok(l.total>=1&&l.total<=20);
  assert.ok(parseDice('d20-2').total>=-1);
  for(const bad of ['','abc','0d6','2d1','99999d6','2d6kh','d','2x6'])assert.ok(parseDice(bad).error,bad);
});
test('roll: number ranges',()=>{
  const r=rollNumber({min:'5',max:'1',cnt:3,uni:1}),n=r.text.split(', ').map(Number);
  assert.equal(new Set(n).size,3);n.forEach(x=>assert.ok(x>=1&&x<=5));assert.equal(r.detail,'1 to 5');
  assert.match(rollNumber({min:'1',max:'3',cnt:10,uni:1}).detail,/^Only 3 unique/);
  assert.equal(rollNumber({min:'1',max:'3',cnt:10,uni:1}).text.split(', ').length,3);
  assert.ok(rollNumber({min:'0',max:'1000000000000',cnt:1,uni:0}).text.length>0);
  assert.ok(rollNumber({min:'x',max:'3',cnt:1,uni:0}).error);
  assert.ok(rollNumber({min:'0',max:'1e16',cnt:1,uni:0}).error);
});

test('table: every column type yields a string with default parameters',()=>{
  for(const t of GENERATED)for(let i=0;i<20;i++)assert.equal(typeof G[t](mk('c',t).v,i),'string',t);
  assert.match(G.uuid([],0),/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.match(G.email([],0),/^[a-z]+\.[a-z]+\d+@/);
  assert.equal(G.seq(['10','5'],3),'25');
  assert.match(G.pat(['ID-##-??'],0),/^ID-\d\d-[a-z]{2}$/);
  assert.equal(G.wchoice(['only*5'],0),'only');
  let sum=0;for(let i=0;i<4000;i++)sum+=+G.normal(['50','10','2'],0);
  assert.ok(Math.abs(sum/4000-50)<1);
});
test('table: template columns are computed from other columns, not generated',()=>{
  assert.ok(T.tpl);assert.equal(G.tpl,undefined);assert.equal(GENERATED.length,Object.keys(T).length-1);
});
test('table: seeded output repeats exactly, including UUIDs',()=>{
  const run=s=>withSeed(s,()=>GENERATED.map(t=>G[t](mk('c',t).v,1)));
  assert.deepEqual(run('abc'),run('abc'));assert.notDeepEqual(run('abc'),run('abd'));
});
test('table: exports quote, escape and type values correctly',()=>{
  const cols=[{name:'a',t:'int'},{name:'b "x"',t:'word'},{name:'c',t:'bool'}];
  const rows=[['1','he,llo','true'],['','a\tb','false']];
  assert.equal(format('csv',cols,rows,1).split('\n')[0],'a,"b ""x""",c');
  assert.equal(format('csv',cols,rows,1).split('\n')[1],'1,"he,llo",true');
  const tsv=format('tsv',cols,rows,1).split('\n');assert.equal(tsv[0],'a\tb "x"\tc');assert.equal(tsv[2],'\ta b\tfalse');
  assert.equal(format('tsv',cols,rows,0).split('\n').length,2);
  const j=JSON.parse(format('json',cols,rows,1));
  assert.equal(j[0].a,1);assert.equal(j[1].a,null);assert.equal(j[0].c,true);assert.equal(j[1].c,false);
  const q=format('sql',cols,rows,1).split('\n');
  assert.equal(q[0],`INSERT INTO data ("a", "b ""x""", "c") VALUES (1, 'he,llo', true);`);
  assert.equal(q[1],`INSERT INTO data ("a", "b ""x""", "c") VALUES (NULL, 'a\tb', false);`);
  const m=format('md',cols,rows,0).split('\n');assert.equal(m[0],'| a | b "x" | c |');assert.equal(m[1],'| --- | --- | --- |');
  assert.match(format('sql',[{name:'n',t:'word'}],[["it's"]],1),/'it''s'/);
});
test('table: saved state is validated before use',()=>{
  for(const bad of [null,[],'x',7,{}])assert.equal(readSaved(bad).cols,undefined);
  assert.deepEqual(readSaved({cols:[]}).cols,[]);
  assert.equal(readSaved({cols:[{name:'x',t:'gone',v:[]}]}).cols[0].t,'word');
  assert.equal(readSaved({cols:[null,3,{name:5,t:'int'}]}).cols.length,1);
  const ok=[{name:'a',t:'int',v:['0','9']}],r=readSaved({cols:ok,n:5,hdr:0,fmt:'sql',seed:'z'});
  assert.deepEqual(r.tb,{n:5,hdr:0,fmt:'sql',seed:'z'});assert.equal(r.cols[0].t,'int');assert.deepEqual(r.cols[0].v,['0','9']);
  assert.deepEqual(readSaved({n:MAX_ROWS+1,hdr:2,fmt:'xml',seed:7}).tb,{});
  assert.equal(readSaved({n:5000}).tb.n,5000);assert.equal(readSaved({n:MAX_ROWS}).tb.n,MAX_ROWS);assert.equal(readSaved({n:0}).tb.n,undefined);
  assert.ok(NUM.has('normal'));
});

test('template: filters',()=>{
  assert.equal(FX.first('Ada Lovelace'),'Ada');assert.equal(FX.last('Ada Lovelace'),'Lovelace');
  assert.equal(FX.initial('Ada Lovelace'),'A');assert.equal(FX.slug('Ada Lovelace'),'ada-lovelace');
  assert.equal(FX.cap("mary-jane O'NEIL"),"Mary-Jane O'Neil");assert.equal(FX.upper('ab'),'AB');assert.equal(FX.lower('AB'),'ab');
  for(const f of Object.keys(FX))assert.equal(FX[f](''),'',f);
});
test('template: compile reports unknown filters and keeps literals',()=>{
  const c=compile('a{name|first|nope}b{#}{?}{ x }');
  assert.deepEqual(c.errs,['unknown filter nope']);
  assert.deepEqual(c.out.map(x=>typeof x==='string'?x:x.r||x.ref),['a','name','b','#','?','x']);
  assert.deepEqual(compile('plain').out,['plain']);assert.deepEqual(compile('').out,[]);
});
test('template: columns are ordered by their dependencies',()=>{
  const cols=[{name:'Email',t:'tpl',v:['{ NAME |first|lower}@x.com']},{name:'name',t:'name',v:[]}];
  const p=plan(cols);
  assert.ok(p.order.indexOf(1)<p.order.indexOf(0));assert.deepEqual(p.P[0].errs,[]);
  assert.equal(fill(p.P[0],['','Ada Lovelace']),'ada@x.com');
  assert.equal(fill(p.P[0],['','']),'@x.com');
  assert.match(fill(compile('{#}{#}{?}'),[]),/^\d\d[a-z]$/);
});
test('template: problems are reported, never thrown',()=>{
  const circ=plan([{name:'a',t:'tpl',v:['{b}']},{name:'b',t:'tpl',v:['{a}']}]);
  circ.P.forEach(x=>assert.match(x.errs[0],/circular/));
  assert.match(plan([{name:'a',t:'tpl',v:['{a}']}]).P[0].errs[0],/circular/);
  const u=plan([{name:'a',t:'int',v:[]},{name:'A ',t:'tpl',v:['{zzz}']}]).P[1].errs;
  assert.ok(u.some(e=>/no column named/.test(e))&&u.some(e=>/share the name/.test(e)));
  assert.doesNotThrow(()=>plan([{name:'',t:'tpl',v:[]},{name:'b',t:'tpl'}]));
});
test('template: renaming a column rewrites references only',()=>{
  const cols=[{name:'x',t:'tpl',v:['{Name|first} {name} {nameother}']},{name:'name',t:'word',v:[]}];
  assert.deepEqual(renameRefs(cols,'name','full'),[0]);assert.equal(cols[0].v[0],'{full|first} {full} {nameother}');
  assert.deepEqual(renameRefs(cols,'full','full'),[]);assert.deepEqual(renameRefs(cols,'','y'),[]);
});

test('history: newest first, no immediate duplicates, capped, truncated',()=>{
  let h=[];
  h=pushItem(h,'pw','a',3);h=pushItem(h,'pw','a',3);assert.equal(h.length,1);
  h=pushItem(h,'rl','a',3);assert.equal(h.length,2);
  h=pushItem(h,'rl','',3);h=pushItem(h,'rl',null,3);assert.equal(h.length,2);
  for(const v of ['b','c','d'])h=pushItem(h,'tk',v,3);
  assert.deepEqual(h.map(x=>x.v),['d','c','b']);
  assert.equal(pushItem([],'pk','x'.repeat(5000),5)[0].v.length,2001);
  const same=[{t:'pw',v:'q'}];assert.equal(pushItem(same,'pw','q',5),same);
});
test('history: saved entries are validated',()=>{
  assert.deepEqual(cleanItems('x',5),[]);assert.deepEqual(cleanItems(null,5),[]);
  assert.deepEqual(cleanItems([{t:'pw',v:'a'},{t:'zz',v:'b'},{t:'tb',v:3},null,{t:'rl',v:'c'}],5).map(x=>x.v),['a','c']);
  assert.equal(cleanItems(Array.from({length:99},()=>({t:'pw',v:'a'})),40).length,40);
});

test('tools: tokens and palettes',()=>{
  const h=makeTokens({kind:'hex',len:40,pre:'k_',count:3});
  assert.equal(h.length,3);h.forEach(t=>assert.match(t,/^k_[0-9a-f]{40}$/));
  makeTokens({kind:'b64',len:64,pre:'',count:5}).forEach(t=>assert.match(t,/^[A-Za-z0-9_-]{64}$/));
  makeTokens({kind:'b62',len:128,pre:'',count:1}).forEach(t=>assert.match(t,/^[A-Za-z0-9]{128}$/));
  assert.match(makeTokens({kind:'uuid',len:8,pre:'',count:1})[0],/^[0-9a-f-]{36}$/);
  for(const harm of ['analogous','complement','random'])for(const style of ['calm','vivid'])
    {const p=makePalette({n:6,harm,style});assert.equal(p.length,6);p.forEach(c=>assert.match(c,/^#[0-9a-f]{6}$/))}
});

const fileList=d=>readdirSync(d).flatMap(f=>{const p=d+'/'+f;return statSync(p).isDirectory()?fileList(p):[p]});
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('rng: a seeded stream resumes across calls and is released between them',()=>{
  const run=seeded('k'),a=[run(()=>rnd(1e6)),run(()=>rnd(1e6)),run(()=>rf())];
  assert.deepEqual(a,withSeed('k',()=>[rnd(1e6),rnd(1e6),rf()]));
  assert.equal(isSeeded(),false);
  const r2=seeded('k');assert.equal(r2(()=>isSeeded()),true);assert.equal(isSeeded(),false);
  assert.throws(()=>r2(()=>{throw new Error('x')}));assert.equal(isSeeded(),false);
  assert.equal(seeded('')(()=>isSeeded()),false);
});

test('table: saved and imported column types can never reach inherited object keys',()=>{
  for(const t of ['constructor','__proto__','toString','hasOwnProperty','valueOf','','nope',7,null,{}])assert.equal(type(t),'word',String(t));
  for(const t of Object.keys(T))assert.equal(type(t),t);
  const r=readSaved({cols:[{name:'a',t:'constructor',v:[]},{name:'b',t:'__proto__'}]});
  r.cols.forEach(c=>assert.equal(c.t,'word'));
  assert.doesNotThrow(()=>makeRows(r.cols,3,'s'));
});
test('table: saved columns are normalised to strings, bounded and padded with defaults',()=>{
  const c=readSaved({cols:[{name:'x'.repeat(500),t:'int',v:[{a:1},null],nul:{z:1}},{name:'c',t:'choice',v:[]},{name:'n',t:'int',v:[5,9,'extra',1],nul:12}]}).cols;
  assert.equal(c[0].name.length,80);assert.deepEqual(c[0].v,['0','100']);assert.equal(c[0].nul,'');
  assert.deepEqual(c[1].v,['red,green,blue']);
  assert.deepEqual(c[2].v,['5','9']);assert.equal(c[2].nul,'12');
  assert.equal(readSaved({cols:[{t:'choice',v:['y'.repeat(9000)]}]}).cols[0].v[0].length,2000);
  assert.equal(readSaved({seed:'s'.repeat(999)}).tb.seed.length,200);
  assert.equal(readSaved({cols:Array.from({length:MAX_COLS+40},()=>({t:'int'}))}).cols.length,MAX_COLS);
});
test('schema: export then import is a lossless round trip for every column type',()=>{
  const cols=Object.keys(T).map(t=>mk(t,t));
  cols[0].v=['10','20'];cols[0].nul='15';cols[9].name='made up';
  const tb={n:5000,hdr:0,fmt:'sql',seed:'round trip'};
  const text=exportSchema(cols,tb),back=importSchema(text);
  assert.equal(back.error,undefined);
  assert.deepEqual(back.cols,cols);assert.deepEqual(back.tb,tb);
  assert.deepEqual(makeRows(back.cols,25,'abc'),makeRows(cols,25,'abc'));
  assert.deepEqual(JSON.parse(text),{cols:cols.map(c=>({name:c.name,t:c.t,v:c.v,nul:c.nul})),...tb});
});
test('schema: the saved shape of rz-t is accepted as it is',()=>{
  const saved={cols:[{name:'id',t:'seq',v:[1,1]},{name:'n',t:'int',v:['0','9'],nul:'5'}],n:30,hdr:1,fmt:'csv',seed:''};
  const r=importSchema(JSON.stringify(saved));
  assert.equal(r.cols.length,2);assert.deepEqual(r.cols[0].v,['1','1']);assert.deepEqual(r.tb,{n:30,hdr:1,fmt:'csv',seed:''});
});
test('schema: hostile and malformed input returns a message and never throws',()=>{
  const bad=['',' \n','null','[]','7','"x"','{','{"cols":5}','{"cols":{}}','{"cols":[]}','{"cols":[null,3,"x"]}','{"n":5}','<script>alert(1)</script>',"{'cols':[]}"];
  for(const b of bad){const r=importSchema(b);assert.equal(typeof r.error,'string',JSON.stringify(b));assert.ok(r.error.length>5);assert.equal(r.cols,undefined)}
  for(const b of [undefined,null,5,{},[]])assert.ok(importSchema(b).error);
  assert.match(importSchema('x'.repeat(SCHEMA_MAX+1)).error,/too large/);
  assert.match(importSchema(JSON.stringify({cols:Array.from({length:MAX_COLS+1},()=>({t:'int'}))})).error,/Too many columns/);
  assert.equal(importSchema(JSON.stringify({cols:Array.from({length:MAX_COLS},()=>({t:'int'}))})).cols.length,MAX_COLS);
  const big=JSON.stringify({cols:[{name:'a',t:'choice',v:['q'.repeat(SCHEMA_MAX-200)]}]});
  assert.ok(big.length<=SCHEMA_MAX);assert.equal(importSchema(big).cols[0].v[0].length,2000);
});
test('schema: unknown column types become word and prototype pollution is ignored',()=>{
  const r=importSchema('{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":2}},"cols":[{"name":"a","t":"nope"},{"name":"b","t":"toString"},{"name":"c","t":"__proto__"},{"name":"d","t":"int","v":["1","2"],"__proto__":{"polluted":3}}],"n":"7","fmt":"xml","hdr":5}');
  assert.deepEqual(r.cols.map(c=>c.t),['word','word','word','int']);
  assert.equal({}.polluted,undefined);assert.equal(Object.prototype.polluted,undefined);
  assert.deepEqual(r.tb,{});
  assert.deepEqual(Object.keys(r).sort(),['cols','tb']);
});

const legacy=(cols,n,seed)=>withSeed(seed,()=>{
  const pl=plan(cols),out=[];
  for(let i=0;i<n;i++){const r=cols.map(()=>'');for(const j of pl.order){const c=cols[j];if(+c.nul>0&&rf()*100<+c.nul)continue;r[j]=c.t==='tpl'?fill(pl.P[j],r):G[c.t](c.v,i)}out.push(r)}
  return out});
test('table: seeded output is unchanged from the single-pass generator, so saved seeds keep their tables',()=>{
  const cols=Object.keys(T).map(t=>mk(t==='tpl'?'tpl':t,t));
  cols[0].nul='30';
  for(const seed of ['a','2026','hello world'])assert.deepEqual(makeRows(cols,300,seed),legacy(cols,300,seed));
  const def=[mk('id','seq'),mk('name','name'),mk('email','tpl'),mk('score','int')];
  assert.deepEqual(makeRows(def,50,'q'),legacy(def,50,'q'));
});
test('table: seeded output is identical however it is chunked, and chunks do not leak the seed',()=>{
  const cols=Object.keys(T).map(t=>mk(t,t));cols[2].nul='25';
  const full=makeRows(cols,1234,'chunk seed');
  for(const sizes of [[1234],[1,1233],[250,250,250,250,234],[7,500,3,724],Array(1234).fill(1)]){
    const st=rowStream(cols,'chunk seed'),out=[];
    for(const k of sizes){out.push(...st.step(k));assert.equal(isSeeded(),false);rnd(1000);crypto.randomUUID()}
    assert.deepEqual(out,full);
  }
  const seqCol=cols.findIndex(c=>c.t==='seq'),st=rowStream(cols,'chunk seed');st.step(300);
  assert.equal(st.step(1)[0][seqCol],String(300+1));
  assert.notDeepEqual(makeRows(cols,50,'other'),full.slice(0,50));
});
test('table: unseeded chunks stay random and row counts clamp to the limits',()=>{
  const cols=[mk('n','int')];cols[0].v=['0','1000000000'];
  const a=makeRows(cols,40,''),b=makeRows(cols,40,'');
  assert.notDeepEqual(a,b);assert.equal(a.length,40);
  assert.equal(clampRows(0),1);assert.equal(clampRows('x'),1);assert.equal(clampRows(-5),1);assert.equal(clampRows(12.6),13);
  assert.equal(clampRows('5000'),5000);assert.equal(clampRows(1e9),MAX_ROWS);assert.equal(clampRows(Infinity),MAX_ROWS);
  assert.equal(makeRows([mk('x','uuid')],MAX_ROWS,'s').length,MAX_ROWS);
});

const letters=t=>t.replace(/[^a-z]/gi,'').toLowerCase();
const syllables=t=>letters(t).match(/../g);
test('password: pronounceable shape, grouping, capitals and digits',()=>{
  for(let i=0;i<200;i++){
    const r=genPron({...DEFAULTS,syl:12,gs:3,cap:1,num:0});
    assert.match(r.t,/^[A-Z][a-z]{5}(-[A-Z][a-z]{5}){3}$/);
    const u=genPron({...DEFAULTS,syl:10,gs:0,cap:0,num:0});assert.match(u.t,/^[a-z]{20}$/);
    const c=genPron({...DEFAULTS,syl:5,gs:0,cap:1,num:0});assert.match(c.t,/^[A-Z][a-z]{9}$/);
    const d=genPron({...DEFAULTS,syl:6,gs:2,cap:0,num:1});assert.match(d.t,/^[a-z]{4}-[a-z]{4}-[a-z]{4}-\d{4}$/);
    const e=genPron({...DEFAULTS,syl:4,gs:0,cap:0,num:1});assert.match(e.t,/^[a-z]{8}\d{4}$/);
    const o=genPron({...DEFAULTS,syl:7,gs:3,cap:0,num:0});assert.match(o.t,/^[a-z]{6}-[a-z]{6}-[a-z]{2}$/);
  }
});
test('password: pronounceable text alternates consonants and vowels from the documented alphabets',()=>{
  assert.equal(CS.length*VW.length,80);assert.equal(new Set(CS+VW).size,CS.length+VW.length);
  for(let i=0;i<300;i++)for(const s of syllables(genPron({...DEFAULTS,syl:24,gs:0,cap:0,num:0}).t)){assert.ok(CS.includes(s[0]),s);assert.ok(VW.includes(s[1]),s)}
  assert.equal(letters(genPron({...DEFAULTS,syl:0}).t).length,2);
  assert.equal(letters(genPron({...DEFAULTS,syl:999,gs:0}).t).length,128);
});
test('password: pronounceable entropy is the sum of log2 of the choices per syllable',()=>{
  const n=80;
  for(const syl of [3,12,24]){
    const want=Math.log2(n)+(syl-1)*Math.log2(n-1);
    assert.ok(Math.abs(genPron({...DEFAULTS,syl,gs:3,num:0}).b-want)<1e-9,String(syl));
    assert.ok(Math.abs(genPron({...DEFAULTS,syl,gs:0,num:1}).b-(want+Math.log2(10000)))<1e-9);
  }
  assert.ok(Math.abs(genPron({...DEFAULTS,syl:1,num:0}).b-Math.log2(80))<1e-9);
});
test('password: pronounceable text never repeats a syllable back to back and is uniform',()=>{
  const first=new Map(),second=new Map();
  for(let i=0;i<16000;i++){
    const s=syllables(genPron({...DEFAULTS,syl:3,gs:0,cap:0,num:0}).t);
    assert.notEqual(s[0],s[1]);assert.notEqual(s[1],s[2]);
    first.set(s[0],(first.get(s[0])||0)+1);second.set(s[1],(second.get(s[1])||0)+1);
  }
  for(const m of [first,second]){assert.equal(m.size,80);m.forEach(v=>assert.ok(Math.abs(v-200)<75,'count '+v))}
  for(let i=0;i<500;i++){const s=syllables(genPron({...DEFAULTS,syl:24,gs:4,cap:1,num:1}).t.replace(/\d{4}$/,''));for(let j=1;j<s.length;j++)assert.notEqual(s[j],s[j-1])}
});

test('roll: the tokenizer splits formulas and rejects anything else',()=>{
  assert.deepEqual(tokenize(' 2D6 + 1d4kh1!5 ').map(t=>t.k),['n','d','n','+','n','d','n','k','n','!','n']);
  assert.deepEqual(tokenize('4d6kl3').map(t=>t.r),['4','d','6','kl','3']);
  for(const bad of ['2x6','2d6;','2d6*3','k3','1d6 kx1','é','1.5d6'])assert.equal(tokenize(bad),null,bad);
  assert.equal(tokenize('1'.repeat(201)),null);assert.deepEqual(tokenize(''),[]);
});
test('roll: several terms add up and the breakdown shows each one',()=>{
  for(let i=0;i<300;i++){
    const r=parseDice('2d6+1d4+3');
    assert.equal(r.parts.length,3);assert.equal(r.parts[0].rolls.length,2);assert.equal(r.parts[1].rolls.length,1);
    assert.equal(r.total,r.parts[0].sum+r.parts[1].sum+3);assert.ok(r.total>=6&&r.total<=19);
    assert.match(r.detail,/^2d6 \[\d, \d\] = \d+ \+ 1d4 \[\d\] = \d \+ 3$/);
    const m=parseDice('1d20-1d4-2'),[a,b]=m.parts;
    assert.equal(m.total,a.sum-b.sum-2);assert.match(m.detail,/^1d20 \[\d+\] = \d+ - 1d4 \[\d\] = \d - 2$/);
  }
  const lead=parseDice('-1d4+5');assert.equal(lead.total,5-lead.parts[0].sum);assert.match(lead.detail,/^-1d4 \[\d\] \+ 5$/);
  assert.match(parseDice('2d6+3').detail,/^2d6 \[\d, \d\] \+ 3$/);
  assert.match(parseDice('4d6kh3+2').detail,/^4d6kh3 \[\d, \d, \d, \d\] keep \d, \d, \d = \d+ \+ 2$/);
  assert.equal(parseDice('2d6kh5').parts[0].kept.length,2);
});
test('roll: keeping the highest or lowest dice works across terms',()=>{
  for(let i=0;i<200;i++){
    const r=parseDice('4d6kh3+2d8kl1'),[h,l]=r.parts;
    assert.deepEqual(h.kept,h.rolls.slice().sort((x,y)=>y-x).slice(0,3));
    assert.deepEqual(l.kept,[Math.min(...l.rolls)]);assert.equal(r.total,h.sum+l.sum);
  }
});
test('roll: exploding dice add dice, mark them, and stop',()=>{
  for(const f of ['5d6!','5d6!5','4d2!','3d10!8']){
    const x=+(f.match(/!(\d+)/)||[0,f==='4d2!'?2:f.startsWith('3d10')?10:6])[1];
    for(let i=0;i<300;i++){
      const r=parseDice(f),p=r.parts[0],n=+f[0];
      assert.equal(p.rolls.length,n+p.exploded.length);
      p.rolls.forEach((v,j)=>assert.equal(v>=x,p.exploded.includes(j),f+' '+p.rolls));
      assert.equal(r.total,p.rolls.reduce((a,b)=>a+b,0));
    }
  }
  let marked=0;for(let i=0;i<200;i++)if(/\[[^\]]*\d!/.test(parseDice('6d6!').detail))marked++;
  assert.ok(marked>20);
  let sum=0;const N=20000;for(let i=0;i<N;i++)sum+=parseDice('1d6!').total;
  assert.ok(Math.abs(sum/N-4.2)<.15,'mean '+sum/N);
  const wild=rollTerm({n:1,s:1000,x:2});assert.ok(wild.rolls.length<=101);
  assert.equal(parseDice('3d6!+1d4!2').parts.length,2);
});
test('roll: exploding with keep applies to the whole pool',()=>{
  for(let i=0;i<200;i++){const p=parseDice('4d6!kh2').parts[0];assert.equal(p.kept.length,2);assert.deepEqual(p.kept,p.rolls.slice().sort((x,y)=>y-x).slice(0,2));assert.equal(parseDice('4d6kh2!').parts[0].kept.length,2)}
});
test('roll: invalid and over-sized formulas give an error, not a result',()=>{
  const bad=['1d6!7','1d6!1','1d6!0','1d6!!','2d6kh3kh2','2d6!3!4','+','-','2d6++3','2d6+','+2d6+','5','5+3','d6d6','2d','dd6','2d6kh','2d6kl-1','2dd6','2d6!kh','1d6!99999','1d99999','9999d6','2d6+9999999','999d6+999d6',Array(25).fill('1d6').join('+'),'1d6+'.repeat(60)+'1'];
  for(const b of bad){const r=parseDice(b);assert.ok(r.error,b);assert.equal(r.total,undefined,b)}
  assert.match(parseDice('999d6+999d6').error,/dice/);assert.match(parseDice(Array(25).fill('1d6').join('+')).error,/terms/);
  assert.match(parseDice('1d6!7').error,/Explode/);
  for(const f of ['d6','D20','2d6','10d10','3d8+5','d100','4d6kh3','2d20kl1','1d4-1','999d2','d9999','1d6+1d6+1d6','2d6kh1','1d6 + 1d6 - 3'])assert.ok(parseDice(f).total!==undefined,f);
});

const tokenCss=read('src/styles/01-tokens.css');
const block=re=>{const m=tokenCss.match(re);assert.ok(m,String(re));return Object.fromEntries([...m[1].matchAll(/--([a-z0-9]+):([^;}]+)/g)].map(x=>[x[1],x[2].trim()]))};
const THEMES={light:block(/:root\{([^}]*)\}/),dark:block(/:root\[data-theme="dark"\]\{([^}]*)\}/)};
const lum=h=>{const n=parseInt(h.slice(1),16),f=c=>{c/=255;return c<=.03928?c/12.92:((c+.055)/1.055)**2.4};return .2126*f(n>>16)+.7152*f(n>>8&255)+.0722*f(n&255)};
const ratio=(a,b)=>{const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
const TEXT_PAIRS=[['ink','bg'],['ink','sf'],['mut','bg'],['mut','sf'],['ac','bg'],['ac','sf'],['tl','bg'],['tl','sf'],['bg','ink'],['sf','ink']];
const UI_PAIRS=[['ac','bg'],['ac','sf'],['ink','bg'],['ink','sf'],['bd','bg'],['bd','sf'],['acx','ac']];
test('contrast: every text token pair reaches 4.5:1 in both themes',()=>{
  for(const [name,t] of Object.entries(THEMES))for(const [f,b] of TEXT_PAIRS){
    assert.match(t[f],/^#[0-9a-f]{6}$/i);assert.match(t[b],/^#[0-9a-f]{6}$/i);
    const r=ratio(t[f],t[b]);assert.ok(r>=4.5,`${name}: ${f} ${t[f]} on ${b} ${t[b]} is ${r.toFixed(2)}`);
  }
});
test('contrast: focus rings, control borders and icons reach 3:1 in both themes',()=>{
  for(const [name,t] of Object.entries(THEMES))for(const [f,b] of UI_PAIRS){
    const r=ratio(t[f],t[b]);assert.ok(r>=3,`${name}: ${f} ${t[f]} on ${b} ${t[b]} is ${r.toFixed(2)}`);
  }
});
test('contrast: the system-dark fallback block matches the dark theme and every used token exists',()=>{
  assert.deepEqual(block(/:root:not\(\[data-theme\]\)\{([^}]*)\}/),THEMES.dark);
  assert.deepEqual(Object.keys(THEMES.light).sort(),Object.keys(THEMES.dark).sort());
  const used=new Set();
  for(const f of [...fileList('src/styles'),'src/index.html'])for(const m of read(f).matchAll(/var\(--([a-z0-9]+)/g))used.add(m[1]);
  used.delete('p');
  used.forEach(k=>assert.ok(k in THEMES.light&&k in THEMES.dark,'undefined token --'+k));
  for(const f of fileList('src/styles').filter(f=>!f.endsWith('01-tokens.css')))assert.doesNotMatch(read(f),/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i,f+' has a literal color');
});

test('lint: the comment scanner finds comments and ignores strings, regexes and templates',()=>{
  for(const c of ['a // b','a /* b */','x\n// y','/**/','f(x) // z'])assert.ok(findComments(c).length>0,c);
  for(const c of ['const u="http://a.b/c"',"const u='//x'",'x=/[//]/.test(y)','x=/`\'"/g','a=b/c/d','return /a\\/b/.test(s)','`a//${b}//`','`${`//`}`','x=a/2;y=b/3'])assert.equal(findComments(c).length,0,c);
  assert.equal(findComments('x=a/b//c').length,1);
  assert.ok(findCssComments('a{} /* c */').length>0);assert.equal(findCssComments('a{content:"/*"}').length,0);
});
test('lint: no source, test or build file contains a comment or Math.random',()=>{
  const js=[...fileList('src').filter(f=>f.endsWith('.js')),...fileList('test').filter(f=>f.endsWith('.mjs')),'build.mjs'];
  assert.ok(js.length>20);
  for(const f of js){const h=findComments(read(f));assert.deepEqual(h,[],f+' has a comment at '+h[0])}
  for(const f of fileList('src').filter(f=>f.endsWith('.js')))assert.doesNotMatch(read(f),/Math\s*\.\s*random/,f);
  for(const f of fileList('src/styles'))assert.deepEqual(findCssComments(read(f)),[],f);
  const html=read('src/index.html');assert.doesNotMatch(html,/<!--/);
  assert.deepEqual(html.match(/\/\*[^*]*\*\//g),['/*CSS*/','/*JS*/']);
});
