# -*- coding: utf-8 -*-
"""数据层：SQLite 连接、建表、实体 CRUD、金额计算。"""
from __future__ import annotations

import os
import re
import shutil
import sqlite3
import sys
from contextlib import contextmanager
from datetime import datetime, timedelta

APP_NAME = "LabQuoteSystem"

SCHEMA = """
CREATE TABLE IF NOT EXISTS categories(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sort INTEGER DEFAULT 0,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS items(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT,
  name TEXT NOT NULL,
  category_id INTEGER DEFAULT 0,
  spec TEXT,
  unit TEXT DEFAULT '项',
  price REAL NOT NULL DEFAULT 0,
  price2 REAL DEFAULT 0,
  price2_text TEXT DEFAULT '',
  cost REAL DEFAULT 0,
  note TEXT,
  enabled INTEGER DEFAULT 1,
  starred INTEGER DEFAULT 0,
  sort INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS customers(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  contact TEXT,
  phone TEXT,
  address TEXT,
  tax_no TEXT,
  bank TEXT,
  note TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS quotes(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_no TEXT,
  title TEXT,
  customer_id INTEGER DEFAULT 0,
  customer_name TEXT,
  contact TEXT,
  phone TEXT,
  address TEXT,
  quote_date TEXT,
  expire_date TEXT,
  status TEXT DEFAULT 'draft',
  discount_rate REAL DEFAULT 0,
  tax_rate REAL DEFAULT 0,
  remark TEXT,
  terms TEXT,
  subtotal REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  total REAL DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS quote_items(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id INTEGER NOT NULL,
  item_id INTEGER DEFAULT 0,
  code TEXT,
  name TEXT,
  spec TEXT,
  unit TEXT,
  price REAL DEFAULT 0,
  price_type TEXT DEFAULT 'normal',
  section TEXT DEFAULT '',
  group_name TEXT DEFAULT '',
  quantity REAL DEFAULT 1,
  samples REAL DEFAULT 0,
  indicators REAL DEFAULT 0,
  repeats REAL DEFAULT 0,
  discount_rate REAL DEFAULT 0,
  sort INTEGER DEFAULT 0,
  note TEXT
);

CREATE TABLE IF NOT EXISTS settings(
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);
CREATE INDEX IF NOT EXISTS idx_quotes_date ON quotes(quote_date);
"""

# 报价说明：置顶条款（数量变更需重新报价），旧数据会在 _migrate 中自动补到最上方
TERMS_RULE = "报价只对当前所报数量生效，若实际实验样本数量发生变化需按照实际数量重新计算。"

# 历史版本的默认条款（迁移时据此判断并补入置顶条款）
LEGACY_TERMS = "\n".join([
    "1. 本报价单含税/不含税情况以税率栏为准，币种为人民币（CNY）。",
    "2. 本报价单自报价日期起 {days} 天内有效，逾期请重新询价。",
    "3. 委托方需提供足量、具有代表性的样品并填写委托单，样品一经受理不予退还。",
    "4. 检测周期自样品与资料齐备之日起计算，加急服务另计费用。",
    "5. 本报价单经双方签字（盖章）确认后生效，作为委托检测合同的附件。",
])


def _add_terms_rule(text: str) -> str:
    """把「数量变更需重新计算」条款插到报价说明最上方，原有编号顺序后移一位。"""
    lines = [ln.strip() for ln in str(text or "").replace("\r\n", "\n").split("\n")]
    lines = [ln for ln in lines if ln]
    if any(TERMS_RULE in ln for ln in lines):
        return str(text or "")
    shifted = []
    for ln in lines:
        m = re.match(r"^(\d+)([.、)）]\s*)", ln)
        if m:
            ln = re.sub(r"^\d+", str(int(m.group(1)) + 1), ln, count=1)
        shifted.append(ln)
    return "\n".join([f"1. {TERMS_RULE}"] + shifted)


DEFAULT_SETTINGS = {
    "company_name": "XX 检测技术有限公司",
    "company_addr": "",
    "company_phone": "",
    "company_fax": "",
    "company_email": "",
    "company_bank": "",
    "company_tax_no": "",
    "company_contact": "",
    "quote_prefix": "BJ",
    "default_tax_rate": "0",
    "default_discount_rate": "0",
    "valid_days": "30",
    "export_dir": os.path.join(os.path.expanduser("~"), "Documents", "实验室报价单"),
    "terms": _add_terms_rule(LEGACY_TERMS),
}

