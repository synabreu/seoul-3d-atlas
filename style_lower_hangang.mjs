// Color-only v1.4 metadata update for the retained 2026-08-30 water dataset.
// These connected main-channel polygons reach the western map boundary;
// separate canals, tributaries, reservoirs and upstream features are unchanged.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const file=new URL('./dist/data/seoul.json',import.meta.url);
const data=JSON.parse(fs.readFileSync(file,'utf8'));
const ids=[3,34,55,144,149,195,226];
const lengths=[13,127,18,32,139,73,65];
assert.equal(data.meta.vectorSnapshot,'2026-08-30');
const area=r=>r.reduce((sum,p,i)=>i?sum+r[i-1][0]*p[1]-p[0]*r[i-1][1]:sum,0)/2;
let total=0;
for(const [j,id] of ids.entries()){
 const rings=data.water[id];
 assert.equal(rings[0].length,lengths[j],`Recheck source feature ${id}`);
 assert.ok(rings.every(r=>r.every(([x,z])=>x<=-8.7&&z<=.2)));
 assert.ok(area(rings[0])>0);
 assert.ok(Number.isFinite(data.waterHeights[id]));
 total+=rings.reduce((sum,r)=>sum+area(r),0);
}
assert.ok(total>15&&total<16,'Unexpected lower Han River coverage');
data.meta.atlasVersion='1.4';
data.meta.lowerHangangWater={
 revision:1,
 source:'Retained OpenFreeMap / OpenStreetMap water geometry',
 waterFeatureIndices:ids,
 displayAdjustment:'Blue water material only; original geometry and elevation retained',
 extent:'Lower Han River north of Gimpo Airport to the existing western map boundary',
};
fs.writeFileSync(file,JSON.stringify(data));
console.log(JSON.stringify({version:'1.4',waterFeatureIndices:ids,sourceAreaKm2:Math.round(total*1000)/1000}));
