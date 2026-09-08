# Full automatic flight video

`export_scene.mjs` evaluates the retained Three.js scene builders and automatic flight logic without a browser. It preserves the source geometry, island holes, model positions, building LOD, vehicle motion, 21-stop order and camera path. The timeline runs until the actual tour ends, the home transition completes and a short final hold finishes; it has no arbitrary duration cutoff.

`render_flight.py` renders that export with ModernGL and FFmpeg at 1280 × 720, 24 fps. It uses a separate software OpenGL renderer and recomposes the visible interface with Pillow. It is a source-based render, not a pixel-identical browser screen recording: lighting and interface details differ from the browser's Three.js renderer. The source site has no audio track.

Requirements: Node, Python with ModernGL, NumPy and Pillow, FFmpeg with libx264, an EGL/Mesa runtime and a Korean font such as Noto Sans CJK KR. Output and dependency paths are explicit arguments; no hosted Site changes are needed to create a video.

```sh
node recording/export_scene.mjs /absolute/path/scene-output
python recording/render_flight.py /absolute/path/scene-output /absolute/path/flight.mp4 --font /absolute/path/NotoSansCJKkr-Regular.otf --egl /absolute/path/libEGL.so.1
```

Map data remains subject to the attributions and licenses in `dist/LICENSES.txt`. Static public assets remain authored in `dist`. Vite is used only to preview those assets locally; the build script checks their JavaScript syntax without rewriting them.

## Version 2 — randomized light and camera choreography

`export_scene_v2.mjs` retains all 21 stops and moving vehicles, and creates a reproducible shuffled sequence with seven daytime, seven sunset and seven night scenes, with no identical adjacent modes. Each stop has its own azimuth, orbit direction, elevation wave and zoom wave. Smooth 3.2-second travel and 2.3-second lighting blends connect scenes; the final four seconds return to the full-city view. Total: 224.5 seconds, with no truncated stops.

`render_flight_v2.py` supports the exported per-material lighting palettes, emissive landmark materials, night window lights and stars. The time selector follows the rendered mode. Both exporters remain available independently; these files do not modify the hosted interface.

```sh
node recording/export_scene_v2.mjs /absolute/path/scene-v2
python recording/render_flight_v2.py /absolute/path/scene-v2 /absolute/path/flight-v2.mp4 --font /absolute/path/NotoSansCJKkr-Regular.otf --egl /absolute/path/libEGL.so.1
```

Use `--sample FRAME` with a PNG output path to inspect a single frame. The optional `--start` and `--end` frame arguments are for rendering partial diagnostics; omit both for the complete deliverable.
