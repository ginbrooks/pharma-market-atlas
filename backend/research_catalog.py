"""Row-level research index and edits backed by the versioned application database.

The index is a projection, not a second source of truth. Every publication rebuilds
it in the same transaction; revisions record changed records without duplicating
unchanged observations. Editors can change records, never arbitrary JSON paths.
"""
import copy
import hashlib
import json
from datetime import date

from .data_logic import (finite_value, profile_structure_errors, source_url_valid,
                         timestamp, validate_snapshot)

KINDS = ('country', 'observation', 'profile', 'section', 'rule', 'source', 'indicator',
         'channel_dataset', 'procurement', 'import_year', 'import_series',
         'api_import_year', 'api_import_category', 'medicine_site',
         'import_origin_dataset', 'import_origin_partner', 'gmp_fact', 'market_indicator', 'religion_daily', 'culture_highlight')
SCHEMA = '''
CREATE TABLE IF NOT EXISTS research_records(
 id TEXT PRIMARY KEY, iso3 TEXT NOT NULL, country_name TEXT NOT NULL,
 kind TEXT NOT NULL, module TEXT NOT NULL, item_key TEXT NOT NULL,
 title TEXT NOT NULL, summary TEXT NOT NULL, content TEXT NOT NULL,
 source_refs TEXT NOT NULL, fingerprint TEXT NOT NULL, base_version TEXT NOT NULL,
 updated_at TEXT NOT NULL, editable INTEGER NOT NULL, target TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS research_country_kind ON research_records(iso3,kind,module);
CREATE INDEX IF NOT EXISTS research_kind ON research_records(kind);
CREATE TABLE IF NOT EXISTS research_record_sources(
 record_id TEXT NOT NULL REFERENCES research_records(id) ON DELETE CASCADE,
 source_record_id TEXT NOT NULL REFERENCES research_records(id) ON DELETE CASCADE,
 PRIMARY KEY(record_id,source_record_id)
);
CREATE TABLE IF NOT EXISTS research_revisions(
 id INTEGER PRIMARY KEY,record_id TEXT NOT NULL,created_at TEXT NOT NULL,
 actor TEXT NOT NULL,reason TEXT NOT NULL,from_version TEXT,to_version TEXT NOT NULL,
 before_content TEXT,after_content TEXT
);
CREATE INDEX IF NOT EXISTS research_revision_record ON research_revisions(record_id,id DESC);
'''


def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)


def fingerprint(value):
    # Object key order does not turn an otherwise identical form save into a change.
    text = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)
    return hashlib.sha256(text.encode()).hexdigest()


def record_id(iso, kind, key):
    return f'{iso}:{kind}:{key}'


def collect_source_ids(value):
    found = []
    if isinstance(value, dict):
        if isinstance(value.get('source_id'), str):
            found.append(value['source_id'])
        for field in ('source_ids', 'current_source_ids'):
            refs = value.get(field, [])
            if isinstance(refs, list):
                found.extend(s for s in refs if isinstance(s, str))
        for k, child in value.items():
            if k not in ('source_ids', 'current_source_ids'):
                found.extend(collect_source_ids(child))
    elif isinstance(value, list):
        for child in value:
            found.extend(collect_source_ids(child))
    return list(dict.fromkeys(found))


