"""Public pharmaceutical atlas with an authenticated editorial workspace."""
import csv
import gzip
import hashlib
import io
import ipaddress
import json
import os
import re
import secrets
import socket
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
from contextlib import asynccontextmanager
from functools import lru_cache
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse, urljoin

import httpx
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from starlette.middleware.gzip import GZipMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .data_logic import (compare, latest_metrics, publication_errors, review_profile,
                         source_url_valid, timestamp, validate_snapshot, view_profile, profile_structure_errors)
from .store import Store, json_text, password_hash, verify_password
from .research_catalog import CatalogConflict, detail as research_detail, edit_record, list_records

ROOT = Path(__file__).resolve().parent.parent
COOKIE = "market_session"
SESSION_SECONDS = 12 * 60 * 60

# Editorial metadata and working files are not part of a published country card.
EDITORIAL_FIELDS = frozenset({
    "internal_notes", "research_notes", "research_coverage", "excerpt", "research_log",
    "editor", "reviewer", "human_verified_by", "technical_note", "check_note",
    "evidence_file", "evidence_dir", "evidence_path", "raw_file", "source_file",
    "local_file_sha256", "source_sha256", "audit",
})


def public_profile(profile):
    # The release snapshot contains the view colleagues browse. Working edits
    # remain in the separate drafts table; review labels on the release stay intact.
    result = view_profile(profile, allow_draft=True)
    restricted = {s["id"] for s in result["sources"] if s.get("license") == "internal_user_provided"}
    result["sources"] = [s for s in result["sources"] if s["id"] not in restricted]
    for key in ("sections", "rules"):
        result[key] = [item for item in result[key]
                       if restricted.isdisjoint(item.get("source_ids", []))
                       and restricted.isdisjoint(item.get("current_source_ids", []))]

    def remove_editorial_fields(value):
        if isinstance(value, dict):
            for key in EDITORIAL_FIELDS.intersection(value):
                del value[key]
            for child in value.values():
                remove_editorial_fields(child)
        elif isinstance(value, list):
            for child in value:
                remove_editorial_fields(child)

    remove_editorial_fields(result)
    return result


def read_json(path, fallback=None):
    try:
        return json.loads(Path(path).read_text("utf-8"))
    except FileNotFoundError:
        if fallback is not None:
            return fallback
        raise


def accepts_gzip(request):
    codings = request.headers.get("accept-encoding", "")
    match = re.search(r"(?:^|,)\s*gzip\s*(?:;\s*q\s*=\s*([01](?:\.[0-9]{0,3})?))?\s*(?:,|$)", codings, re.I)
    return match is not None and float(match[1] or "1") > 0


def map_file(request, path, media_type):
    stat = path.stat()
    # Styling and geometry can change between releases. Reuse cached bytes
    # only after validating this representation against the file we serve.
    tag = f'"{stat.st_ino:x}-{stat.st_mtime_ns:x}-{stat.st_size:x}"'
    headers = {"Cache-Control": "public, no-cache", "ETag": "W/" + tag, "Vary": "Accept-Encoding"}
    validators = request.headers.get("if-none-match", "")
    if any(value.strip().removeprefix("W/") in {tag, "*"} for value in validators.split(",")):
        return Response(status_code=304, headers=headers)
    if "range" in request.headers:
        headers["Content-Encoding"] = "identity"
    elif path.suffix == ".geojson":
        # Deployments can ship a precompressed sibling; local checkouts do not
        # require one. Never serve an older sibling after replacing a layer.
        if accepts_gzip(request):
            sidecar = path.with_suffix(".geojson.gz")
            if sidecar.is_file():
                compressed_stat = sidecar.stat()
                if compressed_stat.st_mtime_ns >= stat.st_mtime_ns:
                    headers["Content-Encoding"] = "gzip"
                    return FileResponse(sidecar, stat_result=compressed_stat, media_type=media_type, headers=headers)
        elif "gzip" in request.headers.get("accept-encoding", "").lower():
            headers["Content-Encoding"] = "identity"
    return FileResponse(path, stat_result=stat, media_type=media_type, headers=headers)


def safe_cell(value):
    """Treat spreadsheet-formula prefixes as text, including after whitespace."""
    if value is None:
        return ""
    if isinstance(value, (int, float)):
        return value
    text = str(value)
    if text.lstrip().startswith(("=", "+", "-", "@")) or text.startswith(("\t", "\r", "\n")):
        return "'" + text
    return text


def check_remote_url(url, allowed_hosts):
    p = urlparse(url)
    host = (p.hostname or "").lower().rstrip(".")
    if p.scheme != "https" or p.username or p.password or p.port not in (None, 443) or host not in allowed_hosts:
        raise ValueError("仅检查已登记的 HTTPS 官方域名")
    addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
        raise ValueError("禁止访问内部或特殊网络地址")
    return host


