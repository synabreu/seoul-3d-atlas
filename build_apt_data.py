"""Build the apartment snapshot from Seoul's public CSV downloads.

Uses the portal's documented download form, never the MOLIT viewer.
Prices are in 10,000 KRW; building-dong and unit numbers are not in this source.
No deduplication by price/floor: identical public rows may be separate homes.
"""
import argparse
import collections
import csv
import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent
SEOUL_DISTRICT_CODES = set("11110 11140 11170 11200 11215 11230 11260 11290 11305 11320 11350 11380 11410 11440 11470 11500 11530 11545 11560 11590 11620 11650 11680 11710 11740".split())
SOURCES = [
    {"name": "서울시 부동산 실거래가 정보", "id": "OA-21275", "url": "https://data.seoul.go.kr/dataList/OA-21275/S/1/datasetView.do", "license": "공공누리 제1유형 (출처표시)"},
    {"name": "서울시 공동주택 아파트 정보", "id": "OA-15818", "url": "https://data.seoul.go.kr/dataList/OA-15818/S/1/datasetView.do", "license": "공공누리 제1유형 (출처표시)"},
]

def download(inf_id, path, apartment_only=False):
    fields = {"infId": inf_id, "srvType": "S", "serviceKind": "1", "pageNo": "1", "ssUserId": "SAMPLE_VIEW", "strWhere": "", "strOrderby": "CTRT_DAY DESC" if apartment_only else "", "filterCol": "BLDG_USG" if apartment_only else "", "txtFilter": "아파트" if apartment_only else ""}
    req = urllib.request.Request("https://datafile.seoul.go.kr/bigfile/iot/sheet/csv/download.do", data=urllib.parse.urlencode(fields).encode())
    with urllib.request.urlopen(req, timeout=60) as r, path.open("wb") as out:
        if "text/html" in r.headers.get("Content-Type", ""):
            raise RuntimeError("Seoul returned an error page, not a CSV")
        while chunk := r.read(1024 * 1024):
            out.write(chunk)

def norm(value):
    return re.sub(r"[^가-힣a-z0-9]", "", value.lower().replace("아파트", ""))

def local_name(value, dong):
    value = norm(value.replace("이편한세상", "e편한세상"))
    prefix = dong[:-1] if dong.endswith("동") else ""
    if len(prefix) > 1 and value.startswith(prefix):
        value = value[len(prefix):]
    return value

def n(value, default=0):
    try:
        return float(str(value).replace(",", ""))
    except (ValueError, TypeError):
        return default

def parcel(main, sub):
    main, sub = int(n(main)), int(n(sub))
    return str(main) + (f"-{sub}" if sub else "") if main else ""

def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

def read_csv(path):
    with path.open(encoding="cp949", newline="") as f:
        return list(csv.DictReader(f))

