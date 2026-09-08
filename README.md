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
