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
 },setTime(time){setTime(time);},view(target,offset,zoom){controls.target.fromArray(target);camera.position.copy(controls.target).add(new THREE.Vector3(...offset));camera.zoom=zoom;camera.updateProjectionMatrix();controls.update();},target(p){return [p.x,heightAt(p.x,p.z)+(p.top||0)*.32,p.z];},start(){startTour();},frame(now){animate(now);scene.updateMatrixWorld(true);return {selected,touring:runningTour,animating:!!animation,zoom:camera.zoom,progress:runningTour?(now-shotStart)/10500:0};}
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
const palettes=new Map();
for(const time of ['day','sunset','night']){
 app.setTime(time);
 built.scene.traverse(object=>{
  if(!object.geometry)return;
  let visible=true;for(let p=object;p;p=p.parent)visible&&=p.visible;
  const m=object.material;
  if(!palettes.has(object.uuid))palettes.set(object.uuid,{});
  palettes.get(object.uuid)[time]={color:m.color.toArray(),emissive:m.emissive?m.emissive.clone().multiplyScalar(m.emissiveIntensity??1).toArray():[0,0,0],visible};
 });
}
app.setTime('day');
built.scene.traverse(object=>{
 if(!object.geometry||(!object.isMesh&&!object.isLine&&!object.isLineSegments&&!object.isPoints))return;
 const palette=palettes.get(object.uuid);if(!Object.values(palette).some(p=>p.visible))return;
 const mat=object.material;if(Array.isArray(mat))throw new Error('Unexpected material array');
 let root=object;while(root&&!Number.isInteger(root.userData.motionId))root=root.parent;
 const model=object.matrixWorld.clone();if(root)model.premultiply(root.matrixWorld.clone().invert());
 const item={palette,pointSize:mat.size??1,geometry:geometry(object.geometry),matrix:model.elements,color:mat.color.toArray(),opacity:mat.opacity,roughness:mat.roughness??1,metalness:mat.metalness??0,mode:object.isPoints?'points':object.isMesh?'triangles':object.isLineSegments?'lines':'line_strip',motion:root?root.userData.motionId:-1};
 if(object.isInstancedMesh){
  item.instances=save(`instances-${objects.length}.bin`,new Float32Array(object.instanceMatrix.array));
  if(object.instanceColor)item.instanceColors=save(`instance-colors-${objects.length}.bin`,new Float32Array(object.instanceColor.array));
  item.fullCount=object.userData.fullCount??object.count;item.overviewCount=object.userData.overviewCount??object.count;
  item.bounds=object.boundingSphere?{center:object.boundingSphere.center.clone().applyMatrix4(object.matrixWorld).toArray(),radius:object.boundingSphere.radius}:null;
 }
 objects.push(item);
});
const places=built.places.map(p=>({name:p.name,en:p.en,ll:p.ll,x:p.x,z:p.z,top:p.top,zoom:p.zoom,target:app.target(p),major:!!p.major,pin:!!p.pin,description:p.description}));
const labelData=built.labels.map(l=>({name:l.el.textContent,place:built.places.indexOf(l.p),position:l.pos.toArray(),major:!!l.p.major}));
// Reproducible random choreography, balanced day / sunset / night.
let seed=20260905;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
let times=[];do{times=Array.from({length:21},(_,i)=>['day','sunset','night'][i%3]);for(let i=20;i>0;i--){const j=Math.floor(random()*(i+1));[times[i],times[j]]=[times[j],times[i]];}}while(times.some((t,i)=>i&&t===times[i-1]));
const shots=places.map((p,i)=>({time:times[i],angle:random()*Math.PI*2,sweep:(random()<.5?-1:1)*(1.0+random()*.7),elevation:.55+random()*.35,phase:random()*Math.PI*2,zoom:p.zoom}));
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const home={target:[-4.5,.1,3.1],offset:[34,39,46],zoom:1};
function pose(i,t){
 const s=shots[i],angle=s.angle+s.sweep*t,e=s.elevation+.17*Math.sin(t*Math.PI*2+s.phase);
 return {target:places[i].target,offset:[40*Math.cos(e)*Math.cos(angle),40*Math.sin(e),40*Math.cos(e)*Math.sin(angle)],zoom:s.zoom*(.82+.26*Math.sin(t*Math.PI*2+s.phase))};
}
app.start();
const frames=[],cameraFrames=[],motionFrames=[];
const total=21*10.5+4;
for(let frame=0;frame<Math.ceil(total*FPS);frame++){
 clock=frame/FPS*1000;app.frame(clock);
 const sec=frame/FPS,index=Math.min(20,Math.floor(sec/10.5)),local=sec-index*10.5;
 let view,lightFrom,lightTo,blend,selected=index,touring=true,progress=local/10.5;
 if(sec<220.5){
  const next=pose(index,local/10.5),prev=index?pose(index-1,1):home,t=smooth(local/3.2);
  view={target:mix(prev.target,next.target,t),offset:mix(prev.offset,next.offset,t),zoom:prev.zoom+(next.zoom-prev.zoom)*t};
  lightFrom=index?times[index-1]:'day';lightTo=times[index];blend=smooth(local/2.3);
 }else{
  const prev=pose(20,1),t=smooth((sec-220.5)/3.2);
  view={target:mix(prev.target,home.target,t),offset:mix(prev.offset,home.offset,t),zoom:prev.zoom+(1-prev.zoom)*t};
  lightFrom=times[20];lightTo='sunset';blend=smooth((sec-220.5)/2.3);selected=-1;touring=false;progress=1;
 }
 app.view(view.target,view.offset,view.zoom);
 const vp=built.camera.projectionMatrix.clone().multiply(built.camera.matrixWorldInverse);
 cameraFrames.push(...vp.elements,...built.camera.position.toArray());
 frames.push({selected,touring,zoom:view.zoom,progress,lightFrom,lightTo,blend});
 for(const root of roots)motionFrames.push(...root.matrixWorld.elements);
}
save('cameras.bin',new Float32Array(cameraFrames));save('motion.bin',new Float32Array(motionFrames));
fs.writeFileSync(path.join(out,'scene.json'),JSON.stringify({version:2,shots,width:W,height:H,fps:FPS,frames,geometries,objects,places,labels:labelData,motionCount:roots.length}));
console.log(JSON.stringify({objects:objects.length,geometries:geometries.length,frames:frames.length,duration:frames.length/FPS,places:places.length}));
