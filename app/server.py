# -*- coding: utf-8 -*-
"""本地 HTTP 服务：静态资源 + REST API。"""
from __future__ import annotations

import base64
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import zipfile
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

import db
import export_excel

MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".json": "application/json; charset=utf-8",
}


def resource_path(rel: str) -> str:
    base = getattr(sys, "_MEIPASS", None)
    if base:
        return os.path.join(base, rel)
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), rel)


def find_free_port(start: int = 8765, tries: int = 60) -> int:
    for port in range(start, start + tries):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise RuntimeError("未找到可用端口")


def open_path(path: str, select: bool = False) -> None:
    path = os.path.abspath(path)
    if select:
        subprocess.Popen(["explorer", "/select,", path])
    elif os.path.isdir(path):
        os.startfile(path)
    else:
        os.startfile(path)


def ok(data=None, **extra):
    payload = {"ok": True, "data": data}
    payload.update(extra)
    return payload


def fail(msg: str, code: int = 400):
    return {"ok": False, "error": msg}, code


# ------------------------------------------------------------------ 业务
def api_dashboard(_q, _b):
    return ok(db.dashboard())


def api_list_categories(_q, _b):
    return ok(db.list_categories())


def api_create_category(_q, body):
    return ok({"id": db.create_category(body)})


def api_update_category(_q, body, cid):
    db.update_category(cid, body)
    return ok(True)


def api_delete_category(_q, _b, cid):
    db.delete_category(cid)
    return ok(True)


def api_list_items(query, _b):
    return ok(db.list_items(
        search=query.get("search", [""])[0],
        category_id=int(query.get("category_id", [0])[0] or 0),
        enabled=int(query.get("enabled", [-1])[0] or -1),
        starred=int(query.get("starred", [-1])[0] or -1),
        page=int(query.get("page", [1])[0] or 1),
        page_size=int(query.get("page_size", [50])[0] or 50),
    ))


def api_all_items(query, _b):
    return ok(db.all_enabled_items())


def api_create_item(_q, body):
    return ok({"id": db.create_item(body)})


def api_update_item(_q, body, iid):
    db.update_item(iid, body)
    return ok(True)


def api_delete_item(_q, _b, iid):
    db.delete_items([iid])
    return ok(True)


def api_delete_items(_q, body):
    db.delete_items(body.get("ids") or [])
    return ok(True)


def api_star_item(_q, body, iid):
    db.toggle_star(iid, body.get("starred", 0))
    return ok(True)


def api_export_items(query, _b):
    rows = db.list_items(
        search=query.get("search", [""])[0],
        category_id=int(query.get("category_id", [0])[0] or 0),
        page_size=100000,
    )["rows"]
    if not rows:
        return fail("没有可导出的项目")
    path = export_excel.export_items(rows)
    return ok({"path": path})


def api_items_template(_q, _b):
    return ok({"path": export_excel.export_items_template()})


def api_import_items(_q, body):
    content = body.get("content") or ""
    filename = body.get("filename") or "import.xlsx"
    if not content:
        return fail("未收到文件内容")
    tmp_dir = tempfile.mkdtemp(prefix="labquote_")
    tmp_path = os.path.join(tmp_dir, os.path.basename(filename))
    with open(tmp_path, "wb") as f:
        f.write(base64.b64decode(content.split(",")[-1]))
    try:
        result = export_excel.import_items(tmp_path)
    except Exception as exc:  # noqa: BLE001
        return fail(f"导入失败：{exc}")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
    if result.get("error"):
        return fail(result["error"])
    return ok(result)


def api_list_customers(query, _b):
    return ok(db.list_customers(query.get("search", [""])[0]))


def api_create_customer(_q, body):
    return ok({"id": db.create_customer(body)})


def api_update_customer(_q, body, cid):
    db.update_customer(cid, body)
    return ok(True)


def api_delete_customer(_q, _b, cid):
    db.delete_customers([cid])
    return ok(True)


def api_list_quotes(query, _b):
    return ok(db.list_quotes(query.get("search", [""])[0], query.get("status", [""])[0]))


def api_create_quote(_q, body):
    return ok({"id": db.create_quote(body)})


def api_get_quote(_q, _b, qid):
    data = db.get_quote(qid)
    if not data:
        return fail("报价单不存在", 404)
    return ok(data)


def api_update_quote(_q, body, qid):
    db.update_quote(qid, body)
    return ok(db.get_quote(qid))


def api_delete_quote(_q, _b, qid):
    db.delete_quotes([qid])
    return ok(True)


def api_delete_quotes(_q, body):
    ids = body.get("ids") or []
    db.delete_quotes(ids)
    return ok({"deleted": len(ids)})