DEFAULT_CATEGORIES = ["理化检测", "微生物检测", "环境检测", "仪器分析", "技术服务"]

DEFAULT_ITEMS = [
    ("LHBZ-001", "水分测定", "理化检测", "GB 5009.3 直接干燥法", "项", 120, ""),
    ("LHBZ-002", "灰分测定", "理化检测", "GB 5009.4 灼烧法", "项", 100, ""),
    ("WSW-001", "菌落总数", "微生物检测", "GB 4789.2", "项", 150, ""),
    ("WSW-002", "大肠菌群", "微生物检测", "GB 4789.3", "项", 150, ""),
    ("HJJ-001", "pH 值测定", "环境检测", "GB/T 6920 玻璃电极法", "样", 60, ""),
    ("HJJ-002", "化学需氧量 COD", "环境检测", "HJ 828 重铬酸盐法", "样", 200, ""),
    ("YQF-001", "重金属铅（Pb）", "仪器分析", "GB 5009.12 原子吸收法", "项", 260, ""),
    ("YQF-002", "气相色谱分析", "仪器分析", "按方法确认", "样", 400, ""),
]


def get_app_dir() -> str:
    """程序所在目录（打包后为 exe 所在目录）。"""
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def get_local_data_dir() -> str:
    base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    path = os.path.join(base, APP_NAME, "data")
    os.makedirs(path, exist_ok=True)
    return path


def get_portable_dir() -> str:
    return os.path.join(get_app_dir(), "data")


def portable_flag_path() -> str:
    return os.path.join(get_portable_dir(), "portable.flag")


def flag_value() -> str:
    """程序目录 data/portable.flag 的内容：路径 / portable / local / 空。"""
    flag = portable_flag_path()
    if not os.path.exists(flag):
        return ""
    try:
        with open(flag, "r", encoding="utf-8") as f:
            return f.read().strip()
    except Exception:
        return ""


def custom_dir() -> str | None:
    """flag 中记录的自定义数据目录（共享盘/同步盘）。"""
    value = flag_value()
    if value and value.lower() not in ("portable", "local"):
        return value
    return None


def _writable(directory: str) -> bool:
    try:
        os.makedirs(directory, exist_ok=True)
        test = os.path.join(directory, ".writetest")
        with open(test, "w", encoding="utf-8") as f:
            f.write("1")
        os.remove(test)
        return True
    except Exception:
        return False


def portable_data_dir() -> str | None:
    """程序目录（或程序目录下 data 文件夹）存在数据库时随身模式自动生效；
    打包后的程序默认就在自己目录建 data，无需任何设置。"""
    value = flag_value().lower()
    if value == "local":
        return None
    if value == "portable":
        return get_portable_dir()
    app_dir = get_app_dir()
    for candidate in (os.path.join(app_dir, "data"), app_dir):
        if os.path.exists(os.path.join(candidate, "labquote.db")):
            return candidate
    if getattr(sys, "frozen", False) and _writable(os.path.join(app_dir, "data")):
        return os.path.join(app_dir, "data")
    return None


def is_portable() -> bool:
    return portable_data_dir() is not None


def get_data_dir() -> str:
    """自定义目录（共享盘）> 随身模式（程序同目录有数据）> 本机用户目录。"""
    custom = custom_dir()
    if custom:
        os.makedirs(custom, exist_ok=True)
        return custom
    portable = portable_data_dir()
    if portable:
        os.makedirs(portable, exist_ok=True)
        return portable
    return get_local_data_dir()


def get_db_path() -> str:
    return os.path.join(get_data_dir(), "labquote.db")


def _copy_db(src: str, dst: str) -> None:
    if not os.path.exists(src):
        return
    source = sqlite3.connect(src)
    target = sqlite3.connect(dst)
    try:
        with target:
            source.backup(target)
    finally:
        source.close()
        target.close()


