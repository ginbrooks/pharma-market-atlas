"""Sourced local customs and lived religion without invented population data."""
import re
from urllib.parse import urlsplit


def valid_photo(photo):
    if not isinstance(photo, dict):
        return False
    if any(not isinstance(photo.get(k), str) or not photo[k].strip() for k in ('src','alt','caption','credit','source_url','license','license_url')):
        return False
    if not re.fullmatch(r'/media/culture/[a-z0-9-]+\.(jpg|jpeg|webp|png)', photo['src']):
        return False
    try:
        return all(urlsplit(photo[k]).scheme == 'https' and bool(urlsplit(photo[k]).netloc) for k in ('source_url','license_url'))
    except ValueError:
        return False


def local_notes_errors(value, field, source_ids, section_ids, current_year):
    label = '当地特色' if field == 'highlights' else '信仰在日常生活里'
    errors = []
    if not isinstance(value, dict) or not isinstance(value.get(field), list):
        return [label + '：资料须为对象列表']
    ids = set()
    for item in value[field]:
        if not isinstance(item, dict):
            errors.append(label + '：每项资料须为对象')
            continue
        for key in ('id', 'label', 'text', 'applies_to'):
            if not isinstance(item.get(key), str) or not item[key].strip():
                errors.append(label + '：须填写标题、内容和适用地区或人群')
        iid = item.get('id')
        if isinstance(iid, str):
            if iid in ids:
                errors.append(label + '：条目 ID 不可重复')
            ids.add(iid)
        refs = item.get('source_ids')
        if not isinstance(refs, list) or not refs or any(not isinstance(r, str) or r not in source_ids or r not in section_ids for r in refs):
            errors.append(label + '：每项内容须引用已登记且纳入章节的来源')
        year = item.get('year')
        if 'year' in item and (not isinstance(year, int) or isinstance(year, bool) or not 1900 <= year <= current_year):
            errors.append(label + '：须填写有效的调查或观察年份')
        if 'when' in item and (not isinstance(item['when'], str) or not item['when'].strip()):
            errors.append(label + '：时间须为非空文本')
        if 'photo' in item and not valid_photo(item['photo']):
            errors.append(label + '：图片须使用本地文化图片路径，填写图注、图片说明、署名和来源及许可链接')
        if 'photos' in item and (not isinstance(item['photos'], list) or len(item['photos']) > 6 or any(not valid_photo(photo) for photo in item['photos'])):
            errors.append(label + '：补充图片须为最多六张具备完整署名与许可的本地图片')
        if 'category' in item and item['category'] not in ('food','festival','clothing','custom','region','place','arts'):
            errors.append(label + '：当地文化分类无效')
    return list(dict.fromkeys(errors))
