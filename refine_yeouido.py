"""v1.1 display correction for Yeouido and its two surrounding river channels.

Run after refine_data.py. Uses the retained 2026-08-30 source water geometry;
the small shoreline inset and wider Saetgang are cartographic exaggerations.
No geographic scaling or relocation is applied to buildings or destinations.
"""
import json
from pathlib import Path

import contourpy
import numpy as np
from matplotlib.path import Path as PolygonPath
from scipy.ndimage import distance_transform_edt, label

ROOT = Path(__file__).parent
DATA_PATH = ROOT / 'dist/data/seoul.json'
BUILDING_PATH = ROOT / 'dist/data/buildings.bin'
STEP = .005  # kilometres, 5 m shoreline sampling
SAETGANG_BANK = .060
ISLAND_INSET = .050
WATER_LEVEL = 6.0
SOURCE_IDS = (309, 314, 315, 375, 376, 377)
SAETGANG_IDS = (314, 315, 376, 377)


def area(ring):
    return sum(a[0]*b[1]-b[0]*a[1] for a, b in zip(ring, ring[1:])) / 2


def simplify_open(points, tolerance=.002):
    """Ramer-Douglas-Peucker with a maximum 2 m displacement."""
    if len(points) <= 2:
        return points
    delta = points[-1] - points[0]
    length2 = np.dot(delta, delta)
    if length2 == 0:
        distances = np.linalg.norm(points - points[0], axis=1)
    else:
        fractions = np.clip((points-points[0]) @ delta / length2, 0, 1)
        distances = np.linalg.norm(points-points[0]-fractions[:, None]*delta, axis=1)
    farthest = int(np.argmax(distances))
    if distances[farthest] <= tolerance:
        return points[[0, -1]]
    return np.concatenate((simplify_open(points[:farthest+1])[:-1],
                           simplify_open(points[farthest:])))


def simplify_ring(points):
    farthest = int(np.argmax(np.linalg.norm(points-points[0], axis=1)))
    ring = np.concatenate((simplify_open(points[:farthest+1])[:-1],
                           simplify_open(points[farthest:])))
    return ring.round(4).tolist()


