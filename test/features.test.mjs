import test from 'node:test';
import assert from 'node:assert/strict';

const store=new Map();
globalThis.localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v))};

const {withSeed}=await import('../src/core/rng.js');
const {parsePattern,genPattern,PATTERN_CLASSES,PATTERN_MAX,readPreset,cleanPresets,savePreset,deletePreset,MAX_PRESETS,RANGE,genWords,DEFAULTS,PRESET_KEYS}=await import('../src/features/password.js');
const {W,WS}=await import('../src/data/words.js');
const {diceStats,readTally,binsOf,STATS}=await import('../src/features/roll.js');
const {readLists,addList,removeList,MAX_LISTS,MAX_NAME,MAX_TEXT}=await import('../src/features/pick.js');
const {makeUlid,makeKsuid,makeTokens,tokenBits,CROCKFORD,B62,hexRgb,rgbHsl,formatColor,formatPalette,contrast,textOn,grade,makePalette,makeLorem,countWords,LOREM_MAX}=await import('../src/features/tools.js');
const {FX,compile,plan,fill}=await import('../src/features/template.js');
const {G,T,mk,NUM,capacity,moveCol,dupCol,uniqueName,uniqueNotes,rowStream,makeRows,MAX_COLS,readSaved}=await import('../src/features/table.js');
const {CITIES,PLACES,COUNTRY_OF,normPlace}=await import('../src/data/places.js');
const {FN,LN,DM}=await import('../src/data/names.js');

const classOk=(s,cls)=>[...s].every(c=>PATTERN_CLASSES[cls].includes(c));