def data_info() -> dict:
    custom = custom_dir()
    mode = "custom" if custom else ("portable" if is_portable() else "local")
    return {
        "mode": mode,
        "data_dir": get_data_dir(),
        "db_path": get_db_path(),
        "app_dir": get_app_dir(),
        "portable_dir": get_portable_dir(),
        "local_dir": get_local_data_dir(),
        "db_exists": os.path.exists(get_db_path()),
        "has_seed": has_seed(),
    }


def switch_mode(mode: str, path: str = "") -> dict:
    """切换数据存放位置：本机目录 / 程序目录（随身）/ 自定义目录（共享盘）。"""
    src = get_db_path()
    if mode == "custom":
        if not path:
            raise ValueError("请填写数据目录路径")
        dst_dir = os.path.abspath(path)
        os.makedirs(dst_dir, exist_ok=True)
        _copy_db(src, os.path.join(dst_dir, "labquote.db"))
        os.makedirs(get_portable_dir(), exist_ok=True)
        with open(portable_flag_path(), "w", encoding="utf-8") as f:
            f.write(dst_dir)
    elif mode == "portable":
        dst_dir = get_portable_dir()
        os.makedirs(dst_dir, exist_ok=True)
        _copy_db(src, os.path.join(dst_dir, "labquote.db"))
        with open(portable_flag_path(), "w", encoding="utf-8") as f:
            f.write("portable")
    else:
        dst_dir = get_local_data_dir()
        _copy_db(src, os.path.join(dst_dir, "labquote.db"))
        os.makedirs(get_portable_dir(), exist_ok=True)
        with open(portable_flag_path(), "w", encoding="utf-8") as f:
            f.write("local")
    return data_info()


