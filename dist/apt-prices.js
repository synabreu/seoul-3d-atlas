import * as THREE from 'three';
import {number, formatPrice, shortPrice, formatDate, filterComplexes, filterTrades, priceColor} from './apt-model.js?v=2.0-apt-1';

const REV = '2.0-apt-1';
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
    <div class="apt-scope"><span>매매 실거래 (Recorded sales)</span><b>v2.0</b></div>
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
    const results=$('apt-results');results.replaceChildren();$('apt-count').textContent=`${number(filtered.length)}개 목록 (results)`;
    if(!filtered.length)results.append(text('p','일치하는 아파트가 없습니다. 이름 또는 자치구를 바꿔 보세요. (No matches)','apt-empty'));
    for(const c of filtered.slice(listPage*LIST_SIZE,(listPage+1)*LIST_SIZE)) {
      const b=document.createElement('button');b.className='apt-result';b.dataset.id=c.id;b.setAttribute('aria-label',`${c.name}, ${c.address}, ${formatPrice(c.latest?.[1])}. 거래 내역 열기`);
      const title=text('strong',c.name);b.append(title,text('span',`${dataset.districts.find(d=>d.code===c.district)?.name} ${c.dong} ${c.jibun}`,'apt-result-address'));
      const line=document.createElement('span');line.className='apt-result-price';line.append(text('b',c.latest?formatPrice(c.latest[1]):c.count?'유효 매매 없음 (No active sale)':'거래 미연결 (No linked sale)'));b.append(line);
      b.append(text('span',c.latest?`${formatDate(c.latest[0])} · ${c.latest[2]}㎡ · ${c.latest[3] ?? '—'}층`:'공식 단지 목록 (Official catalog)','apt-result-meta'));
      b.append(text('span',c.ll?'단지 위치 확인 (Mapped)':'위치 미확인 · 내역 조회 가능 (History available)','apt-location-status'));b.onclick=()=>selectComplex(c.id,true);results.append(b);
    }
    pager('apt',listPage,filtered.length,LIST_SIZE);
  }
  function buildPoints() {
    points=filtered.filter(c=>c.ll).map(c=>{const [x,z]=toWorld(...c.ll);return {c,position:new THREE.Vector3(x,groundHeight(x,z)+.12,z)};});
    if(mesh){root.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}
    mesh=new THREE.InstancedMesh(new THREE.SphereGeometry(.025,7,5),new THREE.MeshBasicMaterial({depthTest:false}),Math.max(1,points.length));mesh.count=points.length;mesh.renderOrder=14;
    points.forEach(({c,position},i)=>{dummy.position.copy(position);dummy.scale.setScalar(1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,new THREE.Color(priceColor(c.latest?.[1])));});mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;root.add(mesh);
    $('apt-map-count').textContent=`위치 확인 ${number(points.length)} / 검색 목록 ${number(filtered.length)} (mapped / results)`;lastUpdate=0;
  }
  function focusMap(c) {if(!c.ll)return;stopTour();clearPlaceSelection();flyTo(c.ll);const [x,z]=toWorld(...c.ll);selectedPoint=new THREE.Vector3(x,groundHeight(x,z)+.15,z);selectedRing.position.copy(selectedPoint);selectedRing.visible=true;}
  async function getRows(code) {if(districtCache.has(code))return districtCache.get(code);const promise=fetch(`/data/apartments/${code}.json?v=${REV}`).then(r=>{if(!r.ok)throw new Error('거래 자료를 불러오지 못했습니다.');return r.json();});districtCache.set(code,promise);try{return await promise;}catch(e){districtCache.delete(code);throw e;}}
  function showLatest(c) {const el=$('apt-latest');el.replaceChildren(text('span','최근 유효 거래 (Latest recorded sale)','apt-small'));el.append(text('strong',formatPrice(c.latest?.[1])));if(c.latest)el.append(text('span',`${formatDate(c.latest[0])} · 전용 ${c.latest[2]}㎡ · ${c.latest[3] ?? '미제공'}층`));}
  async function selectComplex(id,focus=false) {
    const c=indexByID.get(id);if(!c)return;selected=c;setTab('apts');panel.hidden=false;const token=++requestID;rows=[];tradePage=0;
    $('apt-detail-name').textContent=c.name;$('apt-detail-address').textContent=c.address;showLatest(c);
    $('apt-building-meta').textContent=[c.yearBuilt?`${c.yearBuilt}년 준공 (Built)`:null,c.households?`${number(c.households)}세대 (households)`:null,c.buildingCount?`${c.buildingCount}개 동 (buildings)`:null].filter(Boolean).join(' · ');
    $('apt-fly').disabled=!c.ll;$('apt-location-note').textContent=c.ll?'공식 자료의 단지 대표 위치입니다. 거래 동·호 위치는 아닙니다. (Complex representative point.)':'좌표가 확인되지 않았습니다. 거래 내역은 아래에서 볼 수 있습니다. (Location unavailable.)';
    if(focus&&c.ll)focusMap(c);else if(!c.ll)selectedRing.visible=false;
    $('apt-detail-name').focus({preventScroll:true});panel.scrollTop=0;
    for(const id of ['apt-year','apt-area','apt-floor']){$(id).replaceChildren(option('','전체 (All)'));$(id).disabled=true;}$('apt-canceled').checked=false;$('apt-rights').checked=false;
    $('apt-trades').replaceChildren();$('apt-trade-status').textContent='거래 내역을 불러오는 중 (Loading sales)';pager('apt-trade',0,0,TRADE_SIZE);
    try {
      const response=c.count?await getRows(c.district):null;if(token!==requestID)return;rows=response?.trades[c.id]||[];
      for(const [id,column,label] of [['apt-year',0,v=>v.slice(0,4)],['apt-area',2,v=>`${v}㎡`],['apt-floor',3,v=>`${v}층`]]) {
        const vals=[...new Set(rows.map(t=>id==='apt-year'?String(t[column]).slice(0,4):t[column]===null?'':String(t[column])).filter(Boolean))].sort((a,b)=>id==='apt-year'?Number(b)-Number(a):Number(a)-Number(b));
        $(id).replaceChildren(option('','전체 (All)'),...vals.map(v=>option(v,label(v))));$(id).disabled=!rows.length;
      }
      renderTrades();
    } catch(e) {if(token!==requestID)return;$('apt-trade-status').textContent='거래 내역을 불러오지 못했습니다. (Could not load sales)';const retry=text('button','다시 불러오기 (Retry)','apt-primary');retry.onclick=()=>selectComplex(c.id);$('apt-trade-status').append(retry);}
  }
  function renderTrades() {
    const matches=filterTrades(rows,{year:$('apt-year').value,area:$('apt-area').value,floor:$('apt-floor').value,canceled:$('apt-canceled').checked,rights:$('apt-rights').checked});
    $('apt-trade-status').textContent=`${number(matches.length)}건 (sales) · 동·호수 미제공 (Building / unit unavailable)`;
    const tbody=$('apt-trades');tbody.replaceChildren();
    if(!matches.length) {const tr=document.createElement('tr'),td=text('td',rows.length?'조건에 맞는 거래가 없습니다. (No matching sales)':'이 항목에 연결된 거래가 없습니다. 이름으로 다른 거래 목록을 검색해 보세요. (No linked sales)');td.colSpan=7;td.className='apt-empty';tr.append(td);tbody.append(tr);}
    for(const t of matches.slice(tradePage*TRADE_SIZE,(tradePage+1)*TRADE_SIZE)) {
      const tr=document.createElement('tr');if(t[4])tr.className='apt-canceled-row';
      for(const v of [formatDate(t[0]),number(t[2]),t[3]===null?'미제공':`${t[3]}`,t[7]||'미제공','미공개'])tr.append(text('td',v));
      const price=text('td',formatPrice(t[1]),'apt-amount');if(t[4])price.append(text('small',`해제 ${formatDate(t[4])} (Canceled)`));tr.append(price,text('td',t[8]||'매매'));tbody.append(tr);
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
      const content=`${p.c.name}\n${shortPrice(p.c.latest[1])}`;if(el.textContent!==content)el.textContent=content;el.setAttribute('aria-label',`${p.c.name}, 최근 ${formatPrice(p.c.latest[1])}, ${p.c.latest[2]}제곱미터. 거래 내역 열기`);used.push({x,y});if(slot>=LABEL_COUNT)break;
    }
    for(let i=slot;i<LABEL_COUNT;i++)labels[i].hidden=true;
  }
  async function load() {
    try {const r=await fetch(`/data/apartments/index.json?v=${REV}`);if(!r.ok)throw new Error('Apartment index unavailable');dataset=await r.json();const m=dataset.meta;indexByID=new Map(dataset.complexes.map(c=>[c.id,c]));
      $('apt-coverage').textContent=`서울 ${dataset.districts.length}개 구 · 유효 거래 ${number(m.activeApartmentSales)}건 (active sales) · 접수 ${m.receiptYears[0]}–${m.receiptYears.at(-1)} · 수집 ${m.retrievedAt.slice(0,10)}`;
      $('apt-district').append(...dataset.districts.map(d=>option(d.code,d.name+' ('+(ctx.districtNames[d.name]||'District')+')')));
      const facts=$('apt-source-facts');facts.replaceChildren(text('p',`반영 ${m.retrievedAt.slice(0,10)} · 원본 ${number(m.sourceRows)}건 / 지역 코드 불일치 제외 ${number(m.rejectedRows)}건 / 유효 ${number(m.activeTrades)}건 / 해제 ${number(m.canceledTrades)}건 / 분양·입주권 ${number(m.rightsRows)}건`),text('p',`접수연도 ${m.receiptYears.join(', ')} · 포함된 계약일 ${formatDate(m.contractDateRange[0])}–${formatDate(m.contractDateRange[1])}`),text('p',`거래 목록 ${number(m.complexesWithTrades)}개 · 공식 좌표 ${number(m.mappedComplexes)}개 · 거래와 좌표 모두 확인 ${number(m.mappedWithTrades)}개`));
      applyFilters();visibility('apts');setTab('apts');if(innerWidth<=650){$('explore').classList.add('open');$('open-explore').setAttribute('aria-expanded','true');}
    } catch(e) {$('apt-coverage').textContent='아파트 자료를 불러오지 못했습니다. (Could not load apartment data)';const retry=text('button','다시 불러오기 (Retry)','apt-primary');retry.onclick=()=>{retry.remove();load();};$('apt-results').replaceChildren(retry);}
  }
  visibility('apts');
  return {load,update,selectComplex,getState:()=>({ready:Boolean(dataset),active,results:filtered.length,mapped:points.length,selected:selected?.id,sourceRows:dataset?.meta.sourceRows,unitNumberAvailable:false})};
}
