"""Validate source-backed GMP facts and annual operating-environment observations."""
import math
from urllib.parse import urlparse

GMP_TOPICS = {'standard', 'inspection', 'reliance', 'application', 'local_agent',
              'timeline', 'fees', 'register', 'procurement', 'protection'}
CONTEXT_IDS = {'inflation', 'gdp_growth', 'urban_share', 'population_growth'}


def https_url(value):
    try:
        url = urlparse(value)
        return url.scheme == 'https' and bool(url.hostname) and not url.username and not url.password
    except (ValueError, TypeError, AttributeError):
        return False


def text(value):
    return isinstance(value, str) and bool(value.strip())


def gmp_errors(data, source_ids, section_sources):
    errors = []
    if not isinstance(data, dict):
        return ['GMP资料必须为对象']
    if not text(data.get('authority')) or not https_url(data.get('authority_url')):
        errors.append('GMP资料须注明监管机构及官方HTTPS网址')
    facts = data.get('facts')
    if not isinstance(facts, list) or not facts or any(not isinstance(f, dict) for f in facts):
        return errors + ['GMP资料须包含逐条事实']
    ids = [f.get('id') for f in facts]
    if any(not text(i) for i in ids) or len(set(str(i) for i in ids)) != len(ids):
        errors.append('GMP事实ID必须非空且不重复')
    for fact in facts:
        if not isinstance(fact.get('topic'), str) or fact['topic'] not in GMP_TOPICS:
            errors.append('GMP事实主题无效')
        if any(not text(fact.get(k)) for k in ('title', 'summary', 'scope')):
            errors.append('GMP事实须有标题、内容和适用范围')
        refs = fact.get('source_ids')
        if not isinstance(refs, list) or not refs or any(not text(s) or s not in source_ids or s not in section_sources for s in refs):
            errors.append('每条GMP事实必须引用章节内已登记来源')
    return list(dict.fromkeys(errors))


def context_errors(data, source_ids, section_sources, current_year):
    if not isinstance(data, dict):
        return ['经营环境数据必须为对象']
    rows = data.get('indicators')
    if not isinstance(rows, list) or not rows or any(not isinstance(r, dict) for r in rows):
        return ['经营环境须包含有效指标']
    errors = []
    ids = [r.get('id') for r in rows]
    if any(not isinstance(i, str) or i not in CONTEXT_IDS for i in ids) or len(set(str(i) for i in ids)) != len(ids):
        errors.append('经营环境指标ID无效或重复')
    for row in rows:
        value, year = row.get('value'), row.get('year')
        valid = isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
        if not valid or row.get('unit') != '%':
            errors.append('经营环境数值须为有限百分数，未知值不入库')
        elif row.get('id') == 'urban_share' and not 0 <= value <= 100:
            errors.append('城市人口占比须为0至100')
        if not isinstance(year, int) or isinstance(year, bool) or not 1990 <= year < current_year:
            errors.append('经营环境须注明已结束的统计年度')
        if not text(row.get('label')) or not text(row.get('definition')) or not https_url(row.get('source_url')):
            errors.append('经营环境须注明名称、定义和官方HTTPS来源')
        if not isinstance(row.get('source_id'), str) or row['source_id'] not in source_ids or row['source_id'] not in section_sources:
            errors.append('经营环境指标必须引用章节内已登记来源')
    return list(dict.fromkeys(errors))
