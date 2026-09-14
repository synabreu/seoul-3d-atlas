import { getLanguage, t, formatNumber } from './i18n.js?v=2.7-i18n-1';

export const number = value => formatNumber(value);
export function formatPrice(manwon) {
  if (!Number.isFinite(manwon) || manwon <= 0) return t('거래 없음', 'No sale');
  if (getLanguage() === 'en') return new Intl.NumberFormat('en-US', {style:'currency', currency:'KRW', maximumFractionDigits:0}).format(manwon * 10000);
  const eok = Math.floor(manwon / 10000), rest = manwon % 10000;
  return (eok ? `${number(eok)}억` : '') + (rest ? `${eok ? ' ' : ''}${number(rest)}만` : '') + ' 원';
}
export function shortPrice(manwon) {
  if (!manwon) return t('거래 미연결', 'No linked sale');
  if (getLanguage() === 'en') {
    const won = manwon * 10000;
    return won >= 1e9 ? `₩${Number((won / 1e9).toFixed(2))}B` : `₩${Number((won / 1e6).toFixed(1))}M`;
  }
  return manwon >= 10000 ? `${Number((manwon / 10000).toFixed(2))}억` : `${number(manwon)}만`;
}
export function formatDate(date) {
  const s = String(date || '');
  if (s.length !== 8) return t('미제공', 'Unavailable');
  return getLanguage() === 'en' ? `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}` : `${s.slice(0,4)}.${s.slice(4,6)}.${s.slice(6,8)}`;
}
export function searchKey(value) { return String(value).toLocaleLowerCase().replace(/[\s()·._-]/g, ''); }
export function filterComplexes(complexes, {query='', district='', sort='latest'}={}) {
  const q = searchKey(query);
  const result = complexes.filter(c => (!district || c.district === district) && (!q || searchKey(`${c.name} ${c.address} ${c.roadAddress || ''}`).includes(q)));
  return result.sort((a,b) => sort === 'name' ? a.name.localeCompare(b.name, 'ko') : sort === 'price' ? (b.latest?.[1] || 0) - (a.latest?.[1] || 0) || a.name.localeCompare(b.name, 'ko') : (b.latest?.[0] || 0) - (a.latest?.[0] || 0) || a.name.localeCompare(b.name, 'ko'));
}
export function filterTrades(rows, {year='', area='', floor='', dong='', canceled=false, rights=false}={}) {
  return rows.filter(t => (canceled || !t[4]) && (rights || !t[8]) && (!year || String(t[0]).slice(0,4) === year) && (!area || String(t[2]) === area) && (!floor || String(t[3]) === floor) && (!dong || t[7] === dong));
}
export function priceColor(amount) {
  return !amount ? '#627987' : amount < 100000 ? '#177f86' : amount < 200000 ? '#3b65b1' : amount < 300000 ? '#8651a6' : '#b45932';
}
