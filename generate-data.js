/**
 * generate-data.js
 *
 * Reads Markdown files from the IR-log/data directory, parses the tables,
 * and writes a JSON file (data/data.json) that the /data/ page consumes.
 *
 * Each file produces an entry keyed by its filename (without .md extension).
 * The entry contains:
 *   - headers: string[]           — column headers from the table
 *   - rows: (string|number)[][]   — parsed row data
 *   - meta: { created, tags, description } — frontmatter metadata
 *
 * Chart configurations are NOT generated here — they live in chart-configs.js
 * and are maintained manually per file.
 *
 * Usage:
 *   node generate-data.js          — one-shot generation
 *   node generate-data.js --watch  — watch source directory, auto-regenerate on changes
 */

const fs = require('fs');
const path = require('path');

const DATA_SOURCE = path.resolve(__dirname, '../IR-log/data');
const OUTPUT_FILE = path.resolve(__dirname, 'data/data.json');
const DATA_DIR = path.resolve(__dirname, 'data');
const SITE = 'https://aimunger.com';

// Editorial metadata (slug, prose, source, methodology) per chart.
// Charts with an entry here get a standalone indexable page at /data/<slug>/.
let CHART_META = {};
try {
    CHART_META = require('./data/chart-meta.js');
} catch (e) {
    console.warn('chart-meta.js not found or invalid — no chart pages will be generated.');
}

function parseFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---\n/);
    if (!match) return { meta: {}, body: content };
    const meta = {};
    match[1].split('\n').forEach(line => {
        const m = line.match(/^(\w+):\s*(.+)$/);
        if (m) {
            let val = m[2].trim();
            if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
            if (val === '[]') val = [];
            meta[m[1]] = val;
        }
    });
    return { meta, body: content.slice(match[0].length) };
}

function parseMarkdownTable(tableText) {
    const lines = tableText.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) return null;

    const parseLine = line => {
        const parts = line.split('|').map(c => c.trim());
        // Remove leading/trailing empty strings from pipe boundaries
        const start = parts[0] === '' ? 1 : 0;
        const end = parts[parts.length - 1] === '' ? parts.length - 1 : parts.length;
        return parts.slice(start, end);
    };

    const headers = parseLine(lines[0]);

    // Skip separator line (line[1])
    const rows = [];
    for (let i = 2; i < lines.length; i++) {
        const cells = parseLine(lines[i]);
        const parsed = cells.map(cell => {
            // Remove commas from numbers, try to parse
            const cleaned = cell.replace(/,/g, '').replace(/%$/, '');
            const num = Number(cleaned);
            if (cell.endsWith('%') && !isNaN(num)) return num;
            if (!isNaN(num) && cleaned !== '') return num;
            return cell;
        });
        rows.push(parsed);
    }

    return { headers, rows };
}

function main() {
    if (!fs.existsSync(DATA_SOURCE)) {
        console.error(`Data source not found: ${DATA_SOURCE}`);
        process.exit(1);
    }

    const files = fs.readdirSync(DATA_SOURCE).filter(f => f.endsWith('.md'));
    const result = {};

    for (const file of files) {
        const name = file.replace(/\.md$/, '');
        const content = fs.readFileSync(path.join(DATA_SOURCE, file), 'utf-8');
        const { meta, body } = parseFrontmatter(content);

        // Find the first markdown table in the body
        const tableMatch = body.match(/(\|.+\|[\s\S]*?\|.+\|(?:\n|$))/);
        if (!tableMatch) {
            console.warn(`No table found in ${file}, skipping.`);
            continue;
        }

        // Extract full table (all consecutive lines starting with |)
        const bodyLines = body.split('\n');
        let tableStart = -1;
        let tableEnd = -1;
        for (let i = 0; i < bodyLines.length; i++) {
            if (bodyLines[i].trim().startsWith('|')) {
                if (tableStart === -1) tableStart = i;
                tableEnd = i;
            } else if (tableStart !== -1) {
                break;
            }
        }

        if (tableStart === -1) continue;

        const tableText = bodyLines.slice(tableStart, tableEnd + 1).join('\n');
        const table = parseMarkdownTable(tableText);
        if (!table) continue;

        // Expose the page slug to the index page so chart titles can link out
        if (CHART_META[name]) meta.slug = CHART_META[name].slug;

        // Keep any text the source file carries outside the table (e.g. 注 lines)
        // so the site shows exactly what the source says — no more, no less.
        const notes = bodyLines
            .filter((line, i) => (i < tableStart || i > tableEnd) && line.trim())
            .map(line => line.trim());

        result[name] = {
            meta,
            headers: table.headers,
            rows: table.rows,
            notes
        };

        console.log(`Parsed: ${name} (${table.rows.length} rows, ${table.headers.length} cols)`);
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), 'utf-8');
    console.log(`\nWritten: ${OUTPUT_FILE}`);

    generateChartPages(result);
    updateIndexChartLinks(result);
}

