const fs = require('fs');
const path = require('path');

const WIKI_SOURCE = path.join(__dirname, 'wiki-source');
const SITE_DIR = path.join(__dirname, '_site');
const WIKI_DIR = path.join(SITE_DIR, 'wiki');

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
  // Replace [[links]] with internal wiki links
  let html = text.replace(/\[\[([^\]]+)\]\]/g, (_, name) => {
    if (wikiNames.has(name)) {
      return `<a href="/wiki/${encodeURIComponent(name)}/" class="wiki-link">${escHtml(name)}</a>`;
    }
    return `<span class="wiki-link-broken">${escHtml(name)}</span>`;
  });

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // List items
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, (match) => {
    if (!match.startsWith('<ul>')) return '<ul>' + match + '</ul>';
    return match;
  });
  // Merge adjacent <ul> tags
  html = html.replace(/<\/ul>\s*<ul>/g, '');

  // Paragraphs - wrap remaining text blocks
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

function run() {
  if (!fs.existsSync(WIKI_SOURCE)) {
    console.log('wiki-source directory not found, skipping wiki generation');
    return;
  }

  const files = fs.readdirSync(WIKI_SOURCE).filter(f => f.endsWith('.md'));
  if (!files.length) {
    console.log('No wiki files found');
    return;
  }

  // Parse all files
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

  // Build graph data
  const nodes = entries.map(e => ({ id: e.title }));
  const edgeSet = new Set();
  const edges = [];
  for (const e of entries) {
    for (const link of e.links) {
      const key = [e.title, link].sort().join('|||');
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push({ source: e.title, target: link });
      }
    }
  }

  // Build search index
  const searchData = entries.map(e => ({
    title: e.title,
    text: e.plainText.slice(0, 500),
  }));

  // Write output
  fs.mkdirSync(WIKI_DIR, { recursive: true });

  // Write individual pages
  for (const e of entries) {
    const dir = path.join(WIKI_DIR, e.title);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), generateArticlePage(e.title, e.htmlContent));
  }

  // Write data JSON for search and graph
  const wikiData = { nodes, edges, search: searchData };
  fs.writeFileSync(path.join(WIKI_DIR, 'data.json'), JSON.stringify(wikiData));

  // Write wiki index page
  fs.writeFileSync(path.join(WIKI_DIR, 'index.html'), generateIndexPage(entries));

  // Write wiki CSS
  fs.writeFileSync(path.join(WIKI_DIR, 'wiki.css'), generateWikiCSS());

  console.log(`Generated ${entries.length} wiki pages`);
}

