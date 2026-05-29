# aimunger

中国股票投资研究资料库。汇聚三个子站点，统一部署至 [aimunger.com](https://aimunger.com)。

## 站点结构

```
aimunger.com/              ← 本仓库（静态主页）
├── /letters/              ← letters-to-shareholders（致股东信）
└── /llm-reader/           ← llm-reader（AI 辅助阅读笔记）
```

## 部署流程

```
letters-to-shareholders push ──→ GitHub Actions build ──→ deploy Pages
                                                       └─→ notify aimunger ─┐
                                                                            │
llm-reader push ───────────────→ GitHub Actions build ──→ deploy Pages      │
                                                       └─→ notify aimunger ─┤
                                                                            ▼
aimunger (repository_dispatch) ──→ checkout 三个仓库 ──→ 组装 _site/ ──→ deploy Pages
```

aimunger 的 deploy workflow 收到 `subsite-updated` 事件后：

1. Checkout 本仓库 + letters-to-shareholders + llm-reader
2. 构建 letters（Astro，重写 base 为 `/letters/`）
3. 组装 `_site/`：主页文件 + `letters/` + `llm-reader/`
4. 生成 sitemap.xml 与 robots.txt
5. 部署至 GitHub Pages

---

## letters-to-shareholders

中国上市公司致股东信合集。已收录 8 家公司、100+ 封信函（1993–2025）。

**技术栈：** Astro 4 + TypeScript + KaTeX + CSS（Flexoki 配色 + 暗色模式）

### 核心流程

```
src/content/letters/{company}/{year}.md    Markdown + YAML frontmatter
        │
        ▼
Astro Content Collections（Zod schema 校验）
        │
        ▼
静态页面生成 ──→ 首页（扇形卡片）
              ├─→ /all-companies/（公司网格）
              ├─→ /all-years/（年份时间线）
              ├─→ /company/{slug}/（公司阅读器）
              ├─→ /letter/{company}/{year}/（单篇信函）
              └─→ /mcp/（MCP/API 接入说明）
```

### 添加信函

在 `src/content/letters/{company-slug}/` 下新建 `{year}.md`：

```yaml
---
company: 万科 A
year: 2024
title: 致股东信
source: https://...    # 可选
---
信函正文（Markdown，支持 $...$ 数学公式）
```

### 关键功能

- **全文搜索：** BM25 + phrase/AND/OR 模式，按公司和年份筛选
- **公司配色：** 8 色相 × 4 明度确定性分配，WCAG 对比度保证
- **MCP Server：** `list_companies`、`list_letters`、`get_letter`、`search_letters`

---

## LLM Reader

AI 辅助阅读笔记系统。自动从文档中提取重要段落与跨文档洞察，发布为静态页面。

**技术栈：** Node.js + Express + SQLite + Claude CLI + 原生 HTML/JS

### 核心流程

```
Markdown 文件（IR-log/daily/）
        │
        ▼  reader.js：扫描文件、解析 frontmatter、按 --- 分段
content_pieces（SQLite）
        │
        ▼  extractor.js：调用 Claude CLI，提取段落 + 结构化知识
passages + knowledge_index
        │
        ▼  insights.js：每 5 段触发一次，分析跨文档模式
insights（12 类：趋势、矛盾、关联、预测、风险...）
        │
        ▼  用户审核（approve/reject）→ 反馈校准未来评分
        │
        ▼  publisher.js：编译审核通过的内容 → 单文件 HTML → git push
publish/index.html ──→ GitHub Pages
```

### 架构

```
src/
  server.js       Express API（端口 3000）
  db.js           SQLite 6 表 + FTS5 全文索引
  reader.js       文件扫描与分段
  extractor.js    Claude 驱动的段落提取与知识索引
  insights.js     跨文档洞察生成
  orchestrator.js 自动阅读循环（顺序处理、间隔 1s）
  publisher.js    静态 HTML 生成与 git 发布
  qa-cli.js       知识库问答（BM25 检索 + Claude 回答）
public/
  index.html      管理界面
publish/
  index.html      发布页面（GitHub Pages）
```

### 关键设计

- **无需 API Key：** 通过 Claude CLI (`claude -p`) 本地调用
- **人在回路：** 用户反馈（approve/reject）校准提取评分阈值
- **上下文感知：** 提取时注入已审核段落 + BM25 知识 + 已验证洞察
- **FTS5 BM25：** 知识实体检索，支撑提取上下文与问答
