'use strict';

// Greedy, browser-measured layout: keep complete paragraphs first, then
// sentences, then words, and only split an oversized word by grapheme.
// No density targets, balancing weights, or global page optimization.
async function paginateText(body, language, canFit) {
  const paragraphEnds = [...body.matchAll(/\n{2,}/g)].map(m => m.index + m[0].length);
  paragraphEnds.push(body.length);
  const segmentEnds = granularity => [...new Intl.Segmenter(language, {granularity}).segment(body)].map(s => s.index + s.segment.length);
  const sentenceEnds = segmentEnds('sentence');
  let wordEnds, graphemeEnds;
  const pages = [];
  let start = 0;
  while (start < body.length) {
    const cache = new Map();
    const fits = async end => {
      if (!cache.has(end)) cache.set(end, await canFit(start, end));
      return cache.get(end);
    };
    if (await fits(body.length)) { pages.push({start, end: body.length}); break; }
    const longestFit = async ends => {
      const choices = ends.filter(end => end > start && !/^[\p{Pe}\p{Pf}，。！？、；：,.!?;:]/u.test(body.slice(end)));
      let left = 0, right = choices.length - 1, best = start;
      while (left <= right) {
        const middle = Math.floor((left + right) / 2);
        if (await fits(choices[middle])) { best = choices[middle]; left = middle + 1; }
        else right = middle - 1;
      }
      return best;
    };
    let end = await longestFit(paragraphEnds);
    if (end === start) end = await longestFit(sentenceEnds);
    if (end === start) end = await longestFit(wordEnds ??= segmentEnds('word'));
    if (end === start) end = await longestFit(graphemeEnds ??= segmentEnds('grapheme'));
    if (end === start) throw new Error('Cannot fit one text unit; the title or other card fields may be too large');
    pages.push({start, end});
    start = end;
  }
  return pages;
}

module.exports = {paginateText};
