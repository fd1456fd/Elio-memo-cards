'use strict';

const normalize = text => text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');

function chapterRanges(body, declarations = []) {
  if (!Array.isArray(declarations)) throw new Error('chapterHeadings must be an array');
  const paragraphs = [];
  let cursor = 0;
  for (const text of body.split('\n\n')) {
    paragraphs.push({text, start: cursor, end: cursor + text.length});
    cursor += text.length + 2;
  }
  const seen = new Set();
  const ranges = declarations.map(heading => {
    if (typeof heading !== 'string' || !heading.trim() || /[\r\n]/.test(heading) || seen.has(heading)) {
      throw new Error('Each chapter heading must be distinct non-empty single-line text');
    }
    seen.add(heading);
    const matches = paragraphs.filter(p => p.text === heading);
    if (matches.length !== 1) throw new Error('Chapter heading must match one unique whole paragraph');
    const paragraph = matches[0];
    const following = paragraphs.slice(paragraphs.indexOf(paragraph) + 1).find(p => p.text.trim());
    if (!following || declarations.includes(following.text)) throw new Error('Chapter heading needs a following content paragraph');
    return {start: paragraph.start, end: paragraph.end, keepUntil: following.end};
  });
  return ranges.sort((a, b) => a.start - b.start);
}

function readBlock(value, id) {
  if (!value || typeof value.body !== 'string' || !value.body.trim()) throw new Error('Non-empty body required');
  const body = normalize(value.body);
  const phrases = value.highlights ?? [];
  if (!Array.isArray(phrases)) throw new Error('highlights must be an array');
  const selections = phrases.map(phrase => {
    if (typeof phrase !== 'string' || !phrase.trim()) throw new Error('Each highlight must be non-empty text');
    phrase = normalize(phrase);
    const from = body.indexOf(phrase);
    if (from < 0) throw new Error('Highlight is absent from body');
    if (body.indexOf(phrase, from + 1) >= 0) throw new Error('Ambiguous repeated highlight; choose a longer unique phrase');
    return {from, to: from + phrase.length};
  }).sort((a, b) => a.from - b.from);
  for (let i = 1; i < selections.length; i++) {
    if (selections[i].from < selections[i - 1].to) throw new Error('Highlights overlap');
  }
  return {id, body, selections, chapterRanges: chapterRanges(body, value.chapterHeadings)};
}

function readNote(source, extension) {
  const text = normalize(source);
  let value;
  if (extension === '.json') value = JSON.parse(text);
  else if (extension === '.md') {
    const [first, ...rest] = text.split('\n');
    if (rest[0] === '') rest.shift();
    value = {title: first.replace(/^#\s+/, ''), body: rest.join('\n')};
  } else throw new Error('Input must be .json or .md');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a note object');
  if (typeof value.title !== 'string' || !value.title.trim()) throw new Error('Non-empty title required');
  const language = value.language ?? 'zh';
  if (!['zh', 'en'].includes(language)) throw new Error('language must be zh or en');
  if ((value.body !== undefined) === (value.pages !== undefined)) throw new Error('Supply body or pages, exclusively');
  const note = {title: value.title, language};
  for (const field of ['subtitle', 'category', 'footer']) {
    if (value[field] !== undefined && typeof value[field] !== 'string') throw new Error(`${field} must be text`);
    note[field] = value[field] ?? '';
  }
  if (value.pages !== undefined) {
    if (!Array.isArray(value.pages) || !value.pages.length) throw new Error('pages must be a non-empty array');
    if (value.highlights !== undefined) throw new Error('Place highlights inside each source page');
    if (value.chapterHeadings !== undefined) throw new Error('Place chapterHeadings inside each source page');
    note.blocks = value.pages.map((block, i) => {
      const id = block?.id ?? String(i + 1);
      if (typeof id !== 'string' || !id.trim()) throw new Error('Source page id must be non-empty text');
      return readBlock(block, id);
    });
    if (new Set(note.blocks.map(b => b.id)).size !== note.blocks.length) throw new Error('Source page ids must be unique');
  } else note.blocks = [readBlock(value, 'source')];
  // The single-body form remains convenient for callers producing one card.
  if (note.blocks.length === 1) Object.assign(note, {body: note.blocks[0].body, selections: note.blocks[0].selections, chapterRanges: note.blocks[0].chapterRanges});
  return note;
}

function escapeHTML(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function highlightFragments(note, start, end) {
  let offset = start;
  return note.body.slice(start, end).split('\n\n').map(text => {
    const paragraph = {start: offset, end: offset + text.length, text};
    offset += text.length + 2;
    const marks = note.selections.flatMap(range => {
      const from = Math.max(paragraph.start, range.from);
      const to = Math.min(paragraph.end, range.to);
      return from < to ? [{from, to}] : [];
    });
    return {...paragraph, marks};
  });
}

function bodyHTML(note, start = 0, end = note.body.length) {
  return highlightFragments(note, start, end).map(paragraph => {
    let position = paragraph.start;
    let rendered = '';
    for (const range of paragraph.marks) {
      rendered += escapeHTML(note.body.slice(position, range.from));
      rendered += `<mark>${escapeHTML(note.body.slice(range.from, range.to))}</mark>`;
      position = range.to;
    }
    const chapter = (note.chapterRanges ?? []).some(range => range.start === paragraph.start && range.end === paragraph.end);
    const attributes = chapter ? ' class="chapter" role="heading" aria-level="2"' : '';
    return `<p${attributes}>${rendered}${escapeHTML(note.body.slice(position, paragraph.end))}</p>`;
  }).join('');
}

function noteHTML(note, {start = 0, end = note.body.length, index = 1, total = 1} = {}) {
  const en = note.language === 'en';
  const folio = `${String(index).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
  return `<!doctype html>
<html lang="${en ? 'en' : 'zh-CN'}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHTML(note.title)}</title><link rel="stylesheet" href="card.css">
<main class="samples"><article class="card ${note.language}">
<header class="masthead"><span class="brand">Elio</span><span class="product">${en ? 'memo' : '便笺'}</span><span class="category">${escapeHTML(note.category)}</span></header>
<div class="heading"><h1>${escapeHTML(note.title)}</h1>${note.subtitle ? `<p class="subtitle">${escapeHTML(note.subtitle)}</p>` : ''}</div>
<div class="body">${bodyHTML(note, start, end)}</div>
<footer class="footer"><span>${escapeHTML(note.footer)}</span><span class="folio">${folio}</span></footer>
</article></main></html>`;
}

module.exports = {readNote, noteHTML, bodyHTML, highlightFragments, escapeHTML};
