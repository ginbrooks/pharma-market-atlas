"""Validate HS 3004 partner shares against one reporter's annual import total.

Amounts remain in source USD. Shares never use a second provider's denominator,
and a missing partner breakdown cannot be made complete by normalizing it.
"""
import math
import re
from datetime import datetime
from urllib.parse import urlparse


GROUP_IDS = ('china', 'india', 'eu', 'uk', 'switzerland', 'usa', 'other')
EU27 = frozenset(('AUT', 'BEL', 'BGR', 'HRV', 'CYP', 'CZE', 'DNK', 'EST',
                  'FIN', 'FRA', 'DEU', 'GRC', 'HUN', 'IRL', 'ITA', 'LVA',
                  'LTU', 'LUX', 'MLT', 'NLD', 'POL', 'PRT', 'ROU', 'SVK',
                  'SVN', 'ESP', 'SWE'))


def partner_group(iso3):
    if iso3 in EU27:
        return 'eu'
    return {'CHN': 'china', 'IND': 'india', 'GBR': 'uk', 'CHE': 'switzerland',
            'USA': 'usa'}.get(iso3, 'other')


def import_origin_errors(value, source_ids, section_ids, current_year):
    errors = []

    def error(message):
        errors.append('制剂进口来源：' + message)

    def number(v):
        return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)

    def text(v):
        return isinstance(v, str) and bool(v.strip())

    def money_equal(actual, expected):
        return number(actual) and math.isclose(actual, expected, rel_tol=1e-10, abs_tol=.01)

    if not isinstance(value, dict):
        return ['制剂进口来源：数据必须为对象']
    if not section_ids or not section_ids <= source_ids:
        error('章节必须引用已登记来源')
    year = value.get('year')
    if not isinstance(year, int) or isinstance(year, bool) or not 1900 <= year < current_year:
        error('须使用已结束的完整年度')
    if value.get('hs_code') != '3004' or value.get('currency') != 'USD':
        error('统计范围须为 HS 3004，金额单位须为 USD')
    if value.get('basis') != 'reporter_imports':
        error('须采用进口国直接报告的数据')
    if not isinstance(value.get('reporter_code'), str) or not re.fullmatch(r'[0-9]+', value['reporter_code']) or int(value['reporter_code']) == 0:
        error('须保留有效报告国代码')
    try:
        parsed = urlparse(str(value.get('source_url') or ''))
        valid_url = parsed.scheme == 'https' and bool(parsed.hostname) and not parsed.username and not parsed.password
    except ValueError:
        valid_url = False
    if not valid_url:
        error('须保留完整 HTTPS 原始数据地址')
    try:
        retrieved = datetime.fromisoformat(value.get('retrieved_at', '').replace('Z', '+00:00'))
        if retrieved.tzinfo is None or retrieved.year > current_year or isinstance(year, int) and retrieved.year <= year:
            raise ValueError()
    except (ValueError, TypeError, AttributeError):
        error('获取时间须为完整年度结束后的带时区 ISO 时间')
    total = value.get('total_usd')
    if not number(total) or total <= 0:
        return errors + ['制剂进口来源：世界进口总额须为正有限数值']

    groups, partners = value.get('groups'), value.get('partners')
    if not isinstance(groups, list) or len(groups) != len(GROUP_IDS) or any(not isinstance(g, dict) for g in groups):
        error('须分别保留中国大陆、印度、欧盟、英国、瑞士、美国及其他七组')
        groups = []
    ids = [g.get('id') for g in groups]
    if any(not isinstance(gid, str) for gid in ids) or set(gid for gid in ids if isinstance(gid, str)) != set(GROUP_IDS):
        error('来源分组缺失或重复')
    if not isinstance(partners, list) or not partners or any(not isinstance(p, dict) for p in partners):
        return errors + ['制剂进口来源：须保留完整的贸易伙伴金额列表']

    group_totals = dict.fromkeys(GROUP_IDS, 0.0)
    partner_codes = set()
    all_valid = True
    for row in partners:
        code, iso3 = row.get('code'), row.get('iso3')
        if not isinstance(code, str) or not re.fullmatch(r'[0-9]+', code) or int(code) == 0:
            error('伙伴代码须有效且不能包含世界合计')
        elif int(code) in partner_codes:
            error('贸易伙伴代码重复')
        else:
            partner_codes.add(int(code))
        if iso3 is not None and (not isinstance(iso3, str) or not re.fullmatch(r'[A-Z]{3}', iso3)):
            error('伙伴 ISO3 必须为三位大写代码或 null')
            all_valid = False
        if not text(row.get('name')):
            error('贸易伙伴必须保留来源名称')
        amount, share = row.get('amount_usd'), row.get('share_pct')
        if not number(amount) or amount < 0 or amount > total + .01:
            error('伙伴金额须为不超过世界总额的非负有限数值')
            all_valid = False
            continue
        if not number(share) or not 0 <= share <= 100 or not math.isclose(share, amount / total * 100, rel_tol=0, abs_tol=.00500001):
            error('伙伴占比须按同一世界总额计算')
        if iso3 is None or isinstance(iso3, str):
            group_totals[partner_group(iso3)] += amount

    if all_valid:
        difference = sum(group_totals.values()) - total
        tolerance = max(1, total * 1e-7)
        # Some historical submissions round each partner and the independently
        # reported world total to whole USD. Each rounded value can contribute
        # up to half a dollar; fractional-dollar datasets keep the tighter bound.
        if total == int(total) and all(p['amount_usd'] == int(p['amount_usd']) for p in partners):
            tolerance = max(tolerance, .5 * (len(partners) + 1))
        if abs(difference) > tolerance:
            error('伙伴金额未与世界总额对齐，不能将缺失或截断数据归一化')
        # Only the original total is the denominator; preserve rounding residual
        # in Other instead of proportionally changing every source amount.
        group_totals['other'] = total - sum(group_totals[k] for k in GROUP_IDS if k != 'other')
    for group in groups:
        amount, share = group.get('amount_usd'), group.get('share_pct')
        if not text(group.get('label')):
            error('分组名称必须为文本')
        if not number(amount) or not 0 <= amount <= total:
            error('分组金额须为不超过世界总额的非负有限数值')
            continue
        if not number(share) or not 0 <= share <= 100 or not math.isclose(share, amount / total * 100, rel_tol=0, abs_tol=.00500001):
            error('分组占比须按同一世界总额计算')
        gid = group.get('id')
        if all_valid and isinstance(gid, str) and gid in group_totals and not money_equal(amount, group_totals[gid]):
            error('分组金额与伙伴明细不符；中国大陆不含港澳，欧盟采用 EU27')
    if groups and all(number(g.get('amount_usd')) for g in groups) and not money_equal(sum(g['amount_usd'] for g in groups), total):
        error('七组金额合计必须等于世界进口总额')
    return list(dict.fromkeys(errors))
