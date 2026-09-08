"""Upgrade building massing with the complete zoom-14 source over the scene."""
from geo_utils import *

z=14
tx0,ty0=map(int,tilexy(BBOX[0],BBOX[3],z));tx1,ty1=map(int,tilexy(BBOX[2],BBOX[1],z))
tiles=[(x,y) for x in range(tx0,tx1+1) for y in range(ty0,ty1+1)]
planet=VECTOR_TEMPLATE
def load(t):
    x,y=t
    raw=fetch(planet.replace('{z}',str(z)).replace('{x}',str(x)).replace('{y}',str(y)),f'vector-{z}-{x}-{y}.pbf')
    return x,y,raw
scene=json.loads((OUT/'seoul.json').read_text()); bounds=scene['terrain']['bounds']
records=[];seen=set();completed=0
print('Detailed building tiles',len(tiles),flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
    futures=[pool.submit(load,t) for t in tiles]
    for future in concurrent.futures.as_completed(futures):
        tx,ty,raw=future.result();completed+=1
        for layer,props,rings,extent,fid in decode(raw):
            if layer!='building':continue
            for ring in rings:
                if len(ring)<4 or area(ring)<3:continue
                r=[world(p,tx,ty,extent,z=z) for p in ring[:-1]]
                edge=max(zip(r,r[1:]+r[:1]),key=lambda e:(e[1][0]-e[0][0])**2+(e[1][1]-e[0][1])**2)
                a=math.atan2(edge[1][1]-edge[0][1],edge[1][0]-edge[0][0]);c,s=math.cos(a),math.sin(a)
                u=[p[0]*c+p[1]*s for p in r];v=[-p[0]*s+p[1]*c for p in r]
                uc,vc=(max(u)+min(u))/2,(max(v)+min(v))/2;x,y=uc*c-vc*s,uc*s+vc*c
                w,d=max(u)-min(u),max(v)-min(v)
                if w<.005 or d<.005 or w>1 or d>1:continue
                if not(bounds[0][0]+.03<x<bounds[1][0]-.03 and bounds[0][1]+.03<y<bounds[1][1]-.03):continue
                key=(round(x,3),round(y,3),round(w,3),round(d,3))
                if key in seen:continue
                seen.add(key);h=props.get('render_height',6) or 6
                records.append([round(x,3),round(y,3),round(w,3),round(d,3),round(a,3),round(min(max(h,3),555),1)])
        if completed%60==0:print('Processed',completed,'/',len(tiles),'buildings',len(records),flush=True)
scene['buildings']=records;scene['meta']['buildingZoom']=14
(OUT/'seoul.json').write_text(json.dumps(scene,separators=(',',':'),ensure_ascii=False))
print('DETAILED READY',len(records),'height max',max(r[5] for r in records),'bytes',(OUT/'seoul.json').stat().st_size,flush=True)
