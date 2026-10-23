const {test}=require('node:test');
const assert=require('node:assert/strict');
const {paginateText}=require('../src/paginate.cjs');
const fits=limit=>async(start,end)=>end-start<=limit;

test('paragraphs are kept intact when they can fit together',async()=>{
 const body='First.\n\nSecond.\n\nThird.';
 const pages=await paginateText(body,'en',fits(17));
 assert.equal(pages.map(p=>body.slice(p.start,p.end)).join(''),body);
 assert.equal(pages[0].end,17);
});
test('a very long unbroken word splits only on grapheme boundaries',async()=>{
 const body='👩🏽‍🌾'.repeat(15);
 const pages=await paginateText(body,'en',fits(22));
 assert(pages.length>1);
 for(const p of pages)assert.equal(body.slice(p.start,p.end).replaceAll('👩🏽‍🌾',''),'');
 assert.equal(pages.map(p=>body.slice(p.start,p.end)).join(''),body);
});
test('a layout too small for even one grapheme is rejected',async()=>{
 await assert.rejects(paginateText('字','zh',async()=>false),/cannot fit/i);
});
test('a body that already fits remains a single exact range',async()=>{
 assert.deepEqual(await paginateText('One note.','en',fits(100)),[{start:0,end:9}]);
});