function generateIndexPage(entries) {
  const sorted = [...entries].sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
  const cards = sorted.map(e => {
    const excerpt = e.plainText.slice(0, 100);
    const linkCount = e.links.length;
    return `                    <a href="/wiki/${encodeURIComponent(e.title)}/" class="wiki-card" data-title="${escHtml(e.title)}">
                        <h3 class="wiki-card-title">${escHtml(e.title)}</h3>
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
                <canvas id="wiki-graph"></canvas>
            </section>
        </div>
    </main>

${FOOTER_HTML}

    <script>
    (function() {
      var searchInput = document.getElementById('wiki-search');
      var listSection = document.getElementById('wiki-list');
      var graphSection = document.getElementById('wiki-graph-section');
      var cards = document.querySelectorAll('.wiki-card');
      var viewBtns = document.querySelectorAll('.wiki-view-btn');
      var graphData = null;
      var graphInited = false;

      // Search
      searchInput.addEventListener('input', function() {
        var q = this.value.trim().toLowerCase();
        cards.forEach(function(card) {
          var title = card.getAttribute('data-title').toLowerCase();
          var excerpt = card.querySelector('.wiki-card-excerpt').textContent.toLowerCase();
          card.style.display = (title.includes(q) || excerpt.includes(q)) ? '' : 'none';
        });
      });

      // View toggle
      viewBtns.forEach(function(btn) {
        btn.addEventListener('click', function() {
          var view = this.getAttribute('data-view');
          viewBtns.forEach(function(b) { b.classList.remove('active'); });
          this.classList.add('active');
          if (view === 'list') {
            listSection.style.display = '';
            graphSection.style.display = 'none';
          } else {
            listSection.style.display = 'none';
            graphSection.style.display = '';
            if (!graphInited) initGraph();
          }
        });
      });

      function initGraph() {
        graphInited = true;
        fetch('/wiki/data.json')
          .then(function(r) { return r.json(); })
          .then(function(data) { graphData = data; renderGraph(data); });
      }

      function renderGraph(data) {
        var canvas = document.getElementById('wiki-graph');
        var container = canvas.parentElement;
        var dpr = window.devicePixelRatio || 1;
        var W = container.clientWidth;
        var H = Math.max(500, Math.min(W, 700));
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        var ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        var nodes = data.nodes.map(function(n, i) {
          var angle = (2 * Math.PI * i) / data.nodes.length;
          var r = Math.min(W, H) * 0.35;
          return {
            id: n.id,
            x: W / 2 + r * Math.cos(angle) + (Math.random() - 0.5) * 40,
            y: H / 2 + r * Math.sin(angle) + (Math.random() - 0.5) * 40,
            vx: 0, vy: 0
          };
        });

        var nodeMap = {};
        nodes.forEach(function(n) { nodeMap[n.id] = n; });

        var edges = data.edges.filter(function(e) {
          return nodeMap[e.source] && nodeMap[e.target];
        });

        // Compute degree for node sizing
        var degree = {};
        nodes.forEach(function(n) { degree[n.id] = 0; });
        edges.forEach(function(e) {
          degree[e.source] = (degree[e.source] || 0) + 1;
          degree[e.target] = (degree[e.target] || 0) + 1;
        });

        var dragging = null;
        var offsetX = 0, offsetY = 0;
        var hoveredNode = null;

        canvas.addEventListener('mousedown', function(ev) {
          var rect = canvas.getBoundingClientRect();
          var mx = ev.clientX - rect.left;
          var my = ev.clientY - rect.top;
          for (var i = nodes.length - 1; i >= 0; i--) {
            var n = nodes[i];
            if (Math.hypot(n.x - mx, n.y - my) < getRadius(n) + 4) {
              dragging = n;
              offsetX = n.x - mx;
              offsetY = n.y - my;
              break;
            }
          }
        });

        canvas.addEventListener('mousemove', function(ev) {
          var rect = canvas.getBoundingClientRect();
          var mx = ev.clientX - rect.left;
          var my = ev.clientY - rect.top;
          if (dragging) {
            dragging.x = mx + offsetX;
            dragging.y = my + offsetY;
            dragging.vx = 0;
            dragging.vy = 0;
          }
          hoveredNode = null;
          for (var i = nodes.length - 1; i >= 0; i--) {
            var n = nodes[i];
            if (Math.hypot(n.x - mx, n.y - my) < getRadius(n) + 4) {
              hoveredNode = n;
              break;
            }
          }
          canvas.style.cursor = hoveredNode ? 'pointer' : 'default';
        });

        canvas.addEventListener('mouseup', function() { dragging = null; });
        canvas.addEventListener('mouseleave', function() { dragging = null; hoveredNode = null; });

        canvas.addEventListener('click', function(ev) {
          if (dragging) return;
          var rect = canvas.getBoundingClientRect();
          var mx = ev.clientX - rect.left;
          var my = ev.clientY - rect.top;
          for (var i = nodes.length - 1; i >= 0; i--) {
            var n = nodes[i];
            if (Math.hypot(n.x - mx, n.y - my) < getRadius(n) + 4) {
              window.location.href = '/wiki/' + encodeURIComponent(n.id) + '/';
              break;
            }
          }
        });

        // Touch support
        canvas.addEventListener('touchstart', function(ev) {
          var touch = ev.touches[0];
          var rect = canvas.getBoundingClientRect();
          var mx = touch.clientX - rect.left;
          var my = touch.clientY - rect.top;
          for (var i = nodes.length - 1; i >= 0; i--) {
            var n = nodes[i];
            if (Math.hypot(n.x - mx, n.y - my) < getRadius(n) + 8) {
              dragging = n;
              offsetX = n.x - mx;
              offsetY = n.y - my;
              ev.preventDefault();
              break;
            }
          }
        }, { passive: false });

        canvas.addEventListener('touchmove', function(ev) {
          if (dragging) {
            var touch = ev.touches[0];
            var rect = canvas.getBoundingClientRect();
            dragging.x = touch.clientX - rect.left + offsetX;
            dragging.y = touch.clientY - rect.top + offsetY;
            dragging.vx = 0;
            dragging.vy = 0;
            ev.preventDefault();
          }
        }, { passive: false });

        canvas.addEventListener('touchend', function() { dragging = null; });

        function getRadius(n) {
          return 4 + Math.min((degree[n.id] || 0) * 1.5, 10);
        }

        function tick() {
          // Force simulation
          // Repulsion
          for (var i = 0; i < nodes.length; i++) {
            for (var j = i + 1; j < nodes.length; j++) {
              var a = nodes[i], b = nodes[j];
              var dx = b.x - a.x, dy = b.y - a.y;
              var d = Math.max(Math.hypot(dx, dy), 1);
              var force = 800 / (d * d);
              var fx = (dx / d) * force, fy = (dy / d) * force;
              if (a !== dragging) { a.vx -= fx; a.vy -= fy; }
              if (b !== dragging) { b.vx += fx; b.vy += fy; }
            }
          }
          // Attraction along edges
          for (var i = 0; i < edges.length; i++) {
            var a = nodeMap[edges[i].source], b = nodeMap[edges[i].target];
            if (!a || !b) continue;
            var dx = b.x - a.x, dy = b.y - a.y;
            var d = Math.max(Math.hypot(dx, dy), 1);
            var force = (d - 100) * 0.01;
            var fx = (dx / d) * force, fy = (dy / d) * force;
            if (a !== dragging) { a.vx += fx; a.vy += fy; }
            if (b !== dragging) { b.vx -= fx; b.vy -= fy; }
          }
          // Center gravity
          for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            if (n === dragging) continue;
            n.vx += (W / 2 - n.x) * 0.002;
            n.vy += (H / 2 - n.y) * 0.002;
            n.vx *= 0.85;
            n.vy *= 0.85;
            n.x += n.vx;
            n.y += n.vy;
            n.x = Math.max(20, Math.min(W - 20, n.x));
            n.y = Math.max(20, Math.min(H - 20, n.y));
          }

          // Draw
          ctx.clearRect(0, 0, W, H);

          // Edges
          ctx.strokeStyle = '#d4cfc8';
          ctx.lineWidth = 1;
          for (var i = 0; i < edges.length; i++) {
            var a = nodeMap[edges[i].source], b = nodeMap[edges[i].target];
            if (!a || !b) continue;
            var isHighlight = hoveredNode && (a === hoveredNode || b === hoveredNode);
            ctx.strokeStyle = isHighlight ? '#8b2500' : '#d4cfc8';
            ctx.lineWidth = isHighlight ? 2 : 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }

          // Nodes
          for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            var r = getRadius(n);
            var isHovered = n === hoveredNode;
            var isConnected = hoveredNode && edges.some(function(e) {
              return (nodeMap[e.source] === hoveredNode && nodeMap[e.target] === n) ||
                     (nodeMap[e.target] === hoveredNode && nodeMap[e.source] === n);
            });

            ctx.beginPath();
            ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
            if (isHovered) {
              ctx.fillStyle = '#8b2500';
            } else if (isConnected) {
              ctx.fillStyle = '#c45a3c';
            } else if (hoveredNode) {
              ctx.fillStyle = '#ccc';
            } else {
              ctx.fillStyle = '#8b2500';
            }
            ctx.fill();

            // Labels
            ctx.font = '12px "Noto Serif SC", serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = (hoveredNode && !isHovered && !isConnected) ? '#bbb' : '#1a1a1a';
            ctx.fillText(n.id, n.x, n.y + r + 14);
          }

          requestAnimationFrame(tick);
        }

        tick();

        // Handle resize
        window.addEventListener('resize', function() {
          W = container.clientWidth;
          H = Math.max(500, Math.min(W, 700));
          canvas.width = W * dpr;
          canvas.height = H * dpr;
          canvas.style.width = W + 'px';
          canvas.style.height = H + 'px';
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.scale(dpr, dpr);
        });
      }
    })();
    </script>
</body>
</html>`;
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

.wiki-card-title {
    font-family: var(--font-serif);
    font-size: 17px;
    font-weight: 700;
    margin-bottom: 8px;
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

.wiki-graph-section {
    padding-bottom: 72px;
}

#wiki-graph {
    width: 100%;
    border: 1px solid var(--color-border);
    border-radius: 12px;
    background: var(--color-card-bg);
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

@media (max-width: 600px) {
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
}
`;
}

run();