def now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(get_db_path(), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def tx():
    conn = connect()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def seed_payload() -> tuple:
    """内置初始数据（编译进程序的 Python 模块），无则返回空。"""
    try:
        from seed_data import SEED_CATEGORIES, SEED_ITEMS  # noqa: WPS433
    except Exception:
        return [], []
    return list(SEED_CATEGORIES), list(SEED_ITEMS)


def has_seed() -> bool:
    return bool(seed_payload()[1])


def _apply_seed(conn: sqlite3.Connection) -> None:
    categories, items = seed_payload()
    ids = {}
    for idx, name in enumerate(categories):
        cur = conn.execute(
            "INSERT INTO categories(name,sort,created_at) VALUES(?,?,?)", (name, idx, now_str())
        )
        ids[name] = cur.lastrowid
    for row in items:
        code, name, cat, spec, unit, price, price2, p2text, note = (list(row) + [""] * 9)[:9]
        conn.execute(
            "INSERT INTO items(code,name,category_id,spec,unit,price,price2,price2_text,cost,note,"
            " enabled,starred,sort,created_at,updated_at)"
            " VALUES(?,?,?,?,?,?,?,?,0,?,1,0,0,?,?)",
            (code, name, ids.get(cat, 0), spec, unit, float(price or 0), float(price2 or 0),
             p2text, note, now_str(), now_str()),
        )


def _current_backup() -> str:
    target = os.path.join(get_data_dir(), f"before_reset_{datetime.now():%Y%m%d_%H%M%S}.db")
    _copy_db(get_db_path(), target)
    return target


def reset_from_seed() -> dict:
    categories, items = seed_payload()
    if not items:
        return {"ok": False, "error": "本程序未内置初始数据"}
    backup = _current_backup()
    with tx() as conn:
        for table in ("quote_items", "quotes", "items", "customers", "categories"):
            conn.execute(f"DELETE FROM {table}")
        _apply_seed(conn)
        for key, value in DEFAULT_SETTINGS.items():
            conn.execute("INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)", (key, value))
    info = data_info()
    info["backup"] = backup
    return info


def _migrate(conn: sqlite3.Connection) -> None:
    """为旧库补充新字段。"""
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(items)")}
    if "price2" not in cols:
        conn.execute("ALTER TABLE items ADD COLUMN price2 REAL DEFAULT 0")
    if "price2_text" not in cols:
        conn.execute("ALTER TABLE items ADD COLUMN price2_text TEXT DEFAULT ''")
    if "starred" not in cols:
        conn.execute("ALTER TABLE items ADD COLUMN starred INTEGER DEFAULT 0")
    qcols = {r["name"] for r in conn.execute("PRAGMA table_info(quote_items)")}
    if "price_type" not in qcols:
        conn.execute("ALTER TABLE quote_items ADD COLUMN price_type TEXT DEFAULT 'normal'")
    for col, ddl in (
        ("section", "TEXT DEFAULT ''"),
        ("group_name", "TEXT DEFAULT ''"),
        ("samples", "REAL DEFAULT 0"),
        ("indicators", "REAL DEFAULT 0"),
        ("repeats", "REAL DEFAULT 0"),
        ("group_count", "REAL DEFAULT 1"),
    ):
        if col not in qcols:
            conn.execute(f"ALTER TABLE quote_items ADD COLUMN {col} {ddl}")
    _migrate_terms(conn)


def _migrate_terms(conn: sqlite3.Connection) -> None:
    """把「数量变更需重新计算」条款补到已有报价说明的最上方（设置项与历史报价单）。"""
    row = conn.execute("SELECT value FROM settings WHERE key='terms'").fetchone()
    if row and row["value"] and TERMS_RULE not in row["value"]:
        conn.execute("UPDATE settings SET value=? WHERE key='terms'",
                     (_add_terms_rule(row["value"]),))
    for q in conn.execute(
            "SELECT id,terms FROM quotes WHERE terms IS NOT NULL AND TRIM(terms)<>''").fetchall():
        if TERMS_RULE not in q["terms"]:
            conn.execute("UPDATE quotes SET terms=? WHERE id=?",
                         (_add_terms_rule(q["terms"]), q["id"]))


def init_db() -> None:
    with tx() as conn:
        conn.executescript(SCHEMA)
        _migrate(conn)
        for key, value in DEFAULT_SETTINGS.items():
            conn.execute(
                "INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)", (key, value)
            )
        n = conn.execute("SELECT COUNT(*) c FROM categories").fetchone()["c"]
        if n == 0 and has_seed():
            _apply_seed(conn)  # 使用内置初始数据
        elif n == 0:
            for i, name in enumerate(DEFAULT_CATEGORIES):
                conn.execute(
                    "INSERT INTO categories(name,sort,created_at) VALUES(?,?,?)",
                    (name, i, now_str()),
                )
            cat = {r["name"]: r["id"] for r in conn.execute("SELECT id,name FROM categories")}
            for i, (code, name, cat_name, spec, unit, price, note) in enumerate(DEFAULT_ITEMS):
                conn.execute(
                    "INSERT INTO items(code,name,category_id,spec,unit,price,note,enabled,sort,created_at,updated_at)"
                    " VALUES(?,?,?,?,?,?,?,1,?,?,?)",
                    (code, name, cat.get(cat_name, 0), spec, unit, price, note, i, now_str(), now_str()),
                )


# ---------------------------------------------------------------- 设置
def get_settings() -> dict:
    with tx() as conn:
        rows = conn.execute("SELECT key,value FROM settings").fetchall()
    data = dict(DEFAULT_SETTINGS)
    data.update({r["key"]: r["value"] for r in rows})
    return data


def update_settings(patch: dict) -> dict:
    with tx() as conn:
        for key, value in patch.items():
            conn.execute(
                "INSERT INTO settings(key,value) VALUES(?,?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (key, "" if value is None else str(value)),
            )
    return get_settings()


# ---------------------------------------------------------------- 分类
def list_categories() -> list:
    with tx() as conn:
        rows = conn.execute(
            "SELECT c.*, (SELECT COUNT(*) FROM items i WHERE i.category_id=c.id) AS item_count"
            " FROM categories c ORDER BY c.sort, c.id"
        ).fetchall()
    return [dict(r) for r in rows]


def create_category(data: dict) -> int:
    with tx() as conn:
        cur = conn.execute(
            "INSERT INTO categories(name,sort,created_at) VALUES(?,?,?)",
            (data.get("name", "").strip(), int(data.get("sort") or 0), now_str()),
        )
        return cur.lastrowid


def update_category(cid: int, data: dict) -> None:
    with tx() as conn:
        conn.execute(
            "UPDATE categories SET name=?, sort=? WHERE id=?",
            (data.get("name", "").strip(), int(data.get("sort") or 0), cid),
        )


def delete_category(cid: int) -> None:
    with tx() as conn:
        conn.execute("UPDATE items SET category_id=0 WHERE category_id=?", (cid,))
        conn.execute("DELETE FROM categories WHERE id=?", (cid,))


# ---------------------------------------------------------------- 项目库
def list_items(search: str = "", category_id: int = 0, enabled: int = -1,
               starred: int = -1, page: int = 1, page_size: int = 50) -> dict:
    where, args = [], []
    if search:
        where.append("(i.name LIKE ? OR i.code LIKE ? OR i.spec LIKE ?)")
        like = f"%{search}%"
        args += [like, like, like]
    if category_id:
        where.append("i.category_id=?")
        args.append(category_id)
    if enabled == 1:
        where.append("i.enabled=1")
    if starred == 1:
        where.append("i.starred=1")
    sql_where = (" WHERE " + " AND ".join(where)) if where else ""
    total_sql = f"SELECT COUNT(*) c FROM items i{sql_where}"
    list_sql = (
        "SELECT i.*, COALESCE(c.name,'未分类') AS category_name FROM items i"
        " LEFT JOIN categories c ON c.id=i.category_id"
        f"{sql_where} ORDER BY i.starred DESC, i.sort, i.id LIMIT ? OFFSET ?"
    )
    offset = max(0, (int(page) - 1) * int(page_size))
    with tx() as conn:
        total = conn.execute(total_sql, args).fetchone()["c"]
        rows = conn.execute(list_sql, args + [int(page_size), offset]).fetchall()
    return {"total": total, "rows": [dict(r) for r in rows]}


def all_enabled_items() -> list:
    with tx() as conn:
        rows = conn.execute(
            "SELECT i.*, COALESCE(c.name,'未分类') AS category_name FROM items i"
            " LEFT JOIN categories c ON c.id=i.category_id"
            " WHERE i.enabled=1 ORDER BY i.starred DESC, c.sort, i.sort, i.id"
        ).fetchall()
    return [dict(r) for r in rows]


def toggle_star(iid: int, starred: int) -> None:
    with tx() as conn:
        conn.execute("UPDATE items SET starred=?, updated_at=? WHERE id=?",
                     (1 if int(starred) else 0, now_str(), iid))


def create_item(data: dict) -> int:
    with tx() as conn:
        cur = conn.execute(
            "INSERT INTO items(code,name,category_id,spec,unit,price,price2,price2_text,cost,note,"
            " enabled,starred,sort,created_at,updated_at)"
            " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                data.get("code", ""), data.get("name", "").strip(),
                int(data.get("category_id") or 0), data.get("spec", ""),
                data.get("unit") or "项", float(data.get("price") or 0),
                float(data.get("price2") or 0), data.get("price2_text", "") or "",
                float(data.get("cost") or 0), data.get("note", ""),
                1 if int(data.get("enabled", 1)) else 0,
                1 if int(data.get("starred", 0)) else 0,
                int(data.get("sort") or 0), now_str(), now_str(),
            ),
        )
        return cur.lastrowid


