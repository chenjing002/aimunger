const fs = require('fs');
const path = require('path');

const IR_LOG_WIKI = path.join(__dirname, '..', 'IR-log', 'wiki');
const WIKI_SOURCE = path.join(__dirname, 'wiki-source');
const SITE_DIR = path.join(__dirname, '_site');
const WIKI_DIR = path.join(SITE_DIR, 'wiki');

const SLUG_MAP = {
  '万科': 'vanke',
  '华生': 'huasheng',
  '张旭': 'zhangxu',
  '李录': 'lilu',
  '栗淼': 'limiao',
  '王石': 'wangshi',
  '芒格': 'charlie-munger',
  '辛杰': 'xinjie',
  '郁亮': 'yuliang',
  '郭钧': 'guojun',
  '丁祖昱': 'dingzuyu',
  '万物云': 'onewo',
  '何享健': 'hexiangjian',
  '傅育宁': 'fuyuning',
  '刘元生': 'liuyuansheng',
  '单伟建': 'shanweijian',
  '吴亚军': 'wuyajun',
  '周小川': 'zhouxiaochuan',
  '孔庆平': 'kongqingping',
  '孙文杰': 'sunwenjie',
  '巴菲特': 'warren-buffett',
  '新鸿基': 'shkp',
  '方洪波': 'fanghongbo',
  '普洛斯': 'glp',
  '朱保全': 'zhubaoquan',
  '李如成': 'lirucheng',
  '梅志明': 'meizhiming',
  '楼继伟': 'loujiwei',
  '比亚迪': 'byd',
  '毛大庆': 'maodaqing',
  '潘樟良': 'panzhangliang',
  '缪建民': 'miaojianmin',
  '蔡曼莉': 'caimanli',
  '赵燕菁': 'zhaoyanjing',
  '郝建民': 'haojianmin',
  '陈启宗': 'ronnie-chan',
  '陈序平': 'chenxuping',
  '陈曾熙': 'chan-tseng-hsi',
  '雅戈尔': 'youngor',
  '颜建国': 'yanjianguo',
  '马明哲': 'mamingzhe',
  '高西庆': 'gaoxiqing',
  '黄奇帆': 'huangqifan',
  '深基地B': 'shenzhen-chiwan-base',
  '中国平安': 'ping-an',
  '中国建筑': 'cscec',
  '中投公司': 'cic',
  '中海发展': 'china-overseas-land',
  '中金公司': 'cicc',
  '华润置地': 'cr-land',
  '南山控股': 'nanshan-holdings',
  '恒隆地产': 'hang-lung',
  '招商蛇口': 'cmsk',
  '深圳地铁': 'shenzhen-metro',
  '绿景地产': 'lvgem',
  '美的集团': 'midea',
  '越秀地产': 'yuexiu-property',
  '长江电力': 'yangtze-power',
  '龙湖集团': 'longfor',
  '招商局集团': 'cmg',
};

function getSlug(title) {
  return SLUG_MAP[title] || encodeURIComponent(title);
}

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };
  const meta = {};
  match[1].split('\n').forEach(line => {
    const m = line.match(/^(\w+):\s*"?(.+?)"?\s*$/);
    if (m) meta[m[1]] = m[2];
  });
  return { meta, body: match[2] };
}

function removeAtomicNotesSection(body) {
  return body.replace(/## 相关原子笔记[\s\S]*?(?=\n## |\n*$)/, '').trim();
}

function extractLinks(body) {
  const links = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    links.push(m[1]);
  }
  return [...new Set(links)];
}

function markdownToHtml(text, wikiNames) {
  let html = text.replace(/\[\[([^\]]+)\]\]/g, (_, name) => {
    if (wikiNames.has(name)) {
      return `<a href="/wiki/${getSlug(name)}/" class="wiki-link">${escHtml(name)}</a>`;
    }
    return `<span class="wiki-link-broken">${escHtml(name)}</span>`;
  });

  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, (match) => {
    if (!match.startsWith('<ul>')) return '<ul>' + match + '</ul>';
    return match;
  });
  html = html.replace(/<\/ul>\s*<ul>/g, '');

  html = html.split('\n\n').map(block => {
    block = block.trim();
    if (!block) return '';
    if (block.startsWith('<h') || block.startsWith('<ul') || block.startsWith('<blockquote')) return block;
    if (!block.startsWith('<')) return '<p>' + block + '</p>';
    return block;
  }).join('\n');

  return html;
}

function stripMarkdown(text) {
  return text
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/#{1,6}\s*/g, '')
    .replace(/^- /gm, '')
    .replace(/\n+/g, ' ')
    .trim();
}

function classifyNode(title) {
  const companies = [
    '万科', '万物云', '新鸿基', '普洛斯', '比亚迪', '深基地B', '美的集团',
    '绿景地产', '雅戈尔', '长江电力', '龙湖集团', '中国平安', '中国建筑',
    '华润置地', '南山控股', '恒隆地产', '招商蛇口', '越秀地产', '中海发展',
    '招商局集团'
  ];
  const institutions = ['中投公司', '中金公司', '深圳地铁'];
  if (companies.includes(title)) return 'company';
  if (institutions.includes(title)) return 'institution';
  return 'person';
}

const TYPE_LABELS = { person: '人物', company: '公司', institution: '机构' };

