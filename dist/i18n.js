const STORAGE_KEY = 'seoul-atlas-language';
const supported = new Set(['ko', 'en']);
let current = supported.has(localStorage.getItem(STORAGE_KEY)) ? localStorage.getItem(STORAGE_KEY) : 'ko';

export const getLanguage = () => current;
export const t = (ko, en) => current === 'en' ? (en || ko) : ko;
export const pick = (ko, en) => current === 'en' ? (en || ko) : ko;
export const formatNumber = value => Number(value).toLocaleString(current === 'en' ? 'en-US' : 'ko-KR');

const text = (selector, ko, en) => {
  const element = document.querySelector(selector);
  if (element) element.textContent = t(ko, en);
};
const html = (selector, ko, en) => {
  const element = document.querySelector(selector);
  if (element) element.innerHTML = t(ko, en);
};
const attr = (selector, name, ko, en) => {
  const element = document.querySelector(selector);
  if (element) element.setAttribute(name, t(ko, en));
};

export function applyStaticTranslations() {
  document.documentElement.lang = current;
  document.title = t('서울 아파트 실거래가 · 3D Atlas v2.5', 'Seoul Apartment Sales · 3D Atlas v2.5');
  const description = t(
    '서울 아파트 실거래가 3D 지도 v2.5. 단지 검색, 면적·층·계약일별 매매 내역과 서울 25개 자치구.',
    'Seoul apartment sales 3D map v2.5 with complex search, area, floor, contract-date filters, and all 25 districts.'
  );
  document.querySelector('meta[name="description"]')?.setAttribute('content', description);

  text('.brand .eyebrow', '대한민국 · 3D 지도', 'SOUTH KOREA · 3D ATLAS');
  const brandHeading = document.querySelector('.brand h1');
  if (brandHeading) {
    const labelNode = [...brandHeading.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
    if (labelNode) labelNode.textContent = t('서울', 'SEOUL');
  }
  text('.brand-en', '', '');
  text('.brand p', '아파트 실거래가', 'Apartment sales');
  attr('#viewport', 'aria-label', '서울 전역 인터랙티브 3D 지도', 'Interactive 3D map of Seoul');
  attr('#labels', 'aria-label', '지도 위 지명과 랜드마크', 'Map labels and landmarks');

  attr('.language-switch', 'aria-label', '언어 선택', 'Choose language');
  for (const button of document.querySelectorAll('[data-language]')) {
    const selected = button.dataset.language === current;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }

  attr('.time-switch', 'aria-label', '시간대와 날씨 선택', 'Choose time and weather');
  const time = {
    day: ['☀', '낮', 'Day'],
    sunset: ['◒', '노을', 'Sunset'],
    night: ['☾', '야경', 'Night'],
    rain: ['☂', '비', 'Rain'],
    snow: ['❄', '눈', 'Snow']
  };
  for (const [value, labels] of Object.entries(time)) {
    html(`[data-time-choice="${value}"]`, `<span aria-hidden="true">${labels[0]}</span> ${labels[1]}`, `<span aria-hidden="true">${labels[0]}</span> ${labels[2]}`);
  }
  text('label[for="season"]', '나무 계절', 'Tree season');
  text('#season option[value="spring"]', '봄 · 꽃', 'Spring · Blossoms');
  text('#season option[value="summer"]', '여름 · 녹음', 'Summer · Green');
  text('#season option[value="autumn"]', '가을 · 단풍', 'Autumn · Foliage');
  text('#season option[value="winter"]', '겨울 · 가지', 'Winter · Bare branches');
  text('#season-help', '나무의 계절은 시간대와 날씨에 관계없이 선택할 수 있습니다.', 'Tree season can be selected independently of time and weather.');
  attr('#info', 'aria-label', '지도 설명과 데이터 출처', 'About this map and data sources');

  attr('#explore', 'aria-label', '서울 탐색', 'Explore Seoul');
  text('.explore-heading h2', '서울 탐색', 'Explore Seoul');
  attr('#close-explore', 'aria-label', '탐색 목록 닫기', 'Close explorer');
  attr('.explore-tabs', 'aria-label', '탐색 유형', 'Explore category');
  text('#tab-apts', '아파트', 'Apartments');
  text('#tab-places', '도시', 'City');
  text('#tab-trails', '등산로', 'Trails');
  text('label[for="district"]', '서울 25개 자치구', 'Seoul’s 25 districts');
  text('#district option[value=""]', '자치구 선택', 'Select a district');
  text('.section-label span:first-child', '랜드마크', 'Landmarks');
  attr('#places', 'aria-label', '랜드마크 바로 가기', 'Landmark shortcuts');
  const foot = document.querySelector('.explore-foot');
  if (foot) {
    for (const node of [...foot.childNodes]) if (node.nodeType === Node.TEXT_NODE) node.textContent = t('자치구 경계', 'District borders');
  }
  text('#boundaries', '표시', 'Show');

  text('label[for="mountain"]', '산 선택', 'Mountain');
  text('#mountain option[value=""]', '산을 불러오는 중', 'Loading mountains');
  text('label[for="trail-route"]', '등산 코스', 'Hiking route');
  text('#trail-route option[value=""]', '산을 선택하세요', 'Select a mountain');
  const trailLayerLabels = document.querySelectorAll('.trail-layer-controls label');
  if (trailLayerLabels[0]) {
    for (const node of [...trailLayerLabels[0].childNodes]) if (node.nodeType === Node.TEXT_NODE) node.textContent = t('등산로 표시', 'Show trails');
  }
  if (trailLayerLabels[1]) {
    for (const node of [...trailLayerLabels[1].childNodes]) if (node.nodeType === Node.TEXT_NODE) node.textContent = t('출발·도착 표시', 'Show endpoints');
  }
  text('#trail-summary', '등산로를 불러오는 중', 'Loading trails');
  text('#trail-start > span', '출발점', 'Start');
  text('#trail-end > span', '도착점', 'Finish');
  text('#fit-trail', '코스 전체 보기', 'View full route');
  text('#trail-source', '원본 지도', 'Source map');
  text('.trail-note',
    '표시 범위의 공개 등산로 데이터입니다. 선택한 경로의 시작·끝을 표시하며, 공식 코스 지정이나 실시간 통제 정보를 뜻하지 않습니다.',
    'Public trail data for the displayed area. Endpoints belong to the selected route; routes are not official designations and closures are not live.'
  );
  text('#trail-about', '데이터 범위·출처', 'Coverage and sources');

  attr('#north', 'aria-label', '북쪽을 위로 정렬', 'Face north');
  text('#north span', '북', 'N');
  attr('#zoom-in', 'aria-label', '확대', 'Zoom in');
  attr('#zoom-in', 'title', '확대', 'Zoom in');
  attr('#zoom-out', 'aria-label', '축소', 'Zoom out');
  attr('#zoom-out', 'title', '축소', 'Zoom out');
  text('#location-en', '미니어처 도시', 'City in miniature');
  text('#location-name', '서울, 한눈에', 'Seoul overview');
  text('#location-description', '한강과 산, 그 사이에 펼쳐진 25개 자치구', 'Twenty-five districts between the Han River and the mountains');
  html('.desktop-hint', '드래그 회전 <b>·</b> 휠 확대 <b>·</b> 오른쪽 드래그 이동', 'Drag to rotate <b>·</b> Wheel to zoom <b>·</b> Right-drag to pan');
  html('.mobile-hint', '한 손가락 회전 <b>·</b> 두 손가락 확대·이동', 'One finger to rotate <b>·</b> Two fingers to zoom and pan');
  attr('.toolbar', 'aria-label', '지도 조작', 'Map controls');
  html('#home > span', '서울 전체', 'Overview');
  html('#open-explore > span', '탐색', 'Explore');
  html('#tour-text', '자동 비행', 'Auto tour');
  html('#view-text', '평면 보기', '2D view');
  html('#toggle-labels > span', '지명', 'Labels');
  html('#fullscreen > span', '전체 화면', 'Fullscreen');
  const footer = document.querySelector('footer > div');
  if (footer) {
    for (const node of [...footer.childNodes]) if (node.nodeType === Node.TEXT_NODE) node.textContent = t('실제 지도 기반 · 높이 4×', 'Map-based · Height 4×');
  }
  text('#credits', '지도 안내', 'About');
  text('.loading-mark', '서울', 'SEOUL');
  text('#loading-text', '서울의 지형을 펼치는 중', 'Unfolding Seoul’s terrain');
  text('#retry', '다시 불러오기', 'Retry');

  text('#about .dialog-top .eyebrow', '지도 안내 · v2.5', 'About this atlas · v2.5');
  attr('#close-about', 'aria-label', '설명 닫기', 'Close about');
  text('#about > h2', '서울을 닮은 작은 세계', 'A small world shaped like Seoul');
  text('#about > p:nth-of-type(1)',
    '서울 전역과 가장자리의 주변 지역을 담은 인터랙티브 미니어처입니다. 실제 도로·수계·표고 데이터를 바탕으로 만들었습니다.',
    'An interactive miniature of Seoul and its surrounding edge, built from real road, water, and elevation data.'
  );
  text('#about > p:nth-of-type(2)',
    '건물은 OpenStreetMap에 수록된 위치와 윤곽을 단순화한 모형입니다. 높이 정보가 없으면 원본 데이터의 추정 높이를 사용합니다. 지형과 건물 높이는 보기 쉽게 4배로 강조했습니다. 랜드마크는 특징을 살린 해석 모형이며, 모든 건물의 실측·실사 복원은 아닙니다.',
    'Buildings are simplified from OpenStreetMap locations and outlines. Estimated source heights are used where height is missing. Terrain and building heights are exaggerated 4× for clarity. Landmarks are interpretive models, not measured photorealistic reconstructions.'
  );
  text('#about > p:nth-of-type(3)',
    '여의도는 섬과 주변 물길을 구분하기 쉽도록 가장자리와 샛강의 표시 폭을 조정했습니다. 주변 한강 구간은 수면 높이와 연결부를 맞춰 이어지는 물길로 표시합니다. 김포공항 북쪽에서 서해 방향으로 이어지는 한강 하류는 지도 서쪽 끝까지 파란색으로 강조합니다. 물 색상은 구분을 위한 표현이며 실제 수색을 뜻하지 않습니다.',
    'Yeouido’s edges and Saetgang display width are adjusted to clarify the island and waterways. Nearby Han River sections are aligned as a continuous surface, and the lower river west of Gimpo Airport is emphasized in blue to the map edge. Water color is illustrative.'
  );
  text('#about > p:nth-of-type(4)',
    '비·눈 모드와 사계절 나무는 풍경을 둘러보기 위한 연출입니다. 봄에는 꽃, 여름에는 녹음, 가을에는 단풍이 보이고 겨울에는 낙엽수의 잎이 떨어져 가지가 드러나며 상록수는 남습니다. 실시간 기상이나 실제 나무의 수종·개화 상태를 나타내지 않습니다. 시간대·날씨와 나무 계절은 따로 선택할 수 있으며, 기기의 동작 줄이기 설정을 켜면 비·눈의 움직임이 멈춥니다.',
    'Rain, snow, and seasonal trees are visual effects. Spring shows blossoms, summer green foliage, autumn color, and winter bare deciduous branches while evergreens remain. They do not represent live weather or actual species and bloom state. Weather and tree season are independent; reduced-motion settings pause precipitation.'
  );
  text('#about > p:nth-of-type(5)',
    '아파트: 서울시의 공개 매매 내역과 공동주택 단지 좌표를 연결합니다. 아파트 메뉴에서 검색과 층·면적·계약연도별 거래 조회를 할 수 있습니다. 동·호수는 제공되지 않으며 지도 점은 단지 대표 위치입니다. 아파트 메뉴의 데이터 범위·출처에서 반영일과 수록 범위를 확인하세요.',
    'Apartments: Links Seoul’s public sale records with apartment-complex coordinates. Search and filter sales by floor, area, and contract year. Building and unit numbers are unavailable; map points are representative complex locations. See Coverage and sources for dates and scope.'
  );
  text('#about .about-note', '차량과 배의 움직임은 연출입니다. 길 안내나 측량용 지도가 아닙니다.', 'Vehicle and boat motion is illustrative. This is not a navigation or surveying map.');
  html('#about dl > div:nth-child(1) dd',
    '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors · ODbL</a> · <a href="/data/trails.json" download>등산로 데이터</a><br><span id="trails-data-date"></span>',
    '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors · ODbL</a> · <a href="/data/trails.json" download>Trail data</a><br><span id="trails-data-date"></span>'
  );
  html('#about dl > div:nth-child(2) dd',
    '<a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a> / <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> / <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors · ODbL</a><br>2026-08-30 데이터 스냅샷',
    '<a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a> / <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> / <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors · ODbL</a><br>Data snapshot: 2026-08-30'
  );
  html('#about dl > div:nth-child(3) dd',
    '<a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">AWS Terrain Tiles / Mapzen</a> · SRTM 등',
    '<a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">AWS Terrain Tiles / Mapzen</a> · SRTM and others'
  );
  html('#about dl > div:nth-child(4) dd',
    '<a href="https://github.com/southkorea/seoul-maps" target="_blank" rel="noopener">southkorea/seoul-maps</a> · 통계청 2013년 경계<br>현재 법정 경계와 차이가 있을 수 있습니다.',
    '<a href="https://github.com/southkorea/seoul-maps" target="_blank" rel="noopener">southkorea/seoul-maps</a> · Statistics Korea 2013 boundaries<br>May differ from current legal boundaries.'
  );
  html('#about dl > div:nth-child(5) dd',
    '<a href="https://threejs.org/" target="_blank" rel="noopener">Three.js</a> · <a href="/data/seoul.json" download>지형·도로 데이터</a> · <a href="/data/buildings.bin" download>건물 데이터</a> · <a href="/LICENSES.txt">라이선스</a>',
    '<a href="https://threejs.org/" target="_blank" rel="noopener">Three.js</a> · <a href="/data/seoul.json" download>Terrain/roads</a> · <a href="/data/buildings.bin" download>Buildings</a> · <a href="/LICENSES.txt">Licenses</a>'
  );
  const aboutLabels = [
    ['#about dl > div:nth-child(1) dt', '등산로', 'Trails'],
    ['#about dl > div:nth-child(2) dt', '지도·건물', 'Map'],
    ['#about dl > div:nth-child(3) dt', '지형', 'Terrain'],
    ['#about dl > div:nth-child(4) dt', '자치구 경계', 'Borders'],
    ['#about dl > div:nth-child(5) dt', '3D 렌더링', 'Rendering'],
    ['#about a[href="/data/trails.json"]', '등산로 데이터', 'Trail data'],
    ['#about a[href="/data/seoul.json"]', '지형·도로 데이터', 'Terrain/roads'],
    ['#about a[href="/data/buildings.bin"]', '건물 데이터', 'Buildings'],
    ['#about a[href="/LICENSES.txt"]', '라이선스', 'Licenses']
  ];
  for (const entry of aboutLabels) text(...entry);
}

export function setLanguage(next, {announce = true} = {}) {
  if (!supported.has(next)) return;
  current = next;
  localStorage.setItem(STORAGE_KEY, current);
  applyStaticTranslations();
  if (announce) document.dispatchEvent(new CustomEvent('atlas-language-change', {detail: current}));
}

export function initI18n() {
  for (const button of document.querySelectorAll('[data-language]')) {
    button.addEventListener('click', () => setLanguage(button.dataset.language));
  }
  setLanguage(current, {announce: false});
}
