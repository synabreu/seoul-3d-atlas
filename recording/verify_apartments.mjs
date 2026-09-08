import assert from 'node:assert/strict';
import fs from 'node:fs';
import {formatPrice,filterComplexes,filterTrades} from '../dist/apt-model.js';

const base=new URL('../dist/data/apartments/',import.meta.url);
const index=JSON.parse(fs.readFileSync(new URL('index.json',base),'utf8'));
assert.equal(index.districts.length,25);
assert.equal(index.meta.sourceRows,189991,'Matches the portal total at retrieval');
assert.equal(index.meta.rejectedRows,1,'Exclude the non-Seoul district code in the original export');
const fixtures=[
  [20260110,105000,84.95,0,null,2026,'중개거래',null,null],
  [20260110,105000,84.95,0,null,2026,'중개거래',null,null],
  [20260201,200000,84.95,10,20260203,2026,'중개거래',null,null],
  [20260202,150000,59.99,11,null,2026,'중개거래',null,'분양권'],
  [20250101,90000,59.99,11,null,2025,'직거래',null,null],
];
assert.equal(filterTrades(fixtures).length,3,'Keep duplicate public rows; exclude cancellations and rights');
assert.equal(filterTrades(fixtures,{canceled:true,rights:true}).length,5);
assert.equal(filterTrades(fixtures,{floor:'0',area:'84.95',year:'2026'}).length,2);
assert.equal(filterTrades(fixtures,{year:'2025'}).length,1);
assert.equal(formatPrice(10000),'1억 원');
assert.equal(formatPrice(123456),'12억 3,456만 원');
assert.equal(formatPrice(9500),'9,500만 원');
const ids=new Set(index.complexes.map(c=>c.id));
assert.equal(ids.size,index.complexes.length);
let total=0,canceled=0,active=0,rights=0,apartmentSales=0,mapped=0;
const partitions=new Map();
for(const d of index.districts){const p=JSON.parse(fs.readFileSync(new URL(d.code+'.json',base),'utf8'));assert.equal(p.district,d.code);partitions.set(d.code,p);}
for(const c of index.complexes){
  const rows=partitions.get(c.district).trades[c.id]||[];
  assert.equal(c.count,rows.length);
  const valid=filterTrades(rows);
  assert.equal(c.activeCount,valid.length);
  assert.deepEqual(c.latest,valid[0]?.slice(0,4)||null,'Latest price is a real, uncanceled apartment sale');
  assert.equal(c.min,valid.length?Math.min(...valid.map(t=>t[1])):null);
  assert.equal(c.max,valid.length?Math.max(...valid.map(t=>t[1])):null);
  if(c.ll){assert.ok(c.ll.every(Number.isFinite));assert.ok(c.locationSource);mapped++;}
  for(const t of rows){
    assert.equal(t.length,9);
    assert.equal(t[7],null,'Never infer building-dong or unit');
    assert.ok(Number.isInteger(t[1])&&t[1]>0);
    assert.ok(t[2]>0);
    assert.ok(!t[8]||['분양권','입주권'].includes(t[8]));
    total++;if(t[4])canceled++;else active++;if(t[8])rights++;if(!t[4]&&!t[8])apartmentSales++;
  }
}
assert.equal(total+index.meta.rejectedRows,index.meta.sourceRows);
assert.equal(canceled,index.meta.canceledTrades);
assert.equal(active,index.meta.activeTrades);
assert.equal(apartmentSales,index.meta.activeApartmentSales);
assert.equal(rights,index.meta.rightsRows);
assert.equal(mapped,index.meta.mappedComplexes);
assert.equal(filterComplexes(index.complexes,{district:'11710'}).every(c=>c.district==='11710'),true);
assert.ok(filterComplexes(index.complexes,{query:'리센츠'}).length>0);
assert.equal(filterComplexes(index.complexes,{query:'존재하지않는검증문자열XYZ'}).length,0);
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const module=fs.readFileSync(new URL('../dist/apt-prices.js',import.meta.url),'utf8');
const definitions=[...html.matchAll(/\bid="([\w-]+)"/g),...module.matchAll(/\bid="([\w-]+)"/g)].map(m=>m[1]);
assert.equal(new Set(definitions).size,definitions.length,'Unique static and generated control identifiers');
for(const [,id] of module.matchAll(/\$\('([\w-]+)'\)/g))assert.ok(definitions.includes(id),'Defined control: '+id);
console.log(JSON.stringify({verified:true,districts:25,sourceRows:total,activeApartmentSales:apartmentSales,canceled,rights,mapped,priceAndFilterChecks:'passed',controlReferences:'passed'}));
