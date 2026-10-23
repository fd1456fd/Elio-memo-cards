const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {render}=require('../src/render.cjs');
const {chromium}=require('playwright');

test('Chinese and English notes render, preserve text, and remain portable',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'elio-render-test-'));
 try {
  for(const lang of ['zh','en']){
   const destination=path.join(temp,lang);
   const report=await render(path.join(__dirname,'../examples',lang+'.json'),destination);
   assert.equal(report.textPreserved,true);assert.equal(report.highlightsPreserved,true);
   const png=await fs.readFile(path.join(destination,'card.png'));
   assert.equal(png.readUInt32BE(16),1080);assert.equal(png.readUInt32BE(20),1920);
  }
  const moved=path.join(temp,'moved');await fs.rename(path.join(temp,'zh'),moved);
  const options={headless:true};if(process.env.ELIO_CHROMIUM)options.executablePath=process.env.ELIO_CHROMIUM;
  const browser=await chromium.launch(options);
  try {
   const page=await browser.newPage();await page.goto(pathToFileURL(path.join(moved,'card.html')).href);await page.evaluate(()=>document.fonts.ready);
   assert(await page.evaluate(()=>[...document.fonts].every(f=>f.status==='loaded')));
   const original=JSON.parse(await fs.readFile(path.join(__dirname,'../examples/zh.json'),'utf8'));
   assert.equal(await page.locator('.body').evaluate(el=>[...el.querySelectorAll('p')].map(p=>p.textContent).join('\n\n')),original.body);
  } finally {await browser.close()}
 } finally {await fs.rm(temp,{recursive:true,force:true})}
});
test('overflow leaves no final output or partial staging directory',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'elio-overflow-test-'));
 try {
  const input=path.join(temp,'long.json');await fs.writeFile(input,JSON.stringify({title:'Too much text',body:'Long paragraph.\n\n'.repeat(100)}));
  await assert.rejects(render(input,path.join(temp,'result'),{mode:'locked'}),/overflows/);
  assert.deepEqual(await fs.readdir(temp),['long.json']);
 } finally {await fs.rm(temp,{recursive:true,force:true})}
});
test('existing output is refused and its files are untouched',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'elio-output-test-'));
 try {
  await fs.writeFile(path.join(temp,'keep.txt'),'do not replace');
  await assert.rejects(render(path.join(__dirname,'../examples/en.json'),temp),/already exists/);
  assert.equal(await fs.readFile(path.join(temp,'keep.txt'),'utf8'),'do not replace');
 } finally {await fs.rm(temp,{recursive:true,force:true})}
});

test('automatic pagination preserves long Chinese/English text and highlights across pages',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'elio-pagination-test-'));
 const launch={headless:true};if(process.env.ELIO_CHROMIUM)launch.executablePath=process.env.ELIO_CHROMIUM;
 const browser=await chromium.launch(launch);
 try {
  const page=await browser.newPage();
  const cases=[
   {language:'zh',body:('清晨沿着河岸慢慢走，记录一片叶子的颜色。\n\n').repeat(24)},
   {language:'en',body:'Beginning. '+('A word can travel across several cards without disappearing. '.repeat(35))+'\n\n'+'x'.repeat(1800)+' Finish.'}
  ];
  for(const item of cases){
   const input=path.join(temp,item.language+'.json');
   await fs.writeFile(input,JSON.stringify({title:'Long note',...item,highlights:[item.body]}));
   const out=path.join(temp,item.language);
   const report=await render(input,out);
   assert(report.pages>1);
   let content='',highlights='',cursor=0;
   for(const record of report.records){
    assert.equal(record.start,cursor);cursor=record.end;
    await page.goto(pathToFileURL(path.join(out,record.html)).href);await page.evaluate(()=>document.fonts.ready);
    content+=await page.locator('.body').evaluate(el=>[...el.querySelectorAll('p')].map(p=>p.textContent).join('\n\n'));
    highlights+=(await page.locator('mark').allTextContents()).join('');
    assert.equal(await page.locator('.folio').textContent(),`${String(record.page).padStart(2,'0')} / ${String(report.pages).padStart(2,'0')}`);
    assert.equal(record.fits,true);
   }
   assert.equal(cursor,item.body.length);
   assert.equal(content,item.body);
   assert.equal(highlights.replaceAll('\n',''),item.body.replaceAll('\n',''));
   assert((await fs.stat(path.join(out,'preview.png'))).size>0);
  }
 } finally {await browser.close();await fs.rm(temp,{recursive:true,force:true})}
});
test('locked source pages stay separate and retain their ids',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'elio-source-test-'));
 try {
  const input=path.join(temp,'source.json');
  await fs.writeFile(input,JSON.stringify({title:'Two blocks',pages:[{id:'a',body:'First source.'},{id:'b',body:'Second source.'}]}));
  const report=await render(input,path.join(temp,'result'),{mode:'locked'});
  assert.deepEqual(report.records.map(r=>r.sourceId),['a','b']);assert.equal(report.pages,2);
 } finally {await fs.rm(temp,{recursive:true,force:true})}
});

test('a character requiring an unbundled system font is rejected explicitly',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'elio-font-test-'));
 try {
  const input=path.join(temp,'emoji.json');await fs.writeFile(input,JSON.stringify({title:'Font check',body:'An emoji: 👩🏽‍🌾'}));
  await assert.rejects(render(input,path.join(temp,'result')),/unbundled font/i);
  assert.deepEqual(await fs.readdir(temp),['emoji.json']);
 } finally {await fs.rm(temp,{recursive:true,force:true})}
});