const NAV_HTML = `    <header class="header">
        <nav class="nav container">
            <a href="/" class="logo">
                <span class="logo-icon">M</span>
                <span class="logo-text">aimunger</span>
            </a>
            <ul class="nav-links">
                <li><a href="/resources/">资料库</a></li>
                <li><a href="/wiki/" class="active">Wiki</a></li>
                <li><a href="/qa/">问答</a></li>
                <li><a href="/about/">关于</a></li>
            </ul>
        </nav>
    </header>`;

const FOOTER_HTML = `    <footer class="footer">
        <div class="container">
            <div class="footer-links">
                <a href="https://aimunger.com/letters/">letters-to-shareholders</a>
                <a href="https://aimunger.com/llm-reader/">llm-reader</a>
                <a href="https://aimunger.com/llm.txt">llm.txt</a>
                <a href="https://aimunger.com/sitemap.xml">sitemap</a>
                <a href="https://aimunger.com/rss.xml">rss</a>
            </div>
            <p>&copy; 2026 aimunger</p>
        </div>
    </footer>`;

function generateArticlePage(title, htmlContent) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escHtml(title)} - Wiki - aimunger</title>
    <meta name="description" content="${escHtml(title)} - aimunger Wiki">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/style.css">
    <link rel="stylesheet" href="/wiki/wiki.css">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
</head>
<body>
${NAV_HTML}

    <main class="main">
        <div class="container">
            <article class="article">
                <div class="article-header">
                    <a href="/wiki/" class="article-back">&larr; Wiki</a>
                    <h1 class="article-title">${escHtml(title)}</h1>
                </div>
                <div class="article-body wiki-body">
                    ${htmlContent}
                </div>
            </article>
        </div>
    </main>

${FOOTER_HTML}
</body>
</html>`;
}

function syncFromIRLog() {
  if (!fs.existsSync(IR_LOG_WIKI)) return;
  fs.mkdirSync(WIKI_SOURCE, { recursive: true });
  const srcFiles = fs.readdirSync(IR_LOG_WIKI).filter(f => f.endsWith('.md'));
  const destFiles = fs.readdirSync(WIKI_SOURCE).filter(f => f.endsWith('.md'));
  // Remove files in wiki-source that no longer exist in IR-log
  for (const f of destFiles) {
    if (!srcFiles.includes(f)) {
      fs.unlinkSync(path.join(WIKI_SOURCE, f));
      console.log(`Removed: ${f}`);
    }
  }
  // Copy new or updated files
  let synced = 0;
  for (const f of srcFiles) {
    const src = path.join(IR_LOG_WIKI, f);
    const dest = path.join(WIKI_SOURCE, f);
    const srcContent = fs.readFileSync(src, 'utf-8');
    const destContent = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf-8') : null;
    if (srcContent !== destContent) {
      fs.writeFileSync(dest, srcContent);
      synced++;
    }
  }
  if (synced > 0) console.log(`Synced ${synced} wiki files from IR-log`);
}

function run() {
  syncFromIRLog();

  if (!fs.existsSync(WIKI_SOURCE)) {
    console.log('wiki-source directory not found, skipping wiki generation');
    return;
  }

  const files = fs.readdirSync(WIKI_SOURCE).filter(f => f.endsWith('.md'));
  if (!files.length) {
    console.log('No wiki files found');
    return;
  }

  const wikiNames = new Set(files.map(f => f.replace('.md', '')));
  const entries = [];

  for (const file of files) {
    const raw = fs.readFileSync(path.join(WIKI_SOURCE, file), 'utf-8');
    const { meta, body } = parseFrontmatter(raw);
    const title = file.replace('.md', '');
    const cleaned = removeAtomicNotesSection(body);
    const links = extractLinks(cleaned).filter(name => wikiNames.has(name));
    const htmlContent = markdownToHtml(cleaned, wikiNames);
    const plainText = stripMarkdown(cleaned);

    entries.push({ title, meta, links, htmlContent, plainText });
  }

  // Build graph data with types and descriptions
  const nodes = entries.map(e => ({
    id: e.title,
    slug: getSlug(e.title),
    type: classifyNode(e.title),
    desc: e.plainText.slice(0, 200)
  }));

  const edgeMap = {};
  for (const e of entries) {
    for (const link of e.links) {
      const key = [e.title, link].sort().join('|||');
      if (!edgeMap[key]) {
        edgeMap[key] = { source: e.title, target: link, refs: [] };
      }
      if (!edgeMap[key].refs.includes(e.title)) {
        edgeMap[key].refs.push(e.title);
      }
    }
  }
  const edges = Object.values(edgeMap);

  const searchData = entries.map(e => ({
    title: e.title,
    text: e.plainText.slice(0, 500),
  }));

  // Write output — clean old page directories first
  fs.mkdirSync(WIKI_DIR, { recursive: true });
  const keepFiles = new Set(['data.json', 'index.html', 'wiki.css']);
  const slugSet = new Set(entries.map(e => getSlug(e.title)));
  for (const name of fs.readdirSync(WIKI_DIR)) {
    if (keepFiles.has(name)) continue;
    const full = path.join(WIKI_DIR, name);
    if (fs.statSync(full).isDirectory() && !slugSet.has(name)) {
      fs.rmSync(full, { recursive: true });
    }
  }

  for (const e of entries) {
    const slug = getSlug(e.title);
    const dir = path.join(WIKI_DIR, slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), generateArticlePage(e.title, e.htmlContent));
  }

  const wikiData = { nodes, edges, search: searchData };
  fs.writeFileSync(path.join(WIKI_DIR, 'data.json'), JSON.stringify(wikiData));
  fs.writeFileSync(path.join(WIKI_DIR, 'index.html'), generateIndexPage(entries));
  fs.writeFileSync(path.join(WIKI_DIR, 'wiki.css'), generateWikiCSS());

  console.log(`Generated ${entries.length} wiki pages`);
}

function generateIndexPage(entries) {
  const sorted = [...entries].sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
  const cards = sorted.map(e => {
    const excerpt = e.plainText.slice(0, 100);
    const linkCount = e.links.length;
    const nodeType = classifyNode(e.title);
    const typeLabel = TYPE_LABELS[nodeType];
    return `                    <a href="/wiki/${getSlug(e.title)}/" class="wiki-card" data-title="${escHtml(e.title)}">
                        <div class="wiki-card-head">
                            <h3 class="wiki-card-title">${escHtml(e.title)}</h3>
                            <span class="wiki-card-type type-${nodeType}">${typeLabel}</span>
                        </div>
                        <p class="wiki-card-excerpt">${escHtml(excerpt)}</p>
                        ${linkCount > 0 ? `<span class="wiki-card-links">${linkCount} 个关联</span>` : ''}
                    </a>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Wiki - aimunger</title>
    <meta name="description" content="aimunger 投资研究 Wiki - 人物、公司与投资概念知识图谱">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/style.css">
    <link rel="stylesheet" href="/wiki/wiki.css">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
