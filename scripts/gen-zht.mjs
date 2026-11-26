// 中国語（簡体字）の画面の文字から繁体字（台湾）を作る：node scripts/gen-zht.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import * as OpenCC from 'opencc-js';
const conv = OpenCC.Converter({ from: 'cn', to: 'twp' });
const src = readFileSync(new URL('../lib/i18n-dict.ts', import.meta.url), 'utf8');
const out = {};
for (const m of src.matchAll(/^\s*("(?:[^"\\]|\\.)*"):\s*\[("(?:[^"\\]|\\.)*"),/gm)) out[JSON.parse(m[1])] = conv(JSON.parse(m[2]));
writeFileSync(new URL('../lib/i18n-zht.ts', import.meta.url),
  `/** 自動生成（scripts/gen-zht.mjs）：英語の画面の文字 → 中国語（繁体字・台湾）。直接編集しない */\nexport const ZHT: Record<string, string> = ${JSON.stringify(out, null, 1)};\n`);
console.log(Object.keys(out).length);
