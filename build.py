# -*- coding: utf-8 -*-
"""打包脚本：生成单文件 exe（build.py，避免命令行中文编码问题）。"""
import os
import shutil
import sys

import PyInstaller.__main__

ROOT = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(ROOT, "dist")
ENTRY = os.path.join(ROOT, "app", "main.py")

args = [
    "--noconfirm",
    "--clean",
    "--onefile",
    "--windowed",
    "--noupx",
    "--icon", os.path.join(ROOT, "app", "icon.ico"),
    "--name", "LabQuoteSystem",
    "--add-data", os.path.join(ROOT, "web") + os.pathsep + "web",
    "--collect-all", "webview",
    "--collect-all", "clr_loader",
    "--collect-all", "pythonnet",
    "--exclude-module", "pytest",
    "--exclude-module", "PIL",
    "--distpath", DIST,
    "--workpath", os.path.join(ROOT, "build", "tmp"),
    "--specpath", os.path.join(ROOT, "build"),
    ENTRY,
]

SEED_MOD = os.path.join(ROOT, "app", "seed_data.py")
if os.path.exists(SEED_MOD):
    # 内置初始数据模块（首次运行或“重置为内置数据”时使用）
    idx = args.index("--exclude-module")
    args[idx:idx] = ["--hidden-import", "seed_data"]
    print("已内置初始数据模块：", SEED_MOD)

if __name__ == "__main__":
    try:
        PyInstaller.__main__.run(args)
        rc = 0
    except SystemExit as exc:  # PyInstaller 内部调用 sys.exit
        rc = exc.code or 0
    if rc == 0:
        src = os.path.join(DIST, "LabQuoteSystem.exe")
        dst = os.path.join(DIST, "实验室报价系统.exe")
        if os.path.exists(dst):
            os.remove(dst)
        os.rename(src, dst)
        print("生成：", dst, round(os.path.getsize(dst) / 1024 / 1024, 1), "MB")
    sys.exit(rc)