def update_item(iid: int, data: dict) -> None:
    with tx() as conn:
        conn.execute(
            "UPDATE items SET code=?, name=?, category_id=?, spec=?, unit=?, price=?, price2=?,"
            " price2_text=?, cost=?, note=?, enabled=?, starred=?, sort=?, updated_at=? WHERE id=?",
            (
                data.get("code", ""), data.get("name", "").strip(),
                int(data.get("category_id") or 0), data.get("spec", ""),
                data.get("unit") or "项", float(data.get("price") or 0),
                float(data.get("price2") or 0), data.get("price2_text", "") or "",
                float(data.get("cost") or 0), data.get("note", ""),
                1 if int(data.get("enabled", 1)) else 0,
                1 if int(data.get("starred", 0)) else 0,
                int(data.get("sort") or 0), now_str(), iid,
            ),
        )


def delete_items(ids: list) -> None:
    if not ids:
        return
    with tx() as conn:
        conn.executemany("DELETE FROM items WHERE id=?", [(int(i),) for i in ids])


# ---------------------------------------------------------------- 客户
def list_customers(search: str = "") -> list:
    where, args = "", []
    if search:
        where = " WHERE name LIKE ? OR contact LIKE ? OR phone LIKE ?"
        like = f"%{search}%"
        args = [like, like, like]
    with tx() as conn:
        rows = conn.execute(
            f"SELECT * FROM customers{where} ORDER BY id DESC", args
        ).fetchall()
    return [dict(r) for r in rows]


