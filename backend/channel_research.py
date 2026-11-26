"""Validation of source-defined, non-overlapping pharmaceutical channel datasets."""
import math
from datetime import date


def _number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def channel_research_errors(value, known_sources, section_refs):
    errors = []
    if not isinstance(value, dict):
        return ["渠道研究必须为对象"]
    for group in ("datasets", "procurement"):
        rows = value.get(group)
        if not isinstance(rows, list):
            errors.append(group + " 必须为列表")
            continue
        ids = set()
        for row in rows:
            if not isinstance(row, dict):
                errors.append("渠道记录必须为对象")
                continue
            ident = row.get("id")
            if not isinstance(ident, str) or not ident or ident in ids:
                errors.append("渠道记录 ID 必须非空且不重复")
            if isinstance(ident, str):
                ids.add(ident)
            refs = row.get("source_ids")
            if not isinstance(refs, list) or not refs or any(not isinstance(s, str) or s not in known_sources or s not in section_refs for s in refs):
                errors.append("渠道来源必须存在并纳入章节引用")
            if group == "datasets":
                year = row.get("year")
                if not isinstance(year, int) or isinstance(year, bool) or not 1900 <= year <= date.today().year:
                    errors.append("渠道数据必须有有效统计年度")
                if row.get("measure") not in ("sales_value", "sales_volume", "pharmaceutical_expenditure"):
                    errors.append("渠道统计口径无效")
                for key in ("title", "denominator", "product_scope", "geographic_scope"):
                    if not isinstance(row.get(key), str) or not row[key].strip():
                        errors.append("渠道数据缺少 " + key)
                channels = row.get("channels")
                if not isinstance(channels, list) or not channels:
                    errors.append("渠道明细必须为非空列表")
                    continue
                total = 0
                channel_ids = set()
                for channel in channels:
                    if not isinstance(channel, dict):
                        errors.append("渠道明细必须为对象")
                        continue
                    ident = channel.get("id")
                    if not isinstance(ident, str) or not ident or ident in channel_ids:
                        errors.append("渠道明细 ID 必须非空且不重复")
                    if isinstance(ident, str):
                        channel_ids.add(ident)
                    if not isinstance(channel.get("label"), str) or not channel["label"]:
                        errors.append("渠道名称不能为空")
                    share = channel.get("share")
                    if share is not None:
                        if not _number(share) or not 0 <= share <= 100:
                            errors.append("占比必须为 0–100 的数值，未知用 null")
                        else:
                            total += share
                    amount = channel.get("amount")
                    if amount is not None and (not _number(amount) or amount < 0):
                        errors.append("金额必须为非负有限数值")
                    bound = channel.get("share_lower_bound")
                    if bound is not None and (not _number(bound) or not 0 <= bound <= 100 or channel.get("share_operator") not in (">", ">=")):
                        errors.append("占比边界无效")
                if total > 100.20000001:
                    errors.append("同一分母的占比合计不得超过 100%")
            else:
                if any(not isinstance(row.get(k), str) or not row[k].strip() for k in ("summary", "scope")):
                    errors.append("采购方式必须写明内容和适用范围")
                if not isinstance(row.get("mechanisms"), list) or any(not isinstance(m, str) for m in row.get("mechanisms", [])):
                    errors.append("采购机制必须为文字列表")
                if "shares" in row:
                    shares = row["shares"]
                    year = row.get("year")
                    if not isinstance(shares, list) or not isinstance(row.get("denominator"), str) or not row["denominator"].strip() or not isinstance(year, int) or isinstance(year, bool) or not 1900 <= year <= date.today().year:
                        errors.append("采购占比须附年份和分母")
                        continue
                    if any(not isinstance(s, dict) or not _number(s.get("share")) or not 0 <= s["share"] <= 100 for s in shares):
                        errors.append("采购占比无效")
                    elif sum(s["share"] for s in shares) > 100.20000001:
                        errors.append("采购占比合计不得超过 100%")
    if not isinstance(value.get("gaps"), list) or any(not isinstance(g, str) for g in value.get("gaps", [])):
        errors.append("资料缺口必须为文字列表")
    return errors
