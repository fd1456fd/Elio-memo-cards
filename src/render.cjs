'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
const {readNote, noteHTML, bodyHTML, escapeHTML} = require('./note.cjs');
const {paginateText} = require('./paginate.cjs');
const root = path.resolve(__dirname, '..');

async function inspectCard(page) {
  return page.locator('.card').evaluate(card => {
    const bounds = card.getBoundingClientRect();
    const footer = card.querySelector('.footer').getBoundingClientRect();
    const text = card.querySelector('.body').getBoundingClientRect();
    return {
      width: bounds.width, height: bounds.height,
      fits: footer.bottom <= bounds.bottom - 60 && text.bottom <= footer.top - 20 && [...card.querySelectorAll('*')].every(el => {
        const box = el.getBoundingClientRect();
        return box.left >= bounds.left && box.right <= bounds.right && el.scrollWidth <= el.clientWidth + 1;
      }),
      clearance: footer.top - text.bottom,
      fontsLoaded: [...document.fonts].every(face => face.status === 'loaded'),
      body: [...card.querySelectorAll('.body p')].map(p => p.textContent).join('\n\n'),
      highlights: [...card.querySelectorAll('mark')].map(el => el.textContent)
    };
  });
}

async function verifyBundledFonts(page) {
  const client = await page.context().newCDPSession(page);
  try {
    await client.send('DOM.enable');
    await client.send('CSS.enable');
    const document = await client.send('DOM.getDocument');
    const nodes = await client.send('DOM.querySelectorAll', {nodeId: document.root.nodeId, selector: '.card p, .card h1, .card span, .card mark'});
    const families = new Set();
    for (const nodeId of nodes.nodeIds) {
      const result = await client.send('CSS.getPlatformFontsForNode', {nodeId});
      for (const font of result.fonts) {
        if (!font.isCustomFont || font.familyName !== 'Noto Sans CJK SC') {
          throw new Error('Input needs an unbundled font; remove unsupported characters such as emoji before rendering');
        }
        families.add(font.familyName);
      }
    }
    return [...families];
  } finally { await client.detach(); }
}

