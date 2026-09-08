"""Extend v1.6's terrain while preserving every existing core grid sample.

Run with the primary Python runtime (numpy, scipy and Pillow).
New terrain is sampled from AWS Terrain Tiles; no buildings or roads are invented.
"""
import io,json,math,urllib.request,concurrent.futures,argparse
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter,map_coordinates
ROOT=Path(__file__).parent

def main():
 p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);a=p.parse_args();a.cache.mkdir(parents=True,exist_ok=True)
 file=ROOT/'dist/data/seoul.json';d=json.loads(file.read_text());t=d['terrain'];m=d['meta']
 if m.get('trailTerrainExpansion'):print('Terrain already expanded');return
 target=[126.70,37.25,127.35,37.85];ox,oz=m['origin'];sx,sz=m['sx'],m['sz']
 b=t['bounds'];dx=(b[1][0]-b[0][0])/t['nx'];dz=(b[1][1]-b[0][1])/t['nz']
 left=math.ceil((b[0][0]-(target[0]-ox)*sx)/dx);right=math.ceil(((target[2]-ox)*sx-b[1][0])/dx)
 top=math.ceil((b[0][1]-(oz-target[3])*sz)/dz);bottom=math.ceil(((oz-target[1])*sz-b[1][1])/dz)
 nx=t['nx']+left+right;nz=t['nz']+top+bottom;nb=[[b[0][0]-left*dx,b[0][1]-top*dz],[b[1][0]+right*dx,b[1][1]+bottom*dz]]
 xs=np.linspace(nb[0][0],nb[1][0],nx+1);zs=np.linspace(nb[0][1],nb[1][1],nz+1);lons=xs/sx+ox;lats=oz-zs/sz
 zoom=11;px=(lons+180)/360*2**zoom*256;py=(1-np.arcsinh(np.tan(np.radians(lats)))/math.pi)/2*2**zoom*256
 x0,x1=int(px.min()//256),int(px.max()//256);y0,y1=int(py.min()//256),int(py.max()//256)
 def fetch(v):
  x,y=v;f=a.cache/f'dem-{zoom}-{x}-{y}.png'
  if not f.exists():
   u=f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{zoom}/{x}/{y}.png'
   for attempt in range(3):
    try:
     with urllib.request.urlopen(u,timeout=25) as r:f.write_bytes(r.read())
     break
    except Exception:
     if attempt==2:raise
  ar=np.asarray(Image.open(io.BytesIO(f.read_bytes())).convert('RGB'),dtype=np.float32)
  return x,y,ar[:,:,0]*256+ar[:,:,1]+ar[:,:,2]/256-32768
 dem=np.zeros(((y1-y0+1)*256,(x1-x0+1)*256),dtype=np.float32);tiles=[(x,y) for x in range(x0,x1+1) for y in range(y0,y1+1)]
 print('Loading terrain tiles:',len(tiles),flush=True)
 with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
  for x,y,ar in pool.map(fetch,tiles):dem[(y-y0)*256:(y-y0+1)*256,(x-x0)*256:(x-x0+1)*256]=ar
 dem=gaussian_filter(dem,sigma=1.2);xx,yy=np.meshgrid(px-x0*256,py-y0*256);h=np.maximum(0,map_coordinates(dem,[yy,xx],order=1)).round(1)
 original=np.array(t['heights']).reshape(t['nz']+1,t['nx']+1)
 h[top:top+t['nz']+1,left:left+t['nx']+1]=original
 # Blend the added rim to the untouched v1.6 shoreline samples.
 for pad in range(1,5):
  weight=(5-pad)/5
  for row,src in [(top-pad,top),(top+t['nz']+pad,top+t['nz'])]:
   h[row,left:left+t['nx']+1]=h[row,left:left+t['nx']+1]*(1-weight)+h[src,left:left+t['nx']+1]*weight
  for col,src in [(left-pad,left),(left+t['nx']+pad,left+t['nx'])]:
   h[top:top+t['nz']+1,col]=h[top:top+t['nz']+1,col]*(1-weight)+h[top:top+t['nz']+1,src]*weight
 green=np.zeros_like(h,dtype=np.uint8)
 if t.get('green'):green[top:top+t['nz']+1,left:left+t['nx']+1]=np.array(t['green']).reshape(original.shape)
 m['trailTerrainExpansion']={'originalBounds':b,'originalBbox':m['bbox'],'coreGridOffset':[left,top],'coreGridSize':[t['nx'],t['nz']],'terrainSource':'AWS Terrain Tiles / Mapzen','coverage':'Seoul and surrounding mountains; outer area contains terrain and trails only'}
 m['bbox']=[float(lons[0]),float(lats[-1]),float(lons[-1]),float(lats[0])]
 t.update(nx=nx,nz=nz,bounds=nb,heights=[round(float(v),1) for v in h.ravel()],green=green.ravel().tolist())
 for j in range(original.shape[0]):
  begin=(top+j)*(nx+1)+left;t['heights'][begin:begin+original.shape[1]]=original[j].tolist()
 file.write_text(json.dumps(d,ensure_ascii=False,separators=(',',':')))
 print('Extended grid:',nx,nz,'bbox:',m['bbox'],'core samples preserved:',bool(np.array_equal(np.array(t['heights']).reshape(nz+1,nx+1)[top:top+original.shape[0],left:left+original.shape[1]],original)),flush=True)
if __name__=='__main__':main()
