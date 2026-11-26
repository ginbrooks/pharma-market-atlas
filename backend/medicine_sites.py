"""Validate sourced official medicine websites and their described capabilities."""
from datetime import date
from urllib.parse import urlparse

SITE_TYPES = {'regulator', 'health_ministry', 'drug_registry', 'procurement', 'pricing', 'regional', 'other'}
VERIFICATION_METHODS = {'page_content', 'official_directory', 'official_search_result', 'unverified'}


def public_website_url(value, https_only=False):
    if not isinstance(value, str) or not value.strip():
        return False
    try:
        parsed = urlparse(value)
        return (parsed.scheme in ({'https'} if https_only else {'https', 'http'})
                and bool(parsed.hostname) and not parsed.username and not parsed.password
                and not any(ch.isspace() or ord(ch) < 32 for ch in value))
    except ValueError:
        return False


def medicine_sites_errors(sites, source_ids, section_ids, today):
    if not isinstance(sites, list) or any(not isinstance(site, dict) for site in sites):
        return ['药品查询入口必须为对象列表']
    errors, ids, urls = [], set(), set()
    for site in sites:
        title = site.get('title') or '药品查询入口'
        for field in ('id', 'title', 'institution', 'description', 'scope', 'evidence_note'):
            value = site.get(field)
            if not isinstance(value, str) or not value.strip():
                errors.append(f'{title}：{field} 必须为非空文本')
        sid = site.get('id')
        if isinstance(sid, str):
            if sid in ids:
                errors.append('药品查询入口 ID 重复')
            ids.add(sid)
        url = site.get('url')
        if not public_website_url(url):
            errors.append(f'{title}：网站地址须为完整 HTTP 或 HTTPS 链接')
        elif url.rstrip('/') in urls:
            errors.append(f'{title}：同一国家网站地址重复')
        else:
            urls.add(url.rstrip('/'))
        if not public_website_url(site.get('evidence_url'), https_only=True):
            errors.append(f'{title}：功能核对依据须为完整 HTTPS 链接')
        if site.get('site_type') not in SITE_TYPES or site.get('access') not in {'public', 'login_required', 'mixed'}:
            errors.append(f'{title}：网站类型或访问方式无效')
        method = site.get('verification_method')
        if method not in VERIFICATION_METHODS:
            errors.append(f'{title}：核验方式无效')
        checked = site.get('checked_at')
        if method != 'unverified' or checked is not None:
            try:
                parsed_date = date.fromisoformat(checked)
                if parsed_date > today:
                    raise ValueError()
            except (ValueError, TypeError):
                errors.append(f'{title}：核验日期须为实际日期')
        capabilities = site.get('capabilities')
        if not isinstance(capabilities, list) or not capabilities or any(not isinstance(s, str) or not s.strip() for s in capabilities):
            errors.append(f'{title}：须简述网站可查询的内容')
        refs = site.get('source_ids')
        if not isinstance(refs, list) or not refs or any(not isinstance(s, str) or s not in source_ids or s not in section_ids for s in refs):
            errors.append(f'{title}：每个网站须引用已登记并纳入章节的依据')
    return list(dict.fromkeys(errors))