// ── Standalone chart pages (/data/<slug>/) ──────────────────────────────
//
// Each chart with editorial metadata in chart-meta.js gets a static,
// indexable page: prose intro, source, methodology, the full data table in
// HTML (crawlable), Dataset + BreadcrumbList JSON-LD, and the interactive
// ECharts chart hydrating on top. The /data/ index stays the visual
// overview; these pages are the canonical, linkable URLs per dataset.

function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function isPercentHeader(h) {
    return h.includes('比例') || h.includes('占比') || /率\s*$/.test(h);
}

function formatCell(cell, header) {
    if (typeof cell === 'number') {
        return isPercentHeader(header) ? cell + '%' : cell.toLocaleString();
    }
    return cell;
}

function buildTableHtml(headers, rows) {
    const head = headers.map(h => `<th>${escapeHtml(h)}</th>`).join('');
    const body = rows.map(row =>
        `<tr>${row.map((cell, i) => `<td>${escapeHtml(formatCell(cell, headers[i] || ''))}</td>`).join('')}</tr>`
    ).join('\n');
    return `<table class="data-table"><thead><tr>${head}</tr></thead><tbody>\n${body}\n</tbody></table>`;
}

function yearSpan(rows) {
    // Wide tables carry the year in column 0 (existing behaviour, unchanged).
    let years = rows
        .map(r => String(r[0]).replace(/[^0-9]/g, ''))
        .filter(y => y.length === 4)
        .map(Number);
    // Tidy/long-format tables (业务·年份·指标·数值) keep the year in another
    // column; fall back to scanning every cell, bounded to plausible years so
    // ordinary data values aren't mistaken for one.
    if (!years.length) {
        years = [];
        for (const r of rows) {
            for (const cell of r) {
                const s = String(cell).replace(/[^0-9]/g, '');
                if (s.length === 4) {
                    const n = Number(s);
                    if (n >= 1900 && n <= 2100) years.push(n);
                }
            }
        }
    }
    if (!years.length) return '';
    const min = Math.min(...years);
    const max = Math.max(...years);
    return min === max ? String(min) : `${min}–${max}`;
}