</head>
<body>
${NAV_HTML}

    <main class="main">
        <div class="container">
            <section class="hero">
                <h1 class="hero-title">Wiki</h1>
                <p class="hero-desc">投资研究知识图谱 — 人物、公司与关键概念。</p>
            </section>

            <section class="wiki-controls">
                <div class="wiki-search-wrap">
                    <input type="text" id="wiki-search" class="wiki-search" placeholder="搜索 Wiki...">
                </div>
                <div class="wiki-view-toggle">
                    <button class="wiki-view-btn active" data-view="list">列表</button>
                    <button class="wiki-view-btn" data-view="graph">图谱</button>
                </div>
            </section>

            <section class="wiki-list" id="wiki-list">
                <div class="wiki-grid">
${cards}
                </div>
            </section>

            <section class="wiki-graph-section" id="wiki-graph-section" style="display:none">
                <div class="graph-layout">
                    <div class="graph-main" id="graph-main">
                        <canvas id="wiki-graph"></canvas>
                        <div class="graph-tooltip" id="graph-tooltip"></div>
                        <div class="graph-zoom-controls">
                            <button class="graph-zoom-btn" id="graph-zoom-in" title="放大">+</button>
                            <button class="graph-zoom-btn" id="graph-zoom-out" title="缩小">&minus;</button>
                            <button class="graph-zoom-btn graph-zoom-reset" id="graph-zoom-reset" title="重置">&#8634;</button>
                        </div>
                    </div>
                    <aside class="graph-detail" id="graph-detail">
                        <button class="graph-detail-close" id="graph-detail-close">&times;</button>
                        <div id="graph-detail-body"></div>
                    </aside>
                </div>
            </section>
        </div>
    </main>

${FOOTER_HTML}

    <script>
${generateGraphScript()}
    </script>
