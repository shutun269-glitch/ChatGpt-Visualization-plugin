import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = new URL('./', import.meta.url);
const core = readFileSync(new URL('core.mjs',root),'utf8').replace(/^export /gm,'');
const ui = readFileSync(new URL('ui.js',root),'utf8');
const template = readFileSync(new URL('template.html',root),'utf8');
if (/<\/script/i.test(core + ui)) throw new Error('Inline script contains a closing script tag');
writeFileSync(new URL('app.html',root),template.replace('/*__BUNDLE__*/',()=>core+'\n'+ui));
console.log('Built '+fileURLToPath(new URL('app.html',root)));
