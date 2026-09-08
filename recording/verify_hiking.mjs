import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
const root=new URL('../',import.meta.url).pathname;
class Element{
 constructor(tag='div'){this.tagName=tag;this.children=[];this.style={};this.dataset={};this.attrs={};this.hidden=false;this.checked=true;this.classList={add(){},remove(){},toggle(){}};}
 append(...e){this.children.push(...e);for(const c of e)c.parent=this;}
 replaceChildren(...e){this.children=[];this._value=undefined;this.append(...e);}
 setAttribute(k,v){this.attrs[k]=String(v);}
 focus(){} remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
 get value(){return this._value??this.options()[0]?._value??'';}
 set value(v){this._value=v;}
 options(){return this.children.flatMap(c=>c.tagName==='option'?[c]:c.options());}
 showModal(){this.open=true;}
}
const els=new Map();const $=id=>{if(!els.has(id))els.set(id,new Element(id==='mountain'||id==='trail-route'?'select':'div'));return els.get(id);};
const document={createElement:tag=>new Element(tag),dispatchEvent(){}};
globalThis.CustomEvent ||= class CustomEvent{constructor(type,options){this.type=type;this.detail=options?.detail;}};
const terrain=JSON.parse(fs.readFileSync(root+'dist/data/seoul.json'));
const data=JSON.parse(fs.readFileSync(root+'dist/data/trails.json'));
const toWorld=(lon,lat)=>[(lon-terrain.meta.origin[0])*terrain.meta.sx,(terrain.meta.origin[1]-lat)*terrain.meta.sz];
const source=fs.readFileSync(root+'dist/hiking.js','utf8').replace(/^import.*\n/gm,'').replace('export function','function');
const factory=new Function('THREE','document','innerWidth','innerHeight',source+'\nreturn createHikingExplorer;');
for(const [width,height] of [[1280,800],[390,844]]){
 const create=factory(THREE,document,width,height);const scene=new THREE.Scene();const camera=new THREE.OrthographicCamera(-20,20,16,-16,.1,400);camera.position.set(20,30,20);camera.lookAt(0,0,0);camera.updateMatrixWorld();const flights=[];
 const explorer=create(data,{scene,camera,toWorld,groundHeight:(x,z)=>.5+Math.sin(x*.1)*.2,$,stopTour(){},flyTo:(...p)=>{assert.ok(p.every(Number.isFinite));flights.push(p);},closeExplore(){},setLocation(){},clearPlaceSelection(){}});
 assert.equal(explorer.getState().mountains,804);assert.equal(explorer.getState().sections,13719);assert.equal(explorer.getState().activeTab,'trails');assert.equal($('tab-trails').attrs['aria-selected'],'true');
 const cases=['북한산 · 백운대','도봉산 · 자운봉','관악산','불암산','청계산','광교산 · 시루봉','검단산','남한산성 · 청량산','계양산'];
 for(const name of cases){const m=data.mountains.find(x=>x.name===name);explorer.selectMountain(m.id,true);assert.equal(explorer.getState().mountain,m.id);for(const ri of m.routeIds){explorer.selectRoute('r:'+ri,true);assert.equal(explorer.getState().route,data.routes[ri].id);$('trail-start').onclick();$('trail-end').onclick();explorer.update();}}
 for(const type of ['path','footway','steps','track']){const i=data.sections.findIndex(s=>s.type===type),m=data.mountains.find(m=>m.sectionIds.includes(i));explorer.selectMountain(m.id);explorer.selectRoute('s:'+i);assert.equal(explorer.getState().route,data.sections[i].id);assert.equal($('trail-source').href,`https://www.openstreetmap.org/way/${data.sections[i].wayId}`);}
 $('show-trails').onchange({target:{checked:false}});assert.equal(scene.children[0].visible,false);explorer.update();$('show-trails').onchange({target:{checked:true}});
 $('show-endpoints').onchange({target:{checked:false}});assert.equal(explorer.getState().endpointsVisible,false);$('show-endpoints').onchange({target:{checked:true}});
 explorer.setTab('apts');assert.equal(scene.children[0].visible,false);assert.equal($('apts-panel').hidden,false);explorer.setTab('places');assert.equal($('trails-panel').hidden,true);$('tab-places').onkeydown({key:'ArrowRight',preventDefault(){}});assert.equal(explorer.getState().activeTab,'trails');
 const empty=data.mountains.find(m=>!m.sectionIds.length);explorer.selectMountain(empty.id,true);assert.equal($('trail-route').disabled,true);assert.equal($('trail-details').hidden,true);explorer.update();
 for(const obj of scene.children[0].children){obj.traverse(o=>{if(o.geometry)for(const v of o.geometry.attributes.position.array)assert.ok(Number.isFinite(v),'Finite trail geometry');});}
 assert.ok(flights.length>50);console.log('PASS',width+'x'+height,'mountain/route switching, source geometry, both endpoints, all path types, empty state, visibility toggles, keyboard tabs; finite geometry');
 scene.clear();els.clear();
}