def main():
    data = json.loads(DATA_PATH.read_text())
    if data['meta'].get('yeouidoWater'):
        print('Yeouido v1.1 correction is already present; no changes made.')
        return
    assert data['meta']['vectorSnapshot'] == '2026-08-30'
    expected = ([108, 10], [45], [16], [147, 88, 38], [91], [16, 8])
    assert [list(map(len, data['water'][i])) for i in SOURCE_IDS] == list(expected), \
        'Source water geometry changed; reselect the Yeouido source features.'

    points = np.concatenate([r for i in SOURCE_IDS for r in data['water'][i]])
    low = np.floor((points.min(axis=0)-.15)/STEP)*STEP
    high = np.ceil((points.max(axis=0)+.15)/STEP)*STEP
    xs = np.arange(low[0], high[0]+STEP, STEP)
    zs = np.arange(low[1], high[1]+STEP, STEP)
    xx, zz = np.meshgrid(xs, zs)
    samples = np.column_stack((xx.ravel(), zz.ravel()))
    water = np.zeros(xx.size, dtype=bool)
    saetgang = water.copy()
    for i in SOURCE_IDS:
        # Match the viewer's multipolygon grouping: each positive ring begins
        # an outer polygon, followed by its negative holes.
        feature = np.zeros(xx.size, dtype=bool)
        polygon = feature.copy()
        for ring in data['water'][i]:
            inside = PolygonPath(ring).contains_points(samples)
            if area(ring) > 0:
                feature |= polygon
                polygon = inside
            else:
                polygon &= ~inside
        feature |= polygon
        water |= feature
        if i in SAETGANG_IDS:
            saetgang |= feature
    water = water.reshape(xx.shape)
    saetgang = saetgang.reshape(xx.shape)
    expanded = distance_transform_edt(~saetgang, sampling=STEP) <= SAETGANG_BANK

    meta = data['meta']
    seed = np.array([(126.925-meta['origin'][0])*meta['sx'],
                     (meta['origin'][1]-37.524)*meta['sz']])
    column, row = np.rint((seed-low)/STEP).astype(int)
    components, _ = label(~(water | expanded))
    island_id = components[row, column]
    edges = np.concatenate((components[0], components[-1], components[:, 0], components[:, -1]))
    assert island_id and not np.any(edges == island_id), 'The island must be separated by connected channels.'
    island = components == island_id
    inset = island & (distance_transform_edt(island, sampling=STEP) <= ISLAND_INSET)
    corrected = water | expanded | inset
    assert 2.5 < np.sum(island & ~inset)*STEP**2 < 4.5

    # OuterOffset preserves island holes, including Bamseom. Keep a single
    # water surface across the old tile boundaries so there are no level steps.
    vertices, offsets = contourpy.contour_generator(
        x=xs, y=zs, z=corrected.astype(float), fill_type='OuterOffset'
    ).filled(.5, 1.5)
    new_water = []
    for vertices_, offsets_ in zip(vertices, offsets):
        rings = []
        for a, b in zip(offsets_, offsets_[1:]):
            ring = simplify_ring(vertices_[a:b])
            if len(ring) < 4 or abs(area(ring)) < 1e-6:
                continue
            # Positive exteriors and negative holes are the viewer contract.
            if (area(ring) > 0) != (not rings):
                ring.reverse()
            rings.append(ring)
        if rings:
            new_water.append(rings)
    keep = [i for i in range(len(data['water'])) if i not in SOURCE_IDS]
    data['water'] = [data['water'][i] for i in keep] + new_water
    data['waterHeights'] = [data['waterHeights'][i] for i in keep] + [WATER_LEVEL]*len(new_water)

    # Carve all four terrain vertices of every cell touched by water. Sampling
    # only terrain vertices can miss Saetgang, which is narrower than the grid.
    terrain = data['terrain']
    t_low, t_high = np.array(terrain['bounds'])
    grid_step = (t_high-t_low)/[terrain['nx'], terrain['nz']]
    cells = np.floor((samples[corrected.ravel()]-t_low)/grid_step).astype(int)
    assert np.all(cells >= 0) and np.all(cells < [terrain['nx'], terrain['nz']])
    cut = np.zeros((terrain['nz']+1, terrain['nx']+1), dtype=bool)
    for dc, dr in ((0, 0), (1, 0), (0, 1), (1, 1)):
        cut[cells[:, 1]+dr, cells[:, 0]+dc] = True
    heights = np.array(terrain['heights']).reshape(cut.shape)
    heights[cut] = np.minimum(heights[cut], WATER_LEVEL-1.5)
    terrain['heights'] = heights.round(1).ravel().tolist()
    green = np.array(terrain['green']).reshape(cut.shape)
    green[cut] = 0
    terrain['green'] = green.ravel().tolist()

    # Suppress only source building masses inside this corrected water surface.
    # Keeping them would put small edge buildings in the widened channel.
    buildings = np.fromfile(BUILDING_PATH, dtype='<f4').reshape(-1, 6)
    in_region = np.all((buildings[:, :2] >= low) & (buildings[:, :2] <= high), axis=1)
    candidate_indices = np.flatnonzero(in_region)
    candidates = buildings[candidate_indices, :2]
    wet = np.zeros(len(candidates), dtype=bool)
    for rings in new_water:
        hit = PolygonPath(rings[0]).contains_points(candidates)
        for hole in rings[1:]:
            hit &= ~PolygonPath(hole).contains_points(candidates)
        wet |= hit
    retained = np.ones(len(buildings), dtype=bool)
    retained[candidate_indices[wet]] = False
    removed = int(np.sum(~retained))
    buildings[retained].tofile(BUILDING_PATH)
    meta['buildingCount'] = int(np.sum(retained))
    meta['atlasVersion'] = '1.1'
    meta['yeouidoWater'] = {
        'source': 'Retained OpenFreeMap / OpenStreetMap water geometry',
        'displayAdjustment': True,
        'saetgangBankExpansionM': 60,
        'islandShoreInsetM': 50,
        'displayWaterLevelM': WATER_LEVEL,
        'waterFeatureIndices': list(range(len(keep), len(data['water']))),
        'bounds': [low.tolist(), high.tolist()],
    }
    DATA_PATH.write_text(json.dumps(data, separators=(',', ':'), ensure_ascii=False))
    print(json.dumps({'version': '1.1', 'waterPolygons': len(new_water),
                      'islandDisplayAreaKm2': round(np.sum(island & ~inset)*STEP**2, 3),
                      'addedWaterKm2': round(np.sum(corrected & ~water)*STEP**2, 3),
                      'buildingMassesInWaterRemoved': removed}))


if __name__ == '__main__':
    main()
