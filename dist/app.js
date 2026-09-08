import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { createHikingExplorer } from './hiking.js?v=2.0-apt-1';
import { createApartmentExplorer } from './apt-prices.js?v=2.0-apt-1';

const ATLAS_VERSION = '2.0';
const ASSET_REVISION = '2.0-apt-1';
const $ = id => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = () => innerWidth <= 650;
const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const clamp = THREE.MathUtils.clamp;
const V = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z);
let hikingExplorer, trailData, apartmentExplorer;
let data, renderer, scene, camera, controls, terrainMesh, waterMesh, buildings, trees;
let sun, hemisphere, floor, base, roadMesh, nightWindows, borderLines, starField;
let animation = null, runningTour = false, tourIndex = 0, shotStart = 0, lastTime = 0;
let mode = 'day', season = 'summer', flatView = false, labelsVisible = true, selected = -1, stopped = false;
let worldBounds, width, depth, sceneReady = false, toastTimer, targetHalfHeight = 20.5;
const labels = [], animatedCars = [], animatedBoats = [], landmarkMaterials = [];
const buildingTiles = [];
const seasonalTrees = [];
let deciduousTrees, winterBranches, blossoms, weatherEffects, environmentBounds;
let environmentSeed=1509;
function environmentRandom(){environmentSeed=(Math.imul(environmentSeed,1664525)+1013904223)>>>0;return environmentSeed/4294967296;}
const nightGroup = new THREE.Group(), landmarkGroup = new THREE.Group();
const dummy = new THREE.Object3D(), color = new THREE.Color();
let seed = 617; function random(){ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; }

const places = [
 {name:'강남역',en:'Gangnam Station',ll:[127.02758,37.49793],kind:'district',zoom:6.5,top:.25,major:true,pin:true,description:'강남대로와 테헤란로가 만나는 강남역 사거리'},
 {name:'삼성 코엑스',en:'Samseong COEX',ll:[127.0589,37.5119],kind:'coex',zoom:6.5,top:1.0,major:true,pin:true,description:'삼성동의 코엑스 전시장과 무역센터'},
 {name:'서울역',en:'Seoul Station',ll:[126.972,37.5558],kind:'district',zoom:8,top:.22,major:true,pin:true,description:'서울역과 역사 앞 광장, 철길이 모이는 도심 관문'},
 {name:'광화문',en:'Gwanghwamun Square',ll:[126.97694,37.5724],kind:'district',zoom:9,top:.16,major:true,pin:true,description:'광화문광장을 중심으로 세종대로와 경복궁 앞을 둘러보는 곳'},
 {name:'용산',en:'Yongsan',ll:[126.96509,37.53014],kind:'district',zoom:6.5,top:.25,major:true,pin:true,description:'용산역을 중심으로 철길과 한강 사이에 펼쳐진 도심'},
 {name:'김포공항',en:'Gimpo International Airport',ll:[126.79447,37.55865],kind:'district',zoom:4.5,top:.18,major:true,pin:true,offset:[6,27,23],description:'서울 서쪽의 김포국제공항과 국내선·국제선 터미널 일대'},
 {name:'잠실',en:'Jamsil',ll:[127.10028,37.51333],kind:'district',zoom:5.8,top:.2,major:true,pin:true,description:'잠실역을 중심으로 석촌호수와 롯데월드 일대를 둘러보는 곳'},
 {name:'강동',en:'Gangdong',ll:[127.14905,37.54839],kind:'district',zoom:4.2,top:.25,major:true,pin:true,offset:[14,26,25],description:'강동구 중심부에서 천호·길동·명일·고덕 일대를 둘러보는 곳'},
 {name:'경복궁',en:'Gyeongbokgung',ll:[126.9769,37.5786],kind:'palace',zoom:8,top:.37,major:true,description:'조선의 궁궐과 서울의 오래된 중심'},
 {name:'남산 서울타워',en:'N Seoul Tower',ll:[126.9882,37.5512],kind:'tower',zoom:7,top:1.04,major:true,description:'도심 한가운데 솟은 남산의 전망대'},
 {name:'롯데월드타워',en:'Lotte World Tower',ll:[127.1025,37.5125],kind:'lotte',zoom:7,top:2.26,major:true,description:'잠실의 호수 위로 솟은 서울의 스카이라인'},
 {name:'여의도',en:'Yeouido',ll:[126.9243,37.5215],kind:'yeouido',zoom:4.8,top:1.14,major:true,offset:[6,34,16],description:'한강 본류와 샛강 사이, 공원과 빌딩을 품은 섬'},
 {name:'동대문디자인플라자',en:'Dongdaemun Design Plaza',ll:[127.0094,37.5665],kind:'ddp',zoom:9,top:.24,description:'오래된 성곽 옆, 은빛 곡선의 건축'},
 {name:'서울숲 · 성수',en:'Seoul Forest · Seongsu',ll:[127.0374,37.5445],kind:'forest',zoom:7,top:.15,description:'숲과 한강, 성수의 거리들이 만나는 곳'},
 {name:'홍대 · 연남',en:'Hongdae · Yeonnam',ll:[126.9237,37.5563],kind:'district',zoom:7,top:.2,description:'홍대 앞에서 경의선 숲길까지'},
 {name:'북한산',en:'Bukhansan',ll:[126.977,37.6587],kind:'mountain',zoom:3.7,top:.25,major:true,description:'서울 북쪽을 감싸는 산과 능선'},
 {name:'올림픽공원',en:'Olympic Park',ll:[127.1229,37.5208],kind:'olympic',zoom:6,top:.25,description:'몽촌토성과 호수를 품은 넓은 공원'},
 {name:'반포한강공원',en:'Banpo Hangang Park',ll:[126.9958,37.5109],kind:'river',zoom:6.4,top:.12,description:'반포대교 아래로 이어지는 한강의 풍경'},
 {name:'상암 · 하늘공원',en:'Sangam · Haneul Park',ll:[126.8852,37.5683],kind:'stadium',zoom:4.8,top:.34,description:'월드컵경기장과 한강변의 공원들'},
 {name:'마곡 · 서울식물원',en:'Magok · Seoul Botanic Park',ll:[126.835,37.5697],kind:'botanic',zoom:6,top:.26,description:'서울 서쪽, 도시와 정원이 만나는 곳'},
 {name:'관악산',en:'Gwanaksan',ll:[126.964,37.4442],kind:'mountain',zoom:3.7,top:.22,description:'서울 남쪽 경계에 펼쳐진 바위 능선'}
];
const materials = {};
function material(name, hex, extra={}) { const m=new THREE.MeshStandardMaterial({color:hex,roughness:.83,metalness:0,...extra});materials[name]=m;return m; }
function toWorld(lon,lat){return[(lon-data.meta.origin[0])*data.meta.sx,(data.meta.origin[1]-lat)*data.meta.sz];}
function heightAt(x,z){
 const t=data.terrain;
 const gx=clamp((x-worldBounds[0][0])/width*t.nx,0,t.nx-.00001),gz=clamp((z-worldBounds[0][1])/depth*t.nz,0,t.nz-.00001);
 const ix=Math.floor(gx),iz=Math.floor(gz),a=gx-ix,b=gz-iz,i=iz*(t.nx+1)+ix;
 return ((t.heights[i]*(1-a)+t.heights[i+1]*a)*(1-b)+(t.heights[i+t.nx+1]*(1-a)+t.heights[i+t.nx+2]*a)*b)*.004;
}
function trailHeightAt(x,z){
 const t=data.terrain,gx=clamp((x-worldBounds[0][0])/width*t.nx,0,t.nx-.00001),gz=clamp((z-worldBounds[0][1])/depth*t.nz,0,t.nz-.00001),ix=Math.floor(gx),iz=Math.floor(gz),a=gx-ix,b=gz-iz,i=iz*(t.nx+1)+ix,h=t.heights;
 return(a+b<=1?h[i]*(1-a-b)+h[i+1]*a+h[i+t.nx+1]*b:h[i+1]*(1-b)+h[i+t.nx+1]*(1-a)+h[i+t.nx+2]*(a+b-1))*.004;
}
function inBounds(x,z,pad=0){return x>=worldBounds[0][0]+pad&&x<=worldBounds[1][0]-pad&&z>=worldBounds[0][1]+pad&&z<=worldBounds[1][1]-pad;}
function showToast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,3600);}
function fail(error){console.error(error);$('loading').hidden=false;$('loading').classList.remove('done');$('loading-text').textContent='지도를 불러오지 못했습니다. 연결을 확인하거나 최신 Safari·Chrome에서 다시 열어 주세요.';$('retry').hidden=false;}
$('retry').onclick=()=>location.reload();

