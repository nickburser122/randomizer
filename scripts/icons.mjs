import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import {writeFileSync,mkdirSync} from 'node:fs';

const BG='#22252a';
const mark=(scale)=>`<g transform="translate(32 32) scale(${scale}) translate(-32 -32)"><circle cx="24" cy="27" r="11" fill="#d6b3c6"/><circle cx="46" cy="21" r="5.5" fill="#eceeef"/><circle cx="40" cy="43" r="8" fill="#95bfb9"/></g>`;
const ICONS=[
{file:'icon-192.png',size:192,svg:`<rect width="64" height="64" rx="18" fill="${BG}"/>${mark(1)}`},
{file:'icon-512.png',size:512,svg:`<rect width="64" height="64" rx="18" fill="${BG}"/>${mark(1)}`},
{file:'icon-maskable-512.png',size:512,svg:`<rect width="64" height="64" fill="${BG}"/>${mark(.78)}`},
{file:'apple-touch-icon.png',size:180,svg:`<rect width="64" height="64" fill="${BG}"/>${mark(.92)}`}
];
const browser=await puppeteer.launch({args:chromium.args,executablePath:await chromium.executablePath(),headless:'shell'});
mkdirSync('assets/icons',{recursive:true});
for(const i of ICONS){
const page=await browser.newPage();
await page.setViewport({width:i.size,height:i.size,deviceScaleFactor:1});
await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${i.size}" height="${i.size}" style="display:block">${i.svg}</svg></body></html>`);
const png=await page.screenshot({type:'png',omitBackground:true,clip:{x:0,y:0,width:i.size,height:i.size}});
writeFileSync('assets/icons/'+i.file,png);
console.log(i.file,i.size+'x'+i.size,png.length+' bytes');
await page.close()}
await browser.close();