test('pattern: the parser reads classes, literals, escapes and repeats',()=>{
  const a=parsePattern('Cvcc-999').items;
  assert.equal(a.length,8);assert.deepEqual(a.map(x=>x.cls||x.lit),['C','v','c','c','-','9','9','9']);
  const b=parsePattern('Cvc{3}-9{2}').items;assert.deepEqual(b.map(x=>x.cls||x.lit),['C','v','c','c','c','-','9','9']);
  assert.deepEqual(parsePattern('\\9\\c-\\\\').items,[{lit:'9'},{lit:'c'},{lit:'-'},{lit:'\\'}]);
  assert.deepEqual(parsePattern('').items,[]);
  assert.equal(parsePattern('*{128}').items.length,PATTERN_MAX);
  assert.equal(parsePattern('- .,_!').items.length,6);assert.equal(parsePattern('a-A').items.length,3);
});
test('pattern: bad patterns return a message, never throw',()=>{
  for(const [p,re] of [['x',/Unknown class/],['Cvcq9',/Unknown class/],['{3}',/repeat count/],['c{2}{3}',/repeat count/],['c{}',/repeat count/],['c{0}',/between 1 and/],['c{129}',/between 1 and/],['c{1000}',/repeat count/],['c\\',/backslash/],['*{128}c',/at most/],['é1',/Unknown class/]]){
    const r=parsePattern(p);assert.match(r.error||'',re,p);assert.equal(r.items,undefined,p);
  }
  assert.match(genPattern({pat:''}).error,/Type a pattern/);
  assert.match(genPattern({pat:'---'}).error,/at least one class/);
  assert.match(genPattern({pat:'Q'}).error,/Unknown/);
  for(const bad of [undefined,null,5,{}])assert.doesNotThrow(()=>genPattern({pat:bad}));
});
test('pattern: output follows the alphabets and entropy is the sum over classes',()=>{
  assert.deepEqual(Object.fromEntries(Object.entries(PATTERN_CLASSES).map(([k,v])=>[k,v.length])),{c:21,v:5,l:26,a:36,h:16,C:21,V:5,L:26,A:36,H:16,'9':10,s:12,'*':74});
  assert.equal(PATTERN_CLASSES.C,PATTERN_CLASSES.c.toUpperCase());assert.equal(PATTERN_CLASSES.H,'0123456789ABCDEF');
  for(let i=0;i<300;i++){
    const r=genPattern({pat:'Cvcc-999'});
    assert.match(r.t,/^[BCDFGHJKLMNPQRSTVWXYZ][aeiou][bcdfghjklmnpqrstvwxyz]{2}-\d{3}$/);
  }
  assert.ok(Math.abs(genPattern({pat:'Cvcc-999'}).b-(Math.log2(21)*3+Math.log2(5)+3*Math.log2(10)))<1e-9);
  assert.ok(Math.abs(genPattern({pat:'Cvc{3}-9{2}\\9s'}).b-(4*Math.log2(21)+Math.log2(5)+2*Math.log2(10)+Math.log2(12)))<1e-9);
  assert.match(genPattern({pat:'Cvc{3}-9{2}\\9s'}).t,/^[A-Z][aeiou][a-z]{3}-\d\d9[!@#$%&*\-_=+?]$/);
  for(const cls of Object.keys(PATTERN_CLASSES)){
    let s='';for(let i=0;i<200;i++)s+=genPattern({pat:cls}).t;
    assert.ok(classOk(s,cls),cls);assert.ok(new Set(s).size>=Math.min(PATTERN_CLASSES[cls].length,12),cls);
  }
  assert.match(genPattern({pat:'hhhh-HHHH'}).t,/^[0-9a-f]{4}-[0-9A-F]{4}$/);
  assert.equal(genPattern({pat:'a'.repeat(1)}).t.length,1);
});

test('word list: the short list is typable, honest and smaller',()=>{
  assert.ok(WS.length>1000&&WS.length<W.length);
  for(const w of WS)assert.match(w,/^[a-z]{3,5}$/);
  assert.ok(WS.every(w=>W.includes(w)));
  const L=genWords({...DEFAULTS,wl:'long',words:6,num:0,sep:'-'}),S=genWords({...DEFAULTS,wl:'short',words:6,num:0,sep:'-'});
  assert.ok(Math.abs(L.b-6*Math.log2(W.length))<1e-9);assert.ok(Math.abs(S.b-6*Math.log2(WS.length))<1e-9);assert.ok(S.b<L.b);
  for(let i=0;i<100;i++)genWords({...DEFAULTS,wl:'short',words:4,cap:0,num:0,sep:' '}).t.split(' ').forEach(w=>assert.ok(WS.includes(w)));
});

test('presets: settings are validated, clamped and limited to the known keys',()=>{
  const r=readPreset({mode:'pat',len:9999,words:-4,pin:2.6,syl:'x',lo:1,up:0,syms:'x'.repeat(500),pat:'p'.repeat(500),count:20,clr:0,hist:1,sep:'?',wl:'tiny',gs:7,__proto__:{len:5},evil:1,constructor:3});
  assert.equal(r.mode,'pat');assert.equal(r.len,RANGE.len[1]);assert.equal(r.words,RANGE.words[0]);assert.equal(r.pin,3);assert.equal(r.syl,undefined);
  assert.equal(r.syms.length,200);assert.equal(r.pat.length,200);assert.equal(r.sep,undefined);assert.equal(r.wl,undefined);assert.equal(r.gs,undefined);
  for(const k of ['count','clr','hist','evil','constructor'])assert.equal(Object.hasOwn(r,k),false,k);
  for(const k of Object.keys(r))assert.ok(PRESET_KEYS.includes(k),k);
  assert.deepEqual(readPreset(null),{});assert.deepEqual(readPreset('x'),{});assert.deepEqual(readPreset([1]),{});
});
test('presets: saving replaces by name, deleting removes, the list is capped',()=>{
  let list=[];
  const P={...DEFAULTS,len:16,syms:'!@#',mode:'chars',count:10,clr:0};
  let r=savePreset(list,'  Bank, max 16  ',P);assert.equal(r.name,'Bank, max 16');list=r.list;
  assert.equal(list.length,1);assert.equal(list[0].s.len,16);assert.equal(list[0].s.syms,'!@#');assert.equal('count' in list[0].s,false);
  r=savePreset(list,'bank, MAX 16',{...P,len:20});assert.equal(r.list.length,1);assert.equal(r.list[0].s.len,20);assert.equal(r.list[0].name,'bank, MAX 16');
  assert.ok(savePreset(list,'   ',P).error);assert.ok(savePreset(list,'',P).error);
  assert.equal(savePreset(list,'n'.repeat(100),P).list.at(-1).name.length,40);
  assert.deepEqual(deletePreset(list,'Bank, max 16'),[]);assert.equal(deletePreset(list,'nope').length,1);
  let full=[];for(let i=0;i<MAX_PRESETS;i++)full=savePreset(full,'p'+i,P).list;
  assert.equal(full.length,MAX_PRESETS);assert.match(savePreset(full,'one more',P).error,/up to 12/);assert.equal(savePreset(full,'P3',P).list.length,MAX_PRESETS);
});
test('presets: stored presets are cleaned',()=>{
  assert.deepEqual(cleanPresets(null),[]);assert.deepEqual(cleanPresets('x'),[]);assert.deepEqual(cleanPresets({}),[]);
  const c=cleanPresets([null,5,'x',{},{name:5},{name:'  '},{name:'A',s:{len:30}},{name:'a',s:{len:40}},{name:'B'},{name:'C',s:'junk'},...Array.from({length:30},(_,i)=>({name:'n'+i}))]);
  assert.equal(c.length,MAX_PRESETS);assert.deepEqual(c.slice(0,3).map(x=>x.name),['A','B','C']);assert.equal(c[0].s.len,30);assert.deepEqual(c[2].s,{});
  assert.ok(cleanPresets([{name:'__proto__',s:{}}]).length===1);assert.equal({}.polluted,undefined);
});

const sum=a=>a.reduce((x,y)=>x+y,0);
test('dice stats: plain formulas are exact',()=>{
  const s=diceStats('2d6');
  assert.equal(s.exact,true);assert.equal(s.min,2);assert.equal(s.max,12);assert.ok(Math.abs(s.mean-7)<1e-9);assert.ok(Math.abs(s.sd-Math.sqrt(35/6))<1e-9);assert.equal(s.mode,7);
  assert.equal(s.bins.length,11);assert.ok(Math.abs(sum(s.bins.map(b=>b.p))-1)<1e-9);assert.ok(Math.abs(s.bins[5].p-6/36)<1e-9);assert.deepEqual(s.bins.map(b=>b.lo),[2,3,4,5,6,7,8,9,10,11,12]);
  const m=diceStats('3d6-1d4');assert.equal(m.min,-1);assert.equal(m.max,17);assert.ok(Math.abs(m.mean-8)<1e-9);
  const k=diceStats('1d20+1d20-5');assert.equal(k.min,-3);assert.equal(k.max,35);assert.ok(Math.abs(k.mean-16)<1e-9);
  const c=diceStats('d20+5');assert.equal(c.min,6);assert.equal(c.max,25);assert.ok(Math.abs(c.mean-15.5)<1e-9);
  const big=diceStats('10d10');assert.ok(big.bins.length<=STATS.bins);assert.ok(Math.abs(sum(big.bins.map(b=>b.p))-1)<1e-9);assert.ok(Math.abs(big.mean-55)<1e-9);
});
test('dice stats: keep and exploding formulas are estimated the same way every time',()=>{
  const a=diceStats('4d6kh3'),b=diceStats('4d6kh3');
  assert.equal(a.exact,false);assert.deepEqual(a,b);assert.equal(a.min,3);assert.equal(a.max,18);assert.ok(Math.abs(a.mean-12.2446)<.1,String(a.mean));assert.ok(Math.abs(sum(a.bins.map(x=>x.p))-1)<1e-9);
  const e=diceStats('1d6!');assert.equal(e.exact,false);assert.equal(e.max,null);assert.equal(e.min,1);assert.ok(Math.abs(e.mean-4.2)<.12,String(e.mean));
  assert.equal(diceStats('2d20kl1').min,1);assert.ok(Math.abs(diceStats('2d20kl1').mean-7.175)<.2);
  assert.notDeepEqual(diceStats('4d6kh2').bins,a.bins);
  const t0=Date.now(),h=diceStats('999d9999');assert.equal(h.exact,false);assert.ok(h.bins.length<=STATS.bins);assert.ok(Date.now()-t0<5000);
});
test('dice stats: errors pass through and bins group wide ranges',()=>{
  for(const bad of ['','x','2d6+','1d6!7','999d6+999d6'])assert.ok(diceStats(bad).error,bad);
  const p=Array.from({length:100},()=>.01),b=binsOf(1,p,24);
  assert.equal(b.length,Math.ceil(100/Math.ceil(100/24)));assert.equal(b[0].lo,1);assert.equal(b.at(-1).hi,100);assert.ok(Math.abs(sum(b.map(x=>x.p))-1)<1e-9);
  assert.deepEqual(binsOf(5,[1],24),[{lo:5,hi:5,p:1}]);
});
test('coin tally: stored values are validated',()=>{
  assert.deepEqual(readTally(null),{h:0,t:0});assert.deepEqual(readTally('x'),{h:0,t:0});assert.deepEqual(readTally({h:3,t:4}),{h:3,t:4});
  assert.deepEqual(readTally({h:-1,t:2.5}),{h:0,t:0});assert.deepEqual(readTally({h:'3',t:1e12}),{h:0,t:0});assert.deepEqual(readTally({h:1e9,t:0}),{h:1e9,t:0});assert.deepEqual(readTally([1,2]),{h:0,t:0});
});

test('lists: legacy text becomes the first list and stored lists are validated',()=>{
  assert.deepEqual(readLists('Ana\nBen'),{lists:[{name:'List 1',text:'Ana\nBen'}],cur:0});
  assert.deepEqual(readLists(''),{lists:[{name:'List 1',text:''}],cur:0});assert.deepEqual(readLists(null),{lists:[{name:'List 1',text:''}],cur:0});
  assert.equal(readLists('123').lists[0].text,'123');assert.equal(readLists('["a","b"]').lists[0].text,'["a","b"]');assert.equal(readLists('{"x":1}').lists[0].text,'{"x":1}');
  const ok=readLists(JSON.stringify({lists:[{name:'Team',text:'a,b'},{name:'  ',text:'c'},{name:'Z',text:'z'}],cur:2}));
  assert.deepEqual(ok,{lists:[{name:'Team',text:'a,b'},{name:'List 2',text:'c'},{name:'Z',text:'z'}],cur:2});
  assert.equal(readLists(JSON.stringify({lists:[{text:'a'}],cur:99})).cur,0);assert.equal(readLists(JSON.stringify({lists:[{text:'a'},{text:'b'}],cur:-3})).cur,0);assert.equal(readLists(JSON.stringify({lists:[{text:'a'},{text:'b'}],cur:1.5})).cur,0);
  const hostile=readLists({lists:[null,5,'x',{text:5},{name:{},text:'ok'},{name:'n'.repeat(99),text:'t'.repeat(MAX_TEXT+5)},...Array.from({length:40},(_,i)=>({name:'l'+i,text:''}))],cur:'x'});
  assert.equal(hostile.lists.length,MAX_LISTS);assert.equal(hostile.lists[0].name,'List 1');assert.equal(hostile.lists[1].name.length,MAX_NAME);assert.equal(hostile.lists[1].text.length,MAX_TEXT);assert.equal(hostile.cur,0);
  assert.deepEqual(readLists({lists:'x'}).lists.length,1);assert.deepEqual(readLists({lists:[]}).lists,[{name:'List 1',text:''}]);
});
test('lists: adding and removing keep the invariants',()=>{
  let L=readLists('a');
  L=addList(L);assert.deepEqual(L,{lists:[{name:'List 1',text:'a'},{name:'List 2',text:''}],cur:1});
  L={...L,lists:[L.lists[0],{name:'List 3',text:''}]};const n=addList(L);assert.equal(n.lists[2].name,'List 4');assert.equal(new Set(n.lists.map(x=>x.name)).size,3);assert.equal(n.cur,2);
  let M={lists:Array.from({length:MAX_LISTS},(_,i)=>({name:'l'+i,text:''})),cur:0};assert.match(addList(M).error,/up to 20/);
  const R=removeList({lists:[{name:'a',text:'1'},{name:'b',text:'2'},{name:'c',text:'3'}],cur:2},1);assert.deepEqual(R.lists.map(x=>x.name),['a','c']);assert.equal(R.cur,1);
  assert.equal(removeList({lists:[{name:'a',text:''},{name:'b',text:''}],cur:1},1).cur,0);assert.equal(removeList({lists:[{name:'a',text:''},{name:'b',text:''}],cur:0},0).cur,0);
  assert.deepEqual(removeList({lists:[{name:'a',text:'x'}],cur:0},0),{lists:[{name:'List 1',text:''}],cur:0});
  const same={lists:[{name:'a',text:''}],cur:0};assert.equal(removeList(same,5),same);
});

test('tokens: ULID follows the specification',()=>{
  assert.equal(makeUlid(1469918176385,()=>0),'01ARYZ6S410000000000000000');
  assert.equal(makeUlid(0,()=>0),'0'.repeat(26));assert.equal(makeUlid(0,()=>31),'0000000000'+'Z'.repeat(16));
  assert.equal(makeUlid(281474976710655,()=>0).slice(0,10),'7ZZZZZZZZZ');
  for(let i=0;i<200;i++){const u=makeUlid();assert.match(u,/^[0-9A-HJKMNP-TV-Z]{26}$/)}
  const a=makeUlid(1000,()=>0),b=makeUlid(2000,()=>0),c=makeUlid(2000000,()=>0);assert.ok(a<b&&b<c);
  for(const ch of CROCKFORD)assert.ok(!'ILOU'.includes(ch));assert.equal(CROCKFORD.length,32);
});
test('tokens: KSUID follows the specification',()=>{
  assert.equal(makeKsuid(1400000000,()=>0),'0'.repeat(27));
  assert.equal(makeKsuid(1400000000+0xFFFFFFFF,()=>255),'aWgEPTl1tmebfsQzFP4bxwgy80V');
  assert.equal(makeKsuid(1400000000,()=>255).length,27);
  for(let i=0;i<200;i++)assert.match(makeKsuid(),/^[0-9A-Za-z]{27}$/);
  assert.ok(makeKsuid(1500000000,()=>0)<makeKsuid(1600000000,()=>0));assert.equal(makeKsuid(0,()=>0),'0'.repeat(27));
  assert.equal(B62.length,62);assert.equal(new Set(B62).size,62);
});
test('tokens: every kind has the right shape, prefix and entropy',()=>{
  const now=1700000000000;
  assert.match(makeTokens({kind:'ulid',pre:'',count:1,len:0},now)[0],/^01HF7YAT00[0-9A-Z]{16}$/);
  assert.match(makeTokens({kind:'ksuid',pre:'k_',count:2,len:0},now)[1],/^k_[0-9A-Za-z]{27}$/);
  makeTokens({kind:'nanoid',pre:'',count:5,len:21}).forEach(x=>assert.match(x,/^[A-Za-z0-9_-]{21}$/));
  assert.equal(makeTokens({kind:'ulid',pre:'x',count:3,len:0}).length,3);
  assert.equal(tokenBits({kind:'uuid',len:8}),122);assert.equal(tokenBits({kind:'ulid',len:8}),80);assert.equal(tokenBits({kind:'ksuid',len:8}),128);
  assert.ok(Math.abs(tokenBits({kind:'nanoid',len:21})-126)<1e-9);assert.ok(Math.abs(tokenBits({kind:'hex',len:32})-128)<1e-9);assert.ok(Math.abs(tokenBits({kind:'b62',len:10})-10*Math.log2(62))<1e-9);
});
test('palettes: color conversion, formats and contrast',()=>{
  assert.deepEqual(hexRgb('#c0517a'),[192,81,122]);assert.deepEqual(rgbHsl([255,0,0]),[0,100,50]);assert.deepEqual(rgbHsl([128,128,128]),[0,0,50]);assert.deepEqual(rgbHsl([0,0,0]),[0,0,0]);assert.deepEqual(rgbHsl([255,255,255]),[0,0,100]);assert.deepEqual(rgbHsl([0,0,255]),[240,100,50]);
  assert.equal(formatColor('#c0517a','hex'),'#c0517a');assert.equal(formatColor('#c0517a','rgb'),'rgb(192, 81, 122)');assert.equal(formatColor('#ff0000','hsl'),'hsl(0, 100%, 50%)');assert.equal(formatColor('#c0517a','css',2),'--color-3: #c0517a;');
  assert.equal(formatPalette(['#aa0000','#00aa00'],'css'),':root {\n  --color-1: #aa0000;\n  --color-2: #00aa00;\n}');assert.equal(formatPalette(['#aa0000','#00aa00'],'hex'),'#aa0000\n#00aa00');assert.equal(formatPalette(['#ff0000'],'rgb'),'rgb(255, 0, 0)');assert.equal(formatPalette([],'css'),':root {\n\n}');
  assert.ok(Math.abs(contrast('#000000','#ffffff')-21)<1e-9);assert.equal(contrast('#777777','#777777'),1);assert.ok(Math.abs(contrast('#767676','#ffffff')-4.54)<.01);
  assert.equal(textOn('#000000').color,'#ffffff');assert.equal(textOn('#ffffff').color,'#000000');
  assert.equal(grade(21),'AAA');assert.equal(grade(7),'AAA');assert.equal(grade(6.99),'AA');assert.equal(grade(4.5),'AA');assert.equal(grade(3.5),'AA large');
  let worst=99;for(let r=0;r<256;r+=15)for(let g=0;g<256;g+=15)for(let b=0;b<256;b+=15){const h='#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');worst=Math.min(worst,textOn(h).ratio)}
  assert.ok(worst>=4.58,'worst '+worst);
});
test('palettes: locked colors are kept in place and the others are built around them',()=>{
  const Tk={n:5,harm:'analogous',style:'calm'},keep=[{c:'#112233',locked:true},{c:'#aaaaaa',locked:false},{c:'#445566',locked:true},{c:'junk',locked:true},{c:'#abcdef',locked:false}];
  for(let i=0;i<50;i++){
    const p=makePalette(Tk,keep);
    assert.equal(p.length,5);assert.equal(p[0],'#112233');assert.equal(p[2],'#445566');p.forEach(c=>assert.match(c,/^#[0-9a-f]{6}$/));
    assert.notEqual(p[3],'junk');
  }
  assert.equal(makePalette({...Tk,n:2},keep).length,2);assert.equal(makePalette({...Tk,n:8},keep).length,8);
  const hues=[];for(let i=0;i<30;i++)hues.push(rgbHsl(hexRgb(makePalette({n:3,harm:'analogous',style:'vivid'},[{c:'#0000ff',locked:true}])[1]))[0]);
  hues.forEach(h=>assert.ok(Math.abs(h-266)<=2||Math.abs(h-266)>=358,'hue '+h));
  assert.deepEqual(makePalette({n:3,harm:'random',style:'calm'},[{c:'#123456',locked:false}]).includes('#123456'),false);
  assert.equal(makePalette(Tk,[{c:'#ABCDEF',locked:true}])[0],'#abcdef');
});
test('lorem: seeded text repeats, units and limits are respected',()=>{
  const a=makeLorem({unit:'paragraphs',n:3},'seed'),b=makeLorem({unit:'paragraphs',n:3},'seed');
  assert.equal(a,b);assert.notEqual(a,makeLorem({unit:'paragraphs',n:3},'other'));assert.notEqual(makeLorem({unit:'words',n:30},''),makeLorem({unit:'words',n:30},''));
  const paras=a.split('\n\n');assert.equal(paras.length,3);
  for(const p of paras){const s=p.split(/(?<=\.) /);assert.ok(s.length>=3&&s.length<=6,String(s.length));for(const x of s){assert.match(x,/^[A-Z][^.]*\.$/);const n=countWords(x);assert.ok(n>=6&&n<=14,x)}}
  assert.equal(countWords(makeLorem({unit:'words',n:57},'w')),57);assert.equal(makeLorem({unit:'words',n:5},'w').includes('.'),false);
  const ss=makeLorem({unit:'sentences',n:4},'s');assert.equal((ss.match(/\./g)||[]).length,4);assert.equal(ss.includes('\n'),false);
  assert.equal(countWords(makeLorem({unit:'words',n:99999},'x')),LOREM_MAX.words);assert.equal(makeLorem({unit:'paragraphs',n:999},'x').split('\n\n').length,LOREM_MAX.paragraphs);
  assert.equal(countWords(makeLorem({unit:'words',n:0},'x')),1);assert.equal(countWords(makeLorem({unit:'nope',n:'x'},'x')),countWords(makeLorem({unit:'paragraphs',n:1},'x')));
  const set=new Set(W);for(const w of makeLorem({unit:'words',n:300},'q').split(' '))assert.ok(set.has(w),w);
  assert.equal(countWords(''),0);assert.equal(countWords('  a  b '),2);
});

test('template: number formatting filters',()=>{
  assert.equal(FX.num('1234567.891'),'1,234,567.891');assert.equal(FX.num('-1000'),'-1,000');assert.equal(FX.num('abc'),'abc');assert.equal(FX.num(''),'');assert.equal(FX.num('  '),'  ');
  assert.equal(FX.fixed('3.14159','2'),'3.14');assert.equal(FX.fixed('2','3'),'2.000');assert.equal(FX.fixed('2.5','0'),'3');assert.equal(FX.fixed('x','2'),'x');assert.equal(FX.fixed('1','999'),'1.00000000000000000000');assert.equal(FX.fixed('1.5',''),'2');
  assert.equal(FX.pad('7','4'),'0007');assert.equal(FX.pad('12345','3'),'12345');assert.equal(FX.pad('','4'),'');assert.equal(FX.pad('a','x'),'a');assert.equal(FX.pad('7','999').length,50);
});
test('template: date filters follow the calendar',()=>{
  assert.equal(FX.addDays('2024-02-28','2'),'2024-03-01');assert.equal(FX.addDays('2024-03-01','-1'),'2024-02-29');assert.equal(FX.addDays('2023-12-31','1'),'2024-01-01');assert.equal(FX.addDays('2024-01-01','-1'),'2023-12-31');assert.equal(FX.addDays('2024-06-15','0'),'2024-06-15');assert.equal(FX.addDays('2024-06-15',''),'2024-06-15');
  assert.equal(FX.addMonths('2024-01-31','1'),'2024-02-29');assert.equal(FX.addMonths('2023-01-31','1'),'2023-02-28');assert.equal(FX.addMonths('2024-03-31','-1'),'2024-02-29');assert.equal(FX.addMonths('2024-11-15','3'),'2025-02-15');assert.equal(FX.addMonths('2024-01-15','-13'),'2022-12-15');assert.equal(FX.addMonths('2024-05-31','1'),'2024-06-30');
  assert.equal(FX.addYears('2024-02-29','1'),'2025-02-28');assert.equal(FX.addYears('2024-02-29','4'),'2028-02-29');assert.equal(FX.addYears('2020-06-15','-3'),'2017-06-15');
  assert.equal(FX.year('2024-02-29'),'2024');assert.equal(FX.month('2024-02-09'),'02');assert.equal(FX.day('2024-02-09'),'09');assert.equal(FX.weekday('2024-02-29'),'Thursday');assert.equal(FX.weekday('2000-01-01'),'Saturday');
  for(const bad of ['2024-13-01','2024-02-30','24-02-01','2024/02/01','abc','2024-2-1',' ','2023-02-29'])for(const f of ['addDays','addMonths','addYears','year','month','day','weekday'])assert.equal(FX[f](bad,'1'),bad,f+' '+bad);
  assert.equal(FX.addDays('9999-12-31','1'),'9999-12-31');assert.equal(FX.addYears('0050-03-01','1'),'0051-03-01');assert.equal(FX.addDays('0001-01-01','-1'),'0000-12-31');assert.equal(FX.addDays('0000-01-01','-1'),'0000-01-01');
  assert.equal(FX.addDays(' 2024-01-01 ','1'),'2024-01-02');
});
test('template: lookup turns a city into its country',()=>{
  assert.equal(FX.lookup('Tokyo'),'Japan');assert.equal(FX.lookup('  são paulo '),'Brazil');assert.equal(FX.lookup('Sao Paulo'),'Brazil');assert.equal(FX.lookup('ZÜRICH'),'Switzerland');assert.equal(FX.lookup('New   York'),'United States');assert.equal(FX.lookup('Atlantis'),'');assert.equal(FX.lookup(''),'');
  assert.equal(new Set(PLACES.map(([c])=>normPlace(c))).size,PLACES.length);assert.equal(COUNTRY_OF.size,PLACES.length);assert.equal(CITIES.length,PLACES.length);assert.ok(PLACES.length>100);
  for(const [c,k] of PLACES){assert.ok(c&&k);assert.equal(FX.lookup(c),k)}
});
test('template: filters take arguments after a colon and reject unknown names',()=>{
  const c=compile('{city|lookup} {d|addDays: 7|weekday} {x|nope:1|constructor|__proto__}');
  assert.deepEqual(c.out[0],{ref:'city',f:[{n:'lookup',a:''}]});assert.deepEqual(c.out[2].f,[{n:'addDays',a:'7'},{n:'weekday',a:''}]);assert.deepEqual(c.out[4].f,[]);
  assert.deepEqual(c.errs,['unknown filter nope, constructor, __proto__']);
  const cols=[{name:'when',t:'date',v:['2024-02-28','2024-02-28']},{name:'out',t:'tpl',v:['{when|addDays:2|weekday} {when|addMonths:12} {when|year|pad:6} {when|nope}']}];
  const p=plan(cols);assert.equal(fill(p.P[1],['2024-02-28','']),'Friday 2025-02-28 002024 2024-02-28');
  assert.equal(fill(compile('{n|num|fixed:1}'),[]),'');assert.equal(fill(compile('{#}{?}'),[]).length,2);
  const rows=makeRows([{name:'x',t:'int',v:['1234','1234'],nul:'',u:0},{name:'y',t:'tpl',v:['${x|num}'],nul:'',u:0}],1,'s');assert.deepEqual(rows[0],['1234','$1,234']);
  for(const f of Object.keys(FX))assert.equal(FX[f]('','1'),'',f);
});

test('table: new column types stay in range and are right aligned when numeric',()=>{
  for(const k of ['exp','lognormal'])assert.ok(NUM.has(k));assert.ok(!NUM.has('city'));
  for(const k of ['exp','lognormal','city'])assert.ok(T[k]);
  let sum1=0,min1=1e9;const N=20000;
  for(let i=0;i<N;i++){const x=+G.exp(['2','4']);assert.ok(x>=0);sum1+=x;min1=Math.min(min1,x)}
  assert.ok(Math.abs(sum1/N-2)<.1,String(sum1/N));assert.match(G.exp(['3','2']),/^\d+\.\d{2}$/);assert.match(G.exp(['3','0']),/^\d+$/);
  for(const bad of ['0','-5','x',''])assert.ok(+G.exp([bad,'2'])>=0&&isFinite(+G.exp([bad,'2'])));
  const logs=[],xs=[];for(let i=0;i<N;i++){const x=+G.lognormal(['1','0.5','6']);assert.ok(x>0);xs.push(x);logs.push(Math.log(x))}
  const mu=logs.reduce((a,b)=>a+b)/N,sd=Math.sqrt(logs.reduce((a,b)=>a+(b-mu)**2,0)/N);
  assert.ok(Math.abs(mu-1)<.03,String(mu));assert.ok(Math.abs(sd-.5)<.03,String(sd));xs.sort((a,b)=>a-b);assert.ok(Math.abs(xs[N>>1]-Math.E)<.1);
  assert.ok(+G.lognormal(['0','-1','2'])>0);assert.match(G.lognormal(['0','1','3']),/^\d+\.\d{3}$/);
  for(let i=0;i<200;i++)assert.ok(CITIES.includes(G.city([])));
  const ref=withSeed('same',()=>G.normal(['50','10','1']));assert.equal(withSeed('same',()=>G.normal(['50','10','1'])),ref);
});

test('unique: capacities are computed per type',()=>{
  const c=(t,v)=>capacity({t,v});
  assert.equal(c('int',['0','9']),10);assert.equal(c('int',['9','0']),10);assert.equal(c('int',['5','5']),1);assert.equal(c('int',['1.5','4.5']),3);assert.equal(c('int',['x','y']),1);
  assert.equal(c('float',['0','1','2']),101);assert.equal(c('float',['0','1','0']),2);assert.equal(c('float',['1','0','1']),11);
  assert.equal(c('choice',['a, b,a,,c']),3);assert.equal(c('choice',['']),0);assert.equal(c('wchoice',['a*3,b*1,a*2']),2);assert.equal(c('bool',['50']),2);
  assert.equal(c('date',['2020-01-01','2020-01-10']),10);assert.equal(c('date',['2020-01-10','2020-01-01']),10);assert.equal(c('date',['nope','2020-01-01']),1);
  assert.equal(c('seq',['1','1']),Infinity);assert.equal(c('seq',['1','0']),1);assert.equal(c('word',[]),W.length);assert.equal(c('city',[]),CITIES.length);assert.equal(c('name',[]),FN.length*LN.length);
  assert.equal(c('pat',['ID-##??']),10*10*26*26);assert.equal(c('pat',['ID']),1);assert.equal(c('pat',['*']),36);assert.equal(c('phone',['+1 ###-####']),1e7);assert.equal(c('phone',['none']),1);
  for(const t of ['uuid','tpl','normal','exp','lognormal'])assert.equal(c(t,[]),Infinity,t);
  assert.equal(c('email',[]),FN.length*LN.length*100*DM.length);
  assert.equal(new Set(FN).size,FN.length);assert.equal(new Set(LN).size,LN.length);
});
const col=(name,t,v,extra)=>({name,t,v,nul:'',u:1,...extra});
test('unique: every enumerable type yields each value once, in a random order, then reports exhaustion',()=>{
  const cases=[col('i','int',['1','50']),col('c','choice',['a,b,c,d,e']),col('w','wchoice',['x*9,y*1,z*1']),col('b','bool',['90']),col('d','date',['2024-01-01','2024-02-19']),col('f','float',['0','0.49','2']),col('p','pat',['ID-##']),col('n','phone',['##']),col('city','city',[])];
  const want=[50,5,3,2,50,50,100,100,CITIES.length];
  cases.forEach((c,k)=>{
    const out=makeRows([c],want[k],'u'+k).map(r=>r[0]);
    assert.equal(new Set(out).size,want[k],c.name);
    const again=makeRows([c],want[k],'u'+k).map(r=>r[0]);assert.deepEqual(again,out,c.name);
    if(want[k]>=5)assert.notDeepEqual(makeRows([c],want[k],'other').map(r=>r[0]),out,c.name);
    const s=rowStream([c],'z');s.step(want[k]);assert.deepEqual(s.issues,{},c.name);
    const s2=rowStream([c],'z');const rows=s2.step(want[k]+7);assert.equal(rows.length,want[k]+7);assert.equal(s2.issues[0].at,want[k],c.name);
    assert.equal(new Set(rows.slice(0,want[k]).map(r=>r[0])).size,want[k]);
  });
  const ints=makeRows([col('i','int',['1','50'])],50,'order').map(r=>+r[0]);assert.ok(ints.some((v,i)=>i&&v<ints[i-1]));assert.deepEqual([...ints].sort((a,b)=>a-b),Array.from({length:50},(_,i)=>i+1));
  assert.equal(new Set(makeRows([col('n','name',[])],FN.length*LN.length,'all').map(r=>r[0])).size,FN.length*LN.length);
});
test('unique: columns with a huge range use retries and still come out distinct',()=>{
  const e=makeRows([col('e','email',[]),col('n','normal',['50','10','4']),col('u','int',['0','1000000000'])],3000,'big');
  for(let j=0;j<3;j++)assert.equal(new Set(e.map(r=>r[j])).size,3000,String(j));
  assert.equal(new Set(makeRows([col('t','tpl',['{#}{#}{#}{#}'])],500,'tpl').map(r=>r[0])).size,500);
});
test('unique: running out of retries is reported, rows are still produced, and a seq or uuid needs no help',()=>{
  const c=col('t','tpl',['{#}']),s=rowStream([c],'x'),rows=s.step(50);
  assert.equal(rows.length,50);assert.ok(s.issues[0].at>=9&&s.issues[0].at<=10,String(s.issues[0].at));assert.equal(new Set(rows.map(r=>r[0])).size,10);
  rows.forEach(r=>assert.match(r[0],/^\d$/));
  const n=uniqueNotes([c],50,s.issues);assert.match(n[0],/^Ran out of different values after \d+ rows/);
  const pre=uniqueNotes([col('i','int',['1','10'])],25,{});assert.match(pre[0],/^Only 10 different values are possible, but the table has 25 rows/);
  assert.deepEqual(uniqueNotes([col('i','int',['1','10'])],10,{}),{});assert.deepEqual(uniqueNotes([col('i','int',['1','10'],{u:0})],25,{}),{});assert.deepEqual(uniqueNotes([col('s','seq',['1','1']),col('g','uuid',[])],99999,{}),{});
  assert.deepEqual(uniqueNotes([col('t','tpl',['{#}'])],5,{}),{});
  const sq=makeRows([col('s','seq',['1','1']),col('g','uuid',[])],20,'q');assert.equal(new Set(sq.map(r=>r[0])).size,20);assert.equal(new Set(sq.map(r=>r[1])).size,20);
  const empty=rowStream([col('i','int',['1','2'],{nul:'100'})],'e'),er=empty.step(30);er.forEach(r=>assert.equal(r[0],''));assert.deepEqual(empty.issues,{});
  const part=makeRows([col('i','int',['1','1000'],{nul:'50'})],200,'p').map(r=>r[0]).filter(Boolean);assert.equal(new Set(part).size,part.length);assert.ok(part.length>60&&part.length<140);
});
test('unique: chunking does not change a table that uses unique columns, and other columns keep their seeds',()=>{
  const cols=[col('i','int',['1','5000']),col('n','name',[]),{...mk('plain','int'),v:['0','9']},col('e','email',[])];
  const full=makeRows(cols,1500,'chunky');
  for(const sizes of [[1500],[1,1499],[250,250,250,250,250,250],[7,493,1000]]){
    const st=rowStream(cols,'chunky'),out=[];for(const k of sizes)out.push(...st.step(k));assert.deepEqual(out,full);
  }
  const without=cols.map(c=>({...c,u:0}));
  const plainU=makeRows([cols[2]],40,'k'),plain0=makeRows([{...cols[2],u:0}],40,'k');assert.deepEqual(plainU,plain0);
  assert.equal(without.length,4);
});
test('unique: the flag survives saving and loading',()=>{
  const r=readSaved({cols:[{name:'a',t:'int',u:1},{name:'b',t:'int',u:true},{name:'c',t:'int',u:'yes'},{name:'d',t:'int'},{name:'e',t:'int',u:2}]}).cols;
  assert.deepEqual(r.map(c=>c.u),[1,1,0,0,0]);assert.equal(mk('x','int').u,0);
});

test('columns: moving swaps neighbours and never mutates or leaves the table',()=>{
  const a=[{name:'a'},{name:'b'},{name:'c'}],names=x=>x.map(c=>c.name).join('');
  assert.equal(names(moveCol(a,1,-1)),'bac');assert.equal(names(moveCol(a,1,1)),'acb');assert.equal(names(a),'abc');
  assert.equal(moveCol(a,0,-1),a);assert.equal(moveCol(a,2,1),a);assert.equal(moveCol(a,5,-1),a);assert.equal(moveCol(a,-1,1),a);assert.equal(moveCol(a,0.5,1),a);assert.equal(moveCol([],0,1).length,0);
  assert.equal(moveCol(a,0,1)[1],a[0]);
});
test('columns: moving a column does not change what a template column produces',()=>{
  const cols=[mk('id','seq'),mk('name','name'),{...mk('email','tpl'),v:['{name|first|lower}@x.com']}];
  const moved=moveCol(moveCol(cols,2,-1),1,-1),a=makeRows(cols,30,'ord'),b=makeRows(moved,30,'ord');
  assert.deepEqual(b.map(r=>r.slice().sort()),a.map(r=>r.slice().sort()));
  b.forEach(r=>assert.match(r.find(x=>x.includes('@')),/^[a-z]+@x\.com$/));
  assert.equal(plan(moved).P.filter(Boolean).length,1);
});
test('columns: duplicating inserts a renamed independent copy and respects the limit',()=>{
  const cols=[{...mk('name','name'),nul:'5',u:1},{...mk('score','int'),v:['1','9']}];
  const r=dupCol(cols,0);assert.equal(r.at,1);assert.deepEqual(r.cols.map(c=>c.name),['name','name copy','score']);assert.equal(r.cols[1].nul,'5');assert.equal(r.cols[1].u,1);
  const d2=dupCol(dupCol(cols,0).cols,0);assert.deepEqual(d2.cols.map(c=>c.name),['name','name copy 2','name copy','score']);
  const d3=dupCol(d2.cols,1);assert.equal(d3.cols[2].name,'name copy 2 copy');
  const s=dupCol(cols,1);s.cols[2].v.push('x');assert.equal(cols[1].v.length,2);
  assert.equal(uniqueName([],''),'column copy');assert.equal(uniqueName([{name:' Name Copy '}],'name'),'name copy 2');assert.equal(uniqueName([],'x'.repeat(200)).length,80);
  assert.equal(dupCol(cols,9).cols,cols);
  const full=Array.from({length:MAX_COLS},(_,i)=>mk('c'+i,'int'));assert.match(dupCol(full,0).error,/up to 60 columns/);assert.equal(dupCol(full.slice(1),0).cols.length,MAX_COLS);
  assert.deepEqual(dupCol([{...mk('t','tpl'),v:['{a}']}],0).cols[1].v,['{a}']);
});
