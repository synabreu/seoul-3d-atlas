import fs from 'node:fs';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const html = read('dist/index.html');
const app = read('dist/app.js');
const hiking = read('dist/hiking.js');
const apartments = read('dist/apt-prices.js');
const model = read('dist/apt-model.js');
const i18n = read('dist/i18n.js');

const checks = [
  [html.includes('application-version" content="2.5"'), 'HTML application version is v2.5'],
  [html.includes('data-language="ko"') && html.includes('data-language="en"'), 'language buttons exist'],
  [app.includes("const ATLAS_VERSION = '2.5'"), 'runtime version is v2.5'],
  [app.includes("from './i18n.js?v=2.5-i18n-1'"), 'atlas uses i18n'],
  [hiking.includes("from './i18n.js?v=2.5-i18n-1'"), 'trails use i18n'],
  [apartments.includes("from './i18n.js?v=2.5-i18n-1'"), 'apartment explorer uses i18n'],
  [model.includes("from './i18n.js?v=2.5-i18n-1'"), 'price/date formatting uses i18n'],
  [i18n.includes("'atlas-language-change'"), 'language changes notify every resource module'],
  [i18n.includes('localStorage.setItem'), 'language preference persists'],
  [i18n.includes("document.documentElement.lang = current"), 'document language follows selection']
];

const failed = checks.filter(([ok]) => !ok).map(([, label]) => label);
if (failed.length) {
  console.error('i18n verification failed:\n- ' + failed.join('\n- '));
  process.exit(1);
}
console.log(`i18n verification passed (${checks.length} checks)`);
