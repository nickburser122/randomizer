const KW=new Set(['return','typeof','case','of','in','delete','void','throw','new','else','do','instanceof','yield','await']);
const ID=/[\w$]/;
const RX='(,=:[!&|?{};+-*%<>~^';
export function findComments(src){
const hits=[],n=src.length;
let i=0,last='',word='';
const tpl=j=>{
j++;
while(j<n){
const c=src[j];
if(c==='\\'){j+=2;continue}
if(c==='`')return j+1;
if(c==='$'&&src[j+1]==='{'){
j+=2;
let depth=1;
while(j<n&&depth){
const d=src[j];
if(d==='`'){j=tpl(j);continue}
if(d==='"'||d==="'"){j=str(j);continue}
if(d==='{')depth++;
else if(d==='}')depth--;
j++}
continue}
j++}
return j};
const str=j=>{
const q=src[j];
j++;
while(j<n&&src[j]!==q){if(src[j]==='\\')j++;j++}
return j+1};
while(i<n){
const c=src[i],d=src[i+1];
if(c==='/'&&d==='/'){hits.push(i);const e=src.indexOf('\n',i);if(e<0)break;i=e;continue}
if(c==='/'&&d==='*'){hits.push(i);const e=src.indexOf('*/',i+2);if(e<0)break;i=e+2;continue}
if(c==='"'||c==="'"){i=str(i);last='0';word='';continue}
if(c==='`'){i=tpl(i);last='0';word='';continue}
if(c==='/'&&(last===''||RX.includes(last)||KW.has(word))){
let cls=false;
i++;
while(i<n&&src[i]!=='\n'){
const ch=src[i];
if(ch==='\\'){i+=2;continue}
if(ch==='[')cls=true;
else if(ch===']')cls=false;
else if(ch==='/'&&!cls){i++;break}
i++}
while(i<n&&ID.test(src[i]))i++;
last='0';word='';
continue}
if(!/\s/.test(c)){
if(ID.test(c))word=i>0&&ID.test(src[i-1])&&word?word+c:c;
else word='';
last=c}
i++}
return hits}
export function findCssComments(src){
const hits=[],n=src.length;
let i=0;
while(i<n){
const c=src[i];
if(c==='"'||c==="'"){i++;while(i<n&&src[i]!==c){if(src[i]==='\\')i++;i++}i++;continue}
if(c==='/'&&src[i+1]==='*'){hits.push(i);const e=src.indexOf('*/',i+2);if(e<0)break;i=e+2;continue}
i++}
return hits}