def catalog_records(snapshot, profiles):
    rows = []
    def add(iso, name, kind, key, content, title, module='', refs=None, editable=True, target=None):
        rows.append(dict(id=record_id(iso, kind, key), iso3=iso, country_name=name, kind=kind,
            module=module, item_key=key, title=title, summary=str(content.get('summary') or content.get('note') or content.get('business_implication') or '')[:500],
            content=copy.deepcopy(content), source_refs=refs or [], fingerprint=fingerprint(content),
            editable=editable, target=target or {}))
        if kind == 'observation':
            val = content.get('value')
            rows[-1]['summary'] = '暂无数值' if val is None else f"{val:,.2f} {content.get('unit') or ''}"
        elif kind == 'channel_dataset':
            rows[-1]['summary'] = str(content.get('year', '')) + ' · ' + str(content.get('denominator', ''))
        elif kind == 'source':
            rows[-1]['summary'] = str(content.get('institution') or '') + ' · ' + str(content.get('locator') or '')
        elif kind in ('culture_highlight', 'religion_daily'):
            rows[-1]['summary'] = content.get('text', '')
        elif kind == 'medicine_site':
            rows[-1]['summary'] = content.get('description', '')
        elif kind == 'import_origin_dataset':
            rows[-1]['summary'] = f"{content['year']} · HS {content['hs_code']} · {content['total_usd']:,.2f} 美元"
        elif kind == 'import_origin_partner':
            rows[-1]['summary'] = f"{content['amount_usd']:,.2f} 美元 · {content['share_pct']:.2f}%"
    indicators = {i['id']: i for i in snapshot.get('indicators', [])}
    for iid, ind in indicators.items():
        add('GLOBAL', '全部国家', 'indicator', iid, ind, ind.get('name', iid), 'statistics', editable=False)
    for idx, source in enumerate(snapshot.get('sources', [])):
        key = source.get('id') or f'source-{idx}'
        add('GLOBAL', '全部国家', 'source', key, source, source.get('title', key), 'statistics', editable=False)
    for country in snapshot.get('countries', []):
        iso, name = country['iso3'], country.get('name', country['iso3'])
        content = {k:v for k,v in country.items() if k not in ('metrics', 'observation_meta')}
        add(iso, name, 'country', 'metadata', content, name+' · 国家资料', 'country')
        for iid, indicator in indicators.items():
            years = sorted(set(str(y) for y in snapshot.get('years', [])) | set(country.get('metrics', {}).get(iid, {})))
            for year in years:
                content = dict(indicator_id=iid, year=int(year), unit=indicator.get('unit'),
                    value=country.get('metrics', {}).get(iid, {}).get(year),
                    observation_meta=country.get('observation_meta', {}).get(iid, {}).get(year, {}))
                add(iso,name,'observation',iid+':'+year,content,
                    f"{indicator.get('name',iid)} · {year}", 'statistics',
                    [record_id('GLOBAL','indicator',iid)], target={'indicator_id':iid,'year':year})
        profile = profiles.get(iso)
        if not profile:
            continue
        content = {k:v for k,v in profile.items() if k not in ('sections','rules','sources')}
        add(iso,name,'profile','metadata',content,name+' · 档案资料','profile',
            [record_id(iso,'source',sid) for sid in collect_source_ids(content)])
        for singular, plural in (('section','sections'),('rule','rules'),('source','sources')):
            for item in profile.get(plural, []):
                key = item['id']
                module = item.get('module') or item.get('category') or (key if singular=='section' else singular)
                refs = [record_id(iso,'source',sid) for sid in collect_source_ids(item)]
                add(iso,name,singular,key,item,item.get('title',key),module,refs,
                    editable=not bool(item.get('import_data') or item.get('api_import_data') or item.get('import_origin_data')),
                    target={'collection':plural,'id':key})
                if singular != 'section':
                    continue
                for kind, container, field in (('gmp_fact', 'gmp', 'facts'), ('market_indicator', 'market_context', 'indicators'), ('religion_daily', 'religion', 'everyday'), ('religion_daily', 'religion_life', 'everyday'), ('culture_highlight', 'local_culture', 'highlights')):
                    for child in item.get(container, {}).get(field, []):
                        add(iso,name,kind,key+':'+child['id'],child,child.get('title') or child.get('label') or child['id'],
                            key, [record_id(iso,'source',sid) for sid in collect_source_ids(child)],
                            target={'section_id':key,'container':container,'field':field,'id':child['id']})
                for kind, field in (('channel_dataset','datasets'),('procurement','procurement')):
                    for child in item.get('channel_research', {}).get(field, []):
                        child_key=key+':'+child['id']
                        add(iso,name,kind,child_key,child,child.get('title') or child.get('summary') or child['id'],
                            'sales_channels', [record_id(iso,'source',sid) for sid in collect_source_ids(child)],
                            target={'section_id':key,'field':field,'id':child['id']})
                for row in item.get('import_data', {}).get('years', []):
                    add(iso,name,'import_year',key+':'+str(row['year']),row,f"药品进口 · {row['year']}",'trade_imports',refs,False)
                for row in item.get('import_data', {}).get('trend', {}).get('series', []):
                    add(iso,name,'import_series',key+':'+row['code'],row,f"HS {row['code']} · {row.get('name','')}",'trade_imports',refs,False)
                for row in item.get('api_import_data', {}).get('years', []):
                    add(iso,name,'api_import_year',key+':'+str(row['year']),row,f"原料药进口 · {row['year']}",'api_imports',refs,False)
                for row in item.get('api_import_data', {}).get('categories', []):
                    add(iso,name,'api_import_category',key+':'+row['id'],row,row.get('name',row['id']),'api_imports',refs,False)
                origin = item.get('import_origin_data')
                if origin:
                    year_key = key + ':' + str(origin['year'])
                    add(iso,name,'import_origin_dataset',year_key,origin,
                        f"制剂进口来源 · {origin['year']}",'import_origins',refs,False)
                    for partner in origin['partners']:
                        add(iso,name,'import_origin_partner',year_key+':'+partner['code'],
                            dict(partner,year=origin['year'],hs_code=origin['hs_code'],currency=origin['currency']),
                            f"{partner['name']} · {origin['year']}",'import_origins',refs,False)
                for site in item.get('medicine_sites', []):
                    add(iso,name,'medicine_site',key+':'+site['id'],site,site['title'],'official_medicine_sites',
                        [record_id(iso,'source',sid) for sid in collect_source_ids(site)],
                        target={'section_id':key,'field':'medicine_sites','id':site['id']})
    if len({row['id'] for row in rows}) != len(rows):
        raise ValueError('资料库记录ID重复')
    return rows


