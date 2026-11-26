#!/usr/bin/env python3
"""Fetch an atomic, reproducible WDI candidate. No database or active release writes.

python3 scripts/fetch_data.py --output data/snapshot.json --with-map
All network destinations are fixed public official-data endpoints.
"""
import argparse
import concurrent.futures
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import sys
import time
import urllib.request
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
NE_VERSION = '5.1.2'
NE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_countries.geojson'
INDICATORS = [
    ('population', 'SP.POP.TOTL', '总人口', '人', '来源定义下的年中总人口；含来源估计，不等于已确诊或可支付的患者人数。'),
    ('gdp_pc', 'NY.GDP.PCAP.CD', '人均 GDP', '美元/人', '当年价格美元计的人均国内生产总值；名义值，不等于个人收入。'),
    ('health_pc', 'SH.XPD.CHEX.PC.CD', '人均卫生支出', '美元/人', '经常性卫生支出（CHE）除以人口，以当年美元计；不是人均药品消费。'),
    ('government_share', 'SH.XPD.GHED.CH.ZS', '政府支付比例', '%', '国内一般政府卫生支出占经常性卫生支出（CHE）的比例；不是政府药品采购份额、医保报销比例或政府全部支出占比。'),
    ('life_expectancy', 'SP.DYN.LE00.IN', '平均寿命', '岁', '出生时预期寿命：假定出生时的死亡率模式在一生中保持不变，新生儿预计可生存的年数；不是当年死亡者的平均年龄。'),
    ('age65_share', 'SP.POP.65UP.TO.ZS', '老龄化比例', '%', '65 岁及以上人口占总人口的比例；按来源年中人口估计计算，不是老年抚养比。'),
]
VALUE_TYPES = {
    'population': ('estimate', '年中总人口估计；原始提供方见指标来源，不是 WHO 卫生账户估计。'),
    'gdp_pc': ('source_value', '按国民账户来源发布值；来源未逐条区分估计与观测。'),
    'health_pc': ('estimate', 'WHO GHED 发布的卫生账户数据，包含国家报送与估计；原始观测标记另存于 obs_status。'),
    'government_share': ('estimate', 'WHO GHED 发布的卫生账户数据，包含国家报送与估计；原始观测标记另存于 obs_status。'),
    'life_expectancy': ('estimate', '基于年龄别死亡率生命表估计的出生时预期寿命；原始提供方见指标来源。'),
    'age65_share': ('estimate', '联合国人口司年中人口年龄结构估计；不属于 WHO 卫生账户数据。'),
}
ALIASES = {
    'LAO': ['老挝', '寮国', 'Laos'], 'KHM': ['柬埔寨', 'Cambodia'],
    'PHL': ['菲律宾', 'Philippines'], 'UZB': ['乌兹别克斯坦', '乌兹', 'Uzbekistan'],
    'LKA': ['斯里兰卡', '锡兰', 'Sri Lanka'], 'USA': ['美国', '美利坚', 'US', 'USA'],
    'GBR': ['英国', 'UK', 'United Kingdom'], 'KOR': ['韩国', '南韩', 'South Korea'],
    'PRK': ['朝鲜', 'North Korea'], 'RUS': ['俄罗斯', '俄国', 'Russia'],
    'IRN': ['伊朗', 'Iran'], 'EGY': ['埃及', 'Egypt'], 'TUR': ['土耳其', 'Turkey'],
    'VNM': ['越南', 'Vietnam'], 'VEN': ['委内瑞拉', 'Venezuela'],
    'COD': ['刚果金', '刚果民主共和国'], 'COG': ['刚果布', '刚果共和国'],
    'HKG': ['中国香港', '香港', 'Hong Kong'], 'MAC': ['中国澳门', '澳门', 'Macao'],
    'TWN': ['中国台湾', '台湾', 'Taiwan'], 'PSE': ['巴勒斯坦', 'Palestine'],
}
REGIONS = {'EAS': '东亚与太平洋', 'ECS': '欧洲与中亚', 'LCN': '拉丁美洲与加勒比',
           'MEA': '中东与北非', 'MNA': '中东与北非', 'NAC': '北美', 'SAS': '南亚', 'SSF': '撒哈拉以南非洲'}