function buildTerrain(){
 const t=data.terrain,positions=[],colors=[],indices=[];
 const flatColor=new THREE.Color('#d6dfc2'),mid=new THREE.Color('#91ad7b'),high=new THREE.Color('#8b9a79');
 for(let j=0;j<=t.nz;j++)for(let i=0;i<=t.nx;i++){
  const x=worldBounds[0][0]+i/t.nx*width,z=worldBounds[0][1]+j/t.nz*depth,h=t.heights[j*(t.nx+1)+i];
  positions.push(x,h*.004,z);
  const c=flatColor.clone().lerp(mid,clamp((h-35)/300,0,1));if(t.green?.[j*(t.nx+1)+i])c.lerp(mid,.55);if(h>400)c.lerp(high,clamp((h-400)/500,0,1));
  c.multiplyScalar(.975+random()*.05);colors.push(c.r,c.g,c.b);
  if(i<t.nx&&j<t.nz){const k=j*(t.nx+1)+i;indices.push(k,k+t.nx+1,k+1,k+1,k+t.nx+1,k+t.nx+2);}
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
 terrainMesh=new THREE.Mesh(geometry,material('terrain','#ffffff',{vertexColors:true}));terrainMesh.receiveShadow=true;scene.add(terrainMesh);
 // Rounded solid foundation; actual elevation is the surface above it.
 const w=width+.15,d=depth+.15,r=.6,s=new THREE.Shape();
 s.moveTo(-w/2+r,-d/2);s.lineTo(w/2-r,-d/2);s.quadraticCurveTo(w/2,-d/2,w/2,-d/2+r);s.lineTo(w/2,d/2-r);s.quadraticCurveTo(w/2,d/2,w/2-r,d/2);s.lineTo(-w/2+r,d/2);s.quadraticCurveTo(-w/2,d/2,-w/2,d/2-r);s.lineTo(-w/2,-d/2+r);s.quadraticCurveTo(-w/2,-d/2,-w/2+r,-d/2);
 const bg=new THREE.ExtrudeGeometry(s,{depth:.65,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.11,bevelThickness:.11,curveSegments:10});bg.rotateX(-Math.PI/2);
 // Keep the bevel's top at -.04, below zero-elevation terrain and every
 // water surface. A higher cap hid the low-lying downstream Han River.
 base=new THREE.Mesh(bg,material('base','#d3daca'));base.position.set((worldBounds[0][0]+worldBounds[1][0])/2,-.80,(worldBounds[0][1]+worldBounds[1][1])/2);base.receiveShadow=true;base.castShadow=true;scene.add(base);
 // Close the uneven cut edges of the terrain down to its foundation.
 const skirts=[];
 const edgePaths=[Array.from({length:t.nx+1},(_,i)=>[worldBounds[0][0]+i/t.nx*width,worldBounds[0][1]]),Array.from({length:t.nz+1},(_,j)=>[worldBounds[1][0],worldBounds[0][1]+j/t.nz*depth]),Array.from({length:t.nx+1},(_,i)=>[worldBounds[1][0]-i/t.nx*width,worldBounds[1][1]]),Array.from({length:t.nz+1},(_,j)=>[worldBounds[0][0],worldBounds[1][1]-j/t.nz*depth])];
 for(const path of edgePaths)for(let i=0;i<path.length-1;i++){const a=path[i],b=path[i+1],h1=heightAt(...a),h2=heightAt(...b);skirts.push(a[0],-.04,a[1],b[0],h2,b[1],a[0],h1,a[1],a[0],-.04,a[1],b[0],-.04,b[1],b[0],h2,b[1]);}
 const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.Float32BufferAttribute(skirts,3));sg.computeVertexNormals();scene.add(new THREE.Mesh(sg,material('skirt','#bbc9a8',{side:THREE.DoubleSide})));
}
function ringArea(r){let a=0;for(let i=0,j=r.length-1;i<r.length;j=i++)a+=r[j][0]*r[i][1]-r[i][0]*r[j][1];return a/2;}
function groups(rings){const out=[];for(const ring of rings){if(ring.length<4)continue;if(ringArea(ring)>0||!out.length)out.push([ring]);else out[out.length-1].push(ring);}return out;}
function inside(p,ring){let ok=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])ok=!ok;}return ok;}
const waterIndex=new Map();
function indexWater(){
 for(let itemIndex=0;itemIndex<data.water.length;itemIndex++)for(const g of groups(data.water[itemIndex])){
  const r=g[0],xs=r.map(p=>p[0]),zs=r.map(p=>p[1]);
  const item={rings:g,height:data.waterHeights[itemIndex]*.004+.012};
  for(let x=Math.floor(Math.min(...xs));x<=Math.floor(Math.max(...xs));x++)for(let z=Math.floor(Math.min(...zs));z<=Math.floor(Math.max(...zs));z++){const key=x+','+z;if(!waterIndex.has(key))waterIndex.set(key,[]);waterIndex.get(key).push(item);}
 }
}
function waterAt(x,z){for(const w of waterIndex.get(Math.floor(x)+','+Math.floor(z))||[])if(inside([x,z],w.rings[0])&&!w.rings.slice(1).some(r=>inside([x,z],r)))return w.height;return null;}
function polygonMesh(items,mat,water=false,indices=items.map((_,i)=>i)){
 const arr=[];
 for(const itemIndex of indices)for(const group of groups(items[itemIndex])){
  const rings=group.map(r=>{const a=r.slice();if(a.length>1&&a[0][0]===a.at(-1)[0]&&a[0][1]===a.at(-1)[1])a.pop();return a.map(p=>new THREE.Vector2(...p));});
  const faces=THREE.ShapeUtils.triangulateShape(rings[0],rings.slice(1)),pts=rings.flat();
  const wh=water?data.waterHeights[itemIndex]*.004+.012:null;
  for(const face of faces){const a=pts[face[0]],b=pts[face[1]],c=pts[face[2]];const cross=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);if(Math.abs(cross)<1e-10)continue;const order=cross>0?[face[0],face[2],face[1]]:face;for(const k of order){const p=pts[k];arr.push(p.x,water?wh:heightAt(p.x,p.y)+.009,p.y);}}
 }
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(arr,3));geo.computeVertexNormals();const m=new THREE.Mesh(geo,mat);m.receiveShadow=true;scene.add(m);return m;
}
function buildSurface(){
 indexWater();
 // Land cover is colored directly on the elevation grid, preserving the hills.
 // Keep the original river banks, island holes and levels. Render the lower
 // Han River toward the west edge in a distinct blue in every time mode.
 const lowerHangang=new Set(data.meta.lowerHangangWater?.waterFeatureIndices??[]);
 waterMesh=polygonMesh(data.water,material('water','#3d94b0',{roughness:.36,metalness:.15,side:THREE.DoubleSide}),true,data.water.map((_,i)=>i).filter(i=>!lowerHangang.has(i)));
 if(lowerHangang.size)polygonMesh(data.water,material('lowerHangangWater','#167ed1',{roughness:.6,metalness:.05,emissive:'#125893',emissiveIntensity:.18,side:THREE.DoubleSide}),true,[...lowerHangang]);
 const roadPositions=[],railPositions=[],carRoutes=[];
 const roadWidth={motorway:.034,trunk:.03,primary:.024,secondary:.016,tertiary:.009,rail:.006};
 for(const [cls,bridge,path] of data.roads){
  const dest=cls==='rail'?railPositions:roadPositions;
  const route=[];
  for(let i=0;i<path.length;i++){const p=path[i],h=heightAt(...p);route.push(V(p[0],Math.max(h,bridge?waterAt(...p)??0:0)+(bridge?.035:.017),p[1]));}
  for(let i=0;i<route.length-1;i++){
   const a=route[i],b=route[i+1],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<.001)continue;
   const nx=-dz/len*roadWidth[cls],nz=dx/len*roadWidth[cls];
   dest.push(a.x+nx,a.y,a.z+nz,b.x+nx,b.y,b.z+nz,a.x-nx,a.y,a.z-nz,a.x-nx,a.y,a.z-nz,b.x+nx,b.y,b.z+nz,b.x-nx,b.y,b.z-nz);
  }
  if(['motorway','trunk','primary'].includes(cls)&&route.length>3&&route.reduce((s,p,i)=>s+(i?p.distanceTo(route[i-1]):0),0)>.65)carRoutes.push(route);
 }
 const make=(arr,mat)=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(arr,3));g.computeVertexNormals();const m=new THREE.Mesh(g,mat);scene.add(m);return m;};
 roadMesh=make(roadPositions,material('road','#f1ede0',{roughness:.95,side:THREE.DoubleSide}));
 make(railPositions,material('rail','#a6b0a0',{side:THREE.DoubleSide}));
 // Vehicles follow the source road polylines, and do not represent live traffic.
 const carMat=new THREE.MeshStandardMaterial({color:'#edf1d6',emissive:'#e3b675',emissiveIntensity:0});materials.cars=carMat;
 for(let i=0;i<Math.min(100,carRoutes.length);i++){
  const route=carRoutes[Math.floor(random()*carRoutes.length)],curve=new THREE.CurvePath();for(let j=1;j<route.length;j++)curve.add(new THREE.LineCurve3(route[j-1],route[j]));
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(.043,.028,.022),carMat);scene.add(mesh);animatedCars.push({mesh,curve,offset:random(),speed:.035+random()*.045});
 }
}
function buildBuildings(){
 const records=data.buildings.filter(b=>inBounds(b[0],b[1],.05)&&!places.some(p=>['palace','tower','lotte','ddp','botanic'].includes(p.kind)&&Math.hypot(b[0]-p.x,b[1]-p.z)<(p.kind==='palace'?.25:.12)));
 buildings=new THREE.Group();buildings.count=records.length;
 const buildingMat=material('buildings','#ffffff',{roughness:.77}),buildingGeo=new THREE.BoxGeometry(1,1,1);
 const tileRecords=new Map();
 for(const row of records){const key=Math.floor(row[0]/3)+','+Math.floor(row[1]/3);if(!tileRecords.has(key))tileRecords.set(key,[]);tileRecords.get(key).push(row);}
 const hash=r=>{const n=Math.sin(r[0]*132.43+r[1]*219.73)*43758.5453;return n-Math.floor(n);};
 for(const rows of tileRecords.values()){
  rows.sort((a,b)=>(b[5]>=25?2+b[5]/555:hash(b))-(a[5]>=25?2+a[5]/555:hash(a)));
  const mesh=new THREE.InstancedMesh(buildingGeo,buildingMat,rows.length);
  for(let i=0;i<rows.length;i++){
   const [x,z,w,d,a,h]=rows[i],high=h*.004;dummy.position.set(x,heightAt(x,z)+high/2,z);dummy.rotation.set(0,-a,0);dummy.scale.set(w,high,d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
   color.set(h>70?'#9dbdc0':h>25?'#bec9c1':'#d2d7c9').multiplyScalar(.86+hash(rows[i])*.25);mesh.setColorAt(i,color);
  }
  mesh.computeBoundingSphere();mesh.userData.fullCount=rows.length;
  const tall=rows.filter(r=>r[5]>=25).length;mesh.userData.overviewCount=tall+Math.ceil((rows.length-tall)*(mobile()?.25:.4));mesh.count=mesh.userData.overviewCount;buildingTiles.push(mesh);buildings.add(mesh);
 }
 const windowPos=[],windowColors=[];
 for(let i=0;i<records.length;i++){
  const [x,z,w,d,a,h]=records[i],high=h*.004;
  if(h>18&&random()>.22){
   for(let n=0;n<Math.min(8,Math.ceil(h/23));n++){
    const yy=heightAt(x,z)+(.3+random()*.65)*high;
    const side=random()>.5?1:-1,xx=x+Math.cos(a)*w*.505*side,zz=z+Math.sin(a)*w*.505*side;
    windowPos.push(xx,yy,zz);const wc=new THREE.Color(random()>.13?'#ffcc78':'#a1dfef');windowColors.push(wc.r,wc.g,wc.b);
   }
  }
 }
 scene.add(buildings);data.buildings=[];
 const wg=new THREE.BufferGeometry();wg.setAttribute('position',new THREE.Float32BufferAttribute(windowPos,3));wg.setAttribute('color',new THREE.Float32BufferAttribute(windowColors,3));nightWindows=new THREE.Points(wg,new THREE.PointsMaterial({size:1.65,sizeAttenuation:false,vertexColors:true,transparent:true,opacity:.9,depthWrite:false}));nightGroup.add(nightWindows);scene.add(nightGroup);nightGroup.visible=false;
}
function buildTrees(){
 const accepted=[],N=mobile()?11000:17000;
 for(let i=0;i<N*10&&accepted.length<N;i++){
  const x=worldBounds[0][0]+.18+random()*(width-.36),z=worldBounds[0][1]+.18+random()*(depth-.36),h=heightAt(x,z);
  if(h<.30||h>2.65||waterAt(x,z)!==null||random()>Math.min(.9,h/.9))continue;
  accepted.push([x,z,h,.055+random()*.1]);
 }
 const evergreens=[],deciduous=[];
 for(let i=0;i<accepted.length;i++){
  // Consume the original random sequence so landmarks and boats keep their
  // existing positions. Independent variation only affects tree appearance.
  const row={position:accepted[i],angle:random()*6.28,tone:Math.floor(random()*4),flowering:environmentRandom()<.5};
  (i%3===0?evergreens:deciduous).push(row);
 }
 const leafMat=material('trees','#ffffff');
 trees=new THREE.InstancedMesh(new THREE.ConeGeometry(1,1,5),leafMat,evergreens.length);
 deciduousTrees=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),leafMat,deciduous.length);
 const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.08,.11,1,5),material('treeTrunks','#80634c'),deciduous.length);
 for(const [rows,mesh,conifer] of [[evergreens,trees,true],[deciduous,deciduousTrees,false]]){
  for(let i=0;i<rows.length;i++){
   const row=rows[i],[x,z,y,s]=row.position;
   dummy.position.set(x,y+s*(conifer?.68:1),z);dummy.rotation.set(0,row.angle,0);dummy.scale.set(s*(conifer?.45:.65),s*(conifer?1.5:.72),s*(conifer?.45:.6));dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
   seasonalTrees.push({...row,mesh,index:i,conifer});
   if(!conifer){dummy.position.set(x,y+s*.38,z);dummy.scale.set(s,s*.76,s);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);}
  }
  mesh.computeBoundingSphere();scene.add(mesh);
 }
 trunks.computeBoundingSphere();scene.add(trunks);
 // One shared five-segment branch shape, instanced at the existing broadleaf
 // tree positions. Winter hides crowns and shows these bare branches.
 const branchPositions=[],branchNormals=[];
 const branchSegments=[
  [[0,.6,0],[0,1.7,0],.075,.025],
  [[0,.8,0],[.55,1.3,.18],.05,.015],
  [[0,1.02,0],[-.46,1.48,-.22],.043,.012],
  [[0,1.12,0],[.05,1.48,-.5],.035,.01],
  [[0,.68,0],[-.18,1.15,.48],.04,.012],
 ];
 for(const [from,to,bottomRadius,topRadius] of branchSegments){
  const a=V(...from),b=V(...to),direction=b.clone().sub(a);
  const segment=new THREE.CylinderGeometry(topRadius,bottomRadius,direction.length(),3,1,true);
  segment.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0,1,0),direction.clone().normalize()));segment.translate(...a.add(b).multiplyScalar(.5).toArray());
  const expanded=segment.toNonIndexed();branchPositions.push(...expanded.attributes.position.array);branchNormals.push(...expanded.attributes.normal.array);expanded.dispose();segment.dispose();
 }
 const branchGeometry=new THREE.BufferGeometry();branchGeometry.setAttribute('position',new THREE.Float32BufferAttribute(branchPositions,3));branchGeometry.setAttribute('normal',new THREE.Float32BufferAttribute(branchNormals,3));
 winterBranches=new THREE.InstancedMesh(branchGeometry,material('winterBranches','#796b5b'),deciduous.length);winterBranches.name='winter-branches';
 for(let i=0;i<deciduous.length;i++){
  const row=deciduous[i],[x,z,y,s]=row.position;dummy.position.set(x,y,z);dummy.rotation.set(0,row.angle,0);dummy.scale.setScalar(s);dummy.updateMatrix();winterBranches.setMatrixAt(i,dummy.matrix);
 }
 winterBranches.computeBoundingSphere();scene.add(winterBranches);
 // Three low-poly clusters form a flowering crown on the selected broadleaf
 // trees. Evergreens stay green; species and seasons are illustrative.
 const flowering=deciduous.filter(r=>r.flowering);
 blossoms=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),material('blossoms','#ffffff',{roughness:.9}),flowering.length*3);
 const flowerTones=['#f5a8c8','#ffd2e0','#fff0f4','#ed8fbc'];
 for(let i=0;i<flowering.length;i++)for(let j=0;j<3;j++){
  const row=flowering[i],[x,z,y,s]=row.position,a=row.angle+j*Math.PI*2/3;
  dummy.position.set(x+Math.cos(a)*s*.37,y+s*(j===1?1.5:1.18),z+Math.sin(a)*s*.37);dummy.rotation.set(0,a,.15*j);dummy.scale.set(s*.48,s*.43,s*.46);dummy.updateMatrix();blossoms.setMatrixAt(i*3+j,dummy.matrix);
  blossoms.setColorAt(i*3+j,new THREE.Color(flowerTones[(row.tone+j)%flowerTones.length]));
 }
 blossoms.computeBoundingSphere();scene.add(blossoms);setSeason(season);
}
function setSeason(next){
 if(!['spring','summer','autumn','winter'].includes(next))return;
 season=next;document.body.dataset.season=next;$('season').value=next;
 const palettes={spring:['#91b775','#acd18a','#83b56b','#bedb9b'],summer:['#668b55','#74955d','#89a46b','#517e54'],autumn:['#b6472f','#df7136','#e1ac3e','#c45535']};
 const snowTint=new THREE.Color('#eef5f8');
 for(const row of seasonalTrees){
  color.set((row.conifer||next==='winter'?palettes.summer:palettes[next])[row.tone]);
  if(mode==='snow')color.lerp(snowTint,.6);
  row.mesh.setColorAt(row.index,color);
 }
 if(trees?.instanceColor)trees.instanceColor.needsUpdate=true;
 if(deciduousTrees?.instanceColor)deciduousTrees.instanceColor.needsUpdate=true;
 if(deciduousTrees)deciduousTrees.visible=next!=='winter';
 if(winterBranches){winterBranches.visible=next==='winter';winterBranches.material.color.set(mode==='snow'?'#c6d1d5':'#796b5b');}
 if(blossoms){blossoms.visible=next==='spring';blossoms.material.color.set(mode==='snow'?'#eff7ff':'#ffffff');}
}

