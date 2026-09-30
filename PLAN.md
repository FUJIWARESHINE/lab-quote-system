# 实验室报价系统 · 实施方案

> 目标：一个**双击即用的 Windows 桌面程序（.exe）**，可随时维护检测项目与单价，快速制作报价单，并一键导出**可直接发给客户的精美 Excel 报价单**。

---

## 一、交付物

| 产物 | 说明 |
|---|---|
| `实验室报价系统.exe` | 单文件可执行程序，无需安装 Python / Office 即可运行 |
| 内置数据库 | SQLite，存放于 `%LOCALAPPDATA%\LabQuoteSystem\data\labquote.db`（与 exe 解耦，升级不丢数据） |
| 导出文件 | `文档\实验室报价单\报价单_客户_编号.xlsx`（默认，可在设置中改目录） |

---

## 二、技术选型（本机已具备，无额外联网依赖）

- **后端**：Python 3.12 标准库 `http.server`（ThreadingHTTPServer）+ `sqlite3`，零 Web 框架依赖，打包体积小、启动快
- **桌面壳**：`pywebview`（本机 WinForms/.NET Framework + WebView2 已验证可用）；若环境不支持，自动降级为 Edge/Chrome 应用模式窗口
- **Excel 导出**：`openpyxl`（已安装）→ 生成带公司抬头、明细表格、合计、大写金额、签章栏的专业报价单
- **打包**：`PyInstaller 6.22`（已安装）onefile + windowed
- **前端**：原生 HTML + CSS + JS（无框架、无 CDN），随 exe 打包进资源，离线可用

**为什么不用浏览器直接开**：双击 exe 就是一个独立窗口（无地址栏、无标签页），体验等同原生软件；数据落本地 SQLite，不依赖网络。

---

## 三、功能模块（5 大板块）

### 1. 仪表盘
- KPI：报价单总数 / 本月报价金额 / 已确认金额 / 项目库条目数
- 近 6 个月报价金额柱状图、报价单状态分布
- 最近报价单快捷入口（一键导出）

### 2. 项目库（核心：随时维护项目与单价）
- 分类管理（如：理化检测 / 微生物 / 环境 / 仪器分析…）
- 字段：项目编号、名称、分类、规格/检测依据、单位、单价、成本价、备注、启用状态
- 支持：搜索、分类筛选、新增/编辑/删除、启用停用、排序
- **批量导入**：下载 Excel 模板 → 填好 → 一键导入（新增/更新）
- **导出备份**：项目库导出 Excel

### 3. 客户管理
- 客户单位、联系人、电话、地址、备注；支持搜索与增删改
- 建报价单时直接下拉选择，自动带出联系人/电话/地址

### 4. 报价单（核心：制作与导出）
- 列表：编号、客户、日期、金额、状态（草稿/已发送/已确认/已拒绝）、搜索筛选、复制、删除
- 编辑器：
  - 基本信息：客户、联系人、电话、地址、报价日期、有效期、状态、备注
  - 费用规则：整单折扣率(%)、税率(%)
  - 明细：从项目库**搜索勾选批量添加**，可改数量/单价/单项折扣，支持上下移动、删除
  - 实时汇总：小计 → 折扣 → 计税 → 总计 + **人民币大写**
  - 条款说明（默认条款在设置中维护，可单份覆盖）
- 一键导出 Excel（导出后自动打开所在文件夹）

### 5. 系统设置
- 公司信息（名称、地址、电话、传真/邮箱、开户行、税号、Logo 可选）
- 报价单编号规则（前缀 + 日期 + 流水，如 `BJ20260909-001`）
- 默认值：税率、折扣、有效期天数、默认条款
- 导出目录、数据备份 / 恢复 / 打开数据目录

---

## 四、数据库设计（SQLite）

```
categories   分类     id, name, sort
items        项目库   id, code, name, category_id, spec, unit, price, cost, note, enabled, sort, timestamps
customers    客户     id, name, contact, phone, address, tax_no, bank, note, timestamps
quotes       报价单   id, quote_no, title, customer_id, customer_name, contact, phone, address,
                      quote_date, expire_date, status, discount_rate, tax_rate,
                      remark, terms, subtotal, discount_amount, tax_amount, total, timestamps
quote_items  明细     id, quote_id, item_id, code, name, spec, unit, price, quantity, discount_rate, sort, note
settings     设置     key, value
```

金额计算规则（统一在后端实现，前后端一致）：
```
行小计 = 单价 × 数量 × (1 − 单项折扣%)
小计   = Σ 行小计
折扣额 = 小计 × 整单折扣%
税额   = (小计 − 折扣额) × 税率%
总计   = 小计 − 折扣额 + 税额   （两位小数四舍五入）
```

---

## 五、Excel 报价单排版（openpyxl）

- A4 纵向、窄页边距、自适应列宽、**打印区域 + 标题行重复 + 冻结窗格**
- 顶部：公司名（大号加粗）+ 副标题「检 测 报 价 单」
- 右侧信息栏：报价单号 / 报价日期 / 有效期至
- 客户信息区：客户单位、联系人、联系电话、地址
- 明细表：序号 | 项目编号 | 检测项目 | 规格/依据 | 单位 | 数量 | 单价(元) | 金额(元)，斑马纹 + 全边框 + 千分位两位小数
- 合计区：金额小写、人民币大写、折扣与税额说明
- 底部：报价条款说明 + 双方签章栏（报价方/客户确认）
- 页脚：公司地址电话 + 页码

---

## 六、界面风格

- 左侧深色渐变导航 + 右侧内容区，卡片式布局，圆角 14px，柔和阴影
- 主色蓝紫 `#2563eb`，状态色语义化（草稿灰 / 已发送蓝 / 已确认绿 / 已拒绝红）
- 交互：Toast 提示、模态弹窗、表格搜索与分页、空状态插画、按钮微动效
- 全中文界面，字体：微软雅黑 / Segoe UI

---

## 七、实施步骤

1. 数据层 `app/db.py`：建表、默认数据（示例分类与项目）、CRUD 封装
2. 业务层 `app/export_excel.py`：报价单 Excel 生成、项目库导入/导出、金额大写
3. 服务层 `app/server.py`：本地 HTTP 服务 + REST API + 静态资源
4. 入口 `app/main.py`：端口探测、pywebview 窗口 / 浏览器降级、单实例
5. 前端 `web/`：index.html + styles.css + app.js（五大模块）
6. 打包 `build/build.bat`：PyInstaller onefile；本机冒烟测试（启动、建项目、出报价、导 Excel）
7. 交付 `dist/实验室报价系统.exe` + 使用说明

## 八、风险与对策

| 风险 | 对策 |
|---|---|
| 目标机无 WebView2 运行库 | 启动失败自动降级为 Edge/Chrome 应用模式；仍失败则直接打开默认浏览器 |
| 打包后 pywebview/pythonnet 缺失模块 | `--collect-all webview --collect-all clr_loader`，打包后在本机实测 |
| 用户误删数据 | 设置中一键备份/恢复数据库文件，重要操作二次确认 |
| 端口占用 | 启动时随机探测空闲端口（从 8765 起） |