</body>
</html>`;
}

function generateGraphScript() {
  return `(function() {
  'use strict';

  var COLORS = {
    nodePerson: '#107792',
    nodeCompany: '#DE7356',
    nodeInstitution: '#7B6B5D',
    nodeSelected: '#DE7356',
    nodeConnected: '#E8956F',
    nodeFaded: '#C9C6C1',
    edge: '#D8D2CA',
    edgeHighlight: '#DE7356',
    labelDefault: '#1a1a1a',
    labelFaded: '#B0ADA8',
    labelBg: 'rgba(255,255,255,0.85)'
  };

  var TYPE_COLORS = {
    person: COLORS.nodePerson,
    company: COLORS.nodeCompany,
    institution: COLORS.nodeInstitution
  };

  var TYPE_LABELS = { person: '人物', company: '公司', institution: '机构' };

  var searchInput = document.getElementById('wiki-search');
  var listSection = document.getElementById('wiki-list');
  var graphSection = document.getElementById('wiki-graph-section');
  var listCards = document.querySelectorAll('.wiki-card');
  var viewBtns = document.querySelectorAll('.wiki-view-btn');
  var canvas = document.getElementById('wiki-graph');
  var graphMain = document.getElementById('graph-main');
  var tooltip = document.getElementById('graph-tooltip');
  var detailPanel = document.getElementById('graph-detail');
  var detailBody = document.getElementById('graph-detail-body');
  var detailClose = document.getElementById('graph-detail-close');

  var currentView = 'list';
  var graphInited = false;
  var nodes = [], nodeMap = {}, edges = [], degree = {};
  var selectedNode = null;
  var hoveredNode = null;
  var dragging = null;
  var dragMoved = false;
  var offsetX = 0, offsetY = 0;
  var searchMatches = new Set();
  var neighborSet = new Set();
  var neighborEdgeSet = new Set();
  var W = 0, H = 0, dpr = 1;
  var ctx = null;
  var animating = false;
  var isMobile = window.innerWidth < 768;
  var zoom = 1, panX = 0, panY = 0;

  viewBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var view = this.getAttribute('data-view');
      currentView = view;
      viewBtns.forEach(function(b) { b.classList.remove('active'); });
      this.classList.add('active');
      if (view === 'list') {
        listSection.style.display = '';
        graphSection.style.display = 'none';
        applyListSearch(searchInput.value);
      } else {
        listSection.style.display = 'none';
        graphSection.style.display = '';
        if (!graphInited) initGraph();
        else applyGraphSearch(searchInput.value);
      }
    });
  });

  searchInput.addEventListener('input', function() {
    var q = this.value.trim();
    if (currentView === 'list') applyListSearch(q);
    else applyGraphSearch(q);
  });

  searchInput.addEventListener('keydown', function(ev) {
    if (ev.key === 'Enter' && currentView === 'graph' && searchMatches.size > 0) {
      var firstMatch = null;
      for (var i = 0; i < nodes.length; i++) {
        if (searchMatches.has(nodes[i].id)) { firstMatch = nodes[i]; break; }
      }
      if (firstMatch) focusOnNode(firstMatch);
    }
  });

  function applyListSearch(q) {
    q = q.toLowerCase();
    listCards.forEach(function(card) {
      var title = card.getAttribute('data-title').toLowerCase();
      var excerpt = card.querySelector('.wiki-card-excerpt').textContent.toLowerCase();
      card.style.display = (title.includes(q) || excerpt.includes(q)) ? '' : 'none';
    });
  }

  function applyGraphSearch(q) {
    searchMatches = new Set();
    if (!q) { wake(); return; }
    q = q.toLowerCase();
    nodes.forEach(function(n) {
      if (n.id.toLowerCase().includes(q)) searchMatches.add(n.id);
    });
    if (searchMatches.size === 1) {
      var match = nodes.find(function(n) { return searchMatches.has(n.id); });
      if (match) focusOnNode(match);
    } else {
      wake();
    }
  }

  function initGraph() {
    graphInited = true;
    fetch('/wiki/data.json')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        setupGraph(data);
        applyGraphSearch(searchInput.value);
      });
  }

  function setupGraph(data) {
    dpr = window.devicePixelRatio || 1;
    ctx = canvas.getContext('2d');

    nodes = data.nodes.map(function(n, i) {
      var angle = (2 * Math.PI * i) / data.nodes.length;
      var spread = Math.min(400, data.nodes.length * 6);
      return {
        id: n.id,
        slug: n.slug || n.id,
        type: n.type || 'person',
        desc: n.desc || '',
        x: 0, y: 0,
        vx: 0, vy: 0,
        tx: Math.cos(angle) * spread + (Math.random() - 0.5) * 30,
        ty: Math.sin(angle) * spread + (Math.random() - 0.5) * 30
      };
    });

    nodeMap = {};
    nodes.forEach(function(n) { nodeMap[n.id] = n; });

    edges = data.edges.filter(function(e) {
      return nodeMap[e.source] && nodeMap[e.target];
    }).map(function(e) {
      return { source: e.source, target: e.target, refs: e.refs || [] };
    });

    degree = {};
    nodes.forEach(function(n) { degree[n.id] = 0; });
    edges.forEach(function(e) {
      degree[e.source] = (degree[e.source] || 0) + 1;
      degree[e.target] = (degree[e.target] || 0) + 1;
    });

    resizeCanvas();
    nodes.forEach(function(n) {
      n.x = W / 2 + n.tx;
      n.y = H / 2 + n.ty;
    });

    attachCanvasEvents();
    detailClose.addEventListener('click', function() { resetView(); });
    startAnimation();

    window.addEventListener('resize', function() {
      isMobile = window.innerWidth < 768;
      resizeCanvas();
      wake();
    });

    document.getElementById('graph-zoom-in').addEventListener('click', function() {
      zoomAt(W / 2, H / 2, 1.3);
    });
    document.getElementById('graph-zoom-out').addEventListener('click', function() {
      zoomAt(W / 2, H / 2, 1 / 1.3);
    });
    document.getElementById('graph-zoom-reset').addEventListener('click', function() {
      zoom = 1; panX = 0; panY = 0; wake();
    });

    canvas.addEventListener('wheel', function(ev) {
      ev.preventDefault();
      var pos = getCanvasPos(ev);
      var factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1;
      zoomAt(pos.sx, pos.sy, factor);
    }, { passive: false });
  }

  function resizeCanvas() {
    var rect = graphMain.getBoundingClientRect();
    W = rect.width;
    H = isMobile ? Math.max(350, W * 0.6) : Math.max(550, Math.min(W * 0.7, 680));
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  function zoomAt(cx, cy, factor) {
    var newZoom = Math.max(0.3, Math.min(5, zoom * factor));
    var scale = newZoom / zoom;
    panX = cx - scale * (cx - panX);
    panY = cy - scale * (cy - panY);
    zoom = newZoom;
    wake();
  }

  function toScreenX(x) { return x * zoom + panX; }
  function toScreenY(y) { return y * zoom + panY; }
  function toWorldX(sx) { return (sx - panX) / zoom; }
  function toWorldY(sy) { return (sy - panY) / zoom; }

  function startAnimation() {
    if (animating) return;
    animating = true;
    tick();
  }

  var stableFrames = 0;

  function tick() {
    if (!animating) return;
    simulate();
    draw();

    var totalV = 0;
    nodes.forEach(function(n) { totalV += Math.abs(n.vx) + Math.abs(n.vy); });
    if (totalV < 0.5 && !dragging) {
      stableFrames++;
      if (stableFrames > 60) { animating = false; return; }
    } else {
      stableFrames = 0;
    }
    requestAnimationFrame(tick);
  }

  function wake() {
    stableFrames = 0;
    startAnimation();
  }

  function simulate() {
    var i, j, a, b, dx, dy, d, force, fx, fy;

    // Repulsion
    for (i = 0; i < nodes.length; i++) {
      for (j = i + 1; j < nodes.length; j++) {
        a = nodes[i]; b = nodes[j];
        dx = b.x - a.x; dy = b.y - a.y;
        d = Math.max(Math.hypot(dx, dy), 1);
        force = 1200 / (d * d);
        fx = (dx / d) * force; fy = (dy / d) * force;
        if (a !== dragging) { a.vx -= fx; a.vy -= fy; }
        if (b !== dragging) { b.vx += fx; b.vy += fy; }
      }
    }

    // Attraction along edges
    for (i = 0; i < edges.length; i++) {
      a = nodeMap[edges[i].source]; b = nodeMap[edges[i].target];
      if (!a || !b) continue;
      dx = b.x - a.x; dy = b.y - a.y;
      d = Math.max(Math.hypot(dx, dy), 1);
      force = (d - 100) * 0.008;
      fx = (dx / d) * force; fy = (dy / d) * force;
      if (a !== dragging) { a.vx += fx; a.vy += fy; }
      if (b !== dragging) { b.vx -= fx; b.vy -= fy; }
    }

    // Center gravity + damping
    for (i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n === dragging) continue;
      n.vx += (W / 2 - n.x) * 0.002;
      n.vy += (H / 2 - n.y) * 0.002;
      n.vx *= 0.82;
      n.vy *= 0.82;
      n.x += n.vx;
      n.y += n.vy;
      n.x = Math.max(30, Math.min(W - 30, n.x));
      n.y = Math.max(30, Math.min(H - 30, n.y));
    }
  }

  function getNeighborIds(nodeId) {
    var visited = new Set([nodeId]);
    edges.forEach(function(e) {
      if (e.source === nodeId) visited.add(e.target);
      if (e.target === nodeId) visited.add(e.source);
    });
    return visited;
  }

  function getConnectedEdges(nodeIds) {
    var s = new Set();
    edges.forEach(function(e, i) {
      if (nodeIds.has(e.source) && nodeIds.has(e.target)) s.add(i);
    });
    return s;
  }

  function focusOnNode(node) {
    selectedNode = node;
    neighborSet = getNeighborIds(node.id);
    neighborEdgeSet = getConnectedEdges(neighborSet);
    showDetailPanel(node);
    wake();
  }

  function resetView() {
    selectedNode = null;
    neighborSet = new Set();
    neighborEdgeSet = new Set();
    hideDetailPanel();
    wake();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    // Draw edges
    for (var i = 0; i < edges.length; i++) {
      var e = edges[i];
      var a = nodeMap[e.source], b = nodeMap[e.target];
      if (!a || !b) continue;

      var isHighEdge = hoveredNode && (a === hoveredNode || b === hoveredNode);
      var isFocusEdge = selectedNode && neighborEdgeSet.has(i);
      var isFaded = selectedNode && !isFocusEdge;

      if (isFaded) {
        ctx.strokeStyle = 'rgba(216,210,202,0.15)';
        ctx.lineWidth = 0.5 / zoom;
      } else if (isHighEdge || isFocusEdge) {
        ctx.strokeStyle = COLORS.edgeHighlight;
        ctx.lineWidth = (isHighEdge ? 2 : 1.5) / zoom;
      } else {
        ctx.strokeStyle = COLORS.edge;
        ctx.lineWidth = 1 / zoom;
      }
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // Draw nodes
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var r = getRadius(n) / zoom;
      var isSelected = n === selectedNode;
      var isHovered = n === hoveredNode;
      var isNeighbor = selectedNode && neighborSet.has(n.id) && !isSelected;
      var isSearchMatch = searchMatches.size > 0 && searchMatches.has(n.id);
      var isFaded = (selectedNode && !neighborSet.has(n.id)) ||
                    (searchMatches.size > 0 && !searchMatches.has(n.id));
      var isHoverNeighbor = !selectedNode && hoveredNode && hoveredNode !== n &&
        edges.some(function(e) {
          return (nodeMap[e.source] === hoveredNode && nodeMap[e.target] === n) ||
                 (nodeMap[e.target] === hoveredNode && nodeMap[e.source] === n);
        });
      var isHoverFaded = !selectedNode && hoveredNode && !isHovered && !isHoverNeighbor;

      var fillColor;
      if (isSelected || isHovered) {
        fillColor = COLORS.nodeSelected;
      } else if (isNeighbor || isHoverNeighbor) {
        fillColor = COLORS.nodeConnected;
      } else if (isFaded || isHoverFaded) {
        fillColor = COLORS.nodeFaded;
      } else if (isSearchMatch) {
        fillColor = COLORS.nodeSelected;
      } else {
        fillColor = TYPE_COLORS[n.type] || COLORS.nodePerson;
      }

      if (isSelected || isSearchMatch) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 6 / zoom, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(222,115,86,0.12)';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = fillColor;
      ctx.fill();
    }

    // Draw labels
    drawLabels();
    ctx.restore();
  }

  function drawLabels() {
    var fontSize = 12 / zoom;
    var boldFontSize = 13 / zoom;
    ctx.font = fontSize + 'px "Noto Serif SC", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var r = getRadius(n) / zoom;
      var isSelected = n === selectedNode;
      var isHovered = n === hoveredNode;
      var isNeighbor = selectedNode && neighborSet.has(n.id);
      var isSearchMatch = searchMatches.size > 0 && searchMatches.has(n.id);
      var isHoverNeighbor = !selectedNode && hoveredNode && hoveredNode !== n &&
        edges.some(function(e) {
          return (nodeMap[e.source] === hoveredNode && nodeMap[e.target] === n) ||
                 (nodeMap[e.target] === hoveredNode && nodeMap[e.source] === n);
        });

      var showLabel = false;
      if (selectedNode) {
        showLabel = isSelected || isNeighbor;
      } else if (hoveredNode) {
        showLabel = isHovered || isHoverNeighbor;
      } else if (searchMatches.size > 0) {
        showLabel = isSearchMatch;
      } else {
        showLabel = (degree[n.id] || 0) >= 3 || nodes.length <= 20;
      }

      if (!showLabel) continue;

      var isFaded = (selectedNode && !isNeighbor) ||
                    (searchMatches.size > 0 && !isSearchMatch) ||
                    (!selectedNode && hoveredNode && !isHovered && !isHoverNeighbor);

      var labelY = n.y + r + 4 / zoom;
      var text = n.id;
      var textW = ctx.measureText(text).width;
      var labelH = 16 / zoom;

      ctx.fillStyle = COLORS.labelBg;
      ctx.fillRect(n.x - textW / 2 - 3 / zoom, labelY - 1 / zoom, textW + 6 / zoom, labelH);

      ctx.fillStyle = isFaded ? COLORS.labelFaded : COLORS.labelDefault;
      if (isSelected || isHovered) ctx.font = 'bold ' + boldFontSize + 'px "Noto Serif SC", serif';
      ctx.fillText(text, n.x, labelY);
      if (isSelected || isHovered) ctx.font = fontSize + 'px "Noto Serif SC", serif';
    }
  }

  function getRadius(n) {
    var d = degree[n.id] || 0;
    var base = 4 + Math.min(d * 1.8, 14);
    if (n === selectedNode) base += 3;
    if (n === hoveredNode && n !== selectedNode) base += 2;
    return base;
  }

  function attachCanvasEvents() {
    canvas.addEventListener('mousedown', function(ev) {
      var pos = getCanvasPos(ev);
      var node = findNodeAt(pos.x, pos.y);
      if (node) {
        dragging = node;
        dragMoved = false;
        offsetX = node.x - pos.x;
        offsetY = node.y - pos.y;
        ev.preventDefault();
      }
    });

    canvas.addEventListener('mousemove', function(ev) {
      var pos = getCanvasPos(ev);
      if (dragging) {
        dragging.x = pos.x + offsetX;
        dragging.y = pos.y + offsetY;
        dragging.vx = 0;
        dragging.vy = 0;
        dragMoved = true;
        wake();
        return;
      }

      var prevHovered = hoveredNode;
      hoveredNode = findNodeAt(pos.x, pos.y);

      if (hoveredNode) {
        tooltip.style.display = 'none';
      }

      canvas.style.cursor = hoveredNode ? 'pointer' : 'default';
      if (prevHovered !== hoveredNode) wake();
    });

    canvas.addEventListener('mouseup', function() {
      if (dragging && !dragMoved) {
        focusOnNode(dragging);
      }
      dragging = null;
    });

    canvas.addEventListener('mouseleave', function() {
      if (dragging) dragging = null;
      hoveredNode = null;
      tooltip.style.display = 'none';
      canvas.style.cursor = 'default';
      wake();
    });

    canvas.addEventListener('dblclick', function(ev) {
      var pos = getCanvasPos(ev);
      var node = findNodeAt(pos.x, pos.y);
      if (node) {
        window.location.href = '/wiki/' + node.slug + '/';
      }
    });

    canvas.addEventListener('click', function(ev) {
      if (dragMoved) { dragMoved = false; return; }
      var pos = getCanvasPos(ev);
      var node = findNodeAt(pos.x, pos.y);
      if (!node && selectedNode) {
        resetView();
      }
    });

    // Touch support
    canvas.addEventListener('touchstart', function(ev) {
      var touch = ev.touches[0];
      var pos = getTouchPos(touch);
      var node = findNodeAt(pos.x, pos.y);
      if (node) {
        dragging = node;
        dragMoved = false;
        offsetX = node.x - pos.x;
        offsetY = node.y - pos.y;
        ev.preventDefault();
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', function(ev) {
      if (dragging) {
        var touch = ev.touches[0];
        var pos = getTouchPos(touch);
        dragging.x = pos.x + offsetX;
        dragging.y = pos.y + offsetY;
        dragging.vx = 0;
        dragging.vy = 0;
        dragMoved = true;
        wake();
        ev.preventDefault();
      }
    }, { passive: false });

    canvas.addEventListener('touchend', function() {
      if (dragging && !dragMoved) {
        focusOnNode(dragging);
      }
      dragging = null;
    });
  }

  function getCanvasPos(ev) {
    var rect = canvas.getBoundingClientRect();
    var sx = ev.clientX - rect.left, sy = ev.clientY - rect.top;
    return { x: toWorldX(sx), y: toWorldY(sy), sx: sx, sy: sy };
  }

  function getTouchPos(touch) {
    var rect = canvas.getBoundingClientRect();
    var sx = touch.clientX - rect.left, sy = touch.clientY - rect.top;
    return { x: toWorldX(sx), y: toWorldY(sy), sx: sx, sy: sy };
  }

  function findNodeAt(mx, my) {
    var closest = null, closestDist = Infinity;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var dist = Math.hypot(n.x - mx, n.y - my);
      var hitR = (getRadius(n) + 4) / zoom;
      if (dist < hitR && dist < closestDist) {
        closest = n;
        closestDist = dist;
      }
    }
    return closest;
  }

  function showDetailPanel(node) {
    var neighbors = [];
    edges.forEach(function(e) {
      if (e.source === node.id && nodeMap[e.target]) neighbors.push(nodeMap[e.target]);
      if (e.target === node.id && nodeMap[e.source]) neighbors.push(nodeMap[e.source]);
    });
    neighbors.sort(function(a, b) { return (degree[b.id] || 0) - (degree[a.id] || 0); });

    var typeLabel = TYPE_LABELS[node.type] || '';
    var html = '<div class="detail-header">' +
      '<span class="detail-type-badge type-' + node.type + '">' + escH(typeLabel) + '</span>' +
      '<h3 class="detail-name">' + escH(node.id) + '</h3>' +
      '</div>';

    if (node.desc) {
      html += '<p class="detail-desc">' + escH(node.desc) + '</p>';
    }

    if (neighbors.length > 0) {
      html += '<div class="detail-section"><h4>关联节点 (' + neighbors.length + ')</h4><div class="detail-neighbors">';
      neighbors.forEach(function(nb) {
        var nbType = TYPE_LABELS[nb.type] || '';
        html += '<a class="detail-neighbor-item" data-node="' + escH(nb.id) + '" href="javascript:void(0)">' +
          '<span class="detail-nb-dot type-' + nb.type + '"></span>' +
          '<span class="detail-nb-name">' + escH(nb.id) + '</span>' +
          '<span class="detail-nb-type">' + escH(nbType) + '</span>' +
          '</a>';
      });
      html += '</div></div>';
    }

    html += '<a href="/wiki/' + node.slug + '/" class="detail-visit-btn">查看完整页面 &rarr;</a>';

    detailBody.innerHTML = html;
    detailPanel.classList.add('visible');

    var nbItems = detailBody.querySelectorAll('.detail-neighbor-item');
    nbItems.forEach(function(item) {
      item.addEventListener('click', function(ev) {
        ev.preventDefault();
        var nid = this.getAttribute('data-node');
        if (nodeMap[nid]) focusOnNode(nodeMap[nid]);
      });
    });
  }

  function hideDetailPanel() {
    detailPanel.classList.remove('visible');
  }

  function escH(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

})();`;
}

function generateWikiCSS() {
  return `/* Wiki styles */
