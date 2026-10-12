# 实验室报价系统

一个检测报价管理软件：随时维护检测项目与单价，快速制作报价单，一键导出可直接发给客户的精美 Excel 报价单。

**以 Docker 容器形式交付**，浏览器访问，适合实验室在局域网内部署、多人共用。镜像发布在 GitHub Container Registry（GHCR），公开可拉。

## 功能

- **仪表盘**：报价单总数、本月报价金额、已确认金额、项目/客户数量，近 6 个月金额趋势图、状态分布、最近报价单快捷操作。
- **项目库**：随时维护检测项目与价格（编号、名称、分类、规格/检测依据、单位、常规价、趋势价、成本价、备注、启用状态）；支持分类管理、搜索筛选、分页；支持 Excel 模板批量导入（新增/更新）与导出备份。
- **收藏置顶**：常用项目点 ★ 收藏后自动置顶显示；项目库支持「只看收藏」筛选，报价时左侧项目库同样可只看收藏、直接点星收藏，快速找到常用项目。Excel 模板含「收藏」列，可批量标记。

## 两套价格（常规价 / 趋势价）

- 每个项目可维护**常规价**和**趋势价**两套价格；趋势价留空表示该项目没有趋势价。
- 趋势价若是**区间价或条件价**（如 `100-200元/样`、`<5组内100元/膜；200元/膜`），请把原文填到「趋势价说明」，报价时该项的「趋势价」选项会置灰，改用**手填价格**。
- 报价明细中每一行都有「价格类型」下拉：**常规价 / 趋势价 / 手填价格**。
  - 选常规价或趋势价 → 单价自动填入对应价格；
  - 直接修改单价 → 自动切为「手填价格」；
  - 无趋势价或趋势价为区间时，「趋势价」选项显示「趋势价（无）」并禁用，只能手填。
- Excel 导入/导出模板已包含「趋势价」与「趋势价说明」两列；导入时会自动识别带单位的价格文本（如 `60元/对`），区间价自动归入趋势价说明而不误填数值。
- **客户管理**：客户单位、联系人、电话、地址、税号、开户行、备注；建报价单时下拉选择自动带出联系方式。
- **报价单**：从项目库搜索勾选批量添加明细；明细按「分组（如 A 组 / 对照组）+ 每组样本数 × 检测指标数 × 重复实验次数」自动算出合计数量；可改单价、单项折扣、整单折扣与税率；每一项可单独填写备注，随报价单一起导出到 Excel；实时汇总小计/折扣/税额/总计并显示人民币大写；状态管理（草稿/已发送/已确认/已拒绝）；一键复制历史报价单；导出报价单时可**选择下载到本机浏览器**或**保存到服务器数据目录**。
- **模块化报价**：一份报价单可拆成多个模块（部分），模块名称完全自定义（如"分子平台实验""WB 实验"），从项目库添加的项目会归入当前模块；明细与导出的 Excel 都按模块分段，每段显示项目及本模块小计，最后给出总额；模块可随时新增、重命名、删除。
- **临时项目**：客户临时提出的检测项目可在报价界面点「添加临时项目」，直接填名称、单位、单价、分组等加入本报价单；该项目**不会写入项目库**，明细中带「临时」标识，导出的 Excel 同样体现，适合一次性报价。
- **系统设置**：公司抬头信息（用于报价单排版）、单号规则（前缀+日期+流水）、默认折扣/税率/有效期、默认报价条款、导出目录、数据库备份与恢复。
- **Excel 报价单**：A4 专业排版——公司抬头、客户信息区、明细表格（斑马纹、全边框、千分位）、大写金额合计、折扣与税额说明、报价条款、双方签章栏，已设置打印区域与重复标题行，可直接打印或发送客户。

## 快速开始

### 方式一：直接使用已构建镜像（推荐）

镜像已发布在 GHCR，公开可拉，无需克隆代码：

```bash
docker run -d --name labquote \
  -p 8776:8776 \
  -e LABQUOTE_DATA_DIR=/data \
  -v "$PWD/data:/data" \
  --restart unless-stopped \
  ghcr.io/fujiwareshine/lab-quote-system:latest
```

或者直接用仓库自带的 `docker-compose.yml`（已默认使用 GHCR 镜像）：

```bash
docker compose up -d
```

其内容如下，可直接改 `ports` / `volumes` 适配你的环境：

```yaml
services:
  labquote:
    image: ghcr.io/fujiwareshine/lab-quote-system:latest
    container_name: labquote
    ports:
      - "8776:8776"
    environment:
      - LABQUOTE_DATA_DIR=/data
    volumes:
      - ./data:/data
    restart: unless-stopped
```

