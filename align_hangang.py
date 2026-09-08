"""Align the Yeouido water surface with the adjoining Han River tiles.

Run after reveal_yeouido.py. Keep the island holes and existing shorelines;
snap only the sub-5 m raster seams to the adjoining source river edges.
"""
import json
from pathlib import Path

import numpy as np
from matplotlib.path import Path as PolygonPath

from refine_yeouido import area

ROOT = Path(__file__).parent
DATA_PATH = ROOT / 'dist/data/seoul.json'
BUILDING_PATH = ROOT / 'dist/data/buildings.bin'
REVISION = 1
MAX_SEAM_GAP = .005


def water_mask(points, features):
    wet = np.zeros(len(points), dtype=bool)
    for rings in features:
        polygon = np.zeros(len(points), dtype=bool)
        for ring in rings:
            hit = PolygonPath(ring).contains_points(points)
            if area(ring) > 0:
                wet |= polygon
                polygon = hit
            else:
                polygon &= ~hit
        wet |= polygon
    return wet


def main():
    data = json.loads(DATA_PATH.read_text())
    meta = data['meta']
    if meta.get('hangangWater', {}).get('revision', 0) >= REVISION:
        print('Han River surface alignment is already present.')
        return
    adjustment = meta['yeouidoWater']
    assert adjustment.get('visibilityRevision') == 2
    center_ids = adjustment['waterFeatureIndices']
    assert len(center_ids) == 1
    center_id = center_ids[0]
    center = np.array(data['water'][center_id][0])
    low, high = center.min(0)-.2, center.max(0)+.2
    # Select the two large source river tiles meeting the corrected surface.
    neighbours = []
    for i, rings in enumerate(data['water']):
        if i in center_ids or sum(area(r) for r in rings) < 1:
            continue
        points = np.concatenate(rings)
        if np.all(points.max(0) >= low) and np.all(points.min(0) <= high):
            neighbours.append(i)
    assert len(neighbours) == 2, 'Expected the two adjoining Han River tiles.'

    starts = np.concatenate([np.array(data['water'][i][0][:-1]) for i in neighbours])
    ends = np.concatenate([np.array(data['water'][i][0][1:]) for i in neighbours])
    delta = ends-starts
    length2 = np.sum(delta*delta, axis=1)
    # Only shared straight tile cuts are seams. Projecting onto curved banks
    # can fold several raster vertices onto the same short shoreline segment.
    valid = (length2 > .03**2) & np.any(np.abs(delta) < 1e-9, axis=1)
    starts, delta, length2 = starts[valid], delta[valid], length2[valid]
    fractions = np.clip(np.einsum('ijk,jk->ij', center[:, None, :]-starts, delta)/length2, 0, 1)
    closest = starts+fractions[:, :, None]*delta
    distances = np.linalg.norm(center[:, None, :]-closest, axis=2)
    nearest = np.argmin(distances, axis=1)
    gaps = distances[np.arange(len(center)), nearest]
    snap = gaps <= MAX_SEAM_GAP
    center[snap] = closest[np.flatnonzero(snap), nearest[snap]]
    shoreline = []
    for point in center.round(6).tolist():
        if not shoreline or point != shoreline[-1]:
            shoreline.append(point)
    if shoreline[0] != shoreline[-1]:
        shoreline.append(shoreline[0])
    assert abs(area(shoreline)-area(data['water'][center_id][0])) < .02
    data['water'][center_id][0] = shoreline

    indices = neighbours+center_ids
    level = adjustment['displayWaterLevelM']
    for i in indices:
        data['waterHeights'][i] = level
    features = [data['water'][i] for i in indices]

    # Keep the coarse terrain beneath the now continuous water surface.
    terrain = data['terrain']
    t_low, t_high = np.array(terrain['bounds'])
    step = (t_high-t_low)/[terrain['nx'], terrain['nz']]
    points = np.concatenate([r for f in features for r in f])
    low, high = points.min(0), points.max(0)
    xs = np.arange(low[0], high[0]+.005, .005)
    zs = np.arange(low[1], high[1]+.005, .005)
    xx, zz = np.meshgrid(xs, zs)
    samples = np.column_stack((xx.ravel(), zz.ravel()))
    cells = np.floor((samples[water_mask(samples, features)]-t_low)/step).astype(int)
    cut = np.zeros((terrain['nz']+1, terrain['nx']+1), dtype=bool)
    for dc, dr in [(0, 0), (1, 0), (0, 1), (1, 1)]:
        cut[cells[:, 1]+dr, cells[:, 0]+dc] = True
    heights = np.array(terrain['heights']).reshape(cut.shape)
    heights[cut] = np.minimum(heights[cut], level-1.5)
    terrain['heights'] = heights.round(1).ravel().tolist()
    green = np.array(terrain['green']).reshape(cut.shape)
    green[cut] = 0
    terrain['green'] = green.ravel().tolist()

    # Check footprint centers, corners and edge midpoints on both river joins.
    buildings = np.fromfile(BUILDING_PATH, dtype='<f4').reshape(-1, 6)
    radius = np.hypot(buildings[:, 2], buildings[:, 3])*.5
    near = np.all((buildings[:, :2]+radius[:, None] >= low) &
                  (buildings[:, :2]-radius[:, None] <= high), axis=1)
    candidates = np.flatnonzero(near)
    rows = buildings[candidates]
    offsets = np.array([(x, z) for x in [-.5, 0, .5] for z in [-.5, 0, .5]])
    dx = rows[:, 2, None]*offsets[None, :, 0]
    dz = rows[:, 3, None]*offsets[None, :, 1]
    cosine, sine = np.cos(rows[:, 4, None]), np.sin(rows[:, 4, None])
    footprint = np.stack((rows[:, 0, None]+cosine*dx-sine*dz,
                          rows[:, 1, None]+sine*dx+cosine*dz), axis=-1)
    wet = water_mask(footprint.reshape(-1, 2), features).reshape(len(rows), -1).any(axis=1)
    retained = np.ones(len(buildings), dtype=bool)
    retained[candidates[wet]] = False
    removed = int(np.sum(~retained))
    buildings[retained].tofile(BUILDING_PATH)
    meta['buildingCount'] = int(np.sum(retained))
    meta['hangangWater'] = {
        'revision': REVISION,
        'waterFeatureIndices': indices,
        'displayWaterLevelM': level,
        'maxSeamAlignmentM': MAX_SEAM_GAP*1000,
        'label': '한강 물길',
        'labelCoordinates': [126.934, 37.531],
    }
    DATA_PATH.write_text(json.dumps(data, separators=(',', ':'), ensure_ascii=False))
    print(json.dumps({'alignedRiverTiles': indices, 'alignedShoreVertices': int(snap.sum()),
                      'removedBuildingMasses': removed, 'displayWaterLevelM': level}))


if __name__ == '__main__':
    main()
