# 实验室报价系统 · 容器镜像
# 纯标准库后端（http.server + sqlite3）+ openpyxl，无 pywebview，可在任意平台运行。
FROM python:3.12-slim

LABEL org.opencontainers.image.title="实验室报价系统" \
      org.opencontainers.image.description="检测报价管理：项目库 / 客户 / 报价单 / Excel 导出" \
      org.opencontainers.image.source="https://github.com/FUJIWARESHINE/lab-quote-system"

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    LANG=C.UTF-8 \
    TZ=Asia/Shanghai \
    LABQUOTE_HOST=0.0.0.0 \
    LABQUOTE_PORT=8776 \
    PORT=8776 \
    LABQUOTE_DATA_DIR=/data

WORKDIR /app

# openpyxl 是唯一的第三方依赖
RUN pip install --no-cache-dir "openpyxl>=3.1,<4"

COPY app/ /app/app/
COPY web/ /app/web/
COPY docker-compose.yml /app/docker-compose.yml

# 数据卷：数据库与导出的 Excel 都落在这里，需映射到宿主机持久化
RUN mkdir -p /data && chmod 777 /data
VOLUME ["/data"]

EXPOSE 8776

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8776/api/health',timeout=4).status==200 else 1)"

CMD ["python", "-X", "utf8", "app/server.py"]
