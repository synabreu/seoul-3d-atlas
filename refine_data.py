"""Clip geometry to the city plate and drape land cover and water on terrain."""
from geo_utils import *
from PIL import ImageDraw
from scipy.ndimage import maximum_filter

p=OUT/'seoul.json';data=json.loads(p.read_text());t=data['terrain'];bounds=t['bounds']
x0,z0=bounds[0];x1,z1=bounds[1];nx,nz=t['nx'],t['nz'];w=x1-x0;d=z1-z0
def clip_ring(r):
    a=r[:-1] if r[0]==r[-1] else r[:]
    for axis,val,greater in [(0,x0,True),(0,x1,False),(1,z0,True),(1,z1,False)]:
        if not a:return []
        out=[]
        for i,b in enumerate(a):
            prev=a[i-1];bin_=b[axis]>=val if greater else b[axis]<=val;pin=prev[axis]>=val if greater else prev[axis]<=val
            if bin_!=pin:
                frac=(val-prev[axis])/(b[axis]-prev[axis]);out.append([prev[0]+frac*(b[0]-prev[0]),prev[1]+frac*(b[1]-prev[1])])
            if bin_:out.append(b)
        a=out
    if len(a)<3:return []
    a=[[round(v,3) for v in pt] for pt in a]
    return a+[a[0]]
for key in ['water','green']:
    data[key]=[[q for r in item if (q:=clip_ring(r))] for item in data[key]]
    data[key]=[item for item in data[key] if item]
def clip_segment(a,b):
    dx=b[0]-a[0];dz=b[1]-a[1];lo,hi=0,1
    for p,q in [(-dx,a[0]-x0),(dx,x1-a[0]),(-dz,a[1]-z0),(dz,z1-a[1])]:
        if p==0:
            if q<0:return None
        else:
            r=q/p
            if p<0:lo=max(lo,r)
            else:hi=min(hi,r)
    if lo>hi:return None
    return [[round(a[0]+lo*dx,3),round(a[1]+lo*dz,3)],[round(a[0]+hi*dx,3),round(a[1]+hi*dz,3)]]
roads=[]
for cls,bridge,path in data['roads']:
    cur=[]
    for a,b in zip(path,path[1:]):
        seg=clip_segment(a,b)
        if not seg:
            if len(cur)>1:roads.append([cls,bridge,cur])
            cur=[];continue
        if cur and cur[-1]!=seg[0]:
            if len(cur)>1:roads.append([cls,bridge,cur])
            cur=[]
        if not cur:cur.append(seg[0])
        cur.append(seg[1])
    if len(cur)>1:roads.append([cls,bridge,cur])
data['roads']=roads
elev=np.array(t['heights'],dtype=np.float32).reshape(nz+1,nx+1);original=elev.copy()
def pixels(r):return [((a-x0)/w*nx,(b-z0)/d*nz) for a,b in r]
def mask(rings):
    im=Image.new('L',(nx+1,nz+1),0);draw=ImageDraw.Draw(im)
    for r in rings:
        if len(r)>3:draw.polygon(pixels(r),fill=255 if area(r)>0 else 0)
    return np.asarray(im)>0
green=np.zeros_like(elev,dtype=bool)
for rings in data['green']:green|=mask(rings)
water_heights=[]
for rings in data['water']:
    samples=[]
    for r in rings:
        for x,z in r:
            ix=round((x-x0)/w*nx);iz=round((z-z0)/d*nz);samples.append(float(original[min(nz,max(0,iz)),min(nx,max(0,ix))]))
    level=max(2.,float(np.percentile(samples,8)))
    water_heights.append(round(level,2));m=mask(rings)
    # A single extra grid cell closes numerical cracks at shore edges.
    shore=maximum_filter(m,size=3)
    elev[shore]=np.minimum(elev[shore],max(0,level-1.5));green[m]=False
t['heights']=elev.round(1).flatten().tolist();t['green']=green.astype(np.uint8).flatten().tolist();data['waterHeights']=water_heights
# Binary building records are six little-endian float32 values: x,z,w,d,angle,height_m.
buildings=data.pop('buildings');buildings.sort(key=lambda b:(round(b[0],2),round(b[1],2),b[5]))
np.asarray(buildings,dtype='<f4').tofile(OUT/'buildings.bin')
data['meta']['buildingCount']=len(buildings);data['meta']['buildingStride']=6;data['meta']['buildingFile']='buildings.bin'
p.write_text(json.dumps(data,separators=(',',':'),ensure_ascii=False))
print('Refined geometry',len(buildings),'buildings','JSON',p.stat().st_size,'binary',(OUT/'buildings.bin').stat().st_size,flush=True)