def api_duplicate_quote(_q, _b, qid):
    new_id = db.duplicate_quote(qid)
    if not new_id:
        return fail("报价单不存在", 404)
    return ok({"id": new_id})


def api_export_quote(_q, _b, qid):
    quote = db.get_quote(qid)
    if not quote:
        return fail("报价单不存在", 404)
    if not quote.get("items"):
        return fail("报价单没有明细，无法导出")
    path = export_excel.export_quote(quote, db.get_settings())
    db.update_quote(qid, {"status": "sent"})
    return ok({"path": path, "name": os.path.basename(path)})


def api_get_settings(_q, _b):
    return ok(db.get_settings())


def api_update_settings(_q, body):
    return ok(db.update_settings(body))


def api_open(_q, body):
    path = body.get("path") or ""
    if not path or not os.path.exists(path):
        return fail("文件不存在：" + path)
    open_path(path, select=bool(body.get("select")))
    return ok(True)


def api_open_data_dir(_q, _b):
    open_path(db.get_data_dir())
    return ok({"path": db.get_data_dir()})


def api_system_info(_q, _b):
    return ok(db.data_info())


def api_system_mode(_q, body):
    try:
        return ok(db.switch_mode(body.get("mode") or "local", body.get("path") or ""))
    except Exception as exc:  # noqa: BLE001
        return fail(f"切换失败：{exc}")


def api_package(_q, _b):
    """把程序与当前数据打包成一个 zip，便于整体发给同事。"""
    if not getattr(sys, "frozen", False):
        return fail("此功能仅打包后的 exe 支持")
    src_db = db.get_db_path()
    if not os.path.exists(src_db):
        return fail("尚未创建数据库，请先使用一次程序")
    name = f"实验室报价系统_分发包_{datetime.now():%Y%m%d}.zip"
    path = os.path.join(db.get_app_dir(), name)
    try:
        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
            z.write(sys.executable, os.path.basename(sys.executable))
            z.write(src_db, os.path.join("data", "labquote.db"))
            z.writestr(os.path.join("data", "portable.flag"), "portable")
    except Exception as exc:  # noqa: BLE001
        return fail(f"打包失败：{exc}")
    return ok({"path": path, "name": name})


def api_reset_seed(_q, _b):
    info = db.reset_from_seed()
    if info.get("ok") is False:
        return fail(info.get("error", "重置失败"))
    return ok(info)


def api_backup(_q, _b):
    os.makedirs(os.path.join(db.get_data_dir(), "backups"), exist_ok=True)
    target = os.path.join(
        db.get_data_dir(), "backups", f"labquote_backup_{datetime.now():%Y%m%d_%H%M%S}.db"
    )
    with db.tx() as conn:
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    shutil.copy2(db.get_db_path(), target)
    return ok({"path": target})


def api_restore(_q, body):
    content = body.get("content") or ""
    if not content:
        return fail("未收到备份文件")
    tmp_dir = tempfile.mkdtemp(prefix="labquote_restore_")
    tmp_path = os.path.join(tmp_dir, "restore.db")
    with open(tmp_path, "wb") as f:
        f.write(base64.b64decode(content.split(",")[-1]))
    backup = os.path.join(db.get_data_dir(), f"before_restore_{datetime.now():%Y%m%d_%H%M%S}.db")
    try:
        shutil.copy2(db.get_db_path(), backup)
        shutil.copy2(tmp_path, db.get_db_path())
    except Exception as exc:  # noqa: BLE001
        return fail(f"恢复失败：{exc}")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
    return ok({"backup": backup})


def api_quote_preview(_q, body):
    """前端实时计算用：返回与后端一致的合计结果。"""
    return ok(db.calc_totals(
        body.get("items") or [], body.get("discount_rate", 0), body.get("tax_rate", 0)
    ))


