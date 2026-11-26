import hashlib
import hmac
import json
import os
import secrets
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from .data_logic import timestamp
from .research_catalog import SCHEMA as RESEARCH_SCHEMA, synchronize


def json_text(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def password_hash(password):
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 600000).hex()
    return "pbkdf2$600000$" + salt + "$" + key


def verify_password(password, encoded):
    try:
        _, rounds, salt, expected = encoded.split("$")
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(rounds)).hex()
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


class Store:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as db:
            db.executescript('''
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL,created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL,expires REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS versions(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,reason TEXT NOT NULL,actor TEXT NOT NULL,snapshot TEXT NOT NULL,profiles TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS drafts(iso3 TEXT PRIMARY KEY,content TEXT NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,created_at TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,subject TEXT,reason TEXT,before_json TEXT,after_json TEXT);
            CREATE TABLE IF NOT EXISTS jobs(id INTEGER PRIMARY KEY,kind TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,finished_at TEXT,message TEXT,actor TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS quarantine(id INTEGER PRIMARY KEY,job_id INTEGER,created_at TEXT NOT NULL,detail TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS login_attempts(id INTEGER PRIMARY KEY,identity TEXT NOT NULL,created REAL NOT NULL);
            ''')
            db.executescript(RESEARCH_SCHEMA)
        try:
            os.chmod(self.path, 0o600)
        except OSError:
            pass

    @contextmanager
    def connection(self):
        db = sqlite3.connect(str(self.path), timeout=30)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def active_version(self):
        with self.connection() as db:
            row = db.execute("SELECT v.id FROM versions v JOIN settings s ON s.key='active_version' AND s.value=v.id").fetchone()
        return row["id"] if row else None

    def active(self):
        with self.connection() as db:
            row = db.execute("SELECT v.* FROM versions v JOIN settings s ON s.key='active_version' AND s.value=v.id").fetchone()
            if not row:
                return None
            return {"id": row["id"], "snapshot": json.loads(row["snapshot"]), "profiles": json.loads(row["profiles"])}

    def publish(self, snapshot, profiles, actor, reason, db=None):
        if db is None:
            with self.connection() as connection:
                return self.publish(snapshot, profiles, actor, reason, connection)
        version_id = "v" + timestamp().replace("-", "").replace(":", "").replace("+00:00", "Z") + "-" + secrets.token_hex(3)
        snapshot = dict(snapshot, version=version_id)
        db.execute("INSERT INTO versions VALUES(?,?,?,?,?,?)", (version_id, timestamp(), reason, actor, json_text(snapshot), json_text(profiles)))
        db.execute("INSERT INTO settings(key,value) VALUES('active_version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (version_id,))
        synchronize(db, snapshot, profiles, version_id, actor, reason)
        return version_id

    def rebuild_research_catalog(self, force=False):
        """Upgrade an existing database without altering releases or account data."""
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            active = db.execute("SELECT v.* FROM versions v JOIN settings s ON s.key='active_version' AND s.value=v.id").fetchone()
            if active is None:
                return {"version": None, "records": 0, "rebuilt": False}
            indexed = db.execute("SELECT value FROM settings WHERE key='research_catalog_version'").fetchone()
            rebuilt = force or not indexed or indexed[0] != active['id']
            if rebuilt:
                count = synchronize(db, json.loads(active['snapshot']), json.loads(active['profiles']),
                                    active['id'], 'system', '建立或重建资料逐条索引')
            else:
                count = db.execute('SELECT COUNT(*) FROM research_records').fetchone()[0]
            return {"version": active['id'], "records": count, "rebuilt": rebuilt}

    def log(self, db, actor, action, subject="", reason="", before=None, after=None):
        db.execute("INSERT INTO audit(created_at,actor,action,subject,reason,before_json,after_json) VALUES(?,?,?,?,?,?,?)",
                   (timestamp(), actor, action, subject, reason, json_text(before) if before is not None else None, json_text(after) if after is not None else None))
