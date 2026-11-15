import test from 'node:test';
import assert from 'node:assert/strict';

const store=new Map();
globalThis.localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v))};

const {rnd,rf,pick,withSeed,isSeeded}=await import('../src/core/rng.js');
const {restore,get,set,loadJSON}=await import('../src/core/storage.js');
const {genChars,genWords,genPin,DEFAULTS}=await import('../src/features/password.js');
const {parseItems,draw,pickResult}=await import('../src/features/pick.js');
const {parseDice,rollNumber}=await import('../src/features/roll.js');
const {T,G,mk,NUM,format,readSaved}=await import('../src/features/table.js');
const {makeTokens,makePalette}=await import('../src/features/tools.js');
const {W}=await import('../src/data/words.js');
const {FX,compile,plan,fill,renameRefs}=await import('../src/features/template.js');
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
  assert.deepEqual(readSaved({n:5000,hdr:2,fmt:'xml',seed:7}).tb,{});
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
