from geo_utils import *

tx0, ty0 = map(int, tilexy(BBOX[0], BBOX[3], 13))
tx1, ty1 = map(int, tilexy(BBOX[2], BBOX[1], 13))
tiles = [(x, y) for x in range(tx0, tx1+1) for y in range(ty0, ty1+1)]
planet = VECTOR_TEMPLATE
def load_tile(t):
    x,y=t
    return x,y,fetch(planet.replace('{z}','13').replace('{x}',str(x)).replace('{y}',str(y)),f'vector-13-{x}-{y}.pbf')

print(f'Fetching {len(tiles)} vector tiles', flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool: raw = list(pool.map(load_tile, tiles))
print('Vector tiles ready', flush=True)
data = {'water': [], 'green': [], 'roads': [], 'buildings': []}
seen = set()
for tx, ty, rawtile in raw:
    for layer, props, rings, extent, fid in decode(rawtile):
        cls = props.get('class', '')
        if layer == 'building':
            for ring in rings:
                if len(ring) < 4 or area(ring) < 3: continue
                r = [world(p, tx, ty, extent) for p in ring[:-1]]
                edge = max(zip(r, r[1:]+r[:1]), key=lambda e:(e[1][0]-e[0][0])**2+(e[1][1]-e[0][1])**2)
                ang = math.atan2(edge[1][1]-edge[0][1], edge[1][0]-edge[0][0]); c, s = math.cos(ang), math.sin(ang)
                u = [p[0]*c+p[1]*s for p in r]; v = [-p[0]*s+p[1]*c for p in r]
                uc, vc = (max(u)+min(u))/2, (max(v)+min(v))/2
                cx, cz = uc*c-vc*s, uc*s+vc*c
                w,d = max(u)-min(u), max(v)-min(v)
                if w < .004 or d < .004 or w > 1 or d > 1: continue
                key = (round(cx,2),round(cz,2),round(w,2),round(d,2))
                if key in seen: continue
                seen.add(key)
                h = props.get('render_height', 6) or 6
                data['buildings'].append([round(cx,3),round(cz,3),round(w,3),round(d,3),round(ang,3),round(min(max(h,4),555),1)])
        elif layer == 'water':
            if props.get('intermittent') == 1: continue
            converted = [[world(p,tx,ty,extent) for p in r] for r in rings if len(r)>=4]
            if converted: data['water'].append(converted)
        elif layer in ('landcover','landuse') and cls in ('wood','forest','grass','park','cemetery'):
            converted = [[world(p,tx,ty,extent) for p in r] for r in rings if len(r)>=4]
            if converted: data['green'].append(converted)
        elif layer == 'transportation' and cls in ('motorway','trunk','primary','secondary','tertiary','rail'):
            for r in rings:
                if len(r)<2: continue
                data['roads'].append([cls, int(props.get('brunnel')=='bridge'),[world(p,tx,ty,extent) for p in r]])

# A uniform elevation grid aligned to the vector geometry.
Z = 12
dx0,dy0 = map(int,tilexy(BBOX[0],BBOX[3],Z)); dx1,dy1=map(int,tilexy(BBOX[2],BBOX[1],Z))
demtiles=[(x,y) for x in range(dx0,dx1+1) for y in range(dy0,dy1+1)]
def load_dem(t):
    x,y=t; raw=fetch(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{x}/{y}.png',f'dem-{Z}-{x}-{y}.png')
    a=np.asarray(Image.open(io.BytesIO(raw)).convert('RGB'),dtype=np.float32)
    return x,y,a[:,:,0]*256+a[:,:,1]+a[:,:,2]/256-32768
dem=np.zeros(((dy1-dy0+1)*256,(dx1-dx0+1)*256),dtype=np.float32)
print(f'Fetching {len(demtiles)} elevation tiles',flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    for x,y,a in pool.map(load_dem,demtiles):dem[(y-dy0)*256:(y-dy0+1)*256,(x-dx0)*256:(x-dx0+1)*256]=a
dem=gaussian_filter(dem,sigma=2.4)
nx,nz=280,240
lons=np.linspace(BBOX[0],BBOX[2],nx+1); lats=np.linspace(BBOX[3],BBOX[1],nz+1)
px=(lons+180)/360*2**Z*256-dx0*256
py=(1-np.arcsinh(np.tan(np.radians(lats)))/math.pi)/2*2**Z*256-dy0*256
xx,yy=np.meshgrid(px,py)
elev=np.maximum(0,map_coordinates(dem,[yy,xx],order=1)).round(1)
data['terrain']={'nx':nx,'nz':nz,'bounds':[xy(BBOX[0],BBOX[3]),xy(BBOX[2],BBOX[1])],'heights':elev.flatten().tolist()}
boundary=json.loads(fetch('https://raw.githubusercontent.com/southkorea/seoul-maps/master/kostat/2013/json/seoul_municipalities_geo_simple.json','seoul-boundary.json'))
data['districts']=[]
for feature in boundary['features']:
    geom=feature['geometry']; polys=[geom['coordinates']] if geom['type']=='Polygon' else geom['coordinates']
    data['districts'].append({'name':feature['properties']['name'],'en':feature['properties']['name_eng'],'rings':[[xy(*p) for p in poly[0]] for poly in polys]})
data['meta']={'origin':[LON,LAT],'sx':SX,'sz':SZ,'bbox':BBOX,'heightExaggeration':4,'buildings':'Simplified oriented masses from OSM footprints; render_height is source-provided and may be estimated.','districtBoundaryYear':2013,'vectorSnapshot':'2026-08-30','terrainSource':'AWS Terrain Tiles / Mapzen'}
(OUT/'seoul.json').write_text(json.dumps(data,separators=(',',':'),ensure_ascii=False))
print('READY', {k:len(v) for k,v in data.items() if isinstance(v,list)}, 'bytes', (OUT/'seoul.json').stat().st_size,flush=True)