def create_customer(data: dict) -> int:
    with tx() as conn:
        cur = conn.execute(
            "INSERT INTO customers(name,contact,phone,address,tax_no,bank,note,created_at,updated_at)"
            " VALUES(?,?,?,?,?,?,?,?,?)",
            (
                data.get("name", "").strip(), data.get("contact", ""), data.get("phone", ""),
                data.get("address", ""), data.get("tax_no", ""), data.get("bank", ""),
                data.get("note", ""), now_str(), now_str(),
            ),
        )
        return cur.lastrowid


def update_customer(cid: int, data: dict) -> None:
    with tx() as conn:
        conn.execute(
            "UPDATE customers SET name=?, contact=?, phone=?, address=?, tax_no=?, bank=?,"
            " note=?, updated_at=? WHERE id=?",
            (
                data.get("name", "").strip(), data.get("contact", ""), data.get("phone", ""),
                data.get("address", ""), data.get("tax_no", ""), data.get("bank", ""),
                data.get("note", ""), now_str(), cid,
            ),
        )


def delete_customers(ids: list) -> None:
    if not ids:
        return
    with tx() as conn:
        conn.executemany("DELETE FROM customers WHERE id=?", [(int(i),) for i in ids])


# ---------------------------------------------------------------- 报价单
def _money(x) -> float:
    return round(float(x or 0) + 0.0, 2)


def calc_totals(items: list, discount_rate: float = 0, tax_rate: float = 0) -> dict:
    subtotal = 0.0
    for it in items:
        if it.get("quantity") is not None and "quantity" in it:
            qty = float(it.get("quantity") or 0)
        else:
            qty = row_quantity(it)
        price = float(it.get("price") or 0)
        dr = float(it.get("discount_rate") or 0)
        subtotal += round(price * qty * (1 - dr / 100.0), 2)
    subtotal = _money(subtotal)
    discount_amount = _money(subtotal * float(discount_rate or 0) / 100.0)
    base = _money(subtotal - discount_amount)
    tax_amount = _money(base * float(tax_rate or 0) / 100.0)
    total = _money(base + tax_amount)
    return {
        "subtotal": subtotal,
        "discount_amount": discount_amount,
        "tax_amount": tax_amount,
        "total": total,
    }


def next_quote_no(prefix: str = "BJ") -> str:
    today = datetime.now().strftime("%Y%m%d")
    head = f"{prefix or 'BJ'}{today}"
    with tx() as conn:
        row = conn.execute(
            "SELECT COUNT(*) c FROM quotes WHERE quote_no LIKE ?", (head + "%",)
        ).fetchone()
        seq = (row["c"] or 0) + 1
        while True:
            no = f"{head}-{seq:03d}"
            exists = conn.execute("SELECT id FROM quotes WHERE quote_no=?", (no,)).fetchone()
            if not exists:
                return no
            seq += 1


def list_quotes(search: str = "", status: str = "") -> list:
    where, args = [], []
    if search:
        where.append("(q.quote_no LIKE ? OR q.customer_name LIKE ? OR q.title LIKE ?)")
        like = f"%{search}%"
        args += [like, like, like]
    if status:
        where.append("q.status=?")
        args.append(status)
    sql_where = (" WHERE " + " AND ".join(where)) if where else ""
    with tx() as conn:
        rows = conn.execute(
            "SELECT q.*, (SELECT COUNT(*) FROM quote_items qi WHERE qi.quote_id=q.id) AS item_count"
            f" FROM quotes q{sql_where} ORDER BY q.id DESC", args
        ).fetchall()
    return [dict(r) for r in rows]