function buildWeather(){
 if(weatherEffects)return;
 weatherEffects={};
 for(const kind of ['rain','snow']){
  const count=kind==='rain'?(mobile()?650:1500):(mobile()?500:1100);
  const positions=new Float32Array(count*(kind==='rain'?6:3));
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
  let mesh;
  if(kind==='rain')mesh=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:'#adc9e2',transparent:true,opacity:.62,depthWrite:false,toneMapped:false}));
  else{
   const snowMaterial=new THREE.PointsMaterial({color:'#ffffff',size:mobile()?3.5:4,sizeAttenuation:false,transparent:true,opacity:.9,depthWrite:false,toneMapped:false});
   snowMaterial.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_particle_fragment>','#include <map_particle_fragment>\nfloat flakeRadius=length(gl_PointCoord-vec2(0.5));\ndiffuseColor.a*=1.0-smoothstep(0.22,0.5,flakeRadius);\nif(diffuseColor.a<0.01)discard;');};
   snowMaterial.customProgramCacheKey=()=> 'seoul-soft-snow-v1';
   mesh=new THREE.Points(geometry,snowMaterial);
  }
  mesh.name=`weather-${kind}`;mesh.visible=false;mesh.frustumCulled=false;scene.add(mesh);
  weatherEffects[kind]={mesh,count,positions,particles:Array.from({length:count},()=>({phase:environmentRandom()*Math.PI*2,speed:.7+environmentRandom()*.6})),span:0,center:V(),elapsed:0};
 }
}
function updateWeather(dt){
 const effect=weatherEffects?.[mode];if(!effect)return;
 const span=clamp((camera.top-camera.bottom)/camera.zoom*1.25,2,70),aspect=(camera.right-camera.left)/(camera.top-camera.bottom);
 const reset=!effect.span||Math.abs(span/effect.span-1)>.15||Math.hypot(controls.target.x-effect.center.x,controls.target.z-effect.center.z)>span*.18;
 if(reset){effect.span=span;effect.center.copy(controls.target);}
 const size=effect.span,radius=size*Math.max(1,aspect)*.55,ceiling=size*.3,scale=size/48;
 const xMin=Math.max(effect.center.x-radius,worldBounds[0][0]+.01),xMax=Math.min(effect.center.x+radius,worldBounds[1][0]-.01);
 const zMin=Math.max(effect.center.z-radius,worldBounds[0][1]+.01),zMax=Math.min(effect.center.z+radius,worldBounds[1][1]-.01);
 effect.elapsed+=dt;
 for(let i=0;i<effect.count;i++){
  const p=effect.particles[i];
  if(reset||(dt>0&&p.y<=p.ground+.03)){
   p.x=xMin+environmentRandom()*(xMax-xMin);
   p.z=zMin+environmentRandom()*(zMax-zMin);
   p.ground=Math.max(heightAt(p.x,p.z),waterAt(p.x,p.z)??0);
   p.y=p.ground+ceiling*(reset?environmentRandom():1)+.04;
  }
  p.y-=dt*(mode==='rain'?7.5:1.05)*scale*p.speed;
  const j=i*(mode==='rain'?6:3),sway=mode==='snow'?Math.sin(effect.elapsed*.75+p.phase)*scale*.18:0;
  effect.positions[j]=p.x+sway;effect.positions[j+1]=Math.max(p.ground+.025,p.y);effect.positions[j+2]=p.z;
  if(mode==='rain'){
   effect.positions[j+3]=p.x+.07*scale;effect.positions[j+4]=Math.max(p.ground+.025,p.y+.55*scale);effect.positions[j+5]=p.z+.03*scale;
  }
 }
 effect.mesh.geometry.attributes.position.needsUpdate=true;
}
function addMesh(parent,geo,mat,pos=[0,0,0],scale=null){const m=new THREE.Mesh(geo,mat);m.position.set(...pos);if(scale)m.scale.set(...scale);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function block(g,mat,x,y,z,w,h,d){return addMesh(g,new THREE.BoxGeometry(w,h,d),mat,[x,y+h/2,z]);}
function cylinder(g,mat,r1,r2,h,y,x=0,z=0){return addMesh(g,new THREE.CylinderGeometry(r1,r2,h,24),mat,[x,y+h/2,z]);}
function buildLandmarks(){
 const ivory=material('ivory','#eee5d0'),roof=material('roof','#3b6867'),glass=material('glass','#9dc8c6',{metalness:.45,roughness:.25}),metal=material('metal','#dbe3dd',{metalness:.65,roughness:.3}),red=material('red','#a25642'),dark=material('dark','#3b5e64');
 landmarkMaterials.push(ivory,roof,glass,metal,red,dark);
 for(const p of places){
  const g=new THREE.Group();g.position.set(p.x,heightAt(p.x,p.z),p.z);landmarkGroup.add(g);p.group=g;
  if(p.kind==='tower'){
   cylinder(g,ivory,.065,.11,.1,0);cylinder(g,ivory,.025,.07,.58,.08);cylinder(g,glass,.13,.085,.1,.64);cylinder(g,ivory,.11,.13,.04,.74);cylinder(g,glass,.065,.11,.1,.78);cylinder(g,ivory,.024,.055,.075,.88);cylinder(g,red,.004,.013,.22,.94);
   const ring=addMesh(g,new THREE.TorusGeometry(.117,.008,6,48),metal,[0,.748,0]);ring.rotation.x=Math.PI/2;
  }else if(p.kind==='lotte'){
   const points=[];for(let i=0;i<=24;i++){const t=i/24;points.push(new THREE.Vector2(.12*Math.pow(1-t*.9,.65),t*2.12));}
   const tower=addMesh(g,new THREE.LatheGeometry(points,36),glass);tower.scale.z=.8;
   for(let i=0;i<12;i++){const angle=i/12*Math.PI*2,pts=[];for(let k=0;k<points.length;k++){const v=points[k];pts.push(V(Math.cos(angle)*v.x*1.012,v.y,Math.sin(angle)*v.x*.812));}g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:'#e4ece5',transparent:true,opacity:.66})));}
   block(g,metal,-.009,2.08,0,.016,.14,.012);block(g,metal,.012,2.07,0,.012,.12,.014);block(g,ivory,0,0,.16,.35,.07,.32);
  }else if(p.kind==='palace'){
   block(g,ivory,0,0,0,.45,.025,.61);
   const hall=(x,z,w,d,h)=>{
    block(g,red,x,.028,z,w*.77,h*.53,d*.72);
    for(const side of [-1,1])for(let i=-2;i<=2;i++)cylinder(g,red,.008,.008,h*.55,.028,x+i*w*.14,z+side*d*.29);
    for(let level=0;level<2;level++){const geom=new THREE.ConeGeometry(1,1,4);const m=addMesh(g,geom,roof,[x,.04+h*.55+level*.063,z]);m.rotation.y=Math.PI/4;m.scale.set(w*(level?.64:.78),.085,d*(level?.64:.78));}
   };
   hall(0,-.075,.21,.14,.13);hall(0,.25,.15,.09,.1);hall(0,-.23,.14,.09,.1);hall(-.15,-.08,.075,.075,.06);
   block(g,ivory,0,0,.315,.49,.045,.016);block(g,ivory,-.24,0,0,.018,.043,.63);block(g,ivory,.24,0,0,.018,.043,.63);
  }else if(p.kind==='ddp'){
   const a=addMesh(g,new THREE.SphereGeometry(1,40,24),metal,[0,.075,0],[.19,.095,.1]);a.rotation.y=-.65;
   addMesh(g,new THREE.SphereGeometry(1,32,20),metal,[.15,.045,-.08],[.135,.065,.105]);
  }else if(p.kind==='yeouido'){
   for(const [ll,w,h,d] of [[[126.9279,37.525],.115,1.33,.1],[[126.924,37.525],.11,1.05,.11],[[126.9394,37.5194],.08,1.0,.095]]){const [x,z]=toWorld(...ll);block(g,glass,x-p.x,0,z-p.z,w,h,d);}
  }else if(p.kind==='coex'){
   block(g,ivory,0,0,0,.28,.095,.2);block(g,glass,-.16,0,-.03,.105,.91,.11);block(g,dark,.14,0,-.08,.105,1.1,.1);
  }else if(p.kind==='olympic'){
   const m=addMesh(g,new THREE.TorusGeometry(.085,.009,6,40),metal,[0,.09,0]);m.rotation.x=Math.PI/2;
   block(g,ivory,-.18,0,.1,.025,.18,.05);block(g,ivory,.18,0,.1,.025,.18,.05);block(g,ivory,0,.15,.1,.43,.035,.07);
  }else if(p.kind==='botanic'){
   const m=addMesh(g,new THREE.SphereGeometry(.14,36,18,0,Math.PI*2,0,Math.PI/2),glass,[0,.01,0],[1.4,.55,1]);m.material=glass;
   for(let i=0;i<5;i++){const ring=addMesh(g,new THREE.TorusGeometry(.08+i*.012,.002,4,40),ivory,[0,.035+i*.007,0]);ring.rotation.x=Math.PI/2;ring.scale.x=1.4;}
  }else if(p.kind==='stadium'){
   const [x,z]=toWorld(126.8973,37.5683);const stadium=new THREE.Group();stadium.position.set(x-p.x,0,z-p.z);g.add(stadium);
   const m=addMesh(stadium,new THREE.TorusGeometry(.19,.045,8,48),ivory,[0,.075,0],[1.1,1,1]);m.rotation.x=Math.PI/2;
   block(stadium,roof,0,0,0,.26,.03,.15);
  }
 }
 scene.add(landmarkGroup);
}
function buildBorders(){
 const positions=[];
 for(const district of data.districts)for(const ring of district.rings)for(let i=1;i<ring.length;i++){const a=ring[i-1],b=ring[i];positions.push(a[0],heightAt(...a)+.023,a[1],b[0],heightAt(...b)+.023,b[1]);}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));borderLines=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:'#bfa267',transparent:true,opacity:.8}));borderLines.visible=false;scene.add(borderLines);
}
function buildBoats(){
 const mat=new THREE.MeshStandardMaterial({color:'#fff2d8',roughness:.8}),wakeMat=new THREE.LineBasicMaterial({color:'#d8f5e2',transparent:true,opacity:.6});
 for(let i=0;i<20;i++){
  for(let attempt=0;attempt<80;attempt++){
   const x=-14+random()*29,z=-3+random()*10,y=waterAt(x,z);if(y===null)continue;
   const dx=.12+random()*.8,dz=(random()-.5)*.5;if([.25,.5,.75,1].some(t=>waterAt(x+dx*t,z+dz*t)===null))continue;
   const g=new THREE.Group();addMesh(g,new THREE.BoxGeometry(.08,.022,.03),mat,[0,.018,0]);addMesh(g,new THREE.BoxGeometry(.04,.02,.026),mat,[-.006,.039,0]);
   const wake=new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(-.04,.008,0),V(-.16,.008,.032),V(-.08,.008,0),V(-.16,.008,-.032)]),wakeMat);g.add(wake);g.rotation.y=-Math.atan2(dz,dx);scene.add(g);animatedBoats.push({mesh:g,x,z,y,dx,dz,offset:random()});break;
  }
 }
}
function buildStars(){
 const pts=[];for(let i=0;i<550;i++){const a=random()*Math.PI*2,p=.15+random()*1.2,r=110;pts.push(Math.cos(a)*Math.sin(p)*r,Math.cos(p)*r,Math.sin(a)*Math.sin(p)*r);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));starField=new THREE.Points(g,new THREE.PointsMaterial({color:'#cfe1ed',size:1.3,sizeAttenuation:false,transparent:true,opacity:.6}));starField.visible=false;scene.add(starField);
}