ROUTES = [
    ("GET", re.compile(r"^/api/dashboard$"), api_dashboard),
    ("GET", re.compile(r"^/api/categories$"), api_list_categories),
    ("POST", re.compile(r"^/api/categories$"), api_create_category),
    ("PUT", re.compile(r"^/api/categories/(\d+)$"), api_update_category),
    ("DELETE", re.compile(r"^/api/categories/(\d+)$"), api_delete_category),
    ("GET", re.compile(r"^/api/items/all$"), api_all_items),
    ("GET", re.compile(r"^/api/items/export$"), api_export_items),
    ("GET", re.compile(r"^/api/items/template$"), api_items_template),
    ("POST", re.compile(r"^/api/items/import$"), api_import_items),
    ("POST", re.compile(r"^/api/items/delete$"), api_delete_items),
    ("GET", re.compile(r"^/api/items$"), api_list_items),
    ("POST", re.compile(r"^/api/items$"), api_create_item),
    ("POST", re.compile(r"^/api/items/(\d+)/star$"), api_star_item),
    ("PUT", re.compile(r"^/api/items/(\d+)$"), api_update_item),
    ("DELETE", re.compile(r"^/api/items/(\d+)$"), api_delete_item),
    ("GET", re.compile(r"^/api/customers$"), api_list_customers),
    ("POST", re.compile(r"^/api/customers$"), api_create_customer),
    ("PUT", re.compile(r"^/api/customers/(\d+)$"), api_update_customer),
    ("DELETE", re.compile(r"^/api/customers/(\d+)$"), api_delete_customer),
    ("POST", re.compile(r"^/api/quotes/preview$"), api_quote_preview),
    ("POST", re.compile(r"^/api/quotes/delete$"), api_delete_quotes),
    ("POST", re.compile(r"^/api/quotes/(\d+)/export$"), api_export_quote),
    ("POST", re.compile(r"^/api/quotes/(\d+)/duplicate$"), api_duplicate_quote),
    ("GET", re.compile(r"^/api/quotes/(\d+)$"), api_get_quote),
    ("PUT", re.compile(r"^/api/quotes/(\d+)$"), api_update_quote),
    ("DELETE", re.compile(r"^/api/quotes/(\d+)$"), api_delete_quote),
    ("GET", re.compile(r"^/api/quotes$"), api_list_quotes),
    ("POST", re.compile(r"^/api/quotes$"), api_create_quote),
    ("GET", re.compile(r"^/api/settings$"), api_get_settings),
    ("PUT", re.compile(r"^/api/settings$"), api_update_settings),
    ("POST", re.compile(r"^/api/system/open$"), api_open),
    ("GET", re.compile(r"^/api/system/data-dir$"), api_open_data_dir),
    ("GET", re.compile(r"^/api/system/info$"), api_system_info),
    ("POST", re.compile(r"^/api/system/mode$"), api_system_mode),
    ("POST", re.compile(r"^/api/system/reset-seed$"), api_reset_seed),
    ("POST", re.compile(r"^/api/system/package$"), api_package),
    ("POST", re.compile(r"^/api/system/backup$"), api_backup),
    ("POST", re.compile(r"^/api/system/restore$"), api_restore),
]


def dispatch(method: str, path: str, query: dict, body: dict | None):
    for verb, pattern, func in ROUTES:
        m = pattern.match(path)
        if m and verb == method:
            args = [int(x) if x.isdigit() else x for x in m.groups()]
            return func(query, body or {}, *args) if args else func(query, body or {})
        # 兼容前端 PUT/DELETE
    return None


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        pass

    # -------------------------------------------------- helpers
    def _send(self, status: int, body: bytes, content_type: str):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _json(self, status: int, payload):
        self._send(status, json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                   "application/json; charset=utf-8")

    def _read_body(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if not length:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return {}

    # -------------------------------------------------- verbs
    def do_GET(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        if path.startswith("/api/"):
            result = dispatch("GET", path, parse_qs(parsed.query), None)
            if result is None:
                return self._json(404, {"ok": False, "error": "接口不存在"})
            payload, code = result if isinstance(result, tuple) else (result, 200)
            return self._json(code, payload)
        return self._static(path)

    def do_POST(self):
        self._write_api("POST")

    def do_PUT(self):
        self._write_api("PUT")

    def do_DELETE(self):
        self._write_api("DELETE")

    def _write_api(self, method: str):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        body = self._read_body()
        try:
            result = dispatch(method, path, parse_qs(parsed.query), body)
        except Exception as exc:  # noqa: BLE001
            return self._json(500, {"ok": False, "error": f"服务异常：{exc}"})
        if result is None:
            return self._json(404, {"ok": False, "error": "接口不存在"})
        payload, code = result if isinstance(result, tuple) else (result, 200)
        return self._json(code, payload)

    def _static(self, path: str):
        if path in ("/", ""):
            path = "/index.html"
        rel = path.lstrip("/").replace("/", os.sep)
        full = resource_path(os.path.join("web", rel))
        if not os.path.isfile(full):
            full = resource_path(os.path.join("web", "index.html"))
        ext = os.path.splitext(full)[1].lower()
        with open(full, "rb") as f:
            content = f.read()
        self._send(200, content, MIME.get(ext, "application/octet-stream"))


def start_server(port: int | None = None) -> tuple[ThreadingHTTPServer, int]:
    db.init_db()
    port = port or find_free_port()
    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd, port