def get_quote(qid: int) -> dict | None:
    with tx() as conn:
        row = conn.execute("SELECT * FROM quotes WHERE id=?", (qid,)).fetchone()
        if not row:
            return None
        data = dict(row)
        items = conn.execute(
            "SELECT * FROM quote_items WHERE quote_id=? ORDER BY sort, id", (qid,)
        ).fetchall()
        data["items"] = [dict(r) for r in items]
        return data


def row_quantity(it: dict) -> float:
    """数量 = 分组数 × 每组样本数 × 检测指标数 × 重复实验次数（任一为空按 1 计）。"""
    groups = float(it.get("group_count") or 0)
    samples = float(it.get("samples") or 0)
    indicators = float(it.get("indicators") or 0)
    repeats = float(it.get("repeats") or 0)
    if groups or samples or indicators or repeats:
        return round((groups or 1) * (samples or 1) * (indicators or 1) * (repeats or 1), 4)
    return float(it.get("quantity") or 1)


def _save_items(conn, qid: int, items: list) -> None:
    conn.execute("DELETE FROM quote_items WHERE quote_id=?", (qid,))
    for idx, it in enumerate(items):
        conn.execute(
            "INSERT INTO quote_items(quote_id,item_id,code,name,spec,unit,price,price_type,section,"
            " group_name,group_count,quantity,samples,indicators,repeats,discount_rate,sort,note)"
            " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                qid, int(it.get("item_id") or 0), it.get("code", ""), it.get("name", ""),
                it.get("spec", ""), it.get("unit", "项"), float(it.get("price") or 0),
                it.get("price_type") or "normal", it.get("section") or "",
                it.get("group_name") or "",
                float(it.get("group_count") or 1),
                row_quantity(it), float(it.get("samples") or 0),
                float(it.get("indicators") or 0), float(it.get("repeats") or 0),
                float(it.get("discount_rate") or 0),
                idx, it.get("note", ""),
            ),
        )


def create_quote(data: dict) -> int:
    items = data.get("items") or []
    totals = calc_totals(items, data.get("discount_rate", 0), data.get("tax_rate", 0))
    settings = get_settings()
    prefix = data.get("quote_prefix") or settings.get("quote_prefix") or "BJ"
    quote_no = (data.get("quote_no") or "").strip() or next_quote_no(prefix)
    quote_date = data.get("quote_date") or datetime.now().strftime("%Y-%m-%d")
    expire_date = data.get("expire_date") or (
        datetime.strptime(quote_date, "%Y-%m-%d") + timedelta(days=int(settings.get("valid_days") or 30))
    ).strftime("%Y-%m-%d")
    with tx() as conn:
        cur = conn.execute(
            "INSERT INTO quotes(quote_no,title,customer_id,customer_name,contact,phone,address,"
            " quote_date,expire_date,status,discount_rate,tax_rate,remark,terms,"
            " subtotal,discount_amount,tax_amount,total,created_at,updated_at)"
            " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                quote_no, data.get("title", ""), int(data.get("customer_id") or 0),
                data.get("customer_name", ""), data.get("contact", ""), data.get("phone", ""),
                data.get("address", ""), quote_date, expire_date,
                data.get("status") or "draft", float(data.get("discount_rate") or 0),
                float(data.get("tax_rate") or 0), data.get("remark", ""), data.get("terms", ""),
                totals["subtotal"], totals["discount_amount"], totals["tax_amount"],
                totals["total"], now_str(), now_str(),
            ),
        )
        qid = cur.lastrowid
        _save_items(conn, qid, items)
        return qid