function indexHTML(title, records) {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHTML(title)}</title>
<style>@font-face{font-family:ElioNoto;src:url(assets/fonts/NotoSansCJKsc-Regular.otf)}body{margin:0;padding:32px;background:#dfe5dd;color:#26332e;font:18px/1.6 ElioNoto}h1{font-size:26px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}a{color:inherit;text-decoration:none}img{display:block;width:100%;height:auto}span{display:block;text-align:center;padding:8px}@media(max-width:650px){.grid{grid-template-columns:1fr}}</style>
<h1>${escapeHTML(title)}</h1><p>${records.length} · 1080 × 1920</p><main class="grid">${records.map(r => `<a href="${r.html}"><img src="${r.png}" alt="${r.page}"><span>${r.page} / ${records.length}</span></a>`).join('')}</main></html>`;
}

async function render(inputPath, outputPath, {mode = 'auto'} = {}) {
  if (!['auto', 'locked'].includes(mode)) throw new Error('mode must be auto or locked');
  const input = path.resolve(inputPath), output = path.resolve(outputPath);
  try { await fs.lstat(output); throw new Error('Output already exists; choose a new directory'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const note = readNote(await fs.readFile(input, 'utf8'), path.extname(input).toLowerCase());
  await fs.mkdir(path.dirname(output), {recursive: true});
  const stage = await fs.mkdtemp(path.join(path.dirname(output), '.elio-card-'));
  let browser;
  try {
    await fs.cp(path.join(root, 'assets/fonts'), path.join(stage, 'assets/fonts'), {recursive: true});
    const css = await fs.readFile(path.join(root, 'sample.css'), 'utf8');
    await fs.writeFile(path.join(stage, 'card.css'), css + '\nbody{background:var(--paper)}.samples{padding:0;gap:0}.masthead,.heading,.body,.footer{flex-shrink:0}.body{white-space:pre-wrap}.body p:last-child{margin-bottom:0}.body p:empty{height:0;margin:0}\n');
    const firstNote = {...note, ...note.blocks[0]};
    await fs.writeFile(path.join(stage, 'probe.html'), noteHTML(firstNote, {start: 0, end: 0}));
    const launch = {headless: true};
    if (process.env.ELIO_CHROMIUM) launch.executablePath = process.env.ELIO_CHROMIUM;
    browser = await chromium.launch(launch);
    const page = await browser.newPage({viewport: {width: 1080, height: 1920}, deviceScaleFactor: 1});
    const remoteRequests = [];
    await page.route(/^https?:/, route => { remoteRequests.push(route.request().url()); return route.abort(); });
    await page.goto(pathToFileURL(path.join(stage, 'probe.html')).href);
    await page.evaluate(() => document.fonts.ready);
    const planned = [];
    for (const block of note.blocks) {
      const blockNote = {...note, ...block};
      const fits = async (start, end) => {
        await page.locator('.body').evaluate((el, html) => { el.innerHTML = html; }, bodyHTML(blockNote, start, end));
        return (await inspectCard(page)).fits;
      };
      let ranges;
      if (mode === 'locked') {
        if (!await fits(0, block.body.length)) throw new Error(`Locked source page overflows: ${block.id}`);
        ranges = [{start: 0, end: block.body.length}];
      } else ranges = await paginateText(block.body, note.language, fits);
      planned.push(...ranges.map(range => ({...range, block})));
    }
    const records = [];
    const received = new Map(note.blocks.map(b => [b.id, {body: '', highlights: ''}]));
    for (let i = 0; i < planned.length; i++) {
      const {start, end, block} = planned[i];
      const stem = planned.length === 1 ? 'card' : `card-${String(i + 1).padStart(3, '0')}`;
      const html = stem + '.html', png = stem + '.png';
      await fs.writeFile(path.join(stage, html), noteHTML({...note, ...block}, {start, end, index: i + 1, total: planned.length}));
      await page.goto(pathToFileURL(path.join(stage, html)).href);
      await page.evaluate(() => document.fonts.ready);
      const layout = await inspectCard(page);
      if (!layout.fontsLoaded || remoteRequests.length) throw new Error('Local fonts could not be loaded');
      if (!layout.fits) throw new Error(`Final page overflows: ${i + 1}`);
      const fontFamilies = await verifyBundledFonts(page);
      if (layout.body !== block.body.slice(start, end)) throw new Error('Rendered body differs from source range');
      const expected = block.selections.flatMap(range => {
        const from = Math.max(start, range.from), to = Math.min(end, range.to);
        return from < to ? [block.body.slice(from, to)] : [];
      }).join('');
      if (layout.highlights.join('').replaceAll('\n', '') !== expected.replaceAll('\n', '')) throw new Error('Rendered highlights differ from source range');
      received.get(block.id).body += layout.body;
      received.get(block.id).highlights += layout.highlights.join('');
      await page.locator('.card').screenshot({path: path.join(stage, png)});
      const {body, highlights, ...metrics} = layout;
      records.push({page: i + 1, sourceId: block.id, start, end, html, png, fontFamilies, ...metrics});
    }
    for (const block of note.blocks) {
      const actual = received.get(block.id);
      if (actual.body !== block.body) throw new Error('Pagination changed source text');
      const expected = block.selections.map(r => block.body.slice(r.from, r.to)).join('');
      if (actual.highlights.replaceAll('\n', '') !== expected.replaceAll('\n', '')) throw new Error('Pagination changed highlighted text');
    }
    await fs.rm(path.join(stage, 'probe.html'));
    await fs.writeFile(path.join(stage, 'index.html'), indexHTML(note.title, records));
    await page.setViewportSize({width: 1200, height: 900});
    await page.goto(pathToFileURL(path.join(stage, 'index.html')).href);
    await page.evaluate(() => document.fonts.ready);
    await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    await page.screenshot({path: path.join(stage, 'preview.png'), fullPage: true});
    if (remoteRequests.length) throw new Error('Unexpected remote resource request');
    const report = {version: '0.1.0-preview.3', mode, language: note.language, browser: browser.version(), width: 1080, height: 1920, pages: records.length, textPreserved: true, highlightsPreserved: true, remoteRequests: 0, records};
    await fs.writeFile(path.join(stage, 'render-check.json'), JSON.stringify(report, null, 2) + '\n');
    await browser.close(); browser = undefined;
    await fs.mkdir(output);
    try {
      for (const name of await fs.readdir(stage)) await fs.rename(path.join(stage, name), path.join(output, name));
    } catch (error) { await fs.rm(output, {recursive: true, force: true}); throw error; }
    return report;
  } finally {
    if (browser) await browser.close();
    await fs.rm(stage, {recursive: true, force: true});
  }
}
module.exports = {render};
