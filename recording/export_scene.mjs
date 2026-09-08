import fs from 'node:fs';
import path from 'node:path';
import * as THREE from '../dist/vendor/three.module.js';

const out = process.argv[2];
if (!out) throw new Error('Output directory required');
fs.mkdirSync(out,{recursive:true});
const W=1280,H=720,FPS=24;
let clock=0;
const elements=new Map();
const element=()=>({style:{},dataset:{},hidden:false,children:[],classList:{add(){},remove(){},toggle(){}},append(e){this.children.push(e)},setAttribute(){},addEventListener(){},querySelector(){return element()}});
const document={hidden:false,body:{dataset:{}},getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id)},createElement:element,querySelectorAll(){return []}};
const source=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import.*\n/gm,'').replace('init().catch(fail);','');
const app=new Function('THREE','document','matchMedia','innerWidth','innerHeight','performance','requestAnimationFrame','setTimeout','clearTimeout',source+`
return {
 initialize(d){
  data=d;worldBounds=d.terrain.bounds;width=worldBounds[1][0]-worldBounds[0][0];depth=worldBounds[1][1]-worldBounds[0][1];
  for(const p of places)[p.x,p.z]=toWorld(...p.ll);
  scene=new THREE.Scene();scene.background=new THREE.Color('#e6ede7');scene.fog=new THREE.Fog('#e6ede7',135,240);
  camera=new THREE.OrthographicCamera(-35,35,24,-24,.1,400);
  const homeTarget=V(-4.5,.1,3.1);camera.position.copy(homeTarget).add(V(34,39,46));
  controls={target:homeTarget,update(){camera.lookAt(this.target);camera.updateMatrixWorld(true);}};
  renderer={setSize(){},render(){}};
  hemisphere=new THREE.HemisphereLight('#d8e7f2','#b5c4a3',2.1);
  sun=new THREE.DirectionalLight('#fff2d6',3.1);sun.position.set(-25,42,12);
  floor=new THREE.Mesh(new THREE.PlaneGeometry(1000,1000),new THREE.MeshStandardMaterial({color:'#e6ede7',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.94;scene.add(floor);
  buildTerrain();buildSurface();buildBuildings();buildTrees();buildLandmarks();buildBorders();buildBoats();buildStars();buildUI();setTime('day');resize();controls.update();sceneReady=true;scene.updateMatrixWorld(true);
  return {scene,camera,places,labels,animatedCars,animatedBoats};
 },start(){startTour();},frame(now){animate(now);scene.updateMatrixWorld(true);return {selected,touring:runningTour,animating:!!animation,zoom:camera.zoom,progress:runningTour?(now-shotStart)/10500:0};}
};`)(THREE,document,()=>({matches:false}),W,H,{now:()=>clock},()=>{},()=>{},()=>{});
const data=JSON.parse(fs.readFileSync(new URL('../dist/data/seoul.json',import.meta.url)));
const bytes=fs.readFileSync(new URL('../dist/data/buildings.bin',import.meta.url));
const values=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);
data.buildings=Array.from({length:data.meta.buildingCount},(_,i)=>Array.from(values.subarray(i*6,i*6+6)));
const built=app.initialize(data);
const roots=[...built.animatedCars.map(a=>a.mesh),...built.animatedBoats.map(a=>a.mesh)];
roots.forEach((r,i)=>r.userData.motionId=i);
const geometryIds=new Map(),geometries=[],objects=[];
const save=(name,array)=>{fs.writeFileSync(path.join(out,name),Buffer.from(array.buffer,array.byteOffset,array.byteLength));return name;};
function geometry(geo){
 if(geometryIds.has(geo.uuid))return geometryIds.get(geo.uuid);
 const id=geometries.length;geometryIds.set(geo.uuid,id);
 const a=geo.attributes;
 const attrs={};for(const name of ['position','normal','color'])if(a[name])attrs[name]=save(`geometry-${id}-${name}.bin`,new Float32Array(a[name].array));
 if(geo.index)attrs.index=save(`geometry-${id}-index.bin`,new Uint32Array(geo.index.array));
 geometries.push({id,count:a.position.count,...attrs});return id;
}
built.scene.traverseVisible(object=>{
 if(!object.geometry||(!object.isMesh&&!object.isLine&&!object.isLineSegments))return;
 const mat=object.material;if(Array.isArray(mat))throw new Error('Unexpected material array');
 let root=object;while(root&&!Number.isInteger(root.userData.motionId))root=root.parent;
 const model=object.matrixWorld.clone();if(root)model.premultiply(root.matrixWorld.clone().invert());
 const item={geometry:geometry(object.geometry),matrix:model.elements,color:mat.color.toArray(),opacity:mat.opacity,roughness:mat.roughness??1,metalness:mat.metalness??0,mode:object.isMesh?'triangles':object.isLineSegments?'lines':'line_strip',motion:root?root.userData.motionId:-1};
 if(object.isInstancedMesh){
  item.instances=save(`instances-${objects.length}.bin`,new Float32Array(object.instanceMatrix.array));
  if(object.instanceColor)item.instanceColors=save(`instance-colors-${objects.length}.bin`,new Float32Array(object.instanceColor.array));
  item.fullCount=object.userData.fullCount??object.count;item.overviewCount=object.userData.overviewCount??object.count;
  item.bounds=object.boundingSphere?{center:object.boundingSphere.center.clone().applyMatrix4(object.matrixWorld).toArray(),radius:object.boundingSphere.radius}:null;
 }
 objects.push(item);
});
const places=built.places.map(p=>({name:p.name,en:p.en,ll:p.ll,x:p.x,z:p.z,top:p.top,major:!!p.major,pin:!!p.pin,description:p.description}));
const labelData=built.labels.map(l=>({name:l.el.textContent,place:built.places.indexOf(l.p),position:l.pos.toArray(),major:!!l.p.major}));
app.start();
const frames=[],cameraFrames=[],motionFrames=[];
let completeAt=null;
for(let frame=0;;frame++){
 clock=frame/FPS*1000;const state=app.frame(clock);
 const vp=built.camera.projectionMatrix.clone().multiply(built.camera.matrixWorldInverse);
 cameraFrames.push(...vp.elements,...built.camera.position.toArray());
 frames.push(state);
 for(const root of roots)motionFrames.push(...root.matrixWorld.elements);
 if(!state.touring&&!state.animating&&completeAt===null)completeAt=clock+700;
 if(completeAt!==null&&clock>=completeAt)break;
}
save('cameras.bin',new Float32Array(cameraFrames));save('motion.bin',new Float32Array(motionFrames));
fs.writeFileSync(path.join(out,'scene.json'),JSON.stringify({width:W,height:H,fps:FPS,frames,geometries,objects,places,labels:labelData,motionCount:roots.length}));
console.log(JSON.stringify({objects:objects.length,geometries:geometries.length,frames:frames.length,duration:frames.length/FPS,places:places.length}));
