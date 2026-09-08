"""Reveal the two Yeouido channels in the existing miniature map.

Run after refine_yeouido.py. This is a display-only shoreline adjustment;
the three landmark models retain their coordinates and a dry foundation.
"""
import json
from pathlib import Path

import contourpy
import numpy as np
from matplotlib.path import Path as PolygonPath
from scipy.ndimage import distance_transform_edt, label

from refine_yeouido import area, simplify_ring

ROOT = Path(__file__).parent
DATA_PATH = ROOT / 'dist/data/seoul.json'
BUILDING_PATH = ROOT / 'dist/data/buildings.bin'
STEP = .005
SHORE_INSET = .120
LANDMARK_CLEARANCE = .100
REVISION = 2


def main():
    data = json.loads(DATA_PATH.read_text())
    meta = data['meta']
    adjustment = meta['yeouidoWater']
    if adjustment.get('visibilityRevision', 1) >= REVISION:
        print('Yeouido channel visibility correction is already present.')
        return

    def world(lon, lat):
        return np.array([(lon-meta['origin'][0])*meta['sx'],
                         (meta['origin'][1]-lat)*meta['sz']])

    center = world(126.9243, 37.5215)
    matches = [(i, j) for i in adjustment['waterFeatureIndices']
               for j, ring in enumerate(data['water'][i])
               if area(ring) < 0 and PolygonPath(ring).contains_point(center)]
    assert len(matches) == 1, 'Expected one Yeouido island hole.'
    feature_index, ring_index = matches[0]
    original = np.array(data['water'][feature_index][ring_index])
    low = np.floor((original.min(axis=0)-.02)/STEP)*STEP
    high = np.ceil((original.max(axis=0)+.02)/STEP)*STEP
    xs = np.arange(low[0], high[0]+STEP, STEP)
    zs = np.arange(low[1], high[1]+STEP, STEP)
    xx, zz = np.meshgrid(xs, zs)
    samples = np.column_stack((xx.ravel(), zz.ravel()))
    island = PolygonPath(original).contains_points(samples).reshape(xx.shape)
    visible_land = distance_transform_edt(island, sampling=STEP) > SHORE_INSET
    # Preserve the existing Park One, IFC and 63 Building models on land.
    for ll in [(126.9279, 37.525), (126.924, 37.525), (126.9394, 37.5194)]:
        position = world(*ll)
        protected = ((xx-position[0])**2+(zz-position[1])**2) <= LANDMARK_CLEARANCE**2
        visible_land |= island & protected
    _, components = label(visible_land)
    assert components == 1, 'The display island must remain connected.'
    vertices, offsets = contourpy.contour_generator(
        x=xs, y=zs, z=visible_land.astype(float), fill_type='OuterOffset'
    ).filled(.5, 1.5)
    assert len(vertices) == 1 and len(offsets[0]) == 2
    shoreline = simplify_ring(vertices[0])
    if area(shoreline) > 0:
        shoreline.reverse()
    display_area = abs(area(shoreline))
    assert 2.3 < display_area < 2.8
    data['water'][feature_index][ring_index] = shoreline

    # Lower every corner of every terrain cell beneath the newly exposed water.
    # A 150 m elevation grid otherwise bridges over the smaller shoreline strip.
    new_water = island & ~visible_land
    terrain = data['terrain']
    terrain_low, terrain_high = np.array(terrain['bounds'])
    grid_step = (terrain_high-terrain_low)/[terrain['nx'], terrain['nz']]
    cells = np.floor((samples[new_water.ravel()]-terrain_low)/grid_step).astype(int)
    cut = np.zeros((terrain['nz']+1, terrain['nx']+1), dtype=bool)
    for dc, dr in [(0, 0), (1, 0), (0, 1), (1, 1)]:
        cut[cells[:, 1]+dr, cells[:, 0]+dc] = True
    water_level = data['waterHeights'][feature_index]
    heights = np.array(terrain['heights']).reshape(cut.shape)
    heights[cut] = np.minimum(heights[cut], water_level-1.5)
    terrain['heights'] = heights.round(1).ravel().tolist()
    green = np.array(terrain['green']).reshape(cut.shape)
    green[cut] = 0
    terrain['green'] = green.ravel().tolist()

    # Clear building footprints that cover the exposed water, including masses
    # whose centers are on land but whose corners extend across the shoreline.
    buildings = np.fromfile(BUILDING_PATH, dtype='<f4').reshape(-1, 6)
    radius = np.hypot(buildings[:, 2], buildings[:, 3])*.5
    nearby = np.all((buildings[:, :2]+radius[:, None] >= low) &
                    (buildings[:, :2]-radius[:, None] <= high), axis=1)
    indices = np.flatnonzero(nearby)
    rows = buildings[indices]
    offsets = np.array([(x, z) for x in [-.5, 0, .5] for z in [-.5, 0, .5]])
    dx = rows[:, 2, None]*offsets[None, :, 0]
    dz = rows[:, 3, None]*offsets[None, :, 1]
    cosine, sine = np.cos(rows[:, 4, None]), np.sin(rows[:, 4, None])
    footprint = np.stack((rows[:, 0, None]+cosine*dx-sine*dz,
                          rows[:, 1, None]+sine*dx+cosine*dz), axis=-1)
    points = footprint.reshape(-1, 2)
    rings = data['water'][feature_index]
    wet = PolygonPath(rings[0]).contains_points(points)
    for hole in rings[1:]:
        wet &= ~PolygonPath(hole).contains_points(points)
    retained = np.ones(len(buildings), dtype=bool)
    retained[indices[wet.reshape(len(rows), -1).any(axis=1)]] = False
    removed = int(np.sum(~retained))
    buildings[retained].tofile(BUILDING_PATH)
    meta['buildingCount'] = int(np.sum(retained))
    adjustment.update({
        'visibilityRevision': REVISION,
        'additionalIslandShoreInsetM': round(SHORE_INSET*1000),
        'landmarkClearanceM': round(LANDMARK_CLEARANCE*1000),
        'islandDisplayAreaKm2': round(display_area, 3),
    })
    DATA_PATH.write_text(json.dumps(data, separators=(',', ':'), ensure_ascii=False))
    print(json.dumps({'islandDisplayAreaKm2': round(display_area, 3),
                      'newlyVisibleWaterKm2': round(abs(area(original))-display_area, 3),
                      'buildingMassesCoveringWaterRemoved': removed}))


if __name__ == '__main__':
    main()
