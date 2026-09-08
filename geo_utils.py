"""Build a bounded, self-contained Seoul scene from public geographic data.

Vector source: OpenFreeMap / OpenMapTiles / OpenStreetMap (ODbL).
Elevation: AWS Terrain Tiles (Mapzen Terrarium; source attribution in UI).
District boundaries: southkorea/seoul-maps, KOSTAT 2013 (historical).
"""
import concurrent.futures, io, json, math, struct, time, urllib.request, tempfile
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, map_coordinates

ROOT = Path(__file__).parent
CACHE = Path(tempfile.gettempdir()) / 'seoul-3d-atlas-cache'
CACHE.mkdir(exist_ok=True)
OUT = ROOT / 'dist' / 'data'
OUT.mkdir(exist_ok=True)
LON, LAT = 126.97, 37.56
SX, SZ = 111.32 * math.cos(math.radians(LAT)), 111.32
BBOX = [126.735, 37.40, 127.205, 37.72]

def fetch(url, filename):
    p = CACHE / filename
    if p.exists(): return p.read_bytes()
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=25) as r: data = r.read()
            p.write_bytes(data)
            return data
        except Exception:
            if attempt == 2: raise

def varint(data, i):
    value = shift = 0
    while True:
        b = data[i]; i += 1; value |= (b & 127) << shift
        if b < 128: return value, i
        shift += 7

def fields(data):
    i = 0
    while i < len(data):
        tag, i = varint(data, i); wire = tag & 7; field = tag >> 3
        if wire == 0: value, i = varint(data, i)
        elif wire == 2:
            size, i = varint(data, i); value = data[i:i+size]; i += size
        elif wire == 1: value = data[i:i+8]; i += 8
        elif wire == 5: value = data[i:i+4]; i += 4
        else: raise ValueError(wire)
        yield field, value

def packed(data):
    out = []; i = 0
    while i < len(data): v, i = varint(data, i); out.append(v)
    return out

def prop(data):
    for f, v in fields(data):
        if f == 1: return v.decode()
        if f == 2: return struct.unpack('<f', v)[0]
        if f == 3: return struct.unpack('<d', v)[0]
        if f == 6: return (v >> 1) ^ -(v & 1)
        if f == 7: return bool(v)
        return v

def decode(data):
    for f, layer in fields(data):
        if f != 3: continue
        lf = list(fields(layer)); name = next(v.decode() for k, v in lf if k == 1)
        if name not in ('water', 'waterway', 'landcover', 'landuse', 'transportation', 'building'): continue
        keys = [v.decode() for k, v in lf if k == 3]
        values = [prop(v) for k, v in lf if k == 4]
        extent = next((v for k, v in lf if k == 5), 4096)
        for k, v in lf:
            if k != 2: continue
            ff = dict(fields(v)); tags = packed(ff.get(2, b''))
            properties = {keys[tags[i]]: values[tags[i+1]] for i in range(0, len(tags), 2)}
            commands = packed(ff.get(4, b'')); rings = []; ring = []; x = y = i = 0
            while i < len(commands):
                c = commands[i]; i += 1; cmd, count = c & 7, c >> 3
                if cmd == 7:
                    if ring and ring[-1] != ring[0]: ring.append(ring[0])
                    continue
                for _ in range(count):
                    if cmd == 1 and ring: rings.append(ring); ring = []
                    dx, dy = commands[i:i+2]; i += 2
                    x += (dx >> 1) ^ -(dx & 1); y += (dy >> 1) ^ -(dy & 1)
                    ring.append([x, y])
            if ring: rings.append(ring)
            yield name, properties, rings, extent, ff.get(1)

def xy(lon, lat): return [round((lon-LON)*SX, 3), round((LAT-lat)*SZ, 3)]
def tilexy(lon, lat, z):
    n = 2**z
    return (lon+180)/360*n, (1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*n
def world(pt, tx, ty, extent, z=13):
    a, b = tx + pt[0]/extent, ty + pt[1]/extent
    return xy(a/2**z*360-180, math.degrees(math.atan(math.sinh(math.pi*(1-2*b/2**z)))))
def area(r): return sum(r[i][0]*r[i+1][1]-r[i+1][0]*r[i][1] for i in range(len(r)-1))/2


VECTOR_TEMPLATE = 'https://tiles.openfreemap.org/planet/20260830_080001_pt/{z}/{x}/{y}.pbf'