.wiki-controls {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 32px;
}

.wiki-search-wrap {
    flex: 1;
}

.wiki-search {
    width: 100%;
    padding: 10px 16px;
    font-family: var(--font-serif);
    font-size: 15px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-card-bg);
    color: var(--color-text);
    outline: none;
    transition: border-color 0.2s ease;
}

.wiki-search:focus {
    border-color: var(--color-accent);
}

.wiki-view-toggle {
    display: flex;
    gap: 4px;
    background: var(--color-surface);
    border-radius: 8px;
    padding: 3px;
}

.wiki-view-btn {
    padding: 6px 14px;
    font-family: var(--font-serif);
    font-size: 13px;
    font-weight: 500;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
}

.wiki-view-btn.active {
    background: var(--color-card-bg);
    color: var(--color-text);
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}

/* Wiki grid & cards */
.wiki-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
    padding-bottom: 72px;
}

.wiki-card {
    text-decoration: none;
    color: inherit;
    background: var(--color-card-bg);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    padding: 20px;
    transition: border-color 0.3s ease, box-shadow 0.3s ease, transform 0.3s ease;
}

.wiki-card:hover {
    border-color: var(--color-accent);
    box-shadow: 0 4px 16px rgba(139,37,0,0.06);
    transform: translateY(-1px);
}