def synchronize(db, snapshot, profiles, version, actor, reason):
    """Caller owns the transaction. Does not touch drafts, accounts or sessions."""
    now = timestamp()
    old = {r['id']:r for r in db.execute('SELECT * FROM research_records')}
    records = catalog_records(snapshot, profiles)
    new_ids = {r['id'] for r in records}
    writes, revisions = [], []
    for row in records:
        before = old.get(row['id'])
        changed = not before or before['fingerprint'] != row['fingerprint']
        content = encode(row['content'])
        writes.append((row['id'],row['iso3'],row['country_name'],row['kind'],row['module'],row['item_key'],
            row['title'],row['summary'],content,encode(row['source_refs']),row['fingerprint'],version,
            now if changed else before['updated_at'],int(row['editable']),encode(row['target'])))
        if changed:
            revisions.append((row['id'],now,actor,reason,before['base_version'] if before else None,version,
                              before['content'] if before else None,content))
    for rid, before in old.items():
        if rid not in new_ids:
            revisions.append((rid,now,actor,reason,before['base_version'],version,before['content'],None))
    db.execute('DELETE FROM research_record_sources')
    db.executemany('DELETE FROM research_records WHERE id=?', [(rid,) for rid in old if rid not in new_ids])
    db.executemany('''INSERT INTO research_records VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET iso3=excluded.iso3,country_name=excluded.country_name,
      kind=excluded.kind,module=excluded.module,item_key=excluded.item_key,title=excluded.title,
      summary=excluded.summary,content=excluded.content,source_refs=excluded.source_refs,
      fingerprint=excluded.fingerprint,base_version=excluded.base_version,updated_at=excluded.updated_at,
      editable=excluded.editable,target=excluded.target''',writes)
    db.executemany('INSERT INTO research_record_sources VALUES(?,?)',
        [(r['id'],sid) for r in records for sid in r['source_refs'] if sid in new_ids])
    db.executemany('''INSERT INTO research_revisions(record_id,created_at,actor,reason,from_version,to_version,before_content,after_content)
                   VALUES(?,?,?,?,?,?,?,?)''', revisions)
    db.execute("INSERT INTO settings(key,value) VALUES('research_catalog_version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (version,))
    return len(records)


def serialize_record(row):
    result = dict(row)
    result.pop('target', None)
    result['content'] = json.loads(result['content'])
    result['source_refs'] = json.loads(result['source_refs'])
    result['editable'] = bool(result['editable'])
    if not result['editable']:
        result['readonly_reason'] = '关联计算数据，请更新原始进口数据后重新导入。' if result['kind'].startswith(('import_', 'api_import_')) or result['content'].get('import_data') or result['content'].get('api_import_data') or result['content'].get('import_origin_data') else '全局指标定义及来源为只读；可编辑各国观测值。'
    return result


def detail(db, rid):
    row=db.execute('SELECT * FROM research_records WHERE id=?',(rid,)).fetchone()
    if row is None:
        return None
    history=[]
    for revision in db.execute('SELECT * FROM research_revisions WHERE record_id=? ORDER BY id DESC LIMIT 100',(rid,)):
        revision=dict(revision)
        for key in ('before_content','after_content'):
            revision[key]=json.loads(revision[key]) if revision[key] is not None else None
        history.append(revision)
    sources=[]
    for source in db.execute('SELECT s.* FROM research_record_sources rel JOIN research_records s ON s.id=rel.source_record_id WHERE rel.record_id=? ORDER BY s.id',(rid,)):
        content=json.loads(source['content'])
        if source['kind']=='indicator':
            content={**content,'title':content.get('name'),'url':content.get('source_url'),'institution':content.get('provider'),'locator':content.get('code')}
        sources.append({**content,'record_id':source['id']})
    return {'record':serialize_record(row),'history':history,'sources':sources}


def list_records(db, country='', kind='', q='', limit=50, offset=0):
    if kind and kind not in KINDS:
        raise ValueError('数据类型无效')
    if not 1 <= limit <= 200 or offset < 0 or len(q)>200:
        raise ValueError('分页或搜索条件无效')
    clauses, params=[],[]
    if country:
        clauses.append('iso3=?');params.append(country.upper())
    if kind:
        clauses.append('kind=?');params.append(kind)
    if q:
        pattern='%'+q.replace('\\','\\\\').replace('%','\\%').replace('_','\\_')+'%'
        clauses.append("(title LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\' OR country_name LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\')")
        params.extend([pattern]*4)
    where=' WHERE '+' AND '.join(clauses) if clauses else ''
    total=db.execute('SELECT COUNT(*) FROM research_records'+where,params).fetchone()[0]
    items=[serialize_record(r) for r in db.execute('SELECT * FROM research_records'+where+' ORDER BY iso3,kind,item_key LIMIT ? OFFSET ?',params+[limit,offset])]
    counts={r['kind']:r['n'] for r in db.execute('SELECT kind,COUNT(*) n FROM research_records GROUP BY kind')}
    version=db.execute("SELECT value FROM settings WHERE key='research_catalog_version'").fetchone()
    return {'version':version[0] if version else None,'total':total,'counts':counts,'items':items}


def merge_fields(old, submitted):
    """Omitted metadata survives simple forms; arrays are deliberate replacements."""
    result=copy.deepcopy(old)
    for key,value in submitted.items():
        if isinstance(value,dict) and isinstance(result.get(key),dict):
            result[key]=merge_fields(result[key],value)
        else:
            result[key]=copy.deepcopy(value)
    return result


def pending(item, kind):
    for key in ('reviewer','human_verified_by','human_verified_fingerprint','review_reason','is_current','evidence_status','overdue','human_verified_at'):
        item.pop(key,None)
    if kind=='source':
        item['human_verified_at']=None
    elif kind=='section':
        item.update(status='not_compiled' if item.get('kind')=='data_gap' else 'pending',reviewed_at=None)
    else:
        item.update(review_status='pending',reviewed_at=None)
        if kind=='profile':
            item['coverage']='basic'
        if kind=='rule':
            item['validity']='unknown'
            item['next_review_at']=None
            if 'current_status' in item:
                item.update(current_status='unconfirmed', current_checked_at=None,
                            current_basis='', current_source_ids=[])
    return item


def validate_profile(profile):
    def validate_refs(value):
        if isinstance(value,dict):
            if 'source_ids' in value and (not isinstance(value['source_ids'],list) or
                    any(not isinstance(sid,str) or not sid for sid in value['source_ids'])):
                raise ValueError('来源引用必须为非空ID组成的列表')
            for child in value.values():
                validate_refs(child)
        elif isinstance(value,list):
            for child in value:
                validate_refs(child)
    validate_refs(profile)
    for collection in ('sections','rules','sources'):
        items=profile.get(collection,[])
        if not isinstance(items,list) or any(not isinstance(i,dict) or not isinstance(i.get('id'),str) for i in items):
            raise ValueError('章节、规则和来源必须为带ID的对象列表')
        if len({i['id'] for i in items}) != len(items):
            raise ValueError('章节、规则或来源ID重复')
    ids={s['id'] for s in profile.get('sources',[])}
    for section in profile.get('sections',[]):
        research=section.get('channel_research')
        if research is not None:
            if not isinstance(research,dict):
                raise ValueError('渠道研究必须为对象')
            for field in ('datasets','procurement'):
                children=research.get(field,[])
                if not isinstance(children,list) or any(not isinstance(c,dict) or not isinstance(c.get('id'),str) or not c['id'] for c in children):
                    raise ValueError('渠道数据集及采购记录必须包含ID')
                if len({c['id'] for c in children})!=len(children):
                    raise ValueError('渠道数据集或采购记录ID重复')
    for source in profile.get('sources',[]):
        if not source_url_valid(source.get('url')):
            raise ValueError('来源必须使用完整 HTTPS 地址')
    for collection in ('sections','rules'):
        for item in profile.get(collection,[]):
            if any(sid not in ids for sid in collect_source_ids(item)):
                raise ValueError('数据引用的来源不存在')
    errors=profile_structure_errors(profile)
    if errors:
        raise ValueError('；'.join(errors))


def find_item(profile, target, kind):
    if kind=='profile':
        return {k:v for k,v in profile.items() if k not in ('sections','rules','sources')}
    if kind in ('section','rule','source'):
        return next((i for i in profile.get(target['collection'],[]) if i['id']==target['id']),None)
    section=next((i for i in profile.get('sections',[]) if i['id']==target['section_id']),None)
    if kind=='medicine_site':
        return next((i for i in (section or {}).get('medicine_sites',[]) if i['id']==target['id']),None)
    if kind in ('gmp_fact', 'market_indicator', 'religion_daily', 'culture_highlight'):
        return next((i for i in (section or {}).get(target['container'],{}).get(target['field'],[]) if i['id']==target['id']),None)
    return next((i for i in (section or {}).get('channel_research',{}).get(target['field'],[]) if i['id']==target['id']),None)


def replace_profile_item(profile, target, kind, value):
    result=copy.deepcopy(profile)
    if kind=='profile':
        for key in value:
            result[key]=copy.deepcopy(value[key])
    elif kind in ('section','rule','source'):
        result[target['collection']]=[copy.deepcopy(value) if i['id']==target['id'] else i for i in result.get(target['collection'],[])]
    else:
        section=next(s for s in result['sections'] if s['id']==target['section_id'])
        if kind=='medicine_site':
            section['medicine_sites']=[copy.deepcopy(value) if i['id']==target['id'] else i for i in section['medicine_sites']]
            section['source_ids']=list(dict.fromkeys(section['source_ids']+collect_source_ids(value)))
        elif kind in ('gmp_fact', 'market_indicator', 'religion_daily', 'culture_highlight'):
            section[target['container']][target['field']]=[copy.deepcopy(value) if i['id']==target['id'] else i for i in section[target['container']][target['field']]]
            section['source_ids']=list(dict.fromkeys(section['source_ids']+collect_source_ids(value)))
        else:
            section['channel_research'][target['field']]=[copy.deepcopy(value) if i['id']==target['id'] else i for i in section['channel_research'][target['field']]]
        pending(section,'section')
    if kind=='source':
        for collection,singular in (('sections','section'),('rules','rule')):
            for item in result.get(collection,[]):
                if target['id'] in collect_source_ids(item):
                    pending(item,singular)
    pending(result,'profile')
    return result


class CatalogConflict(Exception):
    pass


def edit_record(store, db, rid, submitted, expected, reason, actor):
    """Serialize edits inside BEGIN IMMEDIATE, checking active record + draft node."""
    row=db.execute('SELECT * FROM research_records WHERE id=?',(rid,)).fetchone()
    if row is None:
        raise KeyError(rid)
    if not row['editable']:
        raise PermissionError('此数据为只读关联项')
    if not isinstance(submitted,dict):
        raise ValueError('content必须为JSON对象')
    if not isinstance(reason,str) or not 2 <= len(reason.strip()) <= 2000:
        raise ValueError('请填写2至2000字的修改原因')
    if not isinstance(expected,str) or expected!=row['fingerprint']:
        raise CatalogConflict('这条数据已更新，请重新打开后再修改')
    old=json.loads(row['content']);content=merge_fields(old,submitted)
    kind,iso,target=row['kind'],row['iso3'],json.loads(row['target'])
    for key in ('id','iso3','iso2','indicator_id') + (('year','unit') if kind == 'observation' else ()):
        if key in old and content.get(key)!=old[key]:
            raise ValueError('记录身份与单位不可更改：'+key)
    if fingerprint(content)==row['fingerprint']:
        return {'ok':True,'version':row['base_version'],'unchanged':True,**detail(db,rid)}
    state=db.execute("SELECT v.* FROM versions v JOIN settings s ON s.key='active_version' AND s.value=v.id").fetchone()
    snapshot,profiles=json.loads(state['snapshot']),json.loads(state['profiles'])
    draft_update=None
    if kind in ('country','observation'):
        country=next(c for c in snapshot['countries'] if c['iso3']==iso)
        if kind=='country':
            if any(k in submitted for k in ('metrics','observation_meta')):
                raise ValueError('统计数值应通过对应观测记录修改')
            for field in ('name','name_en','region'):
                if not isinstance(content.get(field),str) or not content[field].strip():
                    raise ValueError('国家名称与区域必须为非空文本')
            if not isinstance(content.get('aliases',[]),list) or any(not isinstance(a,str) for a in content.get('aliases',[])):
                raise ValueError('别名必须为文本列表')
            for field,bound in (('latitude',90),('longitude',180)):
                value=content.get(field)
                if value is not None and (not finite_value(value) or not -bound <= value <= bound):
                    raise ValueError('经纬度超出有效范围')
            country.update(content)
        else:
            if set(submitted)-set(old):
                raise ValueError('观测记录包含未知字段')
            iid,year=target['indicator_id'],target['year']
            value=content.get('value')
            if value is not None and not finite_value(value):
                raise ValueError('数值必须为有限数字或null')
            meta=content.get('observation_meta')
            if not isinstance(meta,dict):
                raise ValueError('观测来源元数据必须为对象')
            if not meta.get('source_record'):
                meta['source_record']=f'{iso}/{iid}/{year}'
            meta.update(value_type='manual_revision',status='available' if value is not None else 'not_reported',
                        manual_revision={'actor':actor,'reason':reason.strip(),'updated_at':timestamp(),
                                         'previous_value':old.get('value'),'previous_value_type':old.get('observation_meta',{}).get('value_type')})
            country.setdefault('metrics',{}).setdefault(iid,{})[year]=value
            country.setdefault('observation_meta',{}).setdefault(iid,{})[year]=meta
        errors=validate_snapshot(snapshot)
        if errors:
            raise ValueError('统计数据无效：'+encode(errors[:3]))
    else:
        if kind=='profile' and any(k in submitted for k in ('sections','rules','sources')):
            raise ValueError('章节、规则与来源应通过各自记录修改')
        if kind in ('section','rule','source','profile'):
            pending(content,kind)
        if kind=='medicine_site' and any(content.get(k)!=old.get(k) for k in ('url','evidence_url')):
            content.update(verification_method='unverified',checked_at=None)
        if kind=='section' and 'medicine_sites' in content:
            if not isinstance(content['medicine_sites'],list) or any(not isinstance(site,dict) for site in content['medicine_sites']):
                raise ValueError('药品查询入口必须为对象列表')
            previous_sites={site['id']:site for site in old.get('medicine_sites',[])}
            for site in content['medicine_sites']:
                prior=previous_sites.get(site.get('id'))
                if prior and any(site.get(k)!=prior.get(k) for k in ('url','evidence_url')):
                    site.update(verification_method='unverified',checked_at=None)
        if kind=='source':
            if content.get('url') != old.get('url'):
                content.update(check_status='unverified', checked_at=None)
                for key in ('http_status','final_url','technical_note','check_error','redirect_url',
                            'content_fingerprint','content_bytes_checked','content_check_truncated',
                            'page_title','content_type'):
                    content.pop(key, None)
            if not source_url_valid(content.get('url')) or not isinstance(content.get('title'),str) or not content['title'].strip():
                raise ValueError('来源需要名称和完整HTTPS地址')
        if kind in ('section','rule'):
            if not isinstance(content.get('title'),str) or not content['title'].strip() or not isinstance(content.get('summary'),str):
                raise ValueError('标题与摘要必须为文本')
        if kind=='rule':
            for field in ('effective_from','effective_to'):
                if content.get(field) is not None:
                    try:
                        date.fromisoformat(content[field])
                    except (ValueError,TypeError):
                        raise ValueError('法规日期必须为YYYY-MM-DD或null')
            if content.get('effective_from') and content.get('effective_to') and content['effective_from']>content['effective_to']:
                raise ValueError('法规失效日期不能早于生效日期')
        profile=profiles[iso]
        draft=db.execute('SELECT content FROM drafts WHERE iso3=?',(iso,)).fetchone()
        if draft:
            draft_profile=json.loads(draft['content'])
            draft_item=find_item(draft_profile,target,kind)
            if draft_item is None or fingerprint(draft_item)!=fingerprint(old):
                raise CatalogConflict('这条数据已有未发布草稿，请先在原审核页处理该草稿')
            draft_update=replace_profile_item(draft_profile,target,kind,content)
            validate_profile(draft_update)
        profiles[iso]=replace_profile_item(profile,target,kind,content)
        validate_profile(profiles[iso])
    version=store.publish(snapshot,profiles,actor,'逐条修订 '+rid+'：'+reason.strip(),db)
    if draft_update is not None:
        db.execute('UPDATE drafts SET content=?,updated_at=?,updated_by=? WHERE iso3=?',(encode(draft_update),timestamp(),actor,iso))
    store.log(db,actor,'research_record_edit',rid,reason.strip(),{'version':state['id'],'content':old},{'version':version,'content':detail(db,rid)['record']['content']})
    return {'ok':True,'version':version,**detail(db,rid)}
