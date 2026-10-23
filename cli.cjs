#!/usr/bin/env node
'use strict';
const {parseArgs} = require('node:util');
const {render} = require('./src/render.cjs');
(async () => {
  const {values} = parseArgs({options: {input: {type: 'string'}, output: {type: 'string'}, help: {type: 'boolean'}, mode: {type: 'string', default: 'auto'}}});
  if (values.help) { console.log('node cli.cjs --input note.json|note.md --output new-directory [--mode auto|locked]'); return; }
  if (!values.input || !values.output) throw new Error('Usage: node cli.cjs --input note.json|note.md --output new-directory [--mode auto|locked]');
  console.log(JSON.stringify(await render(values.input, values.output, {mode: values.mode}), null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