function setTime(time){
 if(!['day','sunset','night','rain','snow'].includes(time))return;
 mode=time;document.body.dataset.time=time;
 for(const b of document.querySelectorAll('[data-time-choice]')){const on=b.dataset.timeChoice===time;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',on);}
 const settings={
  day:{bg:'#e6ede7',sun:'#fff2d6',intensity:3.1,sky:'#d8e7f2',ground:'#b5c4a3',ambient:2.1,water:'#3d94b0',road:'#ede9d9',pos:[-25,42,12],exposure:1.06},
  sunset:{bg:'#ebd7c6',sun:'#ffb579',intensity:3.3,sky:'#edc0b7',ground:'#8c987d',ambient:1.5,water:'#739ba9',road:'#ebcda4',pos:[-42,16,14],exposure:1.05},
  night:{bg:'#132633',sun:'#8dacd2',intensity:.75,sky:'#7da7d5',ground:'#23353c',ambient:1.25,water:'#205d72',road:'#938876',pos:[-22,38,-24],exposure:.93},
  rain:{bg:'#829ba8',sun:'#c0d1e0',intensity:.85,sky:'#b8cbd8',ground:'#718279',ambient:1.6,water:'#366e98',road:'#7d9199',pos:[-25,42,12],exposure:.94},
  snow:{bg:'#dde9f2',sun:'#f3f7ff',intensity:1.9,sky:'#e7f2ff',ground:'#c0d0d7',ambient:2.25,water:'#487fa3',road:'#eef3f4',pos:[-25,42,12],exposure:1.04},
 }[time];
 scene.background.set(settings.bg);scene.fog.color.set(settings.bg);sun.color.set(settings.sun);sun.intensity=settings.intensity;sun.position.set(...settings.pos);hemisphere.color.set(settings.sky);hemisphere.groundColor.set(settings.ground);hemisphere.intensity=settings.ambient;materials.water.color.set(settings.water);materials.road.color.set(settings.road);renderer.toneMappingExposure=settings.exposure;
 const precipitation=time==='rain'||time==='snow';
 sun.castShadow=!precipitation;scene.fog.near=precipitation?65:135;scene.fog.far=precipitation?155:240;
 materials.road.roughness=time==='rain'?.3:.95;materials.water.roughness=time==='rain'?.2:.36;
 materials.water.emissive.set(time==='night'?'#154356':'#000000');materials.water.emissiveIntensity=.3;materials.cars.emissiveIntensity=time==='night'?1.8:time==='sunset'?.2:0;
 if(materials.lowerHangangWater){
  const river={day:['#167ed1',.18],sunset:['#287ed0',.3],night:['#15558d',.45],rain:['#246fac',.3],snow:['#337eb9',.23]}[time];
  materials.lowerHangangWater.color.set(river[0]);materials.lowerHangangWater.emissiveIntensity=river[1];
 }
 nightGroup.visible=time==='night';starField.visible=time==='night';floor.material.color.set(settings.bg);
 for(const m of landmarkMaterials){m.emissive.set(time==='night'?'#235258':time==='sunset'?'#341b0b':'#000000');m.emissiveIntensity=time==='night'?.48:.15;}
 if(time==='night')materials.ivory.emissive.set('#c58a47');
 setSeason(season);
 if(precipitation)buildWeather();
 if(weatherEffects)for(const [kind,effect] of Object.entries(weatherEffects)){effect.mesh.visible=kind===time;if(effect.mesh.visible)effect.span=0;}
 if(precipitation)updateWeather(0);
}
function resize(){
 const aspect=innerWidth/innerHeight;targetHalfHeight=mobile()?Math.max(24,30/aspect):Math.max(24,34/aspect);
 camera.left=-targetHalfHeight*aspect;camera.right=targetHalfHeight*aspect;camera.top=targetHalfHeight;camera.bottom=-targetHalfHeight;
 camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);
 environmentBounds=$('environment-panel')?.getBoundingClientRect?.()??null;
}
function tweenTo(target,zoom,offset=V(34,39,46),duration=2200){
 animation={start:performance.now(),duration:reducedMotion?0:duration,fromTarget:controls.target.clone(),toTarget:target,fromPosition:camera.position.clone(),toPosition:target.clone().add(offset),fromZoom:camera.zoom,toZoom:zoom};
}
function resetView(){
 stopTour();hikingExplorer?.setTab('places');selected=-1;flatView=false;updateViewButton();updateSelection();
 tweenTo(mobile()?V(0,.1,0):V(-4.5,.1,3.1),1,V(34,39,46));
 setLocation('서울, 한눈에 (Seoul overview)','미니어처 도시 (City in miniature)','한강과 산, 그 사이에 펼쳐진 25개 자치구',[126.978,37.5665],'SEOUL');$('district').value='';
}
function setLocation(name,en,desc,ll,index='SEOUL'){$('location-name').textContent=name;$('location-en').textContent=en;$('location-description').textContent=desc;$('location-index').textContent=index;$('location-coordinates').textContent=`${ll[1].toFixed(4)}° N   ${ll[0].toFixed(4)}° E`;}
function updateSelection(){
 for(let i=0;i<places.length;i++){places[i].button.classList.toggle('selected',i===selected);places[i].button.setAttribute('aria-current',i===selected?'location':'false');places[i].label.classList.toggle('selected',i===selected);places[i].pinElement?.classList.toggle('selected',i===selected);}
}
function focusPlace(i,touring=false){
 if(!touring)stopTour();hikingExplorer?.setTab('places');selected=i;flatView=false;updateViewButton();const p=places[i];
 tweenTo(V(p.x,heightAt(p.x,p.z)+p.top*.32,p.z),clamp(p.zoom*(mobile()?targetHalfHeight/24:1),1,28),V(...(p.offset||[14,16,20])),touring?3200:2200);
 setLocation(p.name,p.en,p.description,p.ll,String(i+1).padStart(2,'0'));updateSelection();closeExplore();$('district').value='';
}
function stopTour(){runningTour=false;$('tour').setAttribute('aria-pressed','false');$('tour-text').innerHTML='자동 비행<small>(Auto tour)</small>';$('play-icon').innerHTML='<path d="m9 5 11 7-11 7Z"/>';$('tour-progress').style.width='0';}
function startTour(){runningTour=true;tourIndex=0;shotStart=performance.now();focusPlace(tourIndex,true);$('tour').setAttribute('aria-pressed','true');$('tour-text').innerHTML='비행 멈춤<small>(Stop tour)</small>';$('play-icon').innerHTML='<path d="M8 5h2v14H8zM16 5h2v14h-2z"/>';closeExplore();}
function updateViewButton(){$('view-text').innerHTML=flatView?'입체 보기<small>(3D view)</small>':'평면 보기<small>(2D view)</small>';$('view-mode').setAttribute('aria-pressed',flatView);}
function closeExplore(){$('explore').classList.remove('open');$('open-explore').setAttribute('aria-expanded','false');}
function buildUI(){
 $('place-count').textContent=places.length+'곳 (places)';
 places.forEach((p,i)=>{
  const b=document.createElement('button');b.className='place';b.innerHTML=`<span class="place-number">${String(i+1).padStart(2,'0')}</span><span><span class="place-title">${p.name}</span><span class="place-en">(${p.en})</span></span><span class="place-icon" aria-hidden="true">↗</span>`;b.onclick=()=>focusPlace(i);$('places').append(b);p.button=b;
  const l=document.createElement('button');l.className='map-label';l.textContent=`${p.name} (${p.en})`;l.setAttribute('aria-label',`${p.name} (${p.en}) 위치로 이동 (Go to location)`);l.onclick=()=>focusPlace(i);$('labels').append(l);p.label=l;labels.push({p,el:l,pos:V(p.x,heightAt(p.x,p.z)+p.top+.14,p.z)});
  if(p.pin){const pin=document.createElement('button');pin.className='map-pin';pin.hidden=true;pin.title=`${p.name} (${p.en})`;pin.setAttribute('aria-label',`${p.name} (${p.en}) 위치로 이동 (Go to location)`);pin.onclick=()=>focusPlace(i);$('labels').append(pin);p.pinElement=pin;p.pinPosition=V(p.x,heightAt(p.x,p.z)+.04,p.z);}
 });
 const river=data.meta.hangangWater;
 if(river){
  const [x,z]=toWorld(...river.labelCoordinates),y=waterAt(x,z);
  if(y!==null){const el=document.createElement('span');el.className='map-label water-label';el.textContent=river.label+' (Hangang River)';el.hidden=true;$('labels').append(el);labels.push({p:{major:true},el,pos:V(x,y+.07,z)});}
 }
 for(const d of [...data.districts].sort((a,b)=>a.name.localeCompare(b.name,'ko'))){const o=document.createElement('option');o.value=d.name;o.textContent=`${d.name} (${d.en})`;$('district').append(o);}
 $('district').onchange=e=>{
  const d=data.districts.find(d=>d.name===e.target.value);if(!d)return;stopTour();hikingExplorer?.setTab('places');selected=-1;updateSelection();flatView=false;updateViewButton();
  const points=d.rings.flat(),xs=points.map(p=>p[0]),zs=points.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs),x=(minX+maxX)/2,z=(minZ+maxZ)/2;
  const zoom=clamp(25/Math.max(maxX-minX,maxZ-minZ),2,6)*(mobile()?targetHalfHeight/24:1);tweenTo(V(x,heightAt(x,z),z),clamp(zoom,1,28),V(22,25,29));
  setLocation(d.name,d.en,'자치구 안의 도로와 동네를 자유롭게 둘러보세요.',[x/data.meta.sx+data.meta.origin[0],data.meta.origin[1]-z/data.meta.sz]);closeExplore();
 };
 for(const b of document.querySelectorAll('[data-time-choice]'))b.onclick=()=>setTime(b.dataset.timeChoice);
 $('season').onchange=e=>setSeason(e.target.value);
 $('home').onclick=resetView;$('tour').onclick=()=>runningTour?stopTour():startTour();
 $('zoom-in').onclick=()=>{stopTour();animation=null;camera.zoom=clamp(camera.zoom*1.35,.65,28);camera.updateProjectionMatrix();};$('zoom-out').onclick=()=>{stopTour();animation=null;camera.zoom=clamp(camera.zoom/1.35,.65,28);camera.updateProjectionMatrix();};
 $('north').onclick=()=>{stopTour();tweenTo(controls.target.clone(),camera.zoom,V(0,flatView?65:42,flatView?.001:45),1300);};
 $('view-mode').onclick=()=>{stopTour();flatView=!flatView;updateViewButton();tweenTo(controls.target.clone(),camera.zoom,flatView?V(0,65,.001):V(34,39,46),1500);};
 $('toggle-labels').onclick=()=>{labelsVisible=!labelsVisible;$('toggle-labels').classList.toggle('active',labelsVisible);$('toggle-labels').setAttribute('aria-pressed',labelsVisible);};
 $('boundaries').onclick=()=>{borderLines.visible=!borderLines.visible;$('boundaries').setAttribute('aria-pressed',borderLines.visible);$('boundaries').textContent=borderLines.visible?'숨김 (Hide)':'표시 (Show)';};
 $('open-explore').onclick=()=>{const open=$('explore').classList.toggle('open');$('open-explore').setAttribute('aria-expanded',open);};$('close-explore').onclick=closeExplore;
 const showAbout=()=>{stopTour();$('about').showModal();};$('info').onclick=showAbout;$('credits').onclick=showAbout;$('close-about').onclick=()=>$('about').close();
 $('about').addEventListener('click',e=>{if(e.target===$('about')){const r=$('about').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('about').close();}});
 $('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else showToast('이 브라우저에서는 기기를 가로로 돌려 넓게 볼 수 있습니다.');}catch{showToast('전체 화면을 열 수 없습니다. 기기를 가로로 돌려 보세요.');}};
 $('viewport').addEventListener('keydown',e=>{
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();stopTour();animation=null;const delta=1.2/camera.zoom;const x=e.key==='ArrowLeft'?-delta:e.key==='ArrowRight'?delta:0,z=e.key==='ArrowUp'?-delta:e.key==='ArrowDown'?delta:0;controls.target.add(V(x,0,z));camera.position.add(V(x,0,z));}
  if(e.key==='+'||e.key==='=')$('zoom-in').click();if(e.key==='-')$('zoom-out').click();if(e.key.toLowerCase()==='h')resetView();
 });
}
const projected=new THREE.Vector3();
function blockedByEnvironment(x,y){const r=environmentBounds;return r&&x+64>r.left&&x-64<r.right&&y>r.top-8&&y-36<r.bottom+8;}
function updateLabels(){
 const occupied=[];const ordered=[...labels].sort((a,b)=>(b.p===places[selected]?100:b.p.major?10:0)-(a.p===places[selected]?100:a.p.major?10:0));
 for(const item of ordered){
  const {p,el}=item;projected.copy(item.pos).project(camera);const x=(projected.x*.5+.5)*innerWidth,y=(-projected.y*.5+.5)*innerHeight;
  const near=camera.zoom>2.5||p.major||p===places[selected];
  const blocked=(x<=(mobile()?0:innerWidth<1100?315:355)&&y>145)||blockedByEnvironment(x,y);
  const labelWidth=Math.min(240,Math.max(128,el.textContent.length*6.4));const box={x:x-labelWidth/2,y:y-42,w:labelWidth,h:46};
  const overlaps=occupied.some(b=>box.x<b.x+b.w&&box.x+box.w>b.x&&box.y<b.y+b.h&&box.y+box.h>b.y);
  const show=labelsVisible&&$('explore').dataset.tab!=='apts'&&near&&projected.z>-1&&projected.z<1&&x>35&&x<innerWidth-35&&y>110&&y<innerHeight-150&&!blocked&&!overlaps;
  el.hidden=!show;if(show){el.style.left=x+'px';el.style.top=y+'px';occupied.push(box);}
  if(p.pinElement){
   projected.copy(p.pinPosition).project(camera);const px=(projected.x*.5+.5)*innerWidth,py=(-projected.y*.5+.5)*innerHeight;
   const pinBlocked=(px<=(mobile()?0:innerWidth<1100?315:355)&&py>145)||blockedByEnvironment(px,py);
   const pinShow=labelsVisible&&$('explore').dataset.tab!=='apts'&&projected.z>-1&&projected.z<1&&px>20&&px<innerWidth-20&&py>110&&py<innerHeight-150&&!pinBlocked;
   p.pinElement.hidden=!pinShow;if(pinShow){p.pinElement.style.left=px+'px';p.pinElement.style.top=py+'px';}
  }
 }
 $('north').querySelector('svg').style.transform=`rotate(${-Math.atan2(camera.position.x-controls.target.x,camera.position.z-controls.target.z)*180/Math.PI}deg)`;
}
function animate(now){
 if(stopped)return;requestAnimationFrame(animate);if(document.hidden||!sceneReady)return;
 const dt=Math.min((now-lastTime)/1000,.05);lastTime=now;
 if(animation){const a=animation;const t=a.duration?clamp((now-a.start)/a.duration,0,1):1;const ease=t*t*(3-2*t);controls.target.lerpVectors(a.fromTarget,a.toTarget,ease);camera.position.lerpVectors(a.fromPosition,a.toPosition,ease);camera.zoom=THREE.MathUtils.lerp(a.fromZoom,a.toZoom,ease);camera.updateProjectionMatrix();if(t===1)animation=null;}
 else if(runningTour&&!reducedMotion){const delta=camera.position.clone().sub(controls.target);delta.applyAxisAngle(V(0,1,0),dt*.045);camera.position.copy(controls.target).add(delta);}
 if(runningTour){const elapsed=now-shotStart;$('tour-progress').style.width=Math.min(100,elapsed/105)+'%';if(elapsed>10500){tourIndex++;if(tourIndex>=places.length){stopTour();resetView();showToast('서울 한 바퀴를 마쳤습니다. 원하는 곳을 더 둘러보세요.');}else{shotStart=now;focusPlace(tourIndex,true);}}}
 controls.update();
 if(!animation){const x=clamp(controls.target.x,worldBounds[0][0],worldBounds[1][0]),z=clamp(controls.target.z,worldBounds[0][1],worldBounds[1][1]);camera.position.x+=x-controls.target.x;camera.position.z+=z-controls.target.z;controls.target.x=x;controls.target.z=z;}
 if(!reducedMotion){
  for(const a of animatedCars){const t=(now*.0001*a.speed+a.offset)%1;a.mesh.position.copy(a.curve.getPoint(t));a.mesh.position.y+=.025;const tangent=a.curve.getTangent(t);a.mesh.rotation.y=-Math.atan2(tangent.z,tangent.x);}
  for(const a of animatedBoats){const t=(now*.000022+a.offset)%1;a.mesh.position.set(a.x+a.dx*t,a.y+.012+Math.sin(now*.0018+a.offset*9)*.003,a.z+a.dz*t);}
 }
 const detailed=camera.zoom/(targetHalfHeight/24)>1.7;for(const tile of buildingTiles)tile.count=detailed?tile.userData.fullCount:tile.userData.overviewCount;
 // Reduced-motion users get a static weather field which still follows pans
 // and zooms. Clear modes skip precipitation updates entirely.
 updateWeather(reducedMotion?0:dt);
 updateLabels();hikingExplorer?.update();apartmentExplorer?.update(now);renderer.render(scene,camera);
}
async function init(){
 const [response,buildingResponse,trailResponse]=await Promise.all([fetch(`/data/seoul.json?v=${ASSET_REVISION}`),fetch(`/data/buildings.bin?v=${ASSET_REVISION}`),fetch(`/data/trails.json?v=${ASSET_REVISION}`)]);if(!response.ok||!buildingResponse.ok||!trailResponse.ok)throw new Error('Map data unavailable');[data,trailData]=await Promise.all([response.json(),trailResponse.json()]);
 const buildingArray=new Float32Array(await buildingResponse.arrayBuffer());if(buildingArray.length!==data.meta.buildingCount*6)throw new Error('Building data incomplete');
 data.buildings=Array.from({length:data.meta.buildingCount},(_,i)=>Array.from(buildingArray.subarray(i*6,i*6+6)));$('loading-bar').style.width='35%';
 worldBounds=data.terrain.bounds;width=worldBounds[1][0]-worldBounds[0][0];depth=worldBounds[1][1]-worldBounds[0][1];
 for(const p of places){[p.x,p.z]=toWorld(...p.ll);}
 renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,mobile()?1.6:1.8));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;$('viewport').append(renderer.domElement);
 renderer.domElement.setAttribute('aria-hidden','true');renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();stopped=true;fail(new Error('WebGL context lost'));});
 scene=new THREE.Scene();scene.background=new THREE.Color('#e6ede7');scene.fog=new THREE.Fog('#e6ede7',135,240);
 camera=new THREE.OrthographicCamera(-35,35,24,-24,.1,400);const homeTarget=mobile()?V(0,.1,0):V(-4.5,.1,3.1);camera.position.copy(homeTarget).add(V(34,39,46));
 controls=new OrbitControls(camera,renderer.domElement);controls.target.copy(homeTarget);controls.enableDamping=true;controls.dampingFactor=.07;controls.maxPolarAngle=Math.PI*.465;controls.minPolarAngle=.001;controls.minZoom=.65;controls.maxZoom=28;controls.screenSpacePanning=false;controls.rotateSpeed=.6;controls.zoomSpeed=.85;
 controls.addEventListener('start',()=>{animation=null;stopTour();});
 hemisphere=new THREE.HemisphereLight('#d8e7f2','#b5c4a3',2.1);scene.add(hemisphere);sun=new THREE.DirectionalLight('#fff2d6',3.1);sun.position.set(-25,42,12);sun.castShadow=true;sun.shadow.mapSize.set(mobile()?1024:2048,mobile()?1024:2048);Object.assign(sun.shadow.camera,{left:-25,right:25,top:25,bottom:-25,near:1,far:120});sun.shadow.bias=-.0004;sun.shadow.normalBias=.025;scene.add(sun);
 floor=new THREE.Mesh(new THREE.PlaneGeometry(1000,1000),new THREE.MeshStandardMaterial({color:'#e6ede7',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.94;floor.receiveShadow=true;scene.add(floor);
 buildTerrain();await nextPaint();$('loading-text').textContent='한강과 서울의 거리를 잇는 중';buildSurface();$('loading-bar').style.width='62%';await nextPaint();
 buildBuildings();buildTrees();$('loading-text').textContent='서울의 랜드마크를 세우는 중';$('loading-bar').style.width='83%';await nextPaint();
 buildLandmarks();buildBorders();buildBoats();buildStars();buildUI();setTime('day');resize();
 $('loading-text').textContent='산과 등산로를 연결하는 중 (Mapping mountain trails)';await nextPaint();
 hikingExplorer=createHikingExplorer(trailData,{scene,camera,toWorld,groundHeight:(x,z)=>Math.max(trailHeightAt(x,z),waterAt(x,z)??-Infinity)+.005,$,stopTour,closeExplore,setLocation,
  clearPlaceSelection:()=>{selected=-1;updateSelection();flatView=false;updateViewButton();$('district').value='';},
  flyTo:(x,z,y,radius)=>{const aspect=innerWidth/innerHeight,availableWidth=mobile()?innerWidth-45:Math.max(210,innerWidth-650),availableHeight=Math.max(180,innerHeight-(mobile()?360:200));const span=Math.max(.8,radius*2.5),zoom=clamp(Math.min(targetHalfHeight*2*aspect*(availableWidth/innerWidth)/span,targetHalfHeight*2*(availableHeight/innerHeight)/span),.65,22);tweenTo(V(x,y,z),zoom,V(16,24,20));}
 });
 apartmentExplorer=createApartmentExplorer({$,scene,camera,toWorld,groundHeight:heightAt,stopTour,setTab:tab=>hikingExplorer.setTab(tab),
  districtNames:Object.fromEntries(data.districts.map(d=>[d.name,d.en])),
  clearPlaceSelection:()=>{selected=-1;updateSelection();},
  flyTo:ll=>{const [x,z]=toWorld(...ll);flatView=false;updateViewButton();const target=V(x,heightAt(x,z)+.2,z);tweenTo(target,mobile()?16:18,V(10,18,15));},
  flyDistrict:(code,districts)=>{const name=districts.find(d=>d.code===code)?.name,d=data.districts.find(d=>d.name===name);if(!d)return;stopTour();const pts=d.rings.flat(),xs=pts.map(p=>p[0]),zs=pts.map(p=>p[1]),x=(Math.min(...xs)+Math.max(...xs))/2,z=(Math.min(...zs)+Math.max(...zs))/2;tweenTo(V(x,heightAt(x,z),z),3.5,V(16,24,20));}
 });apartmentExplorer.load();hikingExplorer.setTab('apts');controls.update();sceneReady=true;renderer.render(scene,camera);$('loading-bar').style.width='100%';$('loading').classList.add('done');setTimeout(()=>$('loading').hidden=true,750);window.addEventListener('resize',resize);requestAnimationFrame(animate);
 // Read-only state for non-browser functional checks and diagnostics.
 window.seoulAtlas={getState:()=>({version:ATLAS_VERSION,ready:sceneReady,buildings:buildings.count,districts:data.districts.length,landmarks:places.length,time:mode,season,touring:runningTour,hiking:hikingExplorer?.getState(),apartments:apartmentExplorer?.getState()}),focusPlace,resetView,setTime,setSeason,selectApartment:id=>apartmentExplorer.selectComplex(id,true),selectMountain:(id)=>hikingExplorer.selectMountain(id,true),selectTrail:(id)=>hikingExplorer.selectRoute(id,true)};
}
init().catch(fail);