function buildChartPage(name, entry, meta) {
    const updated = entry.meta && entry.meta.created ? entry.meta.created.split(' ')[0] : '';
    const span = yearSpan(entry.rows);
    const url = `${SITE}/data/${meta.slug}/`;
    const entryJson = JSON.stringify({ headers: entry.headers, rows: entry.rows, meta: entry.meta })
        .replace(/</g, '\\u003c');
    const nameJson = JSON.stringify(name).replace(/</g, '\\u003c');

    // Page text mirrors the source file exactly; the meta description is the
    // frontmatter description when present, otherwise a neutral generated one.
    const description = (entry.meta && entry.meta.description) ||
        `${name}（${span}）历年数据、图表与数据表。`;

    const datasetLd = {
        '@context': 'https://schema.org',
        '@type': 'Dataset',
        name,
        description,
        url,
        ...(updated ? { dateModified: updated } : {}),
        ...(span ? { temporalCoverage: span.replace('–', '/') } : {}),
        inLanguage: 'zh-CN',
        isAccessibleForFree: true,
        creator: { '@type': 'Organization', name: 'aimunger', url: `${SITE}/` }
    };
    const breadcrumbLd = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: '数据', item: `${SITE}/data/` },
            { '@type': 'ListItem', position: 2, name, item: url }
        ]
    };

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(name)}（${span}）数据图表 - aimunger</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${url}" />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;600;700&display=optional" rel="stylesheet">
    <link rel="stylesheet" href="/style.css">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <script type="application/ld+json">${JSON.stringify(datasetLd).replace(/</g, '\\u003c')}</script>
    <script type="application/ld+json">${JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c')}</script>
    <style>
        .chart-breadcrumb {
            font-size: 13px;
            color: var(--color-text-secondary);
            margin-bottom: 24px;
        }
        .chart-breadcrumb a {
            color: var(--color-text-secondary);
        }
        .chart-breadcrumb a:hover {
            color: var(--color-accent);
        }
        .chart-page-title {
            font-family: var(--font-serif);
            font-size: 26px;
            font-weight: 700;
            line-height: 1.4;
            margin-bottom: 8px;
        }
        .chart-page-meta {
            font-size: 13px;
            color: var(--color-text-secondary);
            margin-bottom: 24px;
        }
        .chart-container {
            width: 100%;
            height: 400px;
            background: var(--color-card-bg);
            border: 1px solid var(--color-border);
            border-radius: 12px;
            overflow: hidden;
            margin: 24px 0 32px;
        }
        .chart-page-section-title {
            font-family: var(--font-serif);
            font-size: 17px;
            font-weight: 700;
            margin: 32px 0 12px;
        }
        .data-table-wrapper {
            overflow-x: auto;
        }
        .data-table {
            border-collapse: collapse;
            width: 100%;
            font-size: 13px;
        }
        .data-table th,
        .data-table td {
            border: 1px solid var(--color-border);
            padding: 6px 10px;
            text-align: right;
            white-space: nowrap;
        }
        .data-table th {
            background: var(--color-surface);
            font-weight: 600;
            text-align: center;
        }
        .data-table td:first-child,
        .data-table th:first-child {
            text-align: center;
        }
        .chart-page-note {
            font-size: 13px;
            color: var(--color-text-secondary);
            line-height: 1.8;
            margin: 12px 0 40px;
        }
        @media (max-width: 600px) {
            .chart-container { height: 320px; }
            .chart-page-title { font-size: 21px; }
        }
    </style>
</head>
<body id="top">
    <header class="header">
        <nav class="nav container">
            <a href="/" class="logo">
                <span class="logo-icon">M</span>
                <span class="logo-text">aimunger</span>
            </a>
            <ul class="nav-links">
                <li><a href="/resources/">资料库</a></li>
                <li><a href="/wiki/">Wiki</a></li>
                <li><a href="/blog/">文章</a></li>
                <li class="nav-more">
                    <button type="button" class="nav-more-toggle active" aria-haspopup="true" aria-expanded="false">更多<span class="nav-more-caret" aria-hidden="true">▾</span></button>
                    <ul class="nav-more-menu">
                        <li><a href="/data/" class="active">数据</a></li>
                        <li><a href="/ankicard/">记忆卡</a></li>
                        <li><a href="/podcast/">播客</a></li>
                        <li><a href="/about/">关于</a></li>
                    </ul>
                </li>
            </ul>
        </nav>
    </header>

    <main class="main">
        <div class="container">
            <nav class="chart-breadcrumb"><a href="/data/">数据</a> / ${escapeHtml(name)}</nav>

            <h1 class="chart-page-title">${escapeHtml(name)}（${span}）</h1>
            ${updated ? `<p class="chart-page-meta">数据更新：${updated}</p>` : ''}

            <div class="chart-container" id="chart"></div>
            <noscript><p class="chart-page-note">交互图表需要 JavaScript，完整数据见下方数据表。</p></noscript>

            <h2 class="chart-page-section-title">数据表</h2>
            <div class="data-table-wrapper">
                ${buildTableHtml(entry.headers, entry.rows)}
            </div>
${(entry.notes || []).map(n => `            <p class="chart-page-note">${escapeHtml(n)}</p>`).join('\n')}
        </div>
    </main>

    <footer class="footer">
        <div class="container">
            <div class="footer-links">
                <a href="/about/">关于</a>
                <a href="/contact/">联系</a>
                <a href="/privacy/">隐私政策</a>
                <a href="/disclaimer/">免责声明</a>
                <a href="https://aimunger.com/llm.txt">llm.txt</a>
                <a href="https://aimunger.com/sitemap.xml">sitemap</a>
                <a href="https://aimunger.com/rss.xml">rss</a>
            </div>
            <p>&copy; 2026 aimunger</p>
        </div>
    </footer>

    <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
    <script src="/data/chart-configs.js"></script>
    <script>
    (function() {
        var NAME = ${nameJson};
        var ENTRY = ${entryJson};
        var el = document.getElementById('chart');
        if (typeof echarts !== 'undefined' && typeof CHART_CONFIGS !== 'undefined' && CHART_CONFIGS[NAME]) {
            var chart = echarts.init(el);
            chart.setOption(CHART_CONFIGS[NAME](ENTRY));
            window.addEventListener('resize', function() { chart.resize(); });
        } else {
            el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#999;font-size:14px;">图表未能加载，完整数据见下方数据表</div>';
        }
    })();
    </script>
    <script src="/memory-notify.js"></script>
</body>
</html>
`;
}

function generateChartPages(result) {
    for (const [name, entry] of Object.entries(result)) {
        const meta = CHART_META[name];
        if (!meta) {
            console.log(`No chart-meta for "${name}" — skipping standalone page.`);
            continue;
        }
        const dir = path.join(DATA_DIR, meta.slug);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'index.html'), buildChartPage(name, entry, meta), 'utf-8');
        console.log(`Page: data/${meta.slug}/index.html`);
    }
}

// Rewrite the static, crawlable chart-link list on data/index.html between
// the chart-links markers, so the index always links every chart page.
function updateIndexChartLinks(result) {
    const indexPath = path.join(DATA_DIR, 'index.html');
    if (!fs.existsSync(indexPath)) return;
    const html = fs.readFileSync(indexPath, 'utf-8');
    const START = '<!-- chart-links:start -->';
    const END = '<!-- chart-links:end -->';
    const s = html.indexOf(START);
    const e = html.indexOf(END);
    if (s === -1 || e === -1) {
        console.warn('chart-links markers not found in data/index.html — static link list not updated.');
        return;
    }

    const items = Object.entries(result)
        .filter(([name]) => CHART_META[name])
        .map(([name, entry]) => {
            const meta = CHART_META[name];
            const span = yearSpan(entry.rows);
            const updated = entry.meta && entry.meta.created ? entry.meta.created.split(' ')[0] : '';
            const info = [span, updated ? `更新 ${updated}` : ''].filter(Boolean).join(' · ');
            return `                <li><a href="${meta.slug}/">${escapeHtml(name)}</a>${info ? `<span class="chart-index__info">${info}</span>` : ''}</li>`;
        });

    const block = `${START}\n            <ul class="chart-index__list">\n${items.join('\n')}\n            </ul>\n            ${END}`;
    fs.writeFileSync(indexPath, html.slice(0, s) + block + html.slice(e + END.length), 'utf-8');
    console.log(`Updated static chart links on data/index.html (${items.length} charts).`);
}

main();

// --watch mode: monitor source directory and regenerate on changes
if (process.argv.includes('--watch')) {
    console.log(`\nWatching ${DATA_SOURCE} for changes...\n`);
    let debounce = null;
    fs.watch(DATA_SOURCE, { recursive: false }, (event, filename) => {
        if (!filename || !filename.endsWith('.md')) return;
        clearTimeout(debounce);
        debounce = setTimeout(() => {
            console.log(`[${new Date().toLocaleTimeString()}] Change detected: ${filename}`);
            main();
        }, 300);
    });
}