CONTINENTS = {'Asia': '东亚与太平洋', 'Europe': '欧洲与中亚', 'Africa': '撒哈拉以南非洲',
              'Oceania': '东亚与太平洋', 'North America': '北美', 'South America': '拉丁美洲与加勒比'}


def get_json(url):
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'PharmaAtlas/0.1 (local research; public data)'})
            with urllib.request.urlopen(req, timeout=45) as response:
                body = response.read(25_000_001)
                if len(body) > 25_000_000:
                    raise ValueError('Response exceeds 25 MB')
            return json.loads(body), hashlib.sha256(body).hexdigest()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(1 + attempt)


def atomic_json(path, payload):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':'), allow_nan=False), encoding='utf-8')
    temp.replace(path)


def extract_metadata(result):
    values = {}
    for source in result.get('source', []):
        for concept in source.get('concept', []):
            for variable in concept.get('variable', []):
                values.update({m['id']: m['value'] for m in variable.get('metatype', [])})
    return values


def fetch_indicator(item, start, end):
    key, code, name, unit, definition = item
    url = f'https://api.worldbank.org/v2/country/all/indicator/{code}?source=2&date={start}:{end}&format=json&per_page=20000'
    result, digest = get_json(url)
    if not isinstance(result, list) or len(result) != 2 or result[0].get('pages') != 1 or not result[1]:
        raise ValueError(f'{code}: incomplete or unexpected WDI response')
    metadata_url = f'https://api.worldbank.org/v2/sources/2/series/{code}/metadata?format=json'
    raw_metadata, meta_digest = get_json(metadata_url)
    metadata = extract_metadata(raw_metadata)
    license_type = metadata.get('License_Type', '未确认')
    value_type, value_type_note = VALUE_TYPES[key]
    descriptor = {'id': key, 'code': code, 'name': name, 'unit': unit, 'definition': definition,
                  'source_url': f'https://data.worldbank.org/indicator/{code}',
                  'api_url': url, 'metadata_url': metadata_url,
                  'provider': metadata.get('Source', '原始提供方未载明；请核查来源元数据'),
                  'distributor': 'World Bank · World Development Indicators', 'license': license_type,
                  'license_url': metadata.get('License_URL', 'https://www.worldbank.org/ext/en/legal/terms-conditions/datasets'),
                  'export_allowed': license_type == 'CC BY-4.0', 'source_version': result[0].get('lastupdated'),
                  'value_type': value_type, 'value_type_note': value_type_note,
                  'attribution': f'The World Bank: World Development Indicators: {metadata.get("Source", "source metadata")}',
                  'metadata': metadata}
    return descriptor, result, {'url': url, 'sha256': digest, 'metadata_sha256': meta_digest}


