export const number = value => Number(value).toLocaleString('ko-KR');
export function formatPrice(manwon) {
  if (!Number.isFinite(manwon) || manwon <= 0) return '거래 없음 (No sale)';
  const eok = Math.floor(manwon / 10000), rest = manwon % 10000;
  return (eok ? `${number(eok)}억` : '') + (rest ? `${eok ? ' ' : ''}${number(rest)}만` : '') + ' 원';
}
export function shortPrice(manwon) {
  if (!manwon) return '거래 미연결';
  return manwon >= 10000 ? `${Number((manwon / 10000).toFixed(2))}억` : `${number(manwon)}만`;
}
export function formatDate(date) {
  const s = String(date || '');
  return s.length === 8 ? `${s.slice(0,4)}.${s.slice(4,6)}.${s.slice(6,8)}` : '미제공';
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