def inspect_link(source, allowed_hosts):
    result = dict(source)
    url = source.get("url", "")
    result["checked_at"] = timestamp()
    result["technical_note"] = "连通检查不能证明页面用途、政策内容或有效性。"
    try:
        initial = url
        # trust_env=False prevents ambient proxies from changing our network boundary.
        with httpx.Client(timeout=8, follow_redirects=False, trust_env=False,
                          headers={"User-Agent": "PharmaMarketMap/0.1 source-link-check"}) as client:
            for _ in range(5):
                check_remote_url(url, allowed_hosts)
                with client.stream("GET", url) as response:
                    status = response.status_code
                    if status in (301, 302, 303, 307, 308):
                        target = urljoin(url, response.headers.get("location", ""))
                        if (urlparse(target).hostname or "").lower() not in allowed_hosts:
                            result.update(check_status="unrelated_redirect", final_url=target)
                            break
                        url = target
                        continue
                    result["http_status"] = status
                    result["final_url"] = str(response.url)
                    if status in (401, 403):
                        result["check_status"] = "login_required" if status == 401 else "blocked"
                        if status == 401:
                            result["login_required"] = True
                    elif status in (404, 410):
                        result["check_status"] = "not_found"
                    elif status >= 400:
                        result["check_status"] = "failed"
                    elif "login" in urlparse(url).path.lower() or "signin" in urlparse(url).path.lower():
                        result.update(check_status="login_required", login_required=True)
                    else:
                        body = bytearray()
                        for chunk in response.iter_bytes():
                            remaining = 524288 - len(body)
                            body.extend(chunk[:remaining])
                            if len(body) >= 524288:
                                break
                        fingerprint = hashlib.sha256(body).hexdigest()
                        content_type = response.headers.get("content-type", "")
                        decoded = bytes(body).decode("utf-8", errors="replace") if "html" in content_type else ""
                        title = re.search(r"<title[^>]*>(.*?)</title>", decoded, flags=re.I | re.S)
                        title_text = re.sub(r"\s+", " ", title.group(1)).strip()[:300] if title else None
                        result.update(content_fingerprint=fingerprint, content_bytes_checked=len(body),
                                      content_check_truncated=len(body) >= 524288, page_title=title_text,
                                      content_type=content_type)
                        previous_fingerprint = source.get("content_fingerprint")
                        if previous_fingerprint and previous_fingerprint != fingerprint:
                            result["check_status"] = "content_changed"
                            result["technical_note"] = "页面正文指纹已变化；可能为内容更新或无关替换，必须人工核实用途和结论。"
                        elif source.get("human_verified_at") and not previous_fingerprint:
                            result["check_status"] = "needs_review"
                            result["technical_note"] = "首次建立正文指纹，无法证明与人工核验时相同；需人工再次确认。"
                        else:
                            result["check_status"] = "redirected" if initial != url else "accessible"
                    break
            else:
                result["check_status"] = "failed"
                result["technical_note"] = "重定向次数过多，需人工核实。"
    except (httpx.HTTPError, ValueError, OSError) as exc:
        result["check_status"] = "failed"
        result["technical_note"] = str(exc)[:250]
    if result.get("check_status") != "accessible":
        result["human_verified_at"] = None
        result["human_verified_by"] = None
    return result


