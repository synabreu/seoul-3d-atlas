# Seoul Apartment Prices — 3D Atlas v2.0

`apt-price` forks the v1.7 atlas into a separate OpenAI Sites project. The original atlas remains available at its existing URL.

The new apartment tab searches Seoul's public sale records by name, address and district. A selected item shows contract date, exact reported amount in KRW, area, floor and transaction type. Area, floor and contract-year filters are supported. Cancellation and presale/occupancy-rights transfers are opt-in; they never determine the map's latest apartment sale amount. A floor is not a unit identifier.

This is a dated public-data snapshot, not a complete inventory of homes or an all-time/live transaction feed. Building-dong and unit numbers are unavailable in this source. No identities or unit numbers are inferred. Official catalog coordinates represent apartment complexes, not the building or unit involved in a transaction. Unlocated sales remain searchable. Unique name/address matches are deliberately conservative; unmatched management-catalog entries may describe complexes present under other transaction names.

Sources downloaded 2026-09-08:

- [Seoul apartment sale records](https://data.seoul.go.kr/dataList/OA-21275/S/1/datasetView.do): 189,991 source rows; one inconsistent non-Seoul district code excluded. 189,990 rows retained, including 10,482 cancellations and 3,062 rights transfers. Default active apartment sales: 176,808. Receipt years 2024–2026, contract dates 2023-01-29–2026-09-05.
- [Seoul apartment catalog](https://data.seoul.go.kr/dataList/OA-15818/S/1/datasetView.do): 2,887 source catalog records. Matched or standalone official coordinates are available for 2,847 catalog/transaction entries; 1,713 of these have linked transaction data. Names/addresses can differ between sources, so the combined result count is not a count of distinct physical complexes.
- Both sources are Seoul Metropolitan Government data under KOGL Type 1. Source hashes and coverage are recorded in `dist/data/apartments/provenance.json`.

The initial index is about 3 MB. Transaction files load by district only when needed. The map uses instanced location points and at most 36 visible price labels; it does not instantiate apartment units or attach prices to anonymous building meshes.

Rebuild the snapshot with Python's standard library:

```sh
python build_apt_data.py --download-dir /absolute/temporary/cache
node recording/verify_apartments.mjs
```

The data download uses the Seoul portal's public CSV download form. It does not scrape the MOLIT transaction viewer. No API credentials or server are required. Validate a regenerated snapshot before publishing; source schemas and available years can change. The check records the current expected source count so a changed upstream release requires review.

The verifier checks all 25 district partitions, source totals, prices, cancellation/right-type handling, latest-sale selection, search filters and control references without a browser. No browser or mobile FPS measurements are claimed.

---

# 서울 3D 지도 (Seoul 3D Atlas) · v1.7

v1.7 adds bilingual Korean (English) controls and terrain-following hiking paths
for Seoul and surrounding mountains. The existing 267,080 source building
records, 21 landmarks, five environment modes, four tree seasons and blue
lower Han River are retained. The outer extension contains terrain and trails.

The trail snapshot is 2026-09-08 05:36:51 UTC. It covers 126.70–127.35° E and
37.25–37.85° N: 804 OSM peaks, 13,719 mapped mountain walking/hiking sections
and 1,595 computed summit connections. This is the available mapped inventory
within that rectangle, not a guarantee of every real-world mountain or trail.
All sections can be selected from a nearby peak. Peaks without mapped paths
show an explicit empty state. Mountain groupings overlap geographically.

Open **등산로 (Trails)**, choose a mountain and a summit connection or original
section. Green marks the start, orange-red the finish; the selected line is
outlined in pale cream. The endpoint buttons focus each exact coordinate.
**코스 전체 보기 (View full route)** fits the route. Independent switches show
paths and both endpoint types. City navigation remains under **도시 (City)**.

Connections follow actual connected OSM pedestrian edges and respect explicit
pedestrian direction tags. They are exploratory connections rather than
designated courses. A summit offset is shown when the path stops near the peak.
The source section's first/last coordinates do not mandate a hiking direction.
Distances are horizontal mapped lengths. Closures are not live.

To reproduce the new data, obtain an Overpass JSON snapshot with:

```overpass
[out:json][timeout:140];
(way["highway"~"^(path|footway|steps|track)$"](37.25,126.70,37.85,127.35);
 node["natural"="peak"](37.25,126.70,37.85,127.35);
 node["highway"="trailhead"](37.25,126.70,37.85,127.35);
 node["information"="guidepost"](37.25,126.70,37.85,127.35);
 relation["route"="hiking"](37.25,126.70,37.85,127.35););
out body geom;
```

Use Python with numpy, scipy, Pillow and shapely for data processing:

```bash
python extend_terrain.py --cache /absolute/path/cache
python build_trails.py --input /absolute/path/osm-trails.json
python extend_water.py --cache /absolute/path/cache
```

The terrain extender preserves the original core grid exactly. The water
extender clips only the outer region, keeps the original water geometry and
extends the blue material to connected downstream water. Source provenance and
coverage are also available in the About dialog and `/data/trails.json`.

---

# Seoul 3D Atlas v1.6

A self-contained Three.js city diorama covering all 25 districts of Seoul, plus a small surrounding context margin. Static Site; no API keys or runtime map service is required.

v1.6 adds winter to the independent tree-season selector. Broadleaf crowns and blossoms disappear, exposing trunks and a shared low-poly branch shape instanced at the existing tree positions; evergreens remain. All five time/weather modes work with all four seasons. The branch mesh is allocated once and hidden outside winter. Snow mode lightly tints the exposed branches as well as evergreen foliage.

The lower Han River visibility fix lowers the decorative foundation by 0.07 scene units. Its beveled cap previously reached +0.03 and covered downstream water surfaces at +0.020 to +0.02636. The cap now meets the terrain skirts at -0.04, below all terrain and water, so the retained blue river is visible through the western map boundary. Source shorelines, islands, water elevations, terrain, building records and map extent remain unchanged. `node recording/verify_environment.mjs` checks all 20 environment combinations on desktop/mobile scene setups and uses actual Three.js ray intersections to verify downstream water above the foundation and terrain. These are geometry checks with a mocked renderer, not browser or FPS measurements. Asset revision: `1.6-winter-river-1`.

v1.5 adds rain and snow alongside day, sunset and night, with an independent spring/summer/autumn tree selector. Rain uses falling line segments, muted overcast light and wetter road materials; snow uses soft point flakes and lightly snow-tinted foliage. Precipitation follows the viewed map area and respects reduced motion. The effects are allocated once on first use and hidden in clear modes; mobile uses 650 rain streaks / 500 snowflakes, desktop 1,500 / 1,100. These are capped effect counts, not measured FPS claims.

Trees retain their existing locations and count. One-third remain evergreen; the rest gain low-poly broadleaf crowns and trunks. Spring flowering trees have separate pink/white blossom clusters, summer restores green foliage, and autumn brings red/orange/gold leaves. No tree data or live weather service is implied. The existing 21 destinations and blue lower Han River remain unchanged. All five modes work with all three tree seasons. Asset revision: `1.5-weather-seasons-1`.

v1.4 highlights the retained lower Han River polygons north of Gimpo Airport toward the western map boundary in blue. A separate day/sunset/night material keeps the blue identifiable under changing light. It preserves all source shorelines, islands, water levels, terrain, buildings, destinations and the existing map extent; the scene does not extend to the sea itself. Run `node style_lower_hangang.mjs` after the existing data-preparation steps to record the selected source features. Asset revision `1.4-lower-hangang-1` refreshes the viewer and its data together.

v1.3 places the eight requested landmarks first in the LANDMARKS navigation and automatic tour, in this order: 강남역, 삼성 코엑스, 서울역, 광화문, 용산, 김포공항, 잠실, 강동. All eight have clickable coordinate markers and labels. Gangnam Station and Samseong COEX now use the same position-marker treatment as the six destinations added in v1.2. The total remains 21 unique destinations, and the earlier geography corrections are retained.

- Real OSM roads and water geometry, terrain from AWS Terrain Tiles.
- Buildings are simplified oriented masses from OpenMapTiles footprints and source render heights. Heights may be estimates. All vertical dimensions are exaggerated 4 times.
- Twenty-one landmark destinations, day/sunset/night, orbit/pan/zoom, automatic flight, district selection, optional district lines and labels.
- Historical district boundary source: KOSTAT 2013. Landmark models and vehicle motions are illustrative.

The browser loads dist/data/seoul.json and dist/data/buildings.bin. The binary building format is six little-endian float32 values per building: x_km, z_km, width_km, depth_km, angle_radians, height_m. See dist/LICENSES.txt for data and software attribution.

Source preparation is sequential: build_data.py, build_buildings.py, refine_data.py, refine_yeouido.py, reveal_yeouido.py, align_hangang.py. The build scripts use Python, NumPy, Pillow, SciPy, public OpenFreeMap vector tiles and AWS terrain tiles, with a temporary cache. The checked-in dist assets are the complete deployable result and do not require rebuilding.

Controls: drag to rotate, wheel or pinch to zoom, right drag / two fingers to pan. The focused map supports arrow-key pan, +/- zoom and H for home. Reduced-motion settings disable ambient motion and camera transitions.

Yeouido water visibility follow-up: `reveal_yeouido.py`, run after `refine_yeouido.py`, adds a 120 m display inset to the island shoreline while preserving dry foundations for the three existing landmark models. It exposes more of the main Han River and Saetgang, lowers terrain cells beneath that water, and removes building masses whose footprints cover it. Bamseom and the other water polygons retain their geometry. The Yeouido destination uses a steeper viewing angle to reduce building occlusion, and a separate asset revision refreshes the map data while retaining the v1.3 product label. These are cartographic display adjustments, as disclosed in the map's existing information dialog.

v1.1 separates Gangnam Station (127.02758 E, 37.49793 N) and Samseong COEX (127.0589 E, 37.5119 N), including their labels, destination cards, and tour stops. Location references: [Gangnam Station](https://www.findlatlng.org/place/gangnam), [COEX directions](https://www.coexcenter.com/directions-map-subway/), [COEX coordinates](https://www.wikidata.org/wiki/Q485389).

For the v1.1 water presentation, run `refine_yeouido.py` after the original data preparation. It uses the existing OSM water geometry, expands each Saetgang bank by 60 m, and insets the island shoreline by a further 50 m in the display. It preserves island holes and reconnects the narrow channel, uses a consistent local water level, carves the terrain below the water, and removes building masses that would fall inside the widened channel. These are explicitly disclosed cartographic display adjustments, not survey corrections. Dependencies for this optional data step: NumPy, SciPy, Matplotlib and ContourPy. The Yeouido camera is higher and wider so both river channels fit in its view. Versioned asset URLs prevent old map data being mixed with the new building count.

v1.2 adds six destinations with clickable map position dots, labels, navigation entries, location cards, and automatic tour stops. Gyeongbokgung now has its own name, separate from the new Gwanghwamun Square destination. Jamsil uses the station area separately from Lotte World Tower. Region names use the representative centers below; they do not redefine district boundaries. Existing v1.1 geography and building data are retained.

| Destination | Representative location | Latitude | Longitude | Reference |
| --- | --- | --- | --- | --- |
| 서울역 | Seoul Station area | 37.55580 | 126.97200 | [Station coordinates](https://www.findlatlng.org/place/seoul-station) |
| 광화문 | Gwanghwamun Square, southern central section | 37.57240 | 126.97694 | [Seoul official directions](https://gwanghwamun.seoul.go.kr/ghm/contents/16.do?mid=1009), [coordinate reference](https://medium.com/@nou0ggid/geohashing-fcc245e33254) |
| 용산 | Yongsan Station | 37.53014 | 126.96509 | [Station coordinates](https://www.findlatlng.org/place/yongsan-station-seoul-metropolitan-subway) |
| 김포공항 | Gimpo International Airport area | 37.55865 | 126.79447 | [Airport coordinates](https://kr.2markers.com/50194), [Korea Airports Corporation](https://www.airport.co.kr/gimpo/index.do) |
| 잠실 | Jamsil Station area | 37.51333 | 127.10028 | [Station coordinates](https://www.findlatlng.org/place/jamsil) |
| 강동 | Gangdong-gu polygon centroid | 37.54839 | 127.14905 | Calculated from the retained district polygon in `dist/data/seoul.json` (KOSTAT 2013) |

Han River surface follow-up: `align_hangang.py` aligns the existing Yeouido surface with the two adjoining Han River tiles at the same 6 m display level, snaps only sub-5 m raster seams to source river edges, and removes simplified building footprints overlapping those water surfaces. Existing island holes, destinations and landmark models are preserved. The river uses a consistent blue material, with the map label “한강 물길” placed on the water north of Yeouido. The label follows the existing place-name visibility control without adding a tour stop. Asset revision `1.3-hangang-1` refreshes the changed files while retaining the v1.3 product version.
