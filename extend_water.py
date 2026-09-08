"""Extend mapped water into the new terrain rim without changing core geometry.
Requires numpy, scipy, Pillow and shapely. Uses the existing OSM vector snapshot.
"""
import json,math,argparse,concurrent.futures,urllib.request
from pathlib import Path
import numpy as np
from scipy.ndimage import map_coordinates
from shapely.geometry import Polygon,box
from shapely.ops import unary_union
from shapely.geometry.polygon import orient
import shapely
from geo_utils import decode,tilexy,world,area,VECTOR_TEMPLATE
ROOT=Path(__file__).parent

def polygons(g):
 if g.is_empty:return []
 if g.geom_type=='Polygon':return[g]
 return[p for c in g.geoms for p in polygons(c)] if hasattr(g,'geoms') else []
def sourcepolys(rings):
 out=[];group=[]
 for r in rings:
  if area(r)>0 or not group:
   if group:out.extend(polygons(Polygon(group[0],group[1:]).buffer(0)))
   group=[r]
  else:group.append(r)
 if group:out.extend(polygons(Polygon(group[0],group[1:]).buffer(0)))
 return out

def main():
 p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);a=p.parse_args();a.cache.mkdir(exist_ok=True,parents=True)
 f=ROOT/'dist/data/seoul.json';d=json.loads(f.read_text());t=d['terrain'];m=d['meta']
 if m.get('trailOuterWater'):print('Outer water already present');return
 low,high=np.array(t['bounds']);oldlow,oldhigh=np.array(m['trailTerrainExpansion']['originalBounds']);rim=box(*[low[0],low[1],high[0],high[1]]).difference(box(oldlow[0],oldlow[1],oldhigh[0],oldhigh[1]))
 bbox=m['bbox'];zoom=12;x0,y0=map(int,tilexy(bbox[0],bbox[3],zoom));x1,y1=map(int,tilexy(bbox[2],bbox[1],zoom));tiles=[(x,y) for x in range(x0,x1+1) for y in range(y0,y1+1)]
 def fetch(v):
  x,y=v;cache=a.cache/f'water-{zoom}-{x}-{y}.pbf'
  if not cache.exists():
   u=VECTOR_TEMPLATE.replace('{z}',str(zoom)).replace('{x}',str(x)).replace('{y}',str(y))
   for attempt in range(3):
    try:
     with urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'}),timeout=25) as r:cache.write_bytes(r.read())
     break
    except Exception:
     if attempt==2:raise
  out=[]
  for layer,props,rings,extent,fid in decode(cache.read_bytes()):
   if layer!='water' or props.get('intermittent')==1:continue
   converted=[[world(p,x,y,extent,zoom) for p in r] for r in rings if len(r)>=4]
   for poly in sourcepolys(converted):out.extend(polygons(poly.intersection(rim)))
  return out
 print('Fetching outer water tiles:',len(tiles),flush=True);parts=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
  for subset in pool.map(fetch,tiles):parts.extend(subset)
 # Union removes tile-buffer duplicates while retaining islands and shorelines.
 newpolys=[p for p in polygons(unary_union(parts)) if p.area>.00005]
 h=np.array(t['heights']).reshape(t['nz']+1,t['nx']+1);step=(high-low)/[t['nx'],t['nz']];xs=np.linspace(low[0],high[0],t['nx']+1);zs=np.linspace(low[1],high[1],t['nz']+1);xx,zz=np.meshgrid(xs,zs)
 core=(xx>=oldlow[0]-1e-8)&(xx<=oldhigh[0]+1e-8)&(zz>=oldlow[1]-1e-8)&(zz<=oldhigh[1]+1e-8)
 oldpolys=[(i,p) for i,r in enumerate(d['water']) for p in sourcepolys(r)];original_count=len(d['water']);blue=set(m['lowerHangangWater']['waterFeatureIndices']);addedblue=[]
 for poly in newpolys:
  nearby=[i for i,p in oldpolys if p.distance(poly)<.006]
  wet=shapely.contains_xy(poly.buffer(float(np.hypot(*step))*.7),xx,zz)&~core
  values=h[wet]
  level=min(d['waterHeights'][i] for i in nearby) if nearby else max(0,float(np.percentile(values,10)) if values.size else 0)
  h[wet]=np.minimum(h[wet],max(0,level-1.5))
  rings=[];poly=orient(poly,sign=1)
  for ring in [poly.exterior,*poly.interiors]:rings.append([[round(x,6),round(z,6)] for x,z in ring.coords])
  index=len(d['water']);d['water'].append(rings);d['waterHeights'].append(round(level,3))
  if any(i in blue for i in nearby):addedblue.append(index)
 t['heights']=h.ravel().tolist();m['lowerHangangWater']['waterFeatureIndices'].extend(addedblue);m['lowerHangangWater']['extent']='Lower Han River north of Gimpo Airport to the expanded western map boundary'
 m['trailOuterWater']={'source':'OpenFreeMap / OpenStreetMap','snapshot':'2026-08-30','addedWaterFeatures':len(newpolys),'originalWaterCount':original_count,'blueExtensionFeatures':addedblue,'coreWaterGeometryPreserved':True}
 f.write_text(json.dumps(d,ensure_ascii=False,separators=(',',':')));print('Added outer water:',len(newpolys),'blue extensions:',len(addedblue),flush=True)
if __name__=='__main__':main()