def update_quote(qid: int, data: dict) -> None:
    items = data.get("items")
    discount_rate = float(data.get("discount_rate") or 0)
    tax_rate = float(data.get("tax_rate") or 0)
    with tx() as conn:
        row = conn.execute("SELECT * FROM quotes WHERE id=?", (qid,)).fetchone()
        if not row:
            return
        if items is None:
            items = [dict(r) for r in conn.execute(
                "SELECT * FROM quote_items WHERE quote_id=? ORDER BY sort,id", (qid,))]
        totals = calc_totals(items, discount_rate, tax_rate)
        conn.execute(
            "UPDATE quotes SET title=?, customer_id=?, customer_name=?, contact=?, phone=?, address=?,"
            " quote_date=?, expire_date=?, status=?, discount_rate=?, tax_rate=?, remark=?, terms=?,"
            " subtotal=?, discount_amount=?, tax_amount=?, total=?, updated_at=? WHERE id=?",
            (
                data.get("title", row["title"]), int(data.get("customer_id") or row["customer_id"] or 0),
                data.get("customer_name", row["customer_name"]), data.get("contact", row["contact"]),
                data.get("phone", row["phone"]), data.get("address", row["address"]),
                data.get("quote_date") or row["quote_date"], data.get("expire_date") or row["expire_date"],
                data.get("status") or row["status"], discount_rate, tax_rate,
                data.get("remark", row["remark"]), data.get("terms", row["terms"]),
                totals["subtotal"], totals["discount_amount"], totals["tax_amount"],
                totals["total"], now_str(), qid,
            ),
        )
        if data.get("items") is not None:
            _save_items(conn, qid, items)


def delete_quotes(ids: list) -> None:
    if not ids:
        return
    with tx() as conn:
        conn.executemany("DELETE FROM quote_items WHERE quote_id=?", [(int(i),) for i in ids])
        conn.executemany("DELETE FROM quotes WHERE id=?", [(int(i),) for i in ids])


def duplicate_quote(qid: int) -> int | None:
    src = get_quote(qid)
    if not src:
        return None
    settings = get_settings()
    items = [
        {k: v for k, v in it.items() if k not in ("id", "quote_id")} for it in src["items"]
    ]
    return create_quote({
        "title": src["title"], "customer_id": src["customer_id"],
        "customer_name": src["customer_name"], "contact": src["contact"],
        "phone": src["phone"], "address": src["address"],
        "quote_date": datetime.now().strftime("%Y-%m-%d"),
        "expire_date": (datetime.now() + timedelta(days=int(settings.get("valid_days") or 30))).strftime("%Y-%m-%d"),
        "status": "draft", "discount_rate": src["discount_rate"], "tax_rate": src["tax_rate"],
        "remark": src["remark"], "terms": src["terms"], "items": items,
    })


# ---------------------------------------------------------------- 统计
def dashboard() -> dict:
    with tx() as conn:
        total_quotes = conn.execute("SELECT COUNT(*) c FROM quotes").fetchone()["c"]
        item_count = conn.execute("SELECT COUNT(*) c FROM items").fetchone()["c"]
        customer_count = conn.execute("SELECT COUNT(*) c FROM customers").fetchone()["c"]
        month_start = datetime.now().strftime("%Y-%m-01")
        month_amount = conn.execute(
            "SELECT COALESCE(SUM(total),0) s FROM quotes WHERE quote_date>=?", (month_start,)
        ).fetchone()["s"]
        confirmed = conn.execute(
            "SELECT COALESCE(SUM(total),0) s FROM quotes WHERE status='confirmed'"
        ).fetchone()["s"]
        status_rows = conn.execute(
            "SELECT status, COUNT(*) c, COALESCE(SUM(total),0) s FROM quotes GROUP BY status"
        ).fetchall()
        months = []
        for i in range(5, -1, -1):
            d = datetime.now().replace(day=1)
            year, mon = d.year, d.month - i
            while mon <= 0:
                mon += 12
                year -= 1
            key = f"{year:04d}-{mon:02d}"
            s = conn.execute(
                "SELECT COALESCE(SUM(total),0) s FROM quotes WHERE quote_date LIKE ?", (key + "%",)
            ).fetchone()["s"]
            months.append({"month": f"{mon:02d}月", "amount": round(s or 0, 2)})
        recent = conn.execute(
            "SELECT id, quote_no, customer_name, quote_date, status, total FROM quotes"
            " ORDER BY id DESC LIMIT 8"
        ).fetchall()
    status_map = {"draft": 0, "sent": 0, "confirmed": 0, "rejected": 0}
    for r in status_rows:
        status_map[r["status"]] = r["c"]
    return {
        "total_quotes": total_quotes,
        "item_count": item_count,
        "customer_count": customer_count,
        "month_amount": round(month_amount or 0, 2),
        "confirmed_amount": round(confirmed or 0, 2),
        "status": status_map,
        "months": months,
        "recent": [dict(r) for r in recent],
    }
