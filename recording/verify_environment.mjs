// Non-browser smoke checks: reuse the source-scene initializer with real Three
// geometry and lightweight DOM/renderer substitutes. This does not measure FPS.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';

const harness=fs.readFileSync(new URL('./export_scene_v2.mjs',import.meta.url),'utf8');
let prefix=harness.slice(harness.indexOf('const W='),harness.indexOf('const roots='));
prefix=prefix.replaceAll('import.meta.url',JSON.stringify(new URL('./export_scene_v2.mjs',import.meta.url).href));
prefix=prefix.replace('return {scene,camera,places,labels,animatedCars,animatedBoats};',
 'return {scene,camera,places,labels,animatedCars,animatedBoats,setSeason,updateWeather,effects:()=>weatherEffects,treeState:()=>({trees,deciduousTrees,winterBranches,blossoms,seasonalTrees}),state:()=>({mode,season}),controls,base,terrainMesh,waterAt};');
const checks=`
assert.equal(built.places.length,21);
assert.deepEqual(built.state(),{mode:'day',season:'summer'});
assert.equal(built.effects(),undefined,'Precipitation should be lazy');
const foliage=built.treeState();
assert.equal(foliage.trees.count+foliage.deciduousTrees.count,foliage.seasonalTrees.length);
assert.ok(foliage.blossoms.count>0);
assert.equal(foliage.blossoms.visible,false);
assert.equal(foliage.winterBranches.visible,false);
assert.equal(foliage.winterBranches.count,foliage.deciduousTrees.count);
const branches=foliage.winterBranches;
for(const n of branches.instanceMatrix.array)assert.ok(Number.isFinite(n));
const green=Array.from(foliage.deciduousTrees.instanceColor.array);
const expect={day:'167ed1',sunset:'287ed0',night:'15558d',rain:'246fac',snow:'337eb9'};
const lower=[];built.scene.traverse(o=>{if(o.material?.emissive?.getHexString()==='125893')lower.push(o)});
assert.equal(lower.length,1);
for(const mode of Object.keys(expect))for(const season of ['spring','summer','autumn','winter']){
 app.setTime(mode);built.setSeason(season);
 assert.deepEqual(built.state(),{mode,season});
 assert.equal(lower[0].material.color.getHexString(),expect[mode]);
 assert.equal(foliage.blossoms.visible,season==='spring');
 assert.equal(foliage.deciduousTrees.visible,season!=='winter');
 assert.equal(foliage.winterBranches.visible,season==='winter');
 assert.equal(foliage.trees.visible,true,'Evergreens remain in winter');
 assert.equal(built.treeState().winterBranches,branches,'Season changes must reuse the branch mesh');
 for(const [kind,effect] of Object.entries(built.effects()??{})){
  assert.equal(effect.mesh.visible,mode===kind);
  if(effect.mesh.visible){built.updateWeather(.016);for(const n of effect.positions)assert.ok(Number.isFinite(n));}
 }
}
app.setTime('day');built.setSeason('summer');
assert.deepEqual(Array.from(foliage.deciduousTrees.instanceColor.array),green,'Summer colors must restore');
assert.equal(foliage.deciduousTrees.visible,true,'Foliage returns after winter');
// Regression: the former foundation cap at +.03 covered downstream water
// at +.020 to +.02636, even though terrain was already below the river.
assert.ok(new THREE.Box3().setFromObject(built.base).max.y<0,'Foundation must stay below zero elevation');
const river=lower[0],ray=new THREE.Raycaster();
const downstream=[[-20.5,-9],[-19.5,-8],[-18.5,-7.5],[-16.5,-6.3],[-14,-4]];
const west=data.meta.trailTerrainExpansion?.originalBounds[0][0]??data.terrain.bounds[0][0];
const boundaryRing=data.water[data.meta.lowerHangangWater.waterFeatureIndices[0]][0];
const edge=boundaryRing.filter(p=>p[0]===west);
assert.ok(edge.length>=2,'River geometry must reach the western map boundary');
downstream.push([west+.0001,(Math.min(...edge.map(p=>p[1]))+Math.max(...edge.map(p=>p[1])))/2]);
for(const [x,z] of downstream){
 assert.notEqual(built.waterAt(x,z),null,'Downstream probe must be in the river');
 ray.set(new THREE.Vector3(x,10,z),new THREE.Vector3(0,-1,0));
 const hits=ray.intersectObjects([built.base,built.terrainMesh,river]);
 assert.equal(hits[0]?.object,river,'The blue river must be above the terrain and foundation at '+[x,z]);
}
built.setSeason('autumn');assert.notDeepEqual(Array.from(foliage.deciduousTrees.instanceColor.array),green);
app.setTime('rain');
const effects=built.effects(),rain=effects.rain;
assert.equal(rain.count,W<=650?650:1500);
assert.equal(effects.snow.count,W<=650?500:1100);
const before=Array.from(rain.positions);built.updateWeather(.016);assert.notDeepEqual(Array.from(rain.positions),before);
const still=Array.from(rain.positions);built.updateWeather(0);assert.deepEqual(Array.from(rain.positions),still);
built.camera.zoom=28;built.camera.updateProjectionMatrix();built.updateWeather(0);
const zoomSpan=rain.span;built.camera.zoom=.65;built.camera.updateProjectionMatrix();built.updateWeather(0);assert.ok(rain.span>zoomSpan);
built.controls.target.x=20;built.controls.target.z=-15;built.updateWeather(0);
assert.equal(rain.center.x,20);assert.equal(rain.center.z,-15);
for(let i=0;i<rain.count;i++)assert.ok(rain.positions[i*6+1]>=rain.particles[i].ground);
const shader={fragmentShader:'#include <map_particle_fragment>'};effects.snow.mesh.material.onBeforeCompile(shader);
assert.ok(shader.fragmentShader.includes('gl_PointCoord'));
const allocated=built.effects();for(let i=0;i<6;i++)app.setTime(i%2?'snow':'rain');assert.equal(built.effects(),allocated);
app.setTime('day');built.setSeason('summer');app.start();app.setTime('snow');built.setSeason('winter');clock=16;assert.ok(app.frame(clock).touring,'Environment changes must not stop the tour');
app.setTime('invalid');built.setSeason('invalid');assert.deepEqual(built.state(),{mode:'snow',season:'winter'});
console.log('PASS',W<=650?'mobile':'desktop','20 mode/season combinations, winter branches, river visibility to west edge, bounded effects, motion, zoom/pan, unchanged tour');
`;
for(const width of [1280,390]){
 const current=prefix.replace('const W=1280,H=720,FPS=24;',`const W=${width},H=720,FPS=24;`);
 new Function('fs','THREE','assert',current+checks)(fs,THREE,assert);
}