.wiki-card-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
}

.wiki-card-title {
    font-family: var(--font-serif);
    font-size: 17px;
    font-weight: 700;
}

.wiki-card-type {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 500;
    white-space: nowrap;
}

.wiki-card-type.type-person {
    background: #e6f2f5;
    color: #107792;
}

.wiki-card-type.type-company {
    background: #fceee8;
    color: #DE7356;
}

.wiki-card-type.type-institution {
    background: #eeecea;
    color: #7B6B5D;
}

.wiki-card-excerpt {
    font-size: 13px;
    color: var(--color-text-secondary);
    line-height: 1.6;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.wiki-card-links {
    display: inline-block;
    margin-top: 8px;
    font-size: 11px;
    color: var(--color-accent);
    font-weight: 500;
}

/* === Graph Section === */
.wiki-graph-section {
    padding-bottom: 72px;
}

/* Graph layout: main with overlay detail */
.graph-layout {
    position: relative;
}

.graph-main {
    width: 100%;
    position: relative;
    border: 1px solid #E8E1D8;
    border-radius: 12px;
    overflow: hidden;
    background: #ffffff;
}

#wiki-graph {
    display: block;
    width: 100%;
}

.graph-zoom-controls {
    position: absolute;
    bottom: 12px;
    left: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    z-index: 10;
}