def transform_geojson(raw, countries):
    features = []
    missing = []
    for index, feature in enumerate(raw['features']):
        p = feature['properties']
        if p.get('ADM0_A3') == 'ATA':
            continue
        # Natural Earth KOS and WDI XKX denote the same source entity.
        aliases = {'KOS': 'XKX', 'KSV': 'XKX'}
        choices = [aliases.get(v, v) for v in (p.get('WB_A3'), p.get('ISO_A3'), p.get('ADM0_A3'))]
        code = next((v for v in choices if v in countries), None)
        if not code:
            code = next((v for v in choices if isinstance(v, str) and len(v) == 3 and v != '-99'), None)
        if not code:
            missing.append(p.get('ADMIN'))
            continue
        country = countries.get(code)
        if not country:
            iso2 = 'TW' if code == 'TWN' else p.get('ISO_A2', '')
            iso2 = iso2 if isinstance(iso2, str) and len(iso2) == 2 and iso2.isalpha() else ''
            display_aliases = ALIASES.get(code, [])
            country = {'iso3': code, 'iso2': iso2, 'name': display_aliases[0] if display_aliases else (p.get('NAME_ZH') or p.get('NAME_EN') or p['ADMIN']),
                       'name_en': p.get('NAME_EN') or p['ADMIN'], 'aliases': ALIASES.get(code, []),
                       'region': CONTINENTS.get(p.get('CONTINENT'), '其他地区'), 'capital': '',
                       'longitude': p.get('LABEL_X'), 'latitude': p.get('LABEL_Y'), 'wb_available': False,
                       'metrics': {i[0]: {} for i in INDICATORS}, 'observation_meta': {},
                       'missing_reason': '未纳入本次 WDI 经济体数据；保留地图与资料入口'}
            countries[code] = country
        # Keep only public display geometry and normalized mapping, not hundreds of unused fields.
        features.append({'type': 'Feature', 'id': index + 1,
                         'properties': {'iso3': code, 'name': country['name'], 'name_en': country['name_en'],
                                        'label_rank': p.get('LABELRANK', 5), 'label_x': p.get('LABEL_X'), 'label_y': p.get('LABEL_Y')},
                         'geometry': feature['geometry']})
    return {'type': 'FeatureCollection', 'features': features}, missing


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default=str(ROOT / 'data/snapshot.json'))
    parser.add_argument('--with-map', action='store_true')
    parser.add_argument('--end-year', type=int, default=dt.datetime.now(ZoneInfo('Asia/Shanghai')).year - 1)
    args = parser.parse_args()
    end, start = args.end_year, args.end_year - 4
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        english_future = pool.submit(get_json, 'https://api.worldbank.org/v2/country?format=json&per_page=400')
        chinese_future = pool.submit(get_json, 'https://api.worldbank.org/v2/zh/country?format=json&per_page=400')
        series_futures = [pool.submit(fetch_indicator, item, start, end) for item in INDICATORS]
        english, english_hash = english_future.result()
        chinese, chinese_hash = chinese_future.result()
        if english[0].get('pages') != 1 or chinese[0].get('pages') != 1:
            raise ValueError('Country response truncated')
        by_zh = {c['id']: c for c in chinese[1]}
        countries = {}
        for c in english[1]:
            if c.get('region', {}).get('id') == 'NA':
                continue
            zh = by_zh.get(c['id'], {})
            aliases = ALIASES.get(c['id'], [])
            countries[c['id']] = {'iso3': c['id'], 'iso2': c['iso2Code'], 'name': aliases[0] if aliases else (zh.get('name') or c['name']),
                                  'name_en': c['name'], 'aliases': list(set(aliases + [zh.get('name', ''), c['name']])),
                                  'region': REGIONS.get(c['region']['id'], zh.get('region', {}).get('value') or c['region']['value']),
                                  'capital': zh.get('capitalCity') or c['capitalCity'],
                                  'longitude': float(c['longitude']) if c['longitude'] else None,
                                  'latitude': float(c['latitude']) if c['latitude'] else None,
                                  'wb_available': True, 'metrics': {}, 'observation_meta': {}}
        if len(countries) < 190:
            raise ValueError('Unexpectedly incomplete country coverage')
        descriptors, manifests, quarantine = [], [], []
        for future in series_futures:
            descriptor, result, manifest = future.result()
            key = descriptor['id']
            descriptors.append(descriptor)
            manifests.append(manifest)
            for c in countries.values():
                c['metrics'][key] = {str(year): None for year in range(start, end + 1)}
            seen = set()
            for row in result[1]:
                code, year, value = row['countryiso3code'], row['date'], row['value']
                if code not in countries:
                    continue
                record_key = (code, key, year)
                if record_key in seen:
                    raise ValueError('Duplicate observation: ' + str(record_key))
                seen.add(record_key)
                if not year.isdigit() or not start <= int(year) <= end:
                    raise ValueError('Unexpected statistical year')
                invalid = value is not None and (isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0 or descriptor['unit'] == '%' and value > 100)
                if invalid:
                    quarantine.append({'iso3': code, 'indicator': key, 'year': year, 'value': value, 'reason': '数值或合理范围校验失败'})
                    value = None
                status = row.get('obs_status', '')
                # Forecasts never participate in maps/ranks silently.
                if status == 'F':
                    quarantine.append({'iso3': code, 'indicator': key, 'year': year, 'value': value, 'reason': '预测值不参与默认比较'})
                    value = None
                countries[code]['metrics'][key][year] = value
                countries[code]['observation_meta'].setdefault(key, {})[year] = {
                    'status': 'under_review' if invalid else 'available' if value is not None else 'not_reported',
                    'value_type': 'estimate' if status == 'E' or descriptor['value_type'] == 'estimate' else descriptor['value_type'],
                    'obs_status': status, 'source_record': f'{code}/{descriptor["code"]}/{year}',
                    'source_version': descriptor['source_version']}
    geo_path = ROOT / 'data/world.geojson'
    if args.with_map or not geo_path.exists():
        raw_geo, geo_hash = get_json(NE_URL)
        geo, unmapped = transform_geojson(raw_geo, countries)
        atomic_json(geo_path, geo)
        atomic_json(ROOT / 'data/map-provenance.json', {'version': NE_VERSION, 'scale': '1:50m', 'url': NE_URL,
                    'sha256': geo_hash, 'fetched_at': now, 'license': 'Public domain', 'unmapped': unmapped,
                    'terms_url': 'https://www.naturalearthdata.com/about/terms-of-use/',
                    'note': '边界仅用于资料导航；Natural Earth 原始边界未经法律边界审核，不用于界定主权。'})
    else:
        # Preserve searchable boundary-only countries on scheduled WDI refresh.
        geo = json.loads(geo_path.read_text(encoding='utf-8'))
        previous_path = ROOT / 'data/snapshot.json'
        previous = json.loads(previous_path.read_text(encoding='utf-8')) if previous_path.exists() else {}
        for old in previous.get('countries', []):
            if old['iso3'] not in countries and old.get('wb_available') is False:
                old['metrics'] = {i[0]: {} for i in INDICATORS}
                # Boundary-only regions retain navigation, never obsolete observations.
                old['observation_meta'] = {}
                countries[old['iso3']] = old
    release_fingerprint = {'manifests': manifests, 'mapping': [(c['iso3'], c['name']) for c in sorted(countries.values(), key=lambda c: c['iso3'])]}
    payload = {'version': 'wdi-' + now[:10] + '-' + hashlib.sha256(json.dumps(release_fingerprint, sort_keys=True).encode()).hexdigest()[:8],
               'fetched_at': now, 'source_updated': max(d['source_version'] or '' for d in descriptors),
               'years': list(range(start, end + 1)), 'indicators': descriptors,
               'countries': sorted(countries.values(), key=lambda c: c['iso3']),
               'sources': [{'id': 'wdi', 'title': 'World Development Indicators', 'institution': 'World Bank',
                            'url': 'https://data.worldbank.org/', 'license': 'CC BY-4.0（逐指标核对）',
                            'checked_at': now[:10], 'export_allowed': True,
                            'note': '六项指标的许可与原始提供方逐项保留 WDI metadata。WHO GHED 提供两项卫生支出数据；人口、寿命及年龄结构来自联合国人口司等对应来源。'},
                           {'id': 'natural-earth', 'title': 'Natural Earth 1:50m · v5.1.2', 'institution': 'Natural Earth',
                            'url': 'https://www.naturalearthdata.com/about/terms-of-use/', 'license': 'Public domain',
                            'checked_at': now[:10], 'export_allowed': True,
                            'note': '边界仅用于资料导航；不用于界定主权。'}],
               'raw_manifest': manifests, 'country_sha256': english_hash, 'country_zh_sha256': chinese_hash,
               'quarantine': quarantine}
    if not all(any(c['metrics'].get(d['id'], {}).get(str(y)) is not None for c in countries.values() for y in range(start, end + 1)) for d in descriptors):
        raise ValueError('At least one complete indicator failed: active snapshot is unchanged')
    atomic_json(args.output, payload)
    summary = {d['id']: {str(y): sum(c['metrics'].get(d['id'], {}).get(str(y)) is not None for c in countries.values()) for y in range(start, end + 1)} for d in descriptors}
    print(json.dumps({'output': str(args.output), 'version': payload['version'], 'countries': len(countries), 'coverage': summary,
                      'quarantined': len(quarantine)}, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print('数据获取失败，未替换目标快照：' + str(exc), file=sys.stderr)
        sys.exit(1)