def create_app(data_dir=None, db_path=None, dist_dir=None):
    data_dir = Path(data_dir or os.environ.get("MARKET_DATA_DIR", ROOT / "data"))
    dist_dir = Path(dist_dir or ROOT / "frontend" / "dist")
    store = Store(db_path or os.environ.get("MARKET_DB_PATH") or os.environ.get("PHARMA_DB_PATH") or ROOT / ".runtime" / "market.sqlite3")
    refresh_lock = threading.Lock()
    release_lock = threading.Lock()
    initial_sources = read_json(data_dir / "profiles.json", {"countries": {}}).get("countries", {})
    allowed_hosts = {(urlparse(s.get("url", "")).hostname or "").lower()
                     for p in initial_sources.values() for s in p.get("sources", [])}
    allowed_hosts.discard("")

    def initialize():
        if store.active_version():
            return
        if not (data_dir / "snapshot.json").exists():
            return
        snapshot = read_json(data_dir / "snapshot.json")
        problems = validate_snapshot(snapshot)
        if problems:
            raise RuntimeError("初始统计快照校验失败：" + json_text(problems[:10]))
        profiles = read_json(data_dir / "profiles.json", {"countries": {}}).get("countries", {})
        # The shipped content is research input, never a claim of completed human review.
        for profile in profiles.values():
            profile["coverage"] = "basic"
            profile["review_status"] = "pending"
            profile["reviewed_at"] = None
            for item in profile.get("sections", []):
                item["status"] = "not_compiled" if item.get("kind") == "data_gap" else "pending"
                item["reviewed_at"] = None
            for item in profile.get("rules", []):
                item["review_status"] = "pending"
        with store.connection() as db:
            # A first start under multiple workers must not create duplicate releases.
            db.execute("BEGIN IMMEDIATE")
            if db.execute("SELECT 1 FROM settings WHERE key='active_version'").fetchone():
                return
            store.publish(snapshot, profiles, "system", "首次导入真实统计数据；五国政策待人工复核", db)
            for iso, profile in profiles.items():
                db.execute("INSERT OR IGNORE INTO drafts VALUES(?,?,?,?)", (iso, json_text(profile), timestamp(), "initial-research"))
            for issue in snapshot.get("quarantine", []):
                db.execute("INSERT INTO quarantine(job_id,created_at,detail) VALUES(NULL,?,?)", (timestamp(), json_text(issue)))
        for p in profiles.values():
            for s in p.get("sources", []):
                host = urlparse(s.get("url", "")).hostname
                if host:
                    allowed_hosts.add(host.lower())

    @asynccontextmanager
    async def lifespan(application):
        initialize()
        store.rebuild_research_catalog()
        if store.active_version():
            active()
        with store.connection() as db:
            db.execute("UPDATE jobs SET status='failed',finished_at=?,message='服务重启中断任务；已发布版本保持不变' WHERE status='running'", (timestamp(),))
        yield

    app = FastAPI(title="医药市场地图", version="0.1.0", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.store = store
    app.state.initialize = initialize
    app.state.data_dir = data_dir
    public_hosts = [h.strip() for h in os.environ.get("MARKET_PUBLIC_HOSTS", "").split(",") if h.strip()]
    if any(not re.fullmatch(r"[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?", h) for h in public_hosts):
        raise ValueError("MARKET_PUBLIC_HOSTS must contain exact hostnames, without schemes or wildcards")
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1", "[::1]", "testserver", *public_hosts])
    app.add_middleware(GZipMiddleware, minimum_size=1024, compresslevel=5)

    @app.middleware("http")
    async def protections(request, call_next):
        if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
            origin = request.headers.get("origin")
            if request.headers.get("sec-fetch-site") == "cross-site":
                return JSONResponse({"detail": "跨站写入被拒绝"}, status_code=403)
            if origin and origin != str(request.base_url).rstrip("/"):
                return JSONResponse({"detail": "请求来源与本站不一致"}, status_code=403)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        if request.url.path.startswith("/api"):
            response.headers.setdefault("Cache-Control", "no-store")
        return response

    def user_optional(request: Request):
        token = request.cookies.get(COOKIE)
        if not token:
            return None
        hashed = hashlib.sha256(token.encode()).hexdigest()
        with store.connection() as db:
            row = db.execute("SELECT u.id,u.username,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>?", (hashed, time.time())).fetchone()
        return dict(row) if row else None

    def current_user(request: Request):
        user = user_optional(request)
        if not user:
            raise HTTPException(401, "请先登录内部研究工作台")
        return user

    def editor(user=Depends(current_user)):
        if user["role"] not in {"editor", "admin"}:
            raise HTTPException(403, "此操作需要编辑或管理员权限")
        return user

    def admin(user=Depends(current_user)):
        if user["role"] != "admin":
            raise HTTPException(403, "此操作需要管理员权限")
        return user

    def load_release(version):
        with store.connection() as db:
            row = db.execute("SELECT snapshot,profiles FROM versions WHERE id=?", (version,)).fetchone()
        if not row:
            raise HTTPException(404, "发布版本不存在")
        return {"id": version, "snapshot": json.loads(row["snapshot"]), "profiles": json.loads(row["profiles"])}

    @lru_cache(maxsize=1)
    def cached_release(version):
        state = load_release(version)
        profiles = state["profiles"]
        bootstrap = dict(state["snapshot"])
        bootstrap["profile_coverage"] = {iso: view_profile(p).get("coverage", "basic") for iso, p in profiles.items()}
        bootstrap["profile_status"] = {iso: p.get("review_status", "pending") for iso, p in profiles.items()}
        state["bootstrap"] = bootstrap
        public = dict(bootstrap, user=None)
        public.pop("quarantine", None)
        public.pop("raw_manifest", None)
        state["guest_json"] = json_text(public).encode("utf-8")
        state["guest_gzip"] = gzip.compress(state["guest_json"], compresslevel=5, mtime=0)
        return state

    def active(version=None, *, current_only=False):
        current = store.active_version()
        if not current:
            raise HTTPException(503, "统计数据尚未就绪，请先运行数据获取脚本")
        if version is not None and version != current:
            if current_only:
                raise HTTPException(409, "资料版本已更新，请刷新页面")
            return load_release(version)
        # Published versions are immutable. Each request reads the live pointer
        # so publishes/rollbacks in other processes take effect immediately.
        # Serialize cold loads to avoid parsing the same large release in parallel.
        with release_lock:
            return cached_release(current)

    def create_session(response, user_id, request):
        token = secrets.token_urlsafe(40)
        with store.connection() as db:
            db.execute("DELETE FROM sessions WHERE expires<?", (time.time(),))
            db.execute("INSERT INTO sessions VALUES(?,?,?)", (hashlib.sha256(token.encode()).hexdigest(), user_id, time.time() + SESSION_SECONDS))
        response.set_cookie(COOKIE, token, max_age=SESSION_SECONDS, httponly=True, samesite="strict", secure=request.url.scheme == "https", path="/")

    def credentials(body):
        username = str(body.get("username", "")).strip()
        password = body.get("password", "")
        if not 2 <= len(username) <= 64 or not isinstance(password, str) or not 10 <= len(password) <= 256:
            raise HTTPException(422, "用户名需 2–64 字符，密码需 10–256 字符")
        if any(ord(c) < 32 for c in username):
            raise HTTPException(422, "用户名不能含控制字符")
        return username, password

    async def body_json(request):
        try:
            body = await request.json()
        except (ValueError, UnicodeDecodeError):
            raise HTTPException(422, "请提交有效 JSON")
        if not isinstance(body, dict):
            raise HTTPException(422, "请求正文必须为对象")
        return body

    def parse_codes(raw, minimum=2):
        codes = [c.strip().upper() for c in raw.split(",") if c.strip()]
        if not minimum <= len(codes) <= 4 or len(set(codes)) != len(codes):
            raise HTTPException(422, "请选择 %s–4 个不同国家" % minimum)
        return codes

    def get_profile(state, iso, user):
        # Every page uses the same release. Unpublished edits live only in /api/admin.
        # Editors can inspect the initial, explicitly pending research in a release.
        profile = state["profiles"].get(iso)
        if user is None:
            return public_profile(profile)
        result = view_profile(profile, allow_draft=user["role"] in {"editor", "admin", "research_reader"})
        if user["role"] == "research_reader":
            result.pop("internal_notes", None)
            for source in result.get("sources", []):
                source.pop("excerpt", None)
        return result

    def comparison(state, codes, mode, year, user):
        try:
            result = compare(state["snapshot"], codes, mode, year)
        except ValueError as exc:
            raise HTTPException(422, str(exc))
        result["profiles"] = [dict(get_profile(state, code, user), iso3=code) for code in codes]
        result["generated_at"] = timestamp()
        return result

    @app.get("/api/auth/status")
    def auth_status(request: Request):
        with store.connection() as db:
            empty = not db.execute("SELECT 1 FROM users LIMIT 1").fetchone()
        user = user_optional(request)
        return {"setup_required": empty and not public_hosts, "authenticated": user is not None, "user": user}

    @app.post("/api/auth/setup")
    async def setup(request: Request, response: Response):
        if public_hosts:
            raise HTTPException(403, "管理员初始化仅限本地模式")
        body = await body_json(request)
        username, password = credentials(body)
        with store.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            if db.execute("SELECT 1 FROM users LIMIT 1").fetchone():
                raise HTTPException(409, "已经完成初始化，请登录")
            cur = db.execute("INSERT INTO users(username,password,role,created_at) VALUES(?,?,?,?)", (username, password_hash(password), "admin", timestamp()))
            uid = cur.lastrowid
            store.log(db, username, "setup", username, "首次创建本地管理员")
        create_session(response, uid, request)
        return {"user": {"id": uid, "username": username, "role": "admin"}, "authenticated": True}

    @app.post("/api/auth/login")
    async def login(request: Request, response: Response):
        body = await body_json(request)
        username, password = str(body.get("username", "")).strip(), str(body.get("password", ""))
        if len(username) > 64 or len(password) > 256:
            raise HTTPException(401, "用户名或密码不正确")
        identity = (request.client.host if request.client else "local") + ":" + username
        with store.connection() as db:
            db.execute("DELETE FROM login_attempts WHERE created<?", (time.time() - 900,))
            attempts = db.execute("SELECT COUNT(*) FROM login_attempts WHERE identity=?", (identity,)).fetchone()[0]
            row = db.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
        if attempts >= 8:
            raise HTTPException(429, "失败尝试过多，请在 15 分钟后重试")
        if not row or not verify_password(password, row["password"]):
            with store.connection() as db:
                db.execute("INSERT INTO login_attempts(identity,created) VALUES(?,?)", (identity, time.time()))
            raise HTTPException(401, "用户名或密码不正确")
        with store.connection() as db:
            db.execute("DELETE FROM login_attempts WHERE identity=?", (identity,))
        create_session(response, row["id"], request)
        return {"authenticated": True, "user": {"id": row["id"], "username": username, "role": row["role"]}}

    @app.post("/api/auth/logout")
    def logout(request: Request, response: Response, user=Depends(current_user)):
        token = request.cookies.get(COOKIE, "")
        with store.connection() as db:
            db.execute("DELETE FROM sessions WHERE token_hash=?", (hashlib.sha256(token.encode()).hexdigest(),))
        response.delete_cookie(COOKIE, path="/")
        return {"ok": True}

    @app.post("/api/auth/share")
    async def share_login(request: Request, response: Response):
        body = await body_json(request)
        token = body.get("token")
        if not isinstance(token, str) or not 32 <= len(token) <= 128:
            raise HTTPException(401, "共享链接已失效，请使用最新链接或账号登录")
        with store.connection() as db:
            row = db.execute("SELECT value FROM settings WHERE key='colleague_share'").fetchone()
            config = json.loads(row["value"]) if row else {}
            valid = (config.get("expires", 0) > time.time()
                     and secrets.compare_digest(hashlib.sha256(token.encode()).hexdigest(), config.get("token_hash", "")))
            user = db.execute("SELECT id,username,role FROM users WHERE id=?", (config.get("user_id"),)).fetchone() if valid else None
        if not user or user["role"] != "research_reader":
            raise HTTPException(401, "共享链接已失效，请使用最新链接或账号登录")
        # Opening the colleague link must never replace an existing administrator session.
        current = user_optional(request)
        if current:
            return {"authenticated": True, "user": current}
        create_session(response, user["id"], request)
        return {"authenticated": True, "user": dict(user)}

    @app.get("/api/version")
    def published_version():
        version = store.active_version()
        if not version:
            raise HTTPException(503, "统计数据尚未就绪")
        return {"version": version}

    @app.get("/api/bootstrap")
    def bootstrap(request: Request, user=Depends(user_optional)):
        state = active()
        if user is None:
            if accepts_gzip(request):
                body, encoding = state["guest_gzip"], "gzip"
            else:
                body, encoding = state["guest_json"], "identity"
            return Response(content=body, media_type="application/json",
                            headers={"Content-Encoding": encoding, "Vary": "Accept-Encoding"})
        return JSONResponse(dict(state["bootstrap"], user=user))

    @app.get("/api/countries/{iso3}")
    def country_detail(iso3: str, version: Optional[str] = None, user=Depends(user_optional)):
        state = active(version, current_only=user is None)
        country = next((c for c in state["snapshot"]["countries"] if c["iso3"] == iso3.upper()), None)
        if not country:
            raise HTTPException(404, "未找到国家或地区")
        return {"country": country, "indicators": state["snapshot"]["indicators"],
                "latest": latest_metrics(state["snapshot"], country), "profile": get_profile(state, country["iso3"], user), "version": state["id"]}

    @app.get("/api/countries/{iso3}/humanity")
    def country_humanity(iso3: str):
        if not re.fullmatch(r"[a-zA-Z]{3}", iso3):
            raise HTTPException(404, "未找到国家或地区")
        path = data_dir / "humanity-published" / (iso3.upper() + ".json")
        if not path.is_file():
            code = iso3.upper()
            if any(country["iso3"] == code for country in active()["snapshot"]["countries"]):
                return {"iso3": code, "highlights": [], "sources": []}
            raise HTTPException(404, "未找到国家或地区")
        return FileResponse(path, media_type="application/json")

    @app.get("/api/compare")
    def compare_countries(countries: str, mode: str = "common", year: Optional[int] = None, version: Optional[str] = None, user=Depends(user_optional)):
        return comparison(active(version, current_only=user is None), parse_codes(countries), mode, year, user)

    @app.get("/api/export.csv")
    def export_csv(countries: str, mode: str = "common", year: Optional[int] = None, version: Optional[str] = None, user=Depends(user_optional)):
        state = active(version, current_only=user is None)
        result = comparison(state, parse_codes(countries, 1), mode, year, user)
        output = io.StringIO(newline="")
        writer = csv.writer(output)
        writer.writerow(["国家代码", "国家名称", "指标代码", "显示名称", "数值", "单位", "年度", "口径标识", "值类型", "数据状态", "来源 URL", "源版本", "获取时间", "发布版本"])
        names = {c["iso3"]: c["name"] for c in result["countries"]}
        for row in result["rows"]:
            i = row["indicator"]
            allowed = i.get("export_allowed") is True
            for cell in row["cells"]:
                values = [cell["iso3"], names[cell["iso3"]], i["code"], i["name"], cell["value"] if allowed else None,
                          i["unit"], cell["year"], i["definition"], cell.get("value_type") or "not_reported",
                          cell["status"] if allowed else "license_restricted", i["source_url"],
                          cell.get("source_version") or i.get("source_version") or state["snapshot"].get("source_updated", ""), state["snapshot"].get("fetched_at", ""), state["id"]]
                writer.writerow([safe_cell(v) for v in values])
        return Response("\ufeff" + output.getvalue(), media_type="text/csv; charset=utf-8",
                        headers={"Content-Disposition": 'attachment; filename="market-comparison.csv"'})

    @app.get("/api/geojson")
    def geojson(request: Request):
        path = data_dir / "world.geojson"
        if not path.exists():
            raise HTTPException(503, "边界文件未就绪；可以继续使用国家列表")
        return map_file(request, path, "application/geo+json")

    @app.get("/api/basemap/{filename}")
    def basemap_file(filename: str, request: Request):
        allowed_files = {
            "land.geojson": "application/geo+json",
            "lakes.geojson": "application/geo+json",
            "rivers.geojson": "application/geo+json",
            "bathymetry.geojson": "application/geo+json",
            "cities.geojson": "application/geo+json",
            "geographic-labels.geojson": "application/geo+json",
            "province-lines.geojson": "application/geo+json",
            "urban-areas.geojson": "application/geo+json",
            "roads.geojson": "application/geo+json",
            "relief.webp": "image/webp",
            "relief.png": "image/png",
            "relief.jpg": "image/jpeg",
            "manifest.json": "application/json",
        }
        media_type = allowed_files.get(filename)
        if media_type is None:
            raise HTTPException(404, "底图文件未登记")
        directory = (data_dir / "basemap").resolve()
        path = (directory / filename).resolve()
        if not path.is_relative_to(directory) or not path.is_file():
            raise HTTPException(404, "底图文件尚未提供")
        return map_file(request, path, media_type)

    @app.get("/api/research")
    def research_list(country: str = '', kind: str = '', q: str = '', limit: int = 50,
                      offset: int = 0, user=Depends(editor)):
        store.rebuild_research_catalog()
        try:
            with store.connection() as db:
                db.execute('BEGIN')
                return list_records(db, country, kind, q, limit, offset)
        except ValueError as exc:
            raise HTTPException(422, str(exc))

    @app.get("/api/research/{record_id}")
    def research_record(record_id: str, user=Depends(editor)):
        store.rebuild_research_catalog()
        with store.connection() as db:
            db.execute('BEGIN')
            result = research_detail(db, record_id)
        if result is None:
            raise HTTPException(404, '资料记录不存在')
        return result

    @app.put("/api/research/{record_id}")
    async def research_edit(record_id: str, request: Request, user=Depends(editor)):
        if len(await request.body()) > 1_000_000:
            raise HTTPException(413, '记录内容过大')
        payload = await body_json(request)
        store.rebuild_research_catalog()
        try:
            with store.connection() as db:
                db.execute('BEGIN IMMEDIATE')
                return edit_record(store, db, record_id, payload.get('content'),
                                   payload.get('expected_fingerprint'), payload.get('reason'), user['username'])
        except KeyError:
            raise HTTPException(404, '资料记录不存在')
        except PermissionError as exc:
            raise HTTPException(403, str(exc))
        except CatalogConflict as exc:
            raise HTTPException(409, str(exc))
        except (ValueError, TypeError) as exc:
            raise HTTPException(422, str(exc))

    @app.get("/api/admin")
    def admin_overview(user=Depends(editor)):
        state = active()
        with store.connection() as db:
            profiles = {r["iso3"]: json.loads(r["content"]) for r in db.execute("SELECT * FROM drafts ORDER BY iso3")}
            versions = [dict(r) for r in db.execute("SELECT id,created_at,reason,actor FROM versions ORDER BY rowid DESC LIMIT 100")]
            audit = [dict(r) for r in db.execute("SELECT id,created_at,actor,action,subject,reason,before_json,after_json FROM audit ORDER BY id DESC LIMIT 100")]
            users = [dict(r) for r in db.execute("SELECT id,username,role,created_at FROM users ORDER BY id")] if user["role"] == "admin" else []
            quarantine = [dict(r) for r in db.execute("SELECT * FROM quarantine ORDER BY id DESC LIMIT 100")]
            jobs = [dict(r) for r in db.execute("SELECT * FROM jobs ORDER BY id DESC LIMIT 30")]
        for v in versions:
            v["active"] = v["id"] == state["id"]
        for q in quarantine:
            q["detail"] = json.loads(q["detail"])
        return {"profiles": profiles, "versions": versions, "audit": audit, "users": users, "quarantine": quarantine, "jobs": jobs}

    @app.put("/api/admin/profiles/{iso3}")
    async def save_profile(iso3: str, request: Request, user=Depends(editor)):
        iso3 = iso3.upper()
        state = active()
        if iso3 not in {c["iso3"] for c in state["snapshot"]["countries"]}:
            raise HTTPException(404, "国家代码未纳入")
        raw = await request.body()
        if len(raw) > 1_000_000:
            raise HTTPException(413, "档案内容过大")
        try:
            profile = json.loads(raw)
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise HTTPException(422, "档案必须为有效 JSON")
        if not isinstance(profile, dict) or any(not isinstance(profile.get(key, []), list) for key in ("sections", "rules", "sources", "questions")):
            raise HTTPException(422, "档案结构无效")
        if any(not isinstance(item, dict) for key in ("sections", "rules", "sources") for item in profile.get(key, [])):
            raise HTTPException(422, "章节、规则和来源必须为对象")
        for s in profile.get("sources", []):
            if not source_url_valid(s.get("url")):
                raise HTTPException(422, "来源必须使用完整 HTTPS 地址")
        for item in profile.get('rules', []):
            if 'current_status' in item:
                item.update(current_status='unconfirmed', current_checked_at=None,
                            current_basis='', current_source_ids=[])
        structure_errors = profile_structure_errors(profile)
        if structure_errors:
            raise HTTPException(422, "档案数据无效：" + "；".join(structure_errors))
        profile.update(iso3=iso3, coverage="basic", review_status="pending", reviewed_at=None, updated_at=timestamp(), editor=user["username"])
        for item in profile.get("sections", []):
            item.update(status="not_compiled" if item.get("kind") == "data_gap" else "pending", reviewed_at=None)
        for item in profile.get("rules", []):
            item.update(review_status="pending", reviewed_at=None)
        with store.connection() as db:
            old = db.execute("SELECT content FROM drafts WHERE iso3=?", (iso3,)).fetchone()
            db.execute("INSERT INTO drafts VALUES(?,?,?,?) ON CONFLICT(iso3) DO UPDATE SET content=excluded.content,updated_at=excluded.updated_at,updated_by=excluded.updated_by", (iso3, json_text(profile), timestamp(), user["username"]))
            store.log(db, user["username"], "save_draft", iso3, "编辑后需重新人工复核", json.loads(old["content"]) if old else None, profile)
        return {"ok": True, "profile": profile}

    @app.post("/api/admin/profiles/{iso3}/review")
    async def approve_profile(iso3: str, request: Request, user=Depends(editor)):
        body = await body_json(request)
        reason = str(body.get("reason", "")).strip()
        if len(reason) < 4 or len(reason) > 2000:
            raise HTTPException(422, "请填写人工复核依据与说明（至少 4 字）")
        iso3 = iso3.upper()
        with store.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT content FROM drafts WHERE iso3=?", (iso3,)).fetchone()
            if not row:
                raise HTTPException(404, "没有待复核档案")
            draft = json.loads(row["content"])
            errors = publication_errors(draft)
            if errors:
                raise HTTPException(422, "不能发布：" + "；".join(errors))
            reviewed = review_profile(draft, user["username"], reason)
            row_active = db.execute("SELECT v.* FROM versions v JOIN settings s ON s.key='active_version' AND v.id=s.value").fetchone()
            snapshot, profiles = json.loads(row_active["snapshot"]), json.loads(row_active["profiles"])
            profiles[iso3] = reviewed
            vid = store.publish(snapshot, profiles, user["username"], "人工复核 %s：%s" % (iso3, reason), db)
            db.execute("UPDATE drafts SET content=?,updated_at=?,updated_by=? WHERE iso3=?", (json_text(reviewed), timestamp(), user["username"], iso3))
            store.log(db, user["username"], "review_publish", iso3, reason, draft, reviewed)
        return {"ok": True, "version": vid, "profile": reviewed}

    @app.post("/api/admin/rollback")
    async def rollback(request: Request, user=Depends(admin)):
        body = await body_json(request)
        vid, reason = str(body.get("version_id", "")), str(body.get("reason", "")).strip()
        if len(reason) < 4:
            raise HTTPException(422, "请填写回退原因（至少 4 字）")
        with store.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            target = db.execute("SELECT * FROM versions WHERE id=?", (vid,)).fetchone()
            if not target:
                raise HTTPException(404, "发布版本不存在")
            old = db.execute("SELECT value FROM settings WHERE key='active_version'").fetchone()[0]
            new_id = store.publish(json.loads(target["snapshot"]), json.loads(target["profiles"]), user["username"], "回退至 %s：%s" % (vid, reason), db)
            store.log(db, user["username"], "rollback", new_id, reason, {"version": old}, {"restored_from": vid, "version": new_id})
        return {"ok": True, "version": new_id, "restored_from": vid, "note": "发布版已恢复；未发布工作稿保留，可在后台继续编辑。"}

    @app.post("/api/admin/users")
    async def add_user(request: Request, user=Depends(admin)):
        body = await body_json(request)
        username, password = credentials(body)
        role = body.get("role")
        if role not in {"reader", "research_reader", "editor", "admin"}:
            raise HTTPException(422, "角色应为 reader、research_reader、editor 或 admin")
        try:
            with store.connection() as db:
                cur = db.execute("INSERT INTO users(username,password,role,created_at) VALUES(?,?,?,?)", (username, password_hash(password), role, timestamp()))
                uid = cur.lastrowid
                store.log(db, user["username"], "create_user", username, "创建角色 " + role)
        except sqlite3.IntegrityError:
            raise HTTPException(409, "用户名已存在")
        return {"id": uid, "username": username, "role": role}

    def new_job(kind, actor):
        with store.connection() as db:
            if db.execute("SELECT 1 FROM jobs WHERE kind=? AND status='running'", (kind,)).fetchone():
                raise HTTPException(409, "已有相同任务正在运行")
            cur = db.execute("INSERT INTO jobs(kind,status,created_at,actor) VALUES(?,'running',?,?)", (kind, timestamp(), actor))
            return cur.lastrowid

    def end_job(job_id, status, message):
        with store.connection() as db:
            db.execute("UPDATE jobs SET status=?,finished_at=?,message=? WHERE id=?", (status, timestamp(), message[:3000], job_id))

    def refresh_data(job_id, actor):
        try:
            with refresh_lock, tempfile.TemporaryDirectory(prefix="market-refresh-") as temporary:
                candidate_path = Path(temporary) / "snapshot.json"
                script = ROOT / "scripts" / "fetch_data.py"
                if not script.exists():
                    raise RuntimeError("数据更新脚本尚未安装")
                proc = subprocess.run([sys.executable, str(script), "--output", str(candidate_path)], cwd=str(ROOT), capture_output=True, text=True, timeout=300)
                if proc.returncode:
                    raise RuntimeError("官方数据获取失败：" + (proc.stderr or proc.stdout)[-1500:])
                candidate = read_json(candidate_path)
                previous = active()
                errors = validate_snapshot(candidate, previous["snapshot"])
                if candidate.get("quarantine"):
                    with store.connection() as db:
                        for item in candidate["quarantine"]:
                            db.execute("INSERT INTO quarantine(job_id,created_at,detail) VALUES(?,?,?)", (job_id, timestamp(), json_text(item)))
                if errors:
                    with store.connection() as db:
                        for item in errors:
                            db.execute("INSERT INTO quarantine(job_id,created_at,detail) VALUES(?,?,?)", (job_id, timestamp(), json_text(item)))
                    raise RuntimeError("数据校验未通过，异常已隔离；已发布版本保持不变")
                with store.connection() as db:
                    db.execute("BEGIN IMMEDIATE")
                    current = db.execute("SELECT v.* FROM versions v JOIN settings s ON s.key='active_version' AND v.id=s.value").fetchone()
                    vid = store.publish(candidate, json.loads(current["profiles"]), actor, "从 World Bank 更新六项指标", db)
                    store.log(db, actor, "refresh_publish", vid, "统计数据校验通过", {"version": current["id"]}, {"version": vid})
                end_job(job_id, "succeeded", "数据更新并发布：" + vid)
        except Exception as exc:
            end_job(job_id, "failed", str(exc) + "；旧发布快照保留")

    @app.post("/api/admin/refresh")
    def start_refresh(background_tasks: BackgroundTasks, user=Depends(admin)):
        job = new_job("refresh", user["username"])
        background_tasks.add_task(refresh_data, job, user["username"])
        return {"job_id": job, "status": "running"}

    def check_links(job_id, actor):
        try:
            from concurrent.futures import ThreadPoolExecutor
            with store.connection() as db:
                drafts = {r["iso3"]: json.loads(r["content"]) for r in db.execute("SELECT * FROM drafts")}
            urls = {}
            for profile in drafts.values():
                for source in profile.get("sources", []):
                    urls[source.get("url")] = source
            with ThreadPoolExecutor(max_workers=5) as pool:
                results = dict(zip(urls, pool.map(lambda s: inspect_link(s, allowed_hosts), urls.values())))
            failures = sum(s.get("check_status") != "accessible" for s in results.values())
            with store.connection() as db:
                db.execute("BEGIN IMMEDIATE")
                for iso, profile in drafts.items():
                    # Reload to avoid overwriting a draft edited while requests were running.
                    current = db.execute("SELECT content FROM drafts WHERE iso3=?", (iso,)).fetchone()
                    if not current:
                        continue
                    profile = json.loads(current["content"])
                    for source in profile.get("sources", []):
                        checked = results.get(source.get("url"))
                        if checked:
                            for key in ("checked_at", "technical_note", "check_status", "http_status", "final_url", "human_verified_at", "human_verified_by", "content_fingerprint", "content_bytes_checked", "content_check_truncated", "page_title", "content_type"):
                                if key in checked:
                                    source[key] = checked[key]
                    db.execute("UPDATE drafts SET content=? WHERE iso3=?", (json_text(profile), iso))
                current = db.execute("SELECT v.* FROM versions v JOIN settings s ON s.key='active_version' AND v.id=s.value").fetchone()
                profiles = json.loads(current["profiles"])
                for profile in profiles.values():
                    for source in profile.get("sources", []):
                        checked = results.get(source.get("url"))
                        if checked:
                            for key in ("checked_at", "technical_note", "check_status", "http_status", "final_url", "human_verified_at", "human_verified_by", "content_fingerprint", "content_bytes_checked", "content_check_truncated", "page_title", "content_type"):
                                if key in checked:
                                    source[key] = checked[key]
                vid = store.publish(json.loads(current["snapshot"]), profiles, actor, "官方入口连通检查（不代替人工核验）", db)
                store.log(db, actor, "check_links", vid, "%s 条入口中 %s 条需人工检查" % (len(results), failures))
            end_job(job_id, "succeeded", "检查 %s 个链接，%s 个需人工核验；连通不等于内容有效" % (len(results), failures))
        except Exception as exc:
            end_job(job_id, "failed", str(exc))

    @app.post("/api/admin/check-links")
    def start_link_check(background_tasks: BackgroundTasks, user=Depends(editor)):
        job = new_job("check_links", user["username"])
        background_tasks.add_task(check_links, job, user["username"])
        return {"job_id": job, "status": "running"}

    @app.get("/healthz")
    def health():
        return {"status": "ok", "data_ready": store.active_version() is not None}

    @app.get("/api/health")
    def public_health():
        return {"service": "pharma-atlas", "status": "ok"}

    @app.get("/{path:path}")
    def frontend(path: str):
        if path.startswith("api/"):
            raise HTTPException(404, "接口不存在")
        candidate = (dist_dir / path).resolve()
        if candidate.parent == (dist_dir / "media/culture").resolve() and candidate.name.startswith("hum-"):
            if not candidate.is_file() or candidate.suffix != ".webp":
                raise HTTPException(404, "未找到图片")
            return FileResponse(candidate, media_type="image/webp")
        if candidate.is_relative_to(dist_dir.resolve()) and candidate.is_file():
            if path.startswith("assets/") and re.search(r"-[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9]+$", candidate.name):
                return FileResponse(candidate, headers={"Cache-Control": "public, max-age=31536000, immutable"})
            return FileResponse(candidate)
        if path == "assets" or path.startswith("assets/"):
            raise HTTPException(404, "静态资源不存在，请刷新页面获取当前构建")
        index = dist_dir / "index.html"
        if index.exists():
            return FileResponse(index)
        return PlainTextResponse("医药市场地图服务已启动。前端尚未构建，请在 frontend 中执行 npm run build。", status_code=503)

    return app


app = create_app()