.graph-zoom-btn {
    width: 32px;
    height: 32px;
    border: 1px solid #E8E1D8;
    border-radius: 8px;
    background: #fff;
    color: #333;
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    padding: 0;
    line-height: 1;
}

.graph-zoom-btn:hover {
    background: #f5f5f5;
    border-color: #ccc;
}

.graph-zoom-reset {
    font-size: 14px;
}

.graph-tooltip {
    position: absolute;
    display: none;
    font-size: 12px;
    color: var(--color-text);
    background: #fff;
    border: 1px solid #E8E1D8;
    border-radius: 6px;
    padding: 5px 10px;
    pointer-events: none;
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    z-index: 10;
    white-space: nowrap;
    max-width: 240px;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* Detail panel - overlays graph */
.graph-detail {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 300px;
    background: var(--color-card-bg);
    border: 1px solid #E8E1D8;
    border-radius: 12px;
    overflow-y: auto;
    max-height: calc(100% - 24px);
    padding: 20px;
    opacity: 0;
    pointer-events: none;
    transform: translateX(10px);
    transition: opacity 0.25s ease, transform 0.25s ease;
    z-index: 10;
    box-shadow: 0 4px 20px rgba(0,0,0,0.08);
}

.graph-detail.visible {
    opacity: 1;
    pointer-events: auto;
    transform: translateX(0);
}

.graph-detail-close {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 28px;
    height: 28px;
    border: none;
    background: var(--color-surface);
    border-radius: 50%;
    cursor: pointer;
    font-size: 16px;
    color: var(--color-text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    z-index: 2;
}

.graph-detail-close:hover {
    background: var(--color-border);
    color: var(--color-text);
}

/* Detail panel content */
.detail-header {
    margin-bottom: 16px;
    padding-right: 32px;
}

.detail-type-badge {
    display: inline-block;
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 500;
    margin-bottom: 8px;
}

.detail-type-badge.type-person {
    background: #e6f2f5;
    color: #107792;
}

.detail-type-badge.type-company {
    background: #fceee8;
    color: #DE7356;
}

.detail-type-badge.type-institution {
    background: #eeecea;
    color: #7B6B5D;
}

.detail-name {
    font-family: var(--font-serif);
    font-size: 20px;
    font-weight: 700;
    line-height: 1.3;
}

.detail-desc {
    font-size: 13px;
    color: var(--color-text-secondary);
    line-height: 1.7;
    margin-bottom: 16px;
}

.detail-section {
    margin-bottom: 16px;
}

.detail-section h4 {
    font-family: var(--font-serif);
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-secondary);
    margin-bottom: 8px;
}

.detail-neighbors {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.detail-neighbor-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 6px;
    text-decoration: none;
    color: var(--color-text);
    font-size: 13px;
    transition: background 0.15s ease;
    cursor: pointer;
}

.detail-neighbor-item:hover {
    background: var(--color-surface);
}

.detail-nb-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
}

