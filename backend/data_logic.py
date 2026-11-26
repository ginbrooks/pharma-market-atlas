"""Pure snapshot, ranking, comparison and policy publication logic."""
import copy
import math
from datetime import date, datetime, timezone, timedelta
from urllib.parse import urlparse
from .market_enrichment import gmp_errors, context_errors

INDICATORS = {"population", "gdp_pc", "health_pc", "government_share", "life_expectancy", "age65_share"}
PERCENTAGES = {"government_share", "age65_share"}


def timestamp():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def local_today():
    return datetime.now(timezone(timedelta(hours=8))).date()


def finite_value(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def get_value(country, indicator_id, year):
    if year is None:
        return None
    value = country.get("metrics", {}).get(indicator_id, {}).get(str(year))
    return value if finite_value(value) else None


def available_years(snapshot):
    return sorted([int(y) for y in snapshot.get("years", [])], reverse=True)


def rank(snapshot, indicator_id, year, value):
    if value is None or year is None:
        return None, None
    values = [get_value(c, indicator_id, year) for c in snapshot["countries"]]
    values = [v for v in values if v is not None]
    return 1 + sum(v > value for v in values), len(values)


def latest_metrics(snapshot, country):
    result = {}
    for indicator in snapshot["indicators"]:
        iid = indicator["id"]
        year = next((y for y in available_years(snapshot) if get_value(country, iid, y) is not None), None)
        value = get_value(country, iid, year)
        meta = country.get("observation_meta", {}).get(iid, {}).get(str(year), {})
        item = {"value": value, "year": year, "status": "available" if value is not None else "not_reported",
                "value_type": meta.get("value_type", indicator.get("value_type", "source_value")) if value is not None else None,
                "source_version": meta.get("source_version", indicator.get("source_version")),
                "source_record": meta.get("source_record"), "missing_reason": country.get("missing_reason") if value is None else None}
        if iid == "gdp_pc":
            item["rank"], item["total"] = rank(snapshot, iid, year, value)
        result[iid] = item
    return result


def compare(snapshot, codes, mode, year=None):
    if mode not in {"common", "map", "latest"}:
        raise ValueError("比较模式应为 common、map 或 latest")
    if mode == "map" and year not in snapshot["years"]:
        raise ValueError("请选择发布快照中的统计年度")
    lookup = {c["iso3"]: c for c in snapshot["countries"]}
    if any(code not in lookup for code in codes):
        raise ValueError("存在未纳入的国家代码")
    countries = [lookup[code] for code in codes]
    rows = []
    years = available_years(snapshot)[:5]
    for indicator in snapshot["indicators"]:
        iid = indicator["id"]
        row_year = year if mode == "map" else None
        warning = None
        if mode == "common":
            row_year = next((y for y in years if all(get_value(c, iid, y) is not None for c in countries)), None)
            if row_year is None:
                warning = "最近五个统计年度无共同数据，不可同年比较。"
        cells = []
        for country in countries:
            cell_year = row_year
            if mode == "latest":
                cell_year = next((y for y in years if get_value(country, iid, y) is not None), None)
            value = get_value(country, iid, cell_year)
            pos, total = rank(snapshot, iid, cell_year, value) if iid == "gdp_pc" and mode != "latest" else (None, None)
            meta = country.get("observation_meta", {}).get(iid, {}).get(str(cell_year), {})
            cells.append({"iso3": country["iso3"], "value": value, "year": cell_year,
                          "status": "available" if value is not None else "not_reported", "rank": pos, "total": total,
                          "value_type": meta.get("value_type", indicator.get("value_type", "source_value")) if value is not None else None,
                          "source_version": meta.get("source_version", indicator.get("source_version")),
                          "source_record": meta.get("source_record"), "missing_reason": country.get("missing_reason") if value is None else None})
        if mode == "latest" and len({c["year"] for c in cells if c["year"] is not None}) > 1:
            warning = "各国使用不同年份；不提供严格排名或同年高低判断。"
        rows.append({"indicator": indicator, "year": row_year, "cells": cells, "warning": warning})
    return {"countries": [{"iso3": c["iso3"], "name": c["name"]} for c in countries],
            "rows": rows, "mode": mode, "version": snapshot["version"]}


def validate_snapshot(snapshot, previous=None):
    """Reject an invalid batch rather than allowing it to erase the live snapshot."""
    problems = []
    if not isinstance(snapshot, dict):
        return [{"reason": "快照必须是 JSON 对象"}]
    countries = snapshot.get("countries", [])
    indicators = snapshot.get("indicators", [])
    years = snapshot.get("years", [])
    if not isinstance(countries, list) or not countries:
        return [{"reason": "国家清单为空"}]
    if {i.get("id") for i in indicators} != INDICATORS or len(indicators) != 6:
        problems.append({"reason": "六项指标定义不完整或重复"})
    if not years or len(set(years)) != len(years) or any(not isinstance(y, int) or y < 1900 or y > 2100 for y in years):
        problems.append({"reason": "统计年度无效或重复"})
    for i in indicators:
        if not all(i.get(k) for k in ("code", "name", "unit", "definition", "source_url", "provider")):
            problems.append({"indicator": i.get("id"), "reason": "指标单位、定义或来源不完整"})
    seen = set()
    for country in countries:
        iso = country.get("iso3", "")
        if iso in seen or len(iso) != 3 or not iso.isalpha() or not iso.isupper():
            problems.append({"iso3": iso, "reason": "国家代码无效或重复"})
        if country.get("is_aggregate") or country.get("region") == "Aggregates":
            problems.append({"iso3": iso, "reason": "汇总项不得纳入国家排名"})
        seen.add(iso)
        for iid in INDICATORS:
            series = country.get("metrics", {}).get(iid, {})
            if not isinstance(series, dict):
                problems.append({"iso3": iso, "indicator": iid, "reason": "时间序列格式无效"})
                continue
            for raw_year, value in series.items():
                if str(raw_year) not in {str(y) for y in years}:
                    problems.append({"iso3": iso, "indicator": iid, "year": raw_year, "reason": "年度未登记"})
                if value is None:
                    continue
                upper = 100 if iid in PERCENTAGES else (150 if iid == "life_expectancy" else 3_000_000_000 if iid == "population" else 10_000_000)
                if not finite_value(value) or not 0 <= value <= upper:
                    problems.append({"iso3": iso, "indicator": iid, "year": raw_year, "value": str(value), "reason": "数值越界或不是有限数值"})
    if previous:
        previous_codes = {c["iso3"] for c in previous["countries"]}
        if len(seen & previous_codes) < 0.95 * len(previous_codes):
            problems.append({"reason": "本批次丢失超过 5% 已发布经济体，需要人工处理"})
        for iid in INDICATORS:
            old_count = sum(any(finite_value(v) for v in c.get("metrics", {}).get(iid, {}).values()) for c in previous["countries"])
            new_count = sum(any(finite_value(v) for v in c.get("metrics", {}).get(iid, {}).values()) for c in countries)
            if old_count and new_count < old_count * .8:
                problems.append({"indicator": iid, "reason": "有数据经济体骤减超过 20%，保留旧版等待复核"})
    return problems


def source_url_valid(url):
    parsed = urlparse(str(url or ""))
    return parsed.scheme == "https" and bool(parsed.hostname) and not parsed.username and not parsed.password


from .channel_research import channel_research_errors
from .religion import religion_errors
from .local_culture import local_notes_errors
from .api_imports import api_import_errors
from .medicine_sites import medicine_sites_errors
from .import_origins import import_origin_errors


def profile_structure_errors(profile):
    """Keep unknown sales shares distinct from zero and require a traceable denominator."""
    errors = []
    sources = {source.get("id") for source in profile.get("sources", [])}
    for section in profile.get("sections", []):
        title = section.get("title", section.get("id", "章节"))
        references = section.get("source_ids", [])
        if not isinstance(references, list) or any(not isinstance(sid, str) for sid in references):
            errors.append(title + "：来源 ID 必须为列表")
            continue
        if "channel_research" in section:
            errors.extend(channel_research_errors(section["channel_research"], sources, set(references)))
        if section.get('id') == 'country_languages':
            if not isinstance(section.get('primary'),str) or not section['primary'].strip():
                errors.append('语言：须填写第一语言')
            if section.get('secondary') is not None and not isinstance(section['secondary'],str):
                errors.append('语言：第二语言须为文字或留空')
            for key in ('primary_context','secondary_context'):
                if section.get(key) is not None and not isinstance(section[key],str):
                    errors.append('语言：使用范围须为文字')
            if not references or any(sid not in sources for sid in references):
                errors.append('语言：须填写已登记的来源')
        for container, field in (('local_culture', 'highlights'), ('religion_life', 'everyday')):
            if container in section:
                if section.get('id') != container:
                    errors.append('当地文化与信仰生活资料须位于独立章节')
                errors.extend(local_notes_errors(section[container], field, sources, set(references), local_today().year))
        if 'religion' in section:
            errors.extend(religion_errors(section['religion'], sources, set(references), local_today().year))
        if 'medicine_sites' in section:
            if section.get('id') != 'official_medicine_sites':
                errors.append('官方药品网站须位于独立的 official_medicine_sites 章节')
            errors.extend(medicine_sites_errors(section['medicine_sites'], sources, set(references), local_today()))
        if 'api_import_data' in section:
            if section.get('id') != 'api_imports':
                errors.append('原料药进口数据须位于独立的 api_imports 章节')
            errors.extend(api_import_errors(section['api_import_data'], sources, set(references), local_today().year))
        if 'import_origin_data' in section:
            if section.get('id') != 'import_origins':
                errors.append('制剂进口来源须位于独立的 import_origins 章节')
            errors.extend(import_origin_errors(section['import_origin_data'], sources, set(references), local_today().year))
        if 'gmp' in section:
            if section.get('id') != 'gmp_access' or section.get('kind') == 'data_gap':
                errors.append('GMP事实须位于独立的gmp_access事实章节')
            errors.extend(gmp_errors(section['gmp'], sources, set(references)))
        if 'market_context' in section:
            if section.get('id') != 'market_context' or section.get('kind') == 'data_gap':
                errors.append('经营环境须位于独立的market_context事实章节')
            errors.extend(context_errors(section['market_context'], sources, set(references), local_today().year))
        nested_references = []
        scenarios = section.get("payment_scenarios", [])
        if not isinstance(scenarios, list) or any(not isinstance(row, dict) for row in scenarios):
            errors.append(title + "：支付场景必须为对象列表")
            continue
        for row in scenarios:
            if any(key in row and not isinstance(row[key], str) for key in ("id", "setting", "payer", "coverage", "patient_cost", "conditions")):
                errors.append(title + "：支付场景字段必须为文本")
            refs = row.get("source_ids", [])
            if not isinstance(refs, list) or any(not isinstance(sid, str) for sid in refs):
                errors.append(title + "：场景来源 ID 必须为列表")
            else:
                nested_references.extend(refs)
        if scenarios and section.get("kind") == "data_gap":
            errors.append(title + "：支付场景必须经过内容审核，不能标为数据缺口")
        mix = section.get("channel_mix")
        if mix is not None:
            if not isinstance(mix, dict):
                errors.append(title + "：销售渠道结构无效")
                continue
            channels = mix.get("channels", [])
            if not isinstance(channels, list) or any(not isinstance(row, dict) for row in channels):
                errors.append(title + "：销售渠道必须为对象列表")
                continue
            ids = [row.get("id") for row in channels]
            if len(ids) != 3 or any(not isinstance(i, str) for i in ids) or set(ids) != {"public_hospitals", "private_hospitals", "retail"}:
                errors.append(title + "：必须分别记录公立医院、私立医院和零售渠道")
            if any(key in row and not isinstance(row[key], str) for row in channels for key in ("label", "note")):
                errors.append(title + "：渠道名称和说明必须为文本")
            if any(key in mix and not isinstance(mix[key], str) for key in ("measure", "scope", "denominator", "unit", "caveat")):
                errors.append(title + "：渠道统计口径必须为文本")
            values = [row.get("share") for row in channels if row.get("share") is not None]
            valid_values = all(finite_value(v) and 0 <= v <= 100 for v in values)
            if not valid_values:
                errors.append(title + "：销售占比须为 0–100 的有限数值；未知请用 null")
            status = mix.get("status")
            if not isinstance(status, str) or status not in {"unavailable", "partial", "available"}:
                errors.append(title + "：销售占比状态无效")
            if status == "unavailable" and values:
                errors.append(title + "：暂无可靠占比时不得填入数值")
            if status == "available" and (len(values) != 3 or not valid_values or abs(sum(values) - 100) > .20000001):
                errors.append(title + "：完整三分占比必须同口径并合计约 100%")
            if status == "partial" and not values:
                errors.append(title + "：没有任何占比数值时应标为 unavailable")
            if valid_values and values and sum(values) > 100.20000001:
                errors.append(title + "：同一分母的渠道占比合计不得超过 100%")
            if values:
                year = mix.get("year")
                if not isinstance(year, int) or isinstance(year, bool) or not 1900 <= year <= local_today().year:
                    errors.append(title + "：有占比时必须记录有效统计年度")
                has_context = all(isinstance(mix.get(key), str) and mix[key].strip() for key in ("denominator", "scope"))
                if mix.get("measure") not in ("sales_value", "sales_volume") or not has_context:
                    errors.append(title + "：必须注明销售额或销量、统计范围和共同分母")
                if mix.get("unit") != "%":
                    errors.append(title + "：渠道占比单位必须为 %")
                if section.get("kind") == "data_gap":
                    errors.append(title + "：有数值的渠道资料必须经过内容审核")
            for row in [mix, *channels]:
                refs = row.get("source_ids", [])
                if not isinstance(refs, list) or any(not isinstance(sid, str) for sid in refs):
                    errors.append(title + "：渠道来源 ID 必须为列表")
                    continue
                nested_references.extend(refs)
                if row is not mix and row.get("share") is not None and not refs:
                    errors.append(title + "：每项销售占比必须有来源")
        if any(sid not in sources or sid not in references for sid in nested_references):
            errors.append(title + "：明细来源必须存在且纳入章节引用，才能逐条复核")
    for rule in profile.get("rules", []):
        if rule.get('current_status') not in (None, 'in_force', 'future', 'repealed', 'unconfirmed'):
            errors.append('政策执行状态无效')
        if rule.get('current_status') in ('in_force', 'future'):
            refs = rule.get('current_source_ids')
            source_map = {s.get('id'): s for s in profile.get('sources', [])}
            if not isinstance(refs, list) or not refs or any(not isinstance(sid, str) or sid not in source_map or source_map[sid].get('check_status') != 'accessible' for sid in refs):
                errors.append('现行执行状态必须有已读正文依据')
            try:
                checked = date.fromisoformat(rule.get('current_checked_at', ''))
                if checked > local_today():
                    raise ValueError()
            except (ValueError, TypeError):
                errors.append('政策核查日期无效')
            if not isinstance(rule.get('current_basis'), str) or not rule['current_basis'].strip():
                errors.append('现行执行状态必须注明核查依据')
        if "business_implication" in rule and not isinstance(rule["business_implication"], str):
            errors.append("政策业务影响必须为文本")
        if "category" in rule and rule["category"] not in ("local_protection", "special_policy", ""):
            errors.append("政策分类无效")
    regulatory_rules = [r for r in profile.get("rules", []) if r.get("module") == "production_import"]
    regulatory_sections = [s for s in profile.get("sections", []) if s.get("id") == "production_import"]
    if regulatory_rules or regulatory_sections:
        if len(regulatory_sections) != 1:
            errors.append("生产与进口必须对应一个独立章节")
        section = regulatory_sections[0] if regulatory_sections else {}
        ids = section.get("rule_ids")
        if not isinstance(ids, list) or any(not isinstance(i, str) for i in ids) or len(set(ids)) != len(ids):
            errors.append("生产与进口的规则引用必须为不重复的 ID 列表")
        elif set(ids) != {r.get("id") for r in regulatory_rules}:
            errors.append("生产与进口章节引用与规则不一致")
        for rule in regulatory_rules:
            if any(not isinstance(rule.get(k), str) for k in ("title", "summary", "product_scope", "stage", "conditions", "exceptions")):
                errors.append("法规说明必须为文本")
            if rule.get("topic") not in ("manufacturing", "registration", "import", "customs", "restriction"):
                errors.append("生产与进口主题无效")
            refs = rule.get("source_ids")
            section_refs = section.get("source_ids")
            if not isinstance(refs, list) or not refs or not isinstance(section_refs, list) or any(not isinstance(i, str) or i not in sources or i not in section_refs for i in refs):
                errors.append("生产与进口规则必须有来源，并纳入章节引用")
    return list(dict.fromkeys(errors))


def publication_errors(profile):
    """Evidence and applicability gates. Reviewer, not automated research, confirms accuracy."""
    errors = profile_structure_errors(profile)
    sources = {s.get("id"): s for s in profile.get("sources", [])}
    for collection, prefix in (("sections", "章节"), ("rules", "规则")):
        for item in profile.get(collection, []):
            if collection == "sections" and item.get("kind") == "data_gap":
                continue
            if not item.get("summary"):
                continue
            label = item.get("title", item.get("id", prefix))
            if collection == "sections":
                for scenario in item.get("payment_scenarios", []):
                    if isinstance(scenario, dict) and any(scenario.get(k) for k in ("payer", "coverage", "patient_cost", "conditions")) and not scenario.get("source_ids"):
                        errors.append(label + "：每个支付场景必须有可追溯的来源")
            ids = item.get("source_ids", [])
            if not ids or any(sid not in sources for sid in ids):
                errors.append(label + "：缺少可追溯的来源")
                continue
            for sid in ids:
                s = sources[sid]
                if not all(s.get(k) for k in ("title", "institution", "url", "locator")) or not source_url_valid(s.get("url")):
                    errors.append(label + "：来源标题、机构、HTTPS 地址或原文位置不完整")
                if s.get("check_status") in {"not_found", "failed", "unrelated_redirect", "blocked", "unavailable"}:
                    errors.append(label + "：来源当前不可核验，请先更正来源状态")
            if collection == "rules":
                if not item.get("product_scope") or not item.get("stage"):
                    errors.append(label + "：缺少适用产品或适用环节")
                if item.get("validity") not in {"unknown", "effective", "future", "expired", "replaced"}:
                    errors.append(label + "：有效时间状态必须明确")
                for field in ("effective_from", "effective_to"):
                    try:
                        if item.get(field):
                            date.fromisoformat(item[field])
                    except (ValueError, TypeError):
                        errors.append(label + "：有效日期格式不正确")
                if item.get("validity") == "effective" and not item.get("effective_from"):
                    errors.append(label + "：标为生效的规则必须给出生效日期；未载明时设为日期不明")
                if item.get("effective_from") and item.get("effective_to") and item["effective_from"] > item["effective_to"]:
                    errors.append(label + "：失效日早于生效日")
    if not any(i.get("summary") and not (c == "sections" and i.get("kind") == "data_gap")
               for c in ("sections", "rules") for i in profile.get(c, [])):
        errors.append("档案没有可供审核的章节或规则")
    return list(dict.fromkeys(errors))


def resolve_validity(rule, today=None):
    today = today or local_today()
    status = rule.get("validity", "unknown")
    if status == "replaced":
        return status
    try:
        start = date.fromisoformat(rule["effective_from"]) if rule.get("effective_from") else None
        end = date.fromisoformat(rule["effective_to"]) if rule.get("effective_to") else None
    except (ValueError, TypeError):
        return "unknown"
    if end and end < today:
        return "expired"
    if start and start > today:
        return "future"
    if status in {"expired", "unknown"}:
        return status
    return "effective" if start else "unknown"


def review_profile(profile, reviewer, reason):
    result = copy.deepcopy(profile)
    now, today = timestamp(), local_today()
    result.update(review_status="reviewed", reviewed_at=now, reviewer=reviewer, review_reason=reason)
    reviewed_source_ids = {sid for collection in ("sections", "rules") for item in result.get(collection, [])
                           if item.get("summary") and not (collection == "sections" and item.get("kind") == "data_gap")
                           for sid in item.get("source_ids", [])}
    for source in result.get("sources", []):
        if source.get("id") not in reviewed_source_ids:
            continue
        source["human_verified_at"] = now
        source["human_verified_by"] = reviewer
        source["human_verified_fingerprint"] = source.get("content_fingerprint")
        if source.get("check_status") in {"content_changed", "needs_review", "redirected"}:
            source["check_status"] = "accessible"
            source["technical_note"] = "编辑已人工核实本次页面内容与用途。"
    for section in result.get("sections", []):
        if section.get("kind") == "data_gap":
            section.update(status="not_compiled", reviewed_at=None, reviewer=None)
        elif section.get("summary"):
            section.update(status="reviewed", reviewed_at=now, reviewer=reviewer)
    for rule in result.get("rules", []):
        rule.update(review_status="reviewed", reviewed_at=now, reviewer=reviewer,
                    next_review_at=(today + timedelta(days=90)).isoformat())
        rule["validity"] = resolve_validity(rule, today)
    ids = {s.get("id") for s in result.get("sections", []) if s.get("summary") and s.get("status") == "reviewed"}
    enough_sections = any("pay" in i or "financ" in i for i in ids) and any("procure" in i for i in ids)
    stages = " ".join(str(r.get("stage", "")) for r in result.get("rules", []))
    enough_rules = ("注册" in stages or "registration" in stages) and ("进口" in stages or "import" in stages or "经营" in stages)
    result["coverage"] = "deep" if enough_sections and enough_rules else "basic"
    return result


def view_profile(profile, allow_draft=False):
    if not profile:
        return {"coverage": "basic", "review_status": "not_compiled", "summary": "尚未建立专业档案。",
                "sections": [], "rules": [], "sources": [], "questions": ["支付、采购及产品准入条件尚待官方资料核实。"],
                "pharmaceutical": {"status": "not_compiled", "note": "暂无已核验药品支出数据。"}, "disease_links": []}
    result = copy.deepcopy(profile)
    sources = {s.get("id"): s for s in result.get("sources", [])}
    troubled_sources = {sid for sid, source in sources.items()
                        if source.get("check_status") != "accessible"
                        or not source.get("human_verified_at")}
    used_evidence = {sid for collection in ("sections", "rules") for item in result.get(collection, [])
                     if item.get("summary") and not (collection == "sections" and item.get("kind") == "data_gap")
                     for sid in item.get("source_ids", [])}
    for section in result.get("sections", []):
        if section.get("kind") == "data_gap":
            section.update(status="not_compiled", reviewed_at=None, reviewer=None)
    for rule in result.get("rules", []):
        rule["validity"] = resolve_validity(rule)
        rule["overdue"] = bool(rule.get("next_review_at") and rule["next_review_at"] < local_today().isoformat())
        source_ids = rule.get("source_ids", [])
        evidence_ok = bool(source_ids) and all(sid in sources and sid not in troubled_sources for sid in source_ids)
        rule["evidence_status"] = "verified" if evidence_ok else "needs_review"
        rule["is_current"] = rule.get("review_status") == "reviewed" and rule["validity"] == "effective" and not rule.get("conflict") and evidence_ok
        if rule.get('current_status') in ('in_force', 'future'):
            current_refs = rule.get('current_source_ids') or []
            if not current_refs or any(sid not in sources or sources[sid].get('check_status') != 'accessible' for sid in current_refs):
                rule['current_status'] = 'unconfirmed'
    if result.get("coverage") == "deep" and any(sid not in sources or sid in troubled_sources for sid in used_evidence):
        result["coverage"] = "basic"
        result["coverage_note"] = "部分官方依据需要重新核验，深度档案标识暂时撤下。"
    if allow_draft:
        return result
    pending = len([s for s in result.get("sections", []) if s.get("status") != "reviewed" and s.get("kind") != "data_gap"]) + len([r for r in result.get("rules", []) if r.get("review_status") != "reviewed"])
    result["pending_count"] = pending
    result["sections"] = [s for s in result.get("sections", []) if s.get("status") == "reviewed" or s.get("kind") == "data_gap"]
    result["rules"] = [r for r in result.get("rules", []) if r.get("review_status") == "reviewed"]
    if result.get("review_status") != "reviewed":
        result["summary"] = "已收集官方资料，专业结论尚待人工复核。"
        result["coverage"] = "basic"
        # Draft summaries and personal editor remarks never leave the review area.
        for source in result.get("sources", []):
            source.pop("excerpt", None)
    result.pop("internal_notes", None)
    return result
