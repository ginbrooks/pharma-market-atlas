"""Validation for sourced religious composition and separately scoped practices."""
import math
import re


def religion_errors(value, source_ids, section_ids, current_year):
    errors = []
    def error(message):
        errors.append('宗教与习俗：' + message)
    def text(v):
        return isinstance(v, str) and bool(v.strip())
    def number(v):
        return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
    def references(item):
        refs = item.get('source_ids')
        if not isinstance(refs, list) or not refs or any(not isinstance(s, str) or s not in source_ids or s not in section_ids for s in refs):
            error('每项内容必须引用已登记且纳入章节的来源')
    def rows(field, parent):
        items = parent.get(field)
        if not isinstance(items, list) or any(not isinstance(item, dict) for item in items):
            error(field + '必须是对象列表')
            return []
        ids = [item.get('id') for item in items]
        if any(not text(i) for i in ids) or len(set(i for i in ids if isinstance(i, str))) != len(ids):
            error(field + '需要不重复的文本 ID')
        return items
    if not isinstance(value, dict):
        return ['宗教与习俗：数据必须为对象']
    year = value.get('year')
    if not isinstance(year, int) or isinstance(year, bool) or not 1900 <= year <= current_year:
        error('须记录有效的统计年份')
    for field in ('geographic_scope', 'denominator', 'methodology'):
        if not text(value.get(field)):
            error('须注明地域、统计分母和统计方法')
    groups = rows('groups', value)
    if not groups:
        error('至少需要一项有来源的人口比例')
    lower_total, upper_total = 0, 0
    for group in groups:
        if not text(group.get('label')):
            error('宗教类别名称不能为空')
        references(group)
        share = group.get('share')
        if share is None:
            bound = group.get('upper_bound')
            match = re.fullmatch(r'<\s*(\d+(?:\.\d+)?)\s*%', str(group.get('display_share', '')))
            if not number(bound) or not 0 < bound <= 100 or group.get('share_operator') != '<' or not match or float(match[1]) != bound:
                error('非精确占比须保留上限及原始百分比写法，不得当作零')
            else:
                upper_total += bound
        elif not number(share) or not 0 <= share <= 100:
            error('人口占比必须是 0–100 的有限数值')
        else:
            lower_total += share
            upper_total += share
            if group.get('upper_bound') is not None or group.get('share_operator'):
                error('精确占比不能同时声明上限')
    # Rounded public tables may differ slightly from 100%; never renormalize.
    tolerance = max(.1, len(groups) * .050001)
    if lower_total > 100 + tolerance:
        error('同一人口分母的比例合计不能超过 100%')
    if value.get('composition_complete') is True and upper_total < 100 - tolerance:
        error('完整构成与 100% 不符，请保留未答及未分类人口')
    for tradition in rows('traditions', value):
        if tradition.get('id') in ('other','unaffiliated','not_stated') and tradition.get('practices'):
            error('其他宗教、无宗教及未说明类别不能设定统一禁忌')
        if 'source_ids' in tradition:
            references(tradition)
        if not text(tradition.get('label')) or not text(tradition.get('introduction')):
            error('习俗需要宗教名称及简介')
        for practice in rows('practices', tradition):
            if any(not text(practice.get(field)) for field in ('label', 'text', 'applies_to')):
                error('习俗须注明内容及适用人群或教派')
            references(practice)
    if 'everyday' in value:
        for item in rows('everyday', value):
            if any(not text(item.get(field)) for field in ('label', 'text', 'applies_to')):
                error('当地日常须注明标题、内容及适用人群')
            year = item.get('year')
            if 'year' in item and (not isinstance(year, int) or isinstance(year, bool) or not 1900 <= year <= current_year):
                error('当地日常须使用有效的调查或观察年份')
            references(item)
    return list(dict.fromkeys(errors))