.detail-nb-dot.type-person { background: #107792; }
.detail-nb-dot.type-company { background: #DE7356; }
.detail-nb-dot.type-institution { background: #7B6B5D; }

.detail-nb-name {
    flex: 1;
    font-weight: 500;
}

.detail-nb-type {
    font-size: 11px;
    color: var(--color-text-secondary);
}

.detail-visit-btn {
    display: block;
    text-align: center;
    padding: 10px 16px;
    margin-top: 16px;
    background: var(--color-accent);
    color: #fff;
    text-decoration: none;
    border-radius: 8px;
    font-family: var(--font-serif);
    font-size: 13px;
    font-weight: 500;
    transition: opacity 0.2s ease;
}

.detail-visit-btn:hover {
    opacity: 0.85;
}

/* Wiki body */
.wiki-body .wiki-link {
    color: var(--color-accent);
    text-decoration: none;
    border-bottom: 1px solid transparent;
    transition: border-color 0.2s ease;
}

.wiki-body .wiki-link:hover {
    border-bottom-color: var(--color-accent);
}

.wiki-body .wiki-link-broken {
    color: var(--color-text-secondary);
    font-style: italic;
}

/* === Responsive === */
@media (max-width: 768px) {
    .wiki-controls {
        flex-direction: column;
        align-items: stretch;
    }

    .wiki-view-toggle {
        align-self: flex-start;
    }

    .wiki-grid {
        grid-template-columns: 1fr;
    }

    .graph-detail {
        left: 12px;
        width: calc(100% - 24px);
    }
}

`;
}

run();
