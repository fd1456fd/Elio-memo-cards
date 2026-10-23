const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readNote,noteHTML}=require('../src/note.cjs');

test('plain Markdown preserves paragraph text and explicit line breaks',()=>{
 const note=readNote('# 窗边的一天\r\n\r\n第一行。\r\n第二行。\r\n\r\n最后一段。','.md');
 assert.equal(note.title,'窗边的一天');
 assert.equal(note.body,'第一行。\n第二行。\n\n最后一段。');
});
test('input must have a title, body and a supported language',()=>{
 assert.throws(()=>readNote('{"title":"A","body":""}','.json'),/body/i);
 assert.throws(()=>readNote('{"title":"A","body":"text","language":"fr"}','.json'),/language/i);
});
test('user markup is displayed as text in every field',()=>{
 const note=readNote(JSON.stringify({title:'<script>bad()</script>',body:'One <img src=x onerror=bad()> & two.',subtitle:'<b>text</b>',category:'<svg>',footer:'<iframe>'}),'.json');
 const html=noteHTML(note);
 assert(!html.includes('<script>')&&!html.includes('<img')&&!html.includes('<iframe>'));
 assert(html.includes('&lt;script&gt;bad()&lt;/script&gt;'));
 assert(html.includes('&amp; two.'));
});
test('a selected phrase is marked without consuming other text',()=>{
 const html=noteHTML(readNote(JSON.stringify({title:'Note',body:'A phrase.\n\nAnother phrase.',highlights:['Another phrase.']}),'.json'));
 assert(html.includes('<p>A phrase.</p>'));
 assert(html.includes('<p><mark>Another phrase.</mark></p>'));
});
test('an absent or ambiguous repeated highlight must be corrected by the user',()=>{
 assert.throws(()=>readNote(JSON.stringify({title:'Note',body:'same same',highlights:['same']}),'.json'),/ambiguous/i);
 assert.throws(()=>readNote(JSON.stringify({title:'Note',body:'present',highlights:['absent']}),'.json'),/highlight/i);
});

test('a highlight can continue across a page boundary',()=>{
 const note=readNote(JSON.stringify({title:'Note',body:'before selected text after',highlights:['selected text']}),'.json');
 const left=noteHTML(note,{start:0,end:12,index:1,total:2});
 const right=noteHTML(note,{start:12,end:note.body.length,index:2,total:2});
 assert(left.includes('<mark>selec</mark>'));
 assert(right.includes('<mark>ted text</mark>'));
 assert(right.includes('02 / 02'));
});
test('explicit source pages preserve their identity and reject mixed input',()=>{
 const note=readNote(JSON.stringify({title:'Note',pages:[{id:'first',body:'A'},{id:'second',body:'B'}]}),'.json');
 assert.deepEqual(note.blocks.map(b=>b.id),['first','second']);
 assert.throws(()=>readNote(JSON.stringify({title:'Note',body:'A',pages:[{body:'B'}]}),'.json'),/body or pages/i);
});
