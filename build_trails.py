"""Build reproducible hiking overlays from an Overpass JSON snapshot.

Original OSM way geometry is preserved (rounded to ~1 cm), private/no-foot
ways are excluded. Summit connections follow only connected source edges.
They are exploratory connections, not designated or live-verified courses.
Run: python build_trails.py --input /absolute/path/osm-trails.json
Requires numpy and scipy. Output and metadata are licensed ODbL 1.0.
"""
import argparse,json,math,heapq,re,collections
from pathlib import Path
import numpy as np
from scipy.spatial import cKDTree
ROOT=Path(__file__).parent
BBOX=[126.70,37.25,127.35,37.85]
MAJOR={'북한산(백운대)':('북한산 · 백운대','Bukhansan · Baegundae',4.1),'도봉산자운봉':('도봉산 · 자운봉','Dobongsan · Jaunbong',3.0),'수락산':('수락산','Suraksan',2.7),'불암산':('불암산','Buramsan',2.2),'관악산':('관악산','Gwanaksan',3.2),'삼성산':('삼성산','Samseongsan',2.5),'청계산':('청계산','Cheonggyesan',3.0),'인왕산':('인왕산','Inwangsan',1.2),'북악산':('북악산','Bugaksan',1.5),'남산':('남산','Namsan',1.2),'아차산':('아차산','Achasan',1.3),'용마산':('용마산','Yongmasan',1.5),'안산':('안산','Ansan',1.1),'사패산':('사패산','Sapaesan',2.4),'대모산':('대모산','Daemosan',1.5),'구룡산':('구룡산','Guryongsan',1.5),'우면산':('우면산','Umyeonsan',1.6),'광교산 시루봉':('광교산 · 시루봉','Gwanggyosan · Sirubong',3.0),'백운산':('백운산','Baegunsan',2.5),'바라산':('바라산','Barasan',2.0),'모락산':('모락산','Moraksan',1.6),'수암봉':('수리산 · 수암봉','Surisan · Suambong',2.5),'슬기봉':('수리산 · 슬기봉','Surisan · Seulgibong',2.5),'청량산':('남한산성 · 청량산','Namhansanseong · Cheongnyangsan',2.5),'검단산':('검단산','Geomdansan',3.0),'예봉산':('예봉산','Yebongsan',3.0),'천마산':('천마산','Cheonmasan',2.6),'계양산':('계양산','Gyeyangsan',2.0),'구름산':('구름산','Gureumsan',1.7),'개화산':('개화산','Gaehwasan',1.0),'백련산':('백련산','Baengnyeonsan',1.2),'초안산':('초안산','Choansan',1.0),'봉화산':('봉화산','Bonghwasan',1.1),'불곡산':('불곡산','Bulgoksan',2.2),'축령산':('축령산','Chungnyeongsan',3.0)}

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--input',type=Path,required=True);a=parser.parse_args()
 raw=json.loads(a.input.read_text());d=json.loads((ROOT/'dist/data/seoul.json').read_text());meta=d['meta'];terrain=d['terrain'];origin=meta['origin'];sx,sz=meta['sx'],meta['sz']
 def xy(ll):return((ll[0]-origin[0])*sx,(origin[1]-ll[1])*sz)
 def elevation(point):
  x,z=point;b=terrain['bounds'];gx=np.clip((x-b[0][0])/(b[1][0]-b[0][0])*terrain['nx'],0,terrain['nx']-.000001);gz=np.clip((z-b[0][1])/(b[1][1]-b[0][1])*terrain['nz'],0,terrain['nz']-.000001)
  ix,iz=int(gx),int(gz);fx,fz=gx-ix,gz-iz;i=iz*(terrain['nx']+1)+ix;h=terrain['heights'];return(h[i]*(1-fx)+h[i+1]*fx)*(1-fz)+(h[i+terrain['nx']+1]*(1-fx)+h[i+terrain['nx']+2]*fx)*fz
 elements=raw['elements'];peaks=[e for e in elements if e['type']=='node' and e.get('tags',{}).get('natural')=='peak'];pois=[e for e in elements if e['type']=='node' and (e.get('tags',{}).get('highway')=='trailhead' or e.get('tags',{}).get('information')=='guidepost')]
 mountains=[];px=[]
 for p in peaks:
  t=p['tags'];name=t.get('name:ko') or t.get('name') or f'이름 없는 봉우리 {p["id"]}';ll=[p['lon'],p['lat']];point=xy(ll)
  try:ele=float(t.get('ele','').replace('m','').strip())
  except (ValueError,AttributeError):ele=round(elevation(point),1)
  en=t.get('name:en') or t.get('name:ko-Latn') or f'Peak {p["id"]}'
  major=MAJOR.get(name);radius=max(.65,min(2.1,ele/260))
  if major:name,en,radius=major
  mountains.append({'id':str(p['id']),'name':name,'en':en,'ll':ll,'elevation':ele,'major':bool(major),'radiusKm':radius,'sectionIds':[],'routeIds':[]});px.append(point)
 peak_tree=cKDTree(px);sections=[];section_mid=[];node_ll={};node_xy={};node_elev={};incoming=collections.defaultdict(dict);degrees=collections.Counter();node_way=collections.defaultdict(set);excluded=collections.Counter()
 for w in elements:
  if w['type']!='way':continue
  tags=w.get('tags',{});highway=tags.get('highway');g=w.get('geometry',[]);ids=w.get('nodes',[])
  if tags.get('area')=='yes' or tags.get('access') in ('private','no') or tags.get('foot') in ('private','no') or tags.get('access:conditional') or tags.get('foot:conditional') or tags.get('informal')=='yes':excluded['access_or_area']+=1;continue
  if len(g)<2 or len(g)!=len(ids):continue
  center=xy([sum(p['lon'] for p in g)/len(g),sum(p['lat'] for p in g)/len(g)]);dist,peak_i=peak_tree.query(center);peak=mountains[peak_i];h=elevation(center)
  limit=max(.6,min(2.8,peak['elevation']/200));min_h=max(15,min(90,peak['elevation']*.12))
  if highway=='footway':limit=max(.4,min(1.25,peak['elevation']/330));min_h=max(30,peak['elevation']*.28)
  if dist>limit or h<min_h:excluded['outside_mountain_filter']+=1;continue
  chunks=[];chunk=[]
  for n,p in zip(ids,g):
   if BBOX[0]<=p['lon']<=BBOX[2] and BBOX[1]<=p['lat']<=BBOX[3]:chunk.append((n,[round(p['lon'],7),round(p['lat'],7)]))
   else:
    if len(chunk)>1:chunks.append(chunk)
    chunk=[]
  if len(chunk)>1:chunks.append(chunk)
  for part,chunk in enumerate(chunks):
   points=[p for _,p in chunk];coords=[xy(p) for p in points];length=sum(math.dist(c1,c2) for c1,c2 in zip(coords,coords[1:]))
   if length<.010:continue
   index=len(sections);name=tags.get('name:ko') or tags.get('name') or '';en=tags.get('name:en') or tags.get('name:ko-Latn') or ''
   sections.append({'id':f'w{w["id"]}-{part}','wayId':w['id'],'name':name,'en':en,'type':highway,'sacScale':tags.get('sac_scale'),'lengthKm':round(length,3),'points':points});section_mid.append(center)
   for (n,ll),pt in zip(chunk,coords):node_ll[n]=ll;node_xy[n]=pt;node_way[n].add(w['id'])
   for (n1,_),(n2,_),p1,p2 in zip(chunk,chunk[1:],coords,coords[1:]):
    cost=math.dist(p1,p2)
    if cost<=0:continue
    # Traverse incoming edges from the summit; start-to-summit paths respect
    # explicit pedestrian direction tags. No edge is created across a gap.
    if tags.get('oneway:foot')!='-1':incoming[n2][n1]=(cost,w['id'])
    if tags.get('oneway:foot') not in ('yes','1','true'):incoming[n1][n2]=(cost,w['id'])
    degrees[n1]+=1;degrees[n2]+=1
 print('Retained mountain path sections:',len(sections),'graph nodes:',len(node_xy),flush=True)
 stree=cKDTree(section_mid);nearest_sections=collections.defaultdict(list)
 for si,point in enumerate(section_mid):nearest_sections[int(peak_tree.query(point)[1])].append(si)
 nids=list(node_xy);ntree=cKDTree([node_xy[n] for n in nids]);routes=[]
 poi_xy=[xy([p['lon'],p['lat']]) for p in pois];ptree=cKDTree(poi_xy) if pois else None
 def height(n):
  if n not in node_elev:node_elev[n]=elevation(node_xy[n])
  return node_elev[n]
 directions=[('동쪽','East'),('남쪽','South'),('서쪽','West'),('북쪽','North')]
 for mi,m in enumerate(mountains):
  center=px[mi];m['sectionIds']=sorted(set(stree.query_ball_point(center,m['radiusKm']))|set(nearest_sections[mi]))
  gap,ni=ntree.query(center)
  if gap>.15 or not m['sectionIds']:continue
  root=nids[ni];max_d=min(8,m['radiusKm']*2.5);max_r=m['radiusKm'];distance={root:0};parent={};heap=[(0,root)]
  while heap:
   dist,n=heapq.heappop(heap)
   if distance[n]<dist:continue
   for v,(cost,way_id) in incoming[n].items():
    nd=dist+cost
    if nd>max_d or math.dist(node_xy[v],center)>max_r or nd>=distance.get(v,math.inf):continue
    distance[v]=nd;parent[v]=(n,way_id);heapq.heappush(heap,(nd,v))
  choices={};rh=height(root)
  for n,dist in distance.items():
   if dist<max(.18,min(.6,max_r*.3)) or height(n)>rh-min(20,max(4,rh*.10)):continue
   # Favor actual network endpoints/junctions. Preserve all raw sections even
   # when the graph cannot provide an exploratory summit connection.
   if degrees[n]==2 and len(node_way[n])<2:continue
   dx,dz=node_xy[n][0]-center[0],node_xy[n][1]-center[1];sector=int((math.atan2(dz,dx)+math.pi/4)%(2*math.pi)/(math.pi/2))
   score=(rh-height(n))*.016+dist*.35+(0.15 if degrees[n]==1 else 0)
   if sector not in choices or score>choices[sector][0]:choices[sector]=(score,n)
  seen=set()
  for sector,(_,start) in sorted(choices.items()):
   if start in seen:continue
   seen.add(start);path=[start];wayids=[];n=start
   while n!=root:
    n,way=parent[n];path.append(n);wayids.append(way)
   if len(path)<3:continue
   ko,en=directions[sector];start_name=f'{ko} 접근점';start_en=f'{en} approach'
   if ptree:
    pd,pi=ptree.query(node_xy[start]);tag=pois[pi].get('tags',{})
    if pd<.04 and (tag.get('name') or tag.get('ref')):start_name=tag.get('name') or tag['ref'];start_en=tag.get('name:en') or f'{en} approach'
   end_name=m['name'] if gap<.02 else m['name']+' 인근';end_en=m['en'] if gap<.02 else 'Near '+m['en']
   route={'id':f'r{m["id"]}-{sector}','mountainId':m['id'],'name':f'{start_name} → {end_name}','en':f'{start_en} → {end_en}','startName':start_name,'startEn':start_en,'endName':end_name,'endEn':end_en,'lengthKm':round(distance[start],3),'summitGapM':round(float(gap)*1000,1),'wayIds':list(dict.fromkeys(wayids)),'points':[node_ll[n] for n in path],'kind':'mapped-summit-connection'}
   m['routeIds'].append(len(routes));routes.append(route)
  if mi%100==0:print('Mountains processed:',mi,'connections:',len(routes),flush=True)
 output={'meta':{'version':'1.7','bbox':BBOX,'source':'© OpenStreetMap contributors','sourceUrl':'https://www.openstreetmap.org/copyright','license':'ODbL-1.0','snapshot':raw['osm3s']['timestamp_osm_base'],'retrievedAt':'2026-09-08','sourcePeakCount':len(peaks),'sourceWayCount':sum(e['type']=='way' for e in elements),'mountainCount':len(mountains),'mountainsWithSections':sum(bool(m['sectionIds']) for m in mountains),'sectionCount':len(sections),'connectionCount':len(routes),'coverage':'서울과 근교 · 동경 126.70–127.35°, 북위 37.25–37.85°','method':'Mapped path/footway/steps/track geometry near OSM peaks, filtered by proximity and terrain elevation. Summit connections use shortest connected paths from approach nodes; they are not designated hiking courses. Every section retains its own first and last point. The complete real-world trail inventory and current closures are not guaranteed.','mountainGrouping':'Nearby segments grouped geographically around each peak, with overlapping groups.','excluded':dict(excluded)},'mountains':mountains,'sections':sections,'routes':routes}
 file=ROOT/'dist/data/trails.json';file.write_text(json.dumps(output,ensure_ascii=False,separators=(',',':')))
 print('READY',output['meta'],'bytes',file.stat().st_size,flush=True)
if __name__=='__main__':main()