启动后访问 `http://<主机IP>:8776/`。

### 方式二：用本地源码构建

```bash
git clone https://github.com/FUJIWARESHINE/lab-quote-system.git
cd lab-quote-system
# 先在 docker-compose.yml 中注释掉 image 行、启用 build: . 一行
docker compose up -d --build
```

## 配置说明

- **端口**：容器内固定 `8776`，默认映射到宿主机 `8776`；如需改端口，编辑 `docker-compose.yml` 的 `ports` 左侧（如 `"9000:8776"`）。
- **数据持久化**：数据库与导出的 Excel 全部写入容器 `/data`，通过 `./data:/data` 映射到宿主机项目下的 `data/` 目录。**重建容器不会丢数据**，备份/迁移只需拷贝该目录。
- **数据目录**：由环境变量 `LABQUOTE_DATA_DIR=/data` 固定，界面中不可切换（避免写进容器临时层）。
- **导出文件**：导出报价单时可选择「下载到本机」或「保存到服务器」。选服务器时写入数据目录下的 `导出报价单/`，即宿主机 `./data/导出报价单/`，可直接取用。
- **健康检查**：镜像内置 `HEALTHCHECK`，探测 `GET /api/health`。

常用命令：

```bash
docker compose logs -f          # 查看日志
docker compose restart          # 重启
docker compose down             # 停止并移除容器（数据保留在 ./data）
docker compose pull             # 拉取最新镜像
docker compose up -d            # 用新镜像重建容器
```

## 镜像自动构建

仓库配置了 GitHub Actions（`.github/workflows/docker-publish.yml`），推送到 GitHub 后自动构建镜像并推送到 GHCR：

| 触发 | 产出标签 |
|---|---|
| 推送到 `main` | `latest` |
| 推送 `v*` 标签（如 `v1.1.0`） | `v1.1.0`、`v1.1` |

镜像名称：`ghcr.io/fujiwareshine/lab-quote-system`

## 内置初始项目（开箱即用）

程序已内置**科信研测 146 个检测项目**（16 个分类，含 18 项趋势价），首次启动自动带入，无需再手工导入：

| 分类 | 编号前缀 | 分类 | 编号前缀 |
|---|---|---|---|
| RT-qPCR | KX-RTQ | 取材 | KX-QC |
| WB | KX-WB | 切片制备 | KX-QP |
| ELISA | KX-ELISA | 染色 | KX-RS |
| 培养 | KX-PY | 拍照 | KX-PZ |
| 转染 | KX-ZZ | 分析 | KX-FX |
| 流式 | KX-LS | 动物代购 | KX-DW |
| 功能 | KX-GN | 饲养 / 操作 / 模型 | KX-SY / KX-CZ / KX-MX |

编号规则：`KX-<分类代码><三位序号>`，如 `KX-RTQ001`（普通引物合成）、`KX-RS026`。
项目清单与编号也同步在 `导入项目_科信研测报价单.xlsx`，可随时用它重新导入校对。
如需恢复出厂项目：系统设置 → 数据管理 → 「重置为内置数据」（当前数据会自动备份）。

## 数据存放

数据以 SQLite 文件存放（`labquote.db`），程序按运行环境自动选择数据目录，优先级如下：

1. **容器模式**：环境变量 `LABQUOTE_DATA_DIR` 指定的目录（即挂载卷 `/data`），界面中不可切换；
2. **自定义目录**：设置页指定的共享盘 / 网盘同步目录；
3. **随身模式**：程序目录（或 `data/`）下存在 `labquote.db` 时生效，数据跟着程序走；
4. **本机模式**：`%LOCALAPPDATA%\LabQuoteSystem\data`（Windows）。

容器部署下实际只会用到第 1 种。设置页可随时「立即备份」为 `.db` 文件，或「恢复数据库」导入数据。

## 技术栈

Python 3.12（标准库 `http.server` + `sqlite3`，零 Web 框架）· openpyxl 生成 Excel · 原生 HTML/CSS/JS 前端（无框架、无 CDN，离线可用）· Docker 容器交付。

## 目录结构

```
app/    后端：server.py 服务与 API（容器入口）/ db.py 数据层 / export_excel.py Excel 生成 / seed_data.py 内置初始数据
web/    前端页面：index.html + styles.css + core.js + views.js + quote.js
Dockerfile                          容器镜像（python:3.12-slim + openpyxl）
docker-compose.yml                  容器编排（端口 8776，数据卷 ./data）
.github/workflows/docker-publish.yml 镜像自动构建（推送 → GHCR）
```
