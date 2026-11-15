let PR=null;
const mul=a=>()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
const hs=s=>{let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0};
export const rnd=n=>{if(n<=1)return 0;if(PR)return Math.floor(PR()*n);if(n>4294967296)return Math.floor(rf()*n);const m=Math.floor(4294967296/n)*n,a=new Uint32Array(1);do{crypto.getRandomValues(a)}while(a[0]>=m);return a[0]%n};
export const pick=a=>a[rnd(a.length)];
export const rf=()=>{if(PR)return PR();const a=new Uint32Array(2);crypto.getRandomValues(a);return((a[0]>>>5)*67108864+(a[1]>>>6))/9007199254740992};
export const isSeeded=()=>!!PR;
export const seeded=seed=>{const g=seed?mul(hs(String(seed))):null;return fn=>{const p=PR;PR=g;try{return fn()}finally{PR=p}}};
export const withSeed=(seed,fn)=>seeded(seed)(fn);
