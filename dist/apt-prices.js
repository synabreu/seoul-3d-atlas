import * as THREE from 'three';
import {number, formatPrice, shortPrice, formatDate, filterComplexes, filterTrades, priceColor} from './apt-model.js?v=2.7-i18n-1';
import { t, pick, getLanguage } from './i18n.js?v=2.7-i18n-1';

const REV = '2.7-i18n-1';
const LIST_SIZE = 24, TRADE_SIZE = 15, LABEL_COUNT = 36;
const sourceURL = 'https://data.seoul.go.kr/dataList/OA-21275/S/1/datasetView.do';
const catalogURL = 'https://data.seoul.go.kr/dataList/OA-15818/S/1/datasetView.do';

export function createApartmentExplorer(ctx) {
  const {$, scene, camera, toWorld, groundHeight, stopTour, flyTo, flyDistrict, clearPlaceSelection, setTab} = ctx;
  let dataset, filtered=[], selected=null, rows=[], listPage=0, tradePage=0, active=true, lastUpdate=0, requestID=0;
  let mesh=null, points=[], indexByID=new Map(), selectedPoint=null;
  const districtCache=new Map(), projected=new THREE.Vector3(), dummy=new THREE.Object3D();
  const root=new THREE.Group();root.name='Official apartment representative locations';scene.add(root);
  const labels=[];
  const selectedRing=new THREE.Mesh(new THREE.RingGeometry(.075,.1,32),new THREE.MeshBasicMaterial({color:'#ffe08a',side:THREE.DoubleSide,depthTest:false}));
  selectedRing.rotation.x=-Math.PI/2;selectedRing.renderOrder=20;selectedRing.visible=false;root.add(selectedRing);
  const host=$('apt-explorer');
  host.innerHTML=`
    <div class="apt-scope"><span>매매 실거래</span><b>v2.7</b></div>
    <p id="apt-coverage" class="apt-coverage" role="status">서울의 아파트 거래를 불러오는 중입니다. (Loading)</p>
    <div class="apt-search-controls">
      <label for="apt-query">아파트명·주소 (Name / address)</label>
      <input id="apt-query" type="search" autocomplete="off" placeholder="예: 리센츠, 래미안, 반포동" maxlength="160">
      <label for="apt-district">자치구 (District)</label>
      <select id="apt-district"><option value="">서울 전체 (All Seoul)</option></select>
      <div class="apt-sort-row"><label for="apt-sort">정렬 (Sort)</label><select id="apt-sort"><option value="latest">최근 거래순 (Latest)</option><option value="price">최근 거래금액순 (Price)</option><option value="name">이름순 (Name)</option></select></div>
    </div>
    <p class="apt-disclosure">공개된 층별 거래입니다. 동·호수는 이 자료에 제공되지 않습니다. (Building / unit numbers unavailable.)</p>
    <div class="apt-result-heading"><strong id="apt-count" role="status"></strong><button id="apt-reset" type="button">초기화 (Reset)</button></div>
    <div id="apt-results" aria-label="아파트 검색 결과 (Apartment results)"></div>
    <div class="apt-pagination"><button id="apt-prev" aria-label="이전 아파트 목록 (Previous apartments)">이전 (Prev)</button><span id="apt-pages"></span><button id="apt-next" aria-label="다음 아파트 목록 (Next apartments)">다음 (Next)</button></div>
    <button id="apt-sources-open" class="apt-source-button">데이터 범위·출처 (Coverage / sources)</button>`;
  const panel=document.createElement('aside');panel.id='apt-detail';panel.className='apt-detail glass';panel.hidden=true;panel.setAttribute('aria-label','아파트 거래 상세 (Apartment sale details)');
  panel.innerHTML=`<div class="apt-detail-top"><span class="apt-kicker">아파트 거래 내역 (Sale history)</span><button id="apt-detail-close" aria-label="거래 내역 닫기 (Close details)">×</button></div>
    <h2 id="apt-detail-name" tabindex="-1"></h2><p id="apt-detail-address" class="apt-address"></p>
    <div id="apt-latest" class="apt-latest"></div><p id="apt-building-meta" class="apt-small"></p>
    <button id="apt-fly" class="apt-primary">지도에서 보기 (View on map)</button><p id="apt-location-note" class="apt-small"></p>
    <div class="apt-trade-filters"><label>계약연도 (Year)<select id="apt-year"></select></label><label>전용면적 (Area)<select id="apt-area"></select></label><label>층 (Floor)<select id="apt-floor"></select></label></div>
    <label class="apt-check"><input id="apt-canceled" type="checkbox">해제 거래 포함 (Include canceled sales)</label><label class="apt-check"><input id="apt-rights" type="checkbox">분양·입주권 포함 (Include rights transfers)</label>
    <p id="apt-trade-status" role="status" class="apt-small"></p>
    <div class="apt-table-wrap" tabindex="0" aria-label="거래 내역 표. 좁은 화면에서는 좌우로 스크롤하세요. (Scrollable sale table)"><table class="apt-table"><caption>금액 단위: 원 (KRW) · 계약일 기준 (Contract date)</caption><thead><tr><th>계약일<br><small>Date</small></th><th>전용면적<br><small>Area · ㎡</small></th><th>층<br><small>Floor</small></th><th>동<br><small>Building</small></th><th>호<br><small>Unit</small></th><th>실거래가<br><small>Sale price</small></th><th>거래 유형<br><small>Type</small></th></tr></thead><tbody id="apt-trades"></tbody></table></div>
    <div class="apt-pagination"><button id="apt-trade-prev">이전 (Prev)</button><span id="apt-trade-pages"></span><button id="apt-trade-next">다음 (Next)</button></div>
    <p class="apt-disclosure">같은 층·면적의 거래가 같은 호수의 거래라는 뜻은 아닙니다. 신고 지연·정정·해제로 자료가 달라질 수 있습니다. (A floor does not identify a unit.)</p><a href="${sourceURL}" target="_blank" rel="noopener">서울시 원본 자료 (Official source)</a>`;
  document.body.append(panel);
  const legend=document.createElement('div');legend.id='apt-map-legend';legend.className='apt-map-legend glass';legend.innerHTML=`<strong>최근 유효 거래 (Latest sale)</strong><div><span style="--dot:#177f86">10억 미만</span><span style="--dot:#3b65b1">10–20억</span><span style="--dot:#8651a6">20–30억</span><span style="--dot:#b45932">30억 이상</span><span style="--dot:#627987">거래 미연결</span></div><p>면적이 다른 거래가 함께 표시됩니다. (Areas vary.)</p><p id="apt-map-count"></p>`;document.body.append(legend);
  const sources=document.createElement('dialog');sources.id='apt-sources';sources.innerHTML=`<div class="apt-detail-top"><span class="apt-kicker">공개 자료 (Public data)</span><button id="apt-sources-close" aria-label="데이터 설명 닫기 (Close sources)">×</button></div><h2>데이터 범위와 출처</h2><div id="apt-source-facts"></div><p>이 지도는 서울시에서 내려받은 자료를 반영한 스냅샷입니다. 서울의 모든 세대 목록이나 전체 연도의 거래 이력은 아닙니다. 자동으로 실시간 갱신되지 않습니다.</p><p>서울시 자료에는 아파트 동 번호와 호수가 없습니다. 국토교통부 상세 API는 소유권 이전등기가 완료된 거래에 한해 동 정보를 공개하지만, 개별 호수는 제공하지 않습니다. 누락된 값은 추정하지 않습니다.</p><p>지도 점은 공식 단지명(동일 법정동 접두어·띄어쓰기 등 표기 정규화 포함) 또는 유일한 지번이 일치하는 공동주택 자료의 대표 좌표입니다. 실제 거래가 발생한 동·호의 위치를 나타내지 않습니다. 위치가 확인되지 않은 단지도 목록에서 검색할 수 있습니다. 거래 내역과 연결되지 않은 관리단지 목록 항목은 따로 남겨 두었습니다.</p><ul><li><a href="${sourceURL}" target="_blank" rel="noopener">서울시 부동산 실거래가 정보 · OA-21275</a></li><li><a href="${catalogURL}" target="_blank" rel="noopener">서울시 공동주택 아파트 정보 · OA-15818</a></li><li><a href="https://www.data.go.kr/data/15126468/openapi.do" target="_blank" rel="noopener">국토교통부 상세 API 공개 항목</a></li></ul><p>가격은 신고된 실제 매매금액이며, 해당 주택의 현재 시세나 공시가격이 아닙니다. 해제된 거래와 분양·입주권 거래는 기본 목록과 최근 거래금액에서 제외합니다. 거래 상세에서 포함 여부를 선택할 수 있습니다.</p>`;document.body.append(sources);
  for(let i=0;i<LABEL_COUNT;i++) {const el=document.createElement('button');el.className='apt-price-label';el.hidden=true;el.onclick=()=>selectComplex(el.dataset.id,true);$('labels').append(el);labels.push(el);}
  const text=(tag,content,className)=>{const e=document.createElement(tag);e.textContent=content;if(className)e.className=className;return e;};
  const option=(value,label)=>{const o=document.createElement('option');o.value=value;o.textContent=label;return o;};
  const labelText=(selector,ko,en)=>{const label=document.querySelector(selector);if(!label)return;for(const node of [...label.childNodes])if(node.nodeType===Node.TEXT_NODE)node.textContent=t(ko,en);};
  const setText=(selector,ko,en)=>{const element=document.querySelector(selector);if(element)element.textContent=t(ko,en);};
  const setAria=(selector,ko,en)=>document.querySelector(selector)?.setAttribute('aria-label',t(ko,en));
  function applyApartmentChrome(){
    if(!dataset)setText('#apt-coverage','서울의 아파트 거래를 불러오는 중입니다.','Loading Seoul apartment sales.');
    setText('#apt-explorer .apt-scope span','매매 실거래','Recorded sales');setText('#apt-explorer .apt-scope b','v2.7','v2.7');
    labelText('label[for="apt-query"]','아파트명·주소','Name / address');$('apt-query').placeholder=t('예: 리센츠, 래미안, 반포동','e.g. complex name or address');
    labelText('label[for="apt-district"]','자치구','District');setText('#apt-district option[value=""]','서울 전체','All Seoul');
    labelText('label[for="apt-sort"]','정렬','Sort');setText('#apt-sort option[value="latest"]','최근 거래순','Latest sale');setText('#apt-sort option[value="price"]','최근 거래금액순','Sale price');setText('#apt-sort option[value="name"]','이름순','Name');
    setText('#apt-explorer .apt-disclosure','공개된 층별 거래입니다. 동·호수는 이 자료에 제공되지 않습니다.','These are public floor-level sales. Building and unit numbers are not provided.');
    setText('#apt-reset','초기화','Reset');setAria('#apt-results','아파트 검색 결과','Apartment results');
    setText('#apt-prev','이전','Previous');setAria('#apt-prev','이전 아파트 목록','Previous apartment results');setText('#apt-next','다음','Next');setAria('#apt-next','다음 아파트 목록','Next apartment results');
    setText('#apt-sources-open','데이터 범위·출처','Coverage and sources');
    setAria('#apt-detail','아파트 거래 상세','Apartment sale details');setText('#apt-detail .apt-kicker','아파트 거래 내역','Sale history');setAria('#apt-detail-close','거래 내역 닫기','Close sale details');
    setText('#apt-fly','지도에서 보기','View on map');
    labelText('#apt-detail label:has(#apt-year)','계약연도','Contract year');labelText('#apt-detail label:has(#apt-area)','전용면적','Area');labelText('#apt-detail label:has(#apt-floor)','층','Floor');
    labelText('#apt-detail label:has(#apt-canceled)','해제 거래 포함','Include canceled sales');labelText('#apt-detail label:has(#apt-rights)','분양·입주권 포함','Include rights transfers');
    setAria('.apt-table-wrap','거래 내역 표. 좁은 화면에서는 좌우로 스크롤하세요.','Sale history table. Scroll horizontally on narrow screens.');
    setText('.apt-table caption','금액 단위: 원 · 계약일 기준','Amounts in KRW · Contract date');
    const headings=[['계약일','Date'],['전용면적 · ㎡','Area · ㎡'],['층','Floor'],['동','Building'],['호','Unit'],['실거래가','Sale price'],['거래 유형','Type']];
    document.querySelectorAll('.apt-table th').forEach((th,index)=>{const pair=headings[index];if(pair)th.textContent=t(...pair);});
    setText('#apt-trade-prev','이전','Previous');setText('#apt-trade-next','다음','Next');
    const detailDisclosure=document.querySelector('#apt-detail .apt-disclosure');if(detailDisclosure)detailDisclosure.textContent=t('같은 층·면적의 거래가 같은 호수의 거래라는 뜻은 아닙니다. 신고 지연·정정·해제로 자료가 달라질 수 있습니다.','Sales on the same floor and area do not identify the same unit. Delayed reports, corrections, and cancellations can change the data.');
    const officialLink=document.querySelector('#apt-detail a');if(officialLink)officialLink.textContent=t('서울시 원본 자료','Official Seoul source');
    setText('#apt-map-legend strong','최근 유효 거래','Latest valid sale');
    const ranges=[['10억 미만','Under ₩1B'],['10–20억','₩1–2B'],['20–30억','₩2–3B'],['30억 이상','₩3B+'],['거래 미연결','No linked sale']];
    document.querySelectorAll('#apt-map-legend div span').forEach((span,index)=>{const pair=ranges[index];if(pair)span.textContent=t(...pair);});
    setText('#apt-map-legend > p:first-of-type','면적이 다른 거래가 함께 표시됩니다.','Sales cover different areas.');
    setText('#apt-sources .apt-kicker','공개 자료','Public data');setAria('#apt-sources-close','데이터 설명 닫기','Close data description');setText('#apt-sources > h2','데이터 범위와 출처','Data coverage and sources');
    const sourceParagraphs=[
      ['이 지도는 서울시에서 내려받은 자료를 반영한 스냅샷입니다. 서울의 모든 세대 목록이나 전체 연도의 거래 이력은 아닙니다. 자동으로 실시간 갱신되지 않습니다.','This map is a snapshot of data downloaded from the Seoul Metropolitan Government. It is neither a complete household inventory nor an all-year transaction history, and it does not update automatically in real time.'],
      ['서울시 자료에는 아파트 동 번호와 호수가 없습니다. 국토교통부 상세 API는 소유권 이전등기가 완료된 거래에 한해 동 정보를 공개하지만, 개별 호수는 제공하지 않습니다. 누락된 값은 추정하지 않습니다.','The Seoul dataset does not contain apartment building or unit numbers. The Ministry of Land API exposes building information only for transactions with completed ownership registration and never exposes unit numbers. Missing values are not inferred.'],
      ['지도 점은 공식 단지명 또는 유일한 지번이 일치하는 공동주택 자료의 대표 좌표입니다. 표기 차이는 정규화하지만 실제 거래가 발생한 동·호의 위치를 나타내지 않습니다. 위치가 확인되지 않은 단지도 목록에서 검색할 수 있으며, 거래 내역과 연결되지 않은 관리단지 항목도 유지합니다.','Map points are representative coordinates from official apartment records matched by normalized complex name or a unique lot address. They do not identify the building or unit involved in a sale. Unlocated complexes remain searchable, and catalog entries without linked sales are retained.'],
      ['가격은 신고된 실제 매매금액이며, 해당 주택의 현재 시세나 공시가격이 아닙니다. 해제된 거래와 분양·입주권 거래는 기본 목록과 최근 거래금액에서 제외하며 거래 상세에서 포함 여부를 선택할 수 있습니다.','Prices are reported sale amounts, not current market values or official assessed prices. Canceled sales and rights transfers are excluded from default results and latest-price calculations, but can be included in sale details.']
    ];
    document.querySelectorAll('#apt-sources > p').forEach((paragraph,index)=>{const pair=sourceParagraphs[index];if(pair)paragraph.textContent=t(...pair);});
    const sourceLinks=[['서울시 부동산 실거래가 정보 · OA-21275','Seoul real-estate transaction data · OA-21275'],['서울시 공동주택 아파트 정보 · OA-15818','Seoul apartment-complex data · OA-15818'],['국토교통부 상세 API 공개 항목','Ministry of Land detailed API fields']];
    document.querySelectorAll('#apt-sources li a').forEach((link,index)=>{const pair=sourceLinks[index];if(pair)link.textContent=t(...pair);});
  }
  const tradeType=value=>{
    const labels={'매매':'Sale','중개거래':'Brokered sale','직거래':'Direct sale','분양권':'Presale right','입주권':'Occupancy right'};
    return getLanguage()==='en'?(labels[value]||value||'Sale'):(value||'매매');
  };
  function renderCoverage(){
    if(!dataset)return;const m=dataset.meta;
    $('apt-coverage').textContent=t(
      `서울 ${dataset.districts.length}개 구 · 유효 거래 ${number(m.activeApartmentSales)}건 · 접수 ${m.receiptYears[0]}–${m.receiptYears.at(-1)} · 수집 ${m.retrievedAt.slice(0,10)}`,
      `${dataset.districts.length} Seoul districts · ${number(m.activeApartmentSales)} active sales · Received ${m.receiptYears[0]}–${m.receiptYears.at(-1)} · Retrieved ${m.retrievedAt.slice(0,10)}`
    );
  }
  function renderSourceFacts(){
    if(!dataset)return;const m=dataset.meta,facts=$('apt-source-facts');
    facts.replaceChildren(
      text('p',t(`반영 ${m.retrievedAt.slice(0,10)} · 원본 ${number(m.sourceRows)}건 / 지역 코드 불일치 제외 ${number(m.rejectedRows)}건 / 유효 ${number(m.activeTrades)}건 / 해제 ${number(m.canceledTrades)}건 / 분양·입주권 ${number(m.rightsRows)}건`,`Updated ${m.retrievedAt.slice(0,10)} · ${number(m.sourceRows)} source rows / ${number(m.rejectedRows)} invalid district rows / ${number(m.activeTrades)} active / ${number(m.canceledTrades)} canceled / ${number(m.rightsRows)} rights transfers`)),
      text('p',t(`접수연도 ${m.receiptYears.join(', ')} · 포함된 계약일 ${formatDate(m.contractDateRange[0])}–${formatDate(m.contractDateRange[1])}`,`Receipt years ${m.receiptYears.join(', ')} · Contract dates ${formatDate(m.contractDateRange[0])}–${formatDate(m.contractDateRange[1])}`)),
      text('p',t(`거래 목록 ${number(m.complexesWithTrades)}개 · 공식 좌표 ${number(m.mappedComplexes)}개 · 거래와 좌표 모두 확인 ${number(m.mappedWithTrades)}개`,`${number(m.complexesWithTrades)} sale groups · ${number(m.mappedComplexes)} official coordinates · ${number(m.mappedWithTrades)} with sales and coordinates`))
    );
  }
  function refreshDistrictOptions(){
    if(!dataset)return;for(const option of $('apt-district').options){if(!option.value)continue;const district=dataset.districts.find(d=>d.code===option.value);if(district)option.textContent=pick(district.name,ctx.districtNames[district.name]||'District');}
  }
  function visibility(tab) {active=tab==='apts';root.visible=active;legend.hidden=!active;panel.hidden=!active||!selected;document.body.classList.toggle('apt-active',active);if(!active)labels.forEach(e=>e.hidden=true);}
  document.addEventListener('atlas-tab-change',e=>visibility(e.detail));
  $('apt-detail-close').onclick=()=>{requestID++;selected=null;panel.hidden=true;selectedRing.visible=false;$('apt-query').focus();};
  panel.addEventListener('keydown',e=>{if(e.key==='Escape')$('apt-detail-close').click();});
  $('apt-sources-open').onclick=()=>sources.showModal();$('apt-sources-close').onclick=()=>sources.close();
  $('apt-fly').onclick=()=>{if(!selected?.ll)return;focusMap(selected);panel.hidden=true;$('explore').classList.remove('open');$('open-explore').setAttribute('aria-expanded','false');};
  let debounce;
  $('apt-query').addEventListener('input',()=>{clearTimeout(debounce);debounce=setTimeout(applyFilters,180);});
  $('apt-district').onchange=()=>{applyFilters();if($('apt-district').value)flyDistrict($('apt-district').value,dataset.districts);};
  $('apt-sort').onchange=applyFilters;
  $('apt-reset').onclick=()=>{$('apt-query').value='';$('apt-district').value='';$('apt-sort').value='latest';applyFilters();};
  $('apt-prev').onclick=()=>{listPage--;renderList();};$('apt-next').onclick=()=>{listPage++;renderList();};
  for(const id of ['apt-year','apt-area','apt-floor','apt-canceled','apt-rights'])$(id).onchange=()=>{tradePage=0;renderTrades();};
  $('apt-trade-prev').onclick=()=>{tradePage--;renderTrades();};$('apt-trade-next').onclick=()=>{tradePage++;renderTrades();};
  function pager(prefix,page,count,size) {const pages=Math.max(1,Math.ceil(count/size));$(prefix+'-prev').disabled=page<=0;$(prefix+'-next').disabled=page>=pages-1;$(prefix+'-pages').textContent=`${number(page+1)} / ${number(pages)}`;}
  function applyFilters() {if(!dataset)return;listPage=0;filtered=filterComplexes(dataset.complexes,{query:$('apt-query').value,district:$('apt-district').value,sort:$('apt-sort').value});renderList();buildPoints();}
  function renderList() {
    const results=$('apt-results');results.replaceChildren();$('apt-count').textContent=t(`${number(filtered.length)}개 목록`,`${number(filtered.length)} results`);
    if(!filtered.length)results.append(text('p',t('일치하는 아파트가 없습니다. 이름 또는 자치구를 바꿔 보세요.','No matching apartments. Try another name or district.'),'apt-empty'));
    for(const c of filtered.slice(listPage*LIST_SIZE,(listPage+1)*LIST_SIZE)) {
      const b=document.createElement('button');b.className='apt-result';b.dataset.id=c.id;b.setAttribute('aria-label',t(`${c.name}, ${c.address}, ${formatPrice(c.latest?.[1])}. 거래 내역 열기`,`${c.name}, ${c.address}, ${formatPrice(c.latest?.[1])}. Open sale history`));
      const title=text('strong',c.name);const district=dataset.districts.find(d=>d.code===c.district);b.append(title,text('span',`${pick(district?.name,ctx.districtNames[district?.name])} ${c.dong} ${c.jibun}`,'apt-result-address'));
      const line=document.createElement('span');line.className='apt-result-price';line.append(text('b',c.latest?formatPrice(c.latest[1]):c.count?t('유효 매매 없음','No active sale'):t('거래 미연결','No linked sale')));b.append(line);
      b.append(text('span',c.latest?`${formatDate(c.latest[0])} · ${c.latest[2]}㎡ · ${c.latest[3] ?? '—'}${t('층','F')}`:t('공식 단지 목록','Official catalog'),'apt-result-meta'));
      b.append(text('span',c.ll?t('단지 위치 확인','Mapped complex'):t('위치 미확인 · 내역 조회 가능','Location unavailable · History available'),'apt-location-status'));b.onclick=()=>selectComplex(c.id,true);results.append(b);
    }
    pager('apt',listPage,filtered.length,LIST_SIZE);
  }
  function buildPoints() {
    points=filtered.filter(c=>c.ll).map(c=>{const [x,z]=toWorld(...c.ll);return {c,position:new THREE.Vector3(x,groundHeight(x,z)+.12,z)};});
    if(mesh){root.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}
    mesh=new THREE.InstancedMesh(new THREE.SphereGeometry(.025,7,5),new THREE.MeshBasicMaterial({depthTest:false}),Math.max(1,points.length));mesh.count=points.length;mesh.renderOrder=14;
    points.forEach(({c,position},i)=>{dummy.position.copy(position);dummy.scale.setScalar(1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,new THREE.Color(priceColor(c.latest?.[1])));});mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;root.add(mesh);
    $('apt-map-count').textContent=t(`위치 확인 ${number(points.length)} / 검색 목록 ${number(filtered.length)}`,`${number(points.length)} mapped / ${number(filtered.length)} results`);lastUpdate=0;
  }
  function focusMap(c) {if(!c.ll)return;stopTour();clearPlaceSelection();flyTo(c.ll);const [x,z]=toWorld(...c.ll);selectedPoint=new THREE.Vector3(x,groundHeight(x,z)+.15,z);selectedRing.position.copy(selectedPoint);selectedRing.visible=true;}
  async function getRows(code) {if(districtCache.has(code))return districtCache.get(code);const promise=fetch(`/data/apartments/${code}.json?v=${REV}`).then(r=>{if(!r.ok)throw new Error('거래 자료를 불러오지 못했습니다.');return r.json();});districtCache.set(code,promise);try{return await promise;}catch(e){districtCache.delete(code);throw e;}}
  function showLatest(c) {const el=$('apt-latest');el.replaceChildren(text('span',t('최근 유효 거래','Latest recorded sale'),'apt-small'));el.append(text('strong',formatPrice(c.latest?.[1])));if(c.latest)el.append(text('span',t(`${formatDate(c.latest[0])} · 전용 ${c.latest[2]}㎡ · ${c.latest[3] ?? '미제공'}층`,`${formatDate(c.latest[0])} · ${c.latest[2]}㎡ · Floor ${c.latest[3] ?? 'unavailable'}`)));}
  async function selectComplex(id,focus=false) {
    const c=indexByID.get(id);if(!c)return;selected=c;setTab('apts');panel.hidden=false;const token=++requestID;rows=[];tradePage=0;
    $('apt-detail-name').textContent=c.name;$('apt-detail-address').textContent=c.address;showLatest(c);
    $('apt-building-meta').textContent=[c.yearBuilt?t(`${c.yearBuilt}년 준공`,`Built ${c.yearBuilt}`):null,c.households?t(`${number(c.households)}세대`,`${number(c.households)} households`):null,c.buildingCount?t(`${c.buildingCount}개 동`,`${c.buildingCount} buildings`):null].filter(Boolean).join(' · ');
    $('apt-fly').disabled=!c.ll;$('apt-location-note').textContent=c.ll?t('공식 자료의 단지 대표 위치입니다. 거래 동·호 위치는 아닙니다.','Representative complex point from official data; not the building or unit sold.'):t('좌표가 확인되지 않았습니다. 거래 내역은 아래에서 볼 수 있습니다.','Location unavailable. Sale history remains available below.');
    if(focus&&c.ll)focusMap(c);else if(!c.ll)selectedRing.visible=false;
    $('apt-detail-name').focus({preventScroll:true});panel.scrollTop=0;
    for(const id of ['apt-year','apt-area','apt-floor']){$(id).replaceChildren(option('',t('전체','All')));$(id).disabled=true;}$('apt-canceled').checked=false;$('apt-rights').checked=false;
    $('apt-trades').replaceChildren();$('apt-trade-status').textContent=t('거래 내역을 불러오는 중','Loading sales');pager('apt-trade',0,0,TRADE_SIZE);
    try {
      const response=c.count?await getRows(c.district):null;if(token!==requestID)return;rows=response?.trades[c.id]||[];
      for(const [id,column,label] of [['apt-year',0,v=>v.slice(0,4)],['apt-area',2,v=>`${v}㎡`],['apt-floor',3,v=>`${v}층`]]) {
        const vals=[...new Set(rows.map(t=>id==='apt-year'?String(t[column]).slice(0,4):t[column]===null?'':String(t[column])).filter(Boolean))].sort((a,b)=>id==='apt-year'?Number(b)-Number(a):Number(a)-Number(b));
        $(id).replaceChildren(option('',t('전체','All')),...vals.map(v=>option(v,id==='apt-floor'?t(`${v}층`,`Floor ${v}`):label(v))));$(id).disabled=!rows.length;
      }
      renderTrades();
    } catch(e) {if(token!==requestID)return;$('apt-trade-status').textContent=t('거래 내역을 불러오지 못했습니다.','Could not load sales.');const retry=text('button',t('다시 불러오기','Retry'),'apt-primary');retry.onclick=()=>selectComplex(c.id);$('apt-trade-status').append(retry);}
  }
  function renderTrades() {
    const matches=filterTrades(rows,{year:$('apt-year').value,area:$('apt-area').value,floor:$('apt-floor').value,canceled:$('apt-canceled').checked,rights:$('apt-rights').checked});
    $('apt-trade-status').textContent=t(`${number(matches.length)}건 · 동·호수 미제공`,`${number(matches.length)} sales · Building / unit unavailable`);
    const tbody=$('apt-trades');tbody.replaceChildren();
    if(!matches.length) {const tr=document.createElement('tr'),td=text('td',rows.length?t('조건에 맞는 거래가 없습니다.','No matching sales.'):t('이 항목에 연결된 거래가 없습니다. 이름으로 다른 거래 목록을 검색해 보세요.','No linked sales. Search for another transaction name.'));td.colSpan=7;td.className='apt-empty';tr.append(td);tbody.append(tr);}
    for(const trade of matches.slice(tradePage*TRADE_SIZE,(tradePage+1)*TRADE_SIZE)) {
      const tr=document.createElement('tr');if(trade[4])tr.className='apt-canceled-row';
      for(const v of [formatDate(trade[0]),number(trade[2]),trade[3]===null?t('미제공','Unavailable'):`${trade[3]}`,trade[7]||t('미제공','Unavailable'),t('미공개','Not disclosed')])tr.append(text('td',v));
      const price=text('td',formatPrice(trade[1]),'apt-amount');if(trade[4])price.append(text('small',t(`해제 ${formatDate(trade[4])}`,`Canceled ${formatDate(trade[4])}`)));tr.append(price,text('td',tradeType(trade[8])));tbody.append(tr);
    }
    pager('apt-trade',tradePage,matches.length,TRADE_SIZE);
  }
  function update(now=performance.now()) {
    if(!active||!dataset||now-lastUpdate<90)return;lastUpdate=now;
    const used=[];let slot=0;const desktop=innerWidth>650, left=desktop?410:12, top=desktop?145:190, right=!panel.hidden&&desktop?Math.min(640,innerWidth*.47)+40:45;
    const candidates=selected?.ll?[points.find(p=>p.c.id===selected.id),...points.filter(p=>p.c.id!==selected.id)]:points;
    for(const p of candidates) {if(!p||!p.c.latest)continue;projected.copy(p.position).project(camera);const x=(projected.x*.5+.5)*innerWidth,y=(-projected.y*.5+.5)*innerHeight;
      if(projected.z < -1||projected.z>1||x<left||x>innerWidth-right||y<top||y>innerHeight-190)continue;
      if(used.some(b=>Math.abs(x-b.x)<132&&Math.abs(y-b.y)<56))continue;
      const el=labels[slot++];el.hidden=false;el.dataset.id=p.c.id;el.style.left=x+'px';el.style.top=y+'px';el.style.setProperty('--price-color',priceColor(p.c.latest[1]));el.classList.toggle('selected',selected?.id===p.c.id);
      const content=`${p.c.name}\n${shortPrice(p.c.latest[1])}`;if(el.textContent!==content)el.textContent=content;el.setAttribute('aria-label',t(`${p.c.name}, 최근 ${formatPrice(p.c.latest[1])}, ${p.c.latest[2]}제곱미터. 거래 내역 열기`,`${p.c.name}, latest ${formatPrice(p.c.latest[1])}, ${p.c.latest[2]} square meters. Open sale history`));used.push({x,y});if(slot>=LABEL_COUNT)break;
    }
    for(let i=slot;i<LABEL_COUNT;i++)labels[i].hidden=true;
  }
  async function load() {
    try {const r=await fetch(`/data/apartments/index.json?v=${REV}`);if(!r.ok)throw new Error('Apartment index unavailable');dataset=await r.json();const m=dataset.meta;indexByID=new Map(dataset.complexes.map(c=>[c.id,c]));
      $('apt-coverage').textContent=t(`서울 ${dataset.districts.length}개 구 · 유효 거래 ${number(m.activeApartmentSales)}건 · 접수 ${m.receiptYears[0]}–${m.receiptYears.at(-1)} · 수집 ${m.retrievedAt.slice(0,10)}`,`${dataset.districts.length} Seoul districts · ${number(m.activeApartmentSales)} active sales · Received ${m.receiptYears[0]}–${m.receiptYears.at(-1)} · Retrieved ${m.retrievedAt.slice(0,10)}`);
      $('apt-district').append(...dataset.districts.map(d=>option(d.code,pick(d.name,ctx.districtNames[d.name]||'District'))));
      renderSourceFacts();
      applyFilters();visibility('apts');setTab('apts');if(innerWidth<=650){$('explore').classList.add('open');$('open-explore').setAttribute('aria-expanded','true');}
    } catch(e) {$('apt-coverage').textContent=t('아파트 자료를 불러오지 못했습니다.','Could not load apartment data.');const retry=text('button',t('다시 불러오기','Retry'),'apt-primary');retry.onclick=()=>{retry.remove();load();};$('apt-results').replaceChildren(retry);}
  }
  function refreshLanguage(){
    applyApartmentChrome();
    if(!dataset)return;
    refreshDistrictOptions();renderCoverage();renderSourceFacts();applyFilters();
    if(selected){for(const id of ['apt-year','apt-area','apt-floor']){const select=$(id);for(const option of select.options){if(!option.value)option.textContent=t('전체','All');else if(id==='apt-floor')option.textContent=t(`${option.value}층`,`Floor ${option.value}`);}}$('apt-detail-name').textContent=selected.name;$('apt-detail-address').textContent=selected.address;showLatest(selected);$('apt-building-meta').textContent=[selected.yearBuilt?t(`${selected.yearBuilt}년 준공`,`Built ${selected.yearBuilt}`):null,selected.households?t(`${number(selected.households)}세대`,`${number(selected.households)} households`):null,selected.buildingCount?t(`${selected.buildingCount}개 동`,`${selected.buildingCount} buildings`):null].filter(Boolean).join(' · ');$('apt-location-note').textContent=selected.ll?t('공식 자료의 단지 대표 위치입니다. 거래 동·호 위치는 아닙니다.','Representative complex point from official data; not the building or unit sold.'):t('좌표가 확인되지 않았습니다. 거래 내역은 아래에서 볼 수 있습니다.','Location unavailable. Sale history remains available below.');renderTrades();}
  }
  document.addEventListener('atlas-language-change',refreshLanguage);
  applyApartmentChrome();visibility('apts');
  return {load,update,selectComplex,getState:()=>({ready:Boolean(dataset),active,results:filtered.length,mapped:points.length,selected:selected?.id,sourceRows:dataset?.meta.sourceRows,unitNumberAvailable:false})};
}
