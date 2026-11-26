"""Validate the original-industry import series without treating gaps as zero."""
import math
import re


def api_import_errors(value, source_ids, section_ids, current_year):
    errors = []

    def error(message):
        errors.append('原料药进口：' + message)

    def text(v):
        return isinstance(v, str) and bool(v.strip())

    def number(v):
        return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)

    def integer(v):
        return isinstance(v, int) and not isinstance(v, bool)

    def equal(actual, expected):
        if actual is None or expected is None:
            return actual is expected
        return number(actual) and number(expected) and math.isclose(actual, expected, rel_tol=1e-10, abs_tol=1e-8)

    def growth(current, previous):
        return current / previous - 1 if number(current) and number(previous) and previous > 0 else None

    if not isinstance(value, dict):
        return ['原料药进口：数据必须为对象']
    if value.get('unit') != 'thousand_usd':
        error('金额单位必须为 thousand_usd')
    if not text(value.get('scope_label')) or not text(value.get('source_file')) or not re.fullmatch(r'[a-f0-9]{64}', str(value.get('source_sha256', ''))):
        error('须保留行业统计口径、来源文件及 SHA256')
    if not section_ids or any(sid not in source_ids for sid in section_ids):
        error('章节必须引用已登记来源')
    years, categories = value.get('years'), value.get('categories')
    if not isinstance(years, list) or not years or any(not isinstance(row, dict) for row in years):
        return errors + ['原料药进口：年度数据必须为非空对象列表']
    year_ids = [row.get('year') for row in years]
    if any(not integer(y) or not 1900 <= y <= current_year for y in year_ids) or len(set(y for y in year_ids if integer(y))) != len(year_ids):
        return errors + ['原料药进口：年份无效或重复']
    if year_ids != sorted(year_ids):
        error('年度必须按时间升序排列')
    if value.get('latest_year') not in year_ids:
        error('最新年份必须存在于年度数据中')
    if not isinstance(categories, list) or not categories or any(not isinstance(row, dict) for row in categories):
        return errors + ['原料药进口：品类必须为非空对象列表']
    category_ids = [row.get('id') for row in categories]
    if any(not text(cid) for cid in category_ids) or len(set(cid for cid in category_ids if isinstance(cid, str))) != len(category_ids):
        return errors + ['原料药进口：品类 ID 无效或重复']
    points_by_year = {y: {} for y in year_ids}
    invalid_points = False
    for category in categories:
        if not text(category.get('name')) or not text(category.get('name_en')):
            error('品类须保留中文名称和原始英文名称')
        points = category.get('points')
        if not isinstance(points, list) or any(not isinstance(p, dict) for p in points) or [p.get('year') for p in points] != year_ids:
            error('每项品类必须按年度列齐数据，缺失值用 null')
            invalid_points = True
            continue
        previous = {}
        for point in points:
            for field in ('amount_kusd', 'raw_amount_kusd', 'weight_kg', 'transactions'):
                if field not in point or point[field] is not None and (not number(point[field]) or point[field] < 0):
                    error('金额、重量和交易次数须为非负有限数字或 null')
                    invalid_points = True
            for field in ('yoy', 'reported_yoy'):
                if field not in point or point[field] is not None and not number(point[field]):
                    error('同比须为有限数字或 null')
                    invalid_points = True
            source_row = point.get('source_row')
            if source_row is not None and (not integer(source_row) or source_row < 1):
                error('原始行号无效')
                invalid_points = True
            if source_row is None and any(point.get(field) is not None for field in ('amount_kusd', 'raw_amount_kusd', 'weight_kg', 'transactions', 'reported_yoy')):
                error('没有源记录的品类年份必须保持 null')
            if source_row is not None and point.get('raw_amount_kusd') is None:
                error('有源记录时必须保留原始金额')
                invalid_points = True
            if point.get('amount_kusd') is not None and not equal(point['amount_kusd'], point.get('raw_amount_kusd')):
                error('可用金额必须等于原始金额，不得修改源值')
            expected_yoy = growth(point.get('amount_kusd'), previous.get('amount_kusd')) if previous.get('year') == point['year'] - 1 else None
            if not equal(point.get('yoy'), expected_yoy):
                error('品类同比与相邻年度可用金额不符')
            points_by_year[point['year']][category['id']] = point
            previous = point
    if invalid_points:
        return list(dict.fromkeys(errors))
    year_map = {row['year']: row for row in years}
    all_source_rows = []
    for row in years:
        year = row['year']
        recorded = {cid: p for cid, p in points_by_year[year].items() if p.get('source_row') is not None}
        expected_rows = sorted(p['source_row'] for p in recorded.values())
        all_source_rows.extend(expected_rows)
        if row.get('source_rows') != expected_rows or row.get('category_count') != len(recorded):
            error('年度原始行号或品类数量与明细不符')
        if not text(row.get('name')):
            error('年度须记录国家名称')
        availability = row.get('availability')
        status = row.get('amount_status')
        if availability not in ('available', 'no_data', 'not_selectable') or status not in ('reported', 'zero_unusable', 'unavailable'):
            error('年度可得性或金额状态无效')
        if (availability == 'available') != bool(recorded):
            error('有无源记录必须与可得性一致')
        raw_total = sum(p['raw_amount_kusd'] for p in recorded.values()) if recorded else None
        if not equal(row.get('raw_amount_kusd'), raw_total):
            error('年度原始金额合计与明细不符')
        zero_unusable = bool(recorded) and raw_total == 0 and any((p.get('weight_kg') or 0) > 0 or (p.get('transactions') or 0) > 0 for p in recorded.values())
        expected_status = 'zero_unusable' if zero_unusable else 'reported' if recorded else 'unavailable'
        if status != expected_status:
            error('全零但有交易或重量的年度不得作为零金额展示')
        expected_amount = raw_total if expected_status == 'reported' else None
        if not equal(row.get('amount_kusd'), expected_amount):
            error('年度可用金额合计与状态不符')
        for point in recorded.values():
            if not equal(point.get('amount_kusd'), point['raw_amount_kusd'] if expected_status == 'reported' else None):
                error('年度不可用金额必须同步到所有品类点')
        previous = year_map.get(year - 1)
        previous_points = {cid: p for cid, p in points_by_year.get(year - 1, {}).items() if p.get('source_row') is not None}
        common = sorted(set(recorded) & set(previous_points))
        same = bool(common) and set(recorded) == set(previous_points)
        if row.get('common_category_ids') != common or row.get('same_category_set') is not same:
            error('同码比较范围与相邻年度源记录不符')
        common_usable = common and all(recorded[c]['amount_kusd'] is not None and previous_points[c]['amount_kusd'] is not None for c in common)
        common_yoy = growth(sum(recorded[c]['amount_kusd'] for c in common), sum(previous_points[c]['amount_kusd'] for c in common)) if common_usable else None
        if not equal(row.get('common_yoy'), common_yoy):
            error('共同品类同比与明细不符')
        yoy = growth(row.get('amount_kusd'), previous.get('amount_kusd')) if same and previous else None
        if not equal(row.get('yoy'), yoy):
            error('年度同比必须使用相邻年度相同品类范围')
    if len(set(all_source_rows)) != len(all_source_rows):
        error('原始行号重复使用')
    recorded_years = [row['year'] for row in years if row.get('source_rows')]
    if recorded_years and value.get('latest_year') != max(recorded_years):
        error('最新年份须为最近有源记录的年份')
    return list(dict.fromkeys(errors))