def build(trade_path, apartment_path):
    records = read_csv(trade_path)
    catalog = read_csv(apartment_path)
    districts = {}
    complexes = {}
    trades = collections.defaultdict(list)
    rejected = 0
    for r in records:
        if r.get("건물용도") != "아파트":
            raise ValueError("The download contains a non-apartment record")
        code, name = r["자치구코드"], r["건물명"].strip()
        if code not in SEOUL_DISTRICT_CODES or not r["자치구명"]:
            rejected += 1
            continue
        districts[code] = r["자치구명"]
        date = r["계약일"]
        amount, area = n(r["물건금액(만원)"]), n(r["건물면적(㎡)"])
        if not name or not re.fullmatch(r"\d{8}", date) or amount <= 0 or area <= 0:
            rejected += 1
            continue
        jibun = parcel(r["본번"], r["부번"])
        identity = "|".join([code, r["법정동코드"], r["지번구분"], jibun, name])
        key = "s" + hashlib.sha256(identity.encode()).hexdigest()[:16]
        if key not in complexes:
            complexes[key] = {"id": key, "name": name, "district": code, "dong": r["법정동명"], "jibun": jibun, "address": f"서울특별시 {r['자치구명']} {r['법정동명']} {jibun}", "yearBuilt": int(n(r["건축년도"])) or None, "ll": None, "locationSource": None}
        # Preserve cancellation records and each source row, including equal values.
        trades[key].append([int(date), int(amount), area, int(n(r["층"])) if r["층"].strip() else None, int(r["취소일"]) if r["취소일"].strip() else None, int(r["접수연도"]), r["신고구분"] or None, None, r["권리구분"] or None])

    name_index = collections.defaultdict(list)
    local_name_index = collections.defaultdict(list)
    address_index = collections.defaultdict(list)
    for c in complexes.values():
        name_index[(districts[c["district"]], c["dong"], norm(c["name"]))].append(c)
        local_name_index[(districts[c["district"]], c["dong"], local_name(c["name"], c["dong"]))].append(c)
        address_index[(districts[c["district"]], c["dong"], c["jibun"])].append(c)
    match_counts = collections.Counter()
    added_catalog = 0
    district_codes = {name: code for code, name in districts.items()}
    catalog_names = collections.Counter((r["주소(시군구)"].strip(), r["주소(읍면동)"].strip(), norm(r["k-아파트명"].strip())) for r in catalog)
    catalog_local_names = collections.Counter((r["주소(시군구)"].strip(), r["주소(읍면동)"].strip(), local_name(r["k-아파트명"].strip(), r["주소(읍면동)"].strip())) for r in catalog)
    for r in catalog:
        district, dong = r["주소(시군구)"].strip(), r["주소(읍면동)"].strip()
        if district not in district_codes:
            continue
        name = r["k-아파트명"].strip()
        ll = [n(r["좌표X"]), n(r["좌표Y"])]
        valid = 126.7 <= ll[0] <= 127.22 and 37.4 <= ll[1] <= 37.72
        if not valid:
            ll = None
        else:
            ll = [round(v, 7) for v in ll]
        candidates = name_index[(district, dong, norm(name))]
        if catalog_names[(district, dong, norm(name))] > 1:
            candidates = []
        method = "공식 단지명·자치구·법정동 일치"
        if not candidates and catalog_local_names[(district, dong, local_name(name, dong))] == 1:
            candidates = local_name_index[(district, dong, local_name(name, dong))]
            method = "동일 법정동 내 명칭 표기 정규화 일치"
        tail = r["나머지주소"].strip()
        official_parcel = re.fullmatch(r"(\d+)(?:-(\d+))?", tail)
        if not candidates and official_parcel:
            p = parcel(official_parcel[1], official_parcel[2] or 0)
            candidates = address_index[(district, dong, p)]
            method = "공식 지번·자치구·법정동 일치"
        # Ambiguous joins stay unlocated. We never infer a building or apartment unit.
        target = candidates[0] if len(candidates) == 1 and not candidates[0].get("kaptCode") else None
        if target is None:
            key = "k" + r["k-아파트코드"]
            if key in complexes:
                continue
            target = {"id": key, "name": name, "district": district_codes[district], "dong": dong, "jibun": tail if official_parcel else "", "address": r["kapt도로명주소"].strip() or f"서울특별시 {district} {dong}", "yearBuilt": int(r["k-사용검사일-사용승인일"][:4]) if re.match(r"\d{4}", r["k-사용검사일-사용승인일"]) else None, "ll": None, "locationSource": None}
            complexes[key] = target
            added_catalog += 1
            method = "공식 단지 목록 (거래 자료 연결 안 됨)"
        if ll and not target["ll"]:
            target["ll"] = ll
            target["locationSource"] = method
            match_counts[method] += 1
        target["kaptCode"] = r["k-아파트코드"]
        target["households"] = int(n(r["k-전체세대수"])) or None
        target["buildingCount"] = int(n(r["k-전체동수"])) or None
        target["roadAddress"] = r["kapt도로명주소"].strip() or None

    total_valid, canceled, apartment_sales, rights_rows = 0, 0, 0, 0
    all_dates, receipt_years = [], set()
    per_district = collections.defaultdict(dict)
    for c in complexes.values():
        values = sorted(trades[c["id"]], key=lambda r: r[0], reverse=True)
        valid = [t for t in values if t[4] is None]
        canceled += len(values) - len(valid)
        total_valid += len(valid)
        apartment_valid = [t for t in valid if not t[8]]
        apartment_sales += len(apartment_valid)
        rights_rows += sum(bool(t[8]) for t in values)
        c["count"] = len(values)
        c["activeCount"] = len(apartment_valid)
        c["latest"] = apartment_valid[0][:4] if apartment_valid else None
        c["min"] = min((t[1] for t in apartment_valid), default=None)
        c["max"] = max((t[1] for t in apartment_valid), default=None)
        if values:
            all_dates.extend(t[0] for t in values)
            receipt_years.update(t[5] for t in values)
            per_district[c["district"]][c["id"]] = values
    out = ROOT / "dist/data/apartments"
    for stale in out.glob("[0-9][0-9][0-9][0-9][0-9].json"):
        if stale.stem not in per_district:
            stale.unlink()
    for code, data in per_district.items():
        dump(out / f"{code}.json", {"schema": 1, "district": code, "columns": ["contractDate", "priceManwon", "areaM2", "floor", "canceledDate", "receiptYear", "dealType", "buildingDong", "rightType"], "trades": data})
    meta = {"version": "2.0", "schema": 1, "retrievedAt": dt.datetime.now(dt.timezone.utc).isoformat(), "sourceRows": len(records), "tradeRows": sum(len(t) for t in trades.values()), "activeTrades": total_valid, "canceledTrades": canceled, "rejectedRows": rejected, "complexCount": len(complexes), "complexesWithTrades": sum(c["count"] > 0 for c in complexes.values()), "mappedComplexes": sum(c["ll"] is not None for c in complexes.values()), "mappedWithTrades": sum(c["ll"] is not None and c["count"] > 0 for c in complexes.values()), "catalogRows": len(catalog), "catalogOnly": added_catalog, "contractDateRange": [min(all_dates), max(all_dates)], "receiptYears": sorted(receipt_years), "buildingDongAvailable": False, "unitNumberAvailable": False, "coverage": "서울 25개 자치구 · 서울시 공개 CSV 전체 아파트 행. 전체 세대 목록이나 전체 연도 이력은 아닙니다.", "sources": SOURCES, "rawSha256": {"trades": hashlib.sha256(trade_path.read_bytes()).hexdigest(), "apartments": hashlib.sha256(apartment_path.read_bytes()).hexdigest()}, "locationMatches": dict(match_counts)}
    meta.update({"retrievedAt": dt.datetime.fromtimestamp(max(trade_path.stat().st_mtime, apartment_path.stat().st_mtime), dt.timezone.utc).isoformat(), "builtAt": dt.datetime.now(dt.timezone.utc).isoformat(), "activeApartmentSales": apartment_sales, "rightsRows": rights_rows})
    dump(out / "index.json", {"meta": meta, "districts": [{"code": c, "name": name} for c, name in sorted(districts.items())], "complexes": sorted(complexes.values(), key=lambda c: c["id"])})
    dump(out / "provenance.json", meta)
    print(json.dumps(meta, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--trades", type=Path)
    parser.add_argument("--apartments", type=Path)
    parser.add_argument("--download-dir", type=Path)
    args = parser.parse_args()
    if args.download_dir:
        args.download_dir.mkdir(parents=True, exist_ok=True)
        args.trades, args.apartments = args.download_dir / "trades.csv", args.download_dir / "apartments.csv"
        download("OA-21275", args.trades, True)
        download("OA-15818", args.apartments)
    if not args.trades or not args.apartments:
        parser.error("Provide --trades and --apartments, or --download-dir")
    build(args.trades, args.apartments)
