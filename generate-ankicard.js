const fs = require('fs');
const path = require('path');

const CARDS_DIR = path.join(__dirname, 'ankicards');
const SITE_DIR = path.join(__dirname, '_site');
const OUT_DIR = path.join(SITE_DIR, 'ankicard');

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseFile(content) {
  const lines = content.split('\n');
  let title = '';
  let body = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (!title && /^title[：:]/.test(line)) {
      title = line.replace(/^title[：:]\s*/, '');
      body = lines.slice(i + 1).join('\n');
      break;
    }
  }

  if (!title) {
    title = '未命名';
    body = content;
  }

  // Split by --- separators, parse Q:/A: pairs
  const blocks = body.split(/^---$/m);
  const cards = [];
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const qMatch = trimmed.match(/^Q[：:]\s*(.*)/m);
    const aMatch = trimmed.match(/^A[：:]\s*(.*)/m);
    if (qMatch && aMatch) {
      cards.push({ q: qMatch[1].trim(), a: aMatch[1].trim() });
    }
  }

  return { title, cards };
}

function run() {
  if (!fs.existsSync(CARDS_DIR)) {
    console.log('ankicards/ directory not found, skipping');
    return;
  }

  const files = fs.readdirSync(CARDS_DIR)
    .filter(f => f.endsWith('.md'))
    .sort((a, b) => {
      const na = parseInt(a) || 0, nb = parseInt(b) || 0;
      return na - nb || a.localeCompare(b);
    });

  if (!files.length) {
    console.log('No .md files in ankicards/, skipping');
    return;
  }

  const decks = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(CARDS_DIR, file), 'utf-8');
    const deck = parseFile(content);
    if (deck.cards.length > 0) {
      deck.file = file;
      decks.push(deck);
    }
  }

  const cardsJson = JSON.stringify(decks).replace(/<\//g, '<\\/');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>记忆卡 - aimunger</title>
    <meta name="description" content="投资知识记忆卡片 - 通过闪卡复习巩固投资研究中的关键知识点。">
    <link rel="canonical" href="https://aimunger.com/ankicard/" />
    <meta property="og:title" content="记忆卡 - aimunger" />
    <meta property="og:description" content="投资知识记忆卡片 - 通过闪卡复习巩固投资研究中的关键知识点。" />
    <meta property="og:url" content="https://aimunger.com/ankicard/" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="zh_CN" />
    <meta property="og:site_name" content="aimunger" />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/style.css">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <style>
        .deck-section { margin-bottom: 48px; }
        .deck-title {
            font-family: var(--font-serif);
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 16px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--color-border);
        }
        .deck-count {
            font-size: 13px;
            color: var(--color-text-secondary);
            font-weight: 400;
            margin-left: 8px;
        }
        .cards-grid {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .card {
            background: var(--color-card-bg);
            border: 1px solid var(--color-border);
            border-radius: 10px;
            cursor: pointer;
            transition: border-color 0.2s;
            overflow: hidden;
        }
        .card:hover { border-color: var(--color-accent); }
        .card-q {
            padding: 16px 20px;
            font-size: 15px;
            line-height: 1.7;
        }
        .card-q::before {
            content: 'Q';
            display: inline-block;
            width: 22px;
            height: 22px;
            line-height: 22px;
            text-align: center;
            font-size: 12px;
            font-weight: 700;
            color: #fff;
            background: var(--color-accent);
            border-radius: 4px;
            margin-right: 10px;
            flex-shrink: 0;
            vertical-align: middle;
        }
        .card-a {
            padding: 0 20px;
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease, padding 0.3s ease;
            font-size: 14px;
            line-height: 1.8;
            color: var(--color-text-secondary);
            border-top: 1px solid transparent;
        }
        .card.open .card-a {
            max-height: 800px;
            padding: 14px 20px;
            border-top-color: var(--color-border);
        }
        .card-a::before {
            content: 'A';
            display: inline-block;
            width: 22px;
            height: 22px;
            line-height: 22px;
            text-align: center;
            font-size: 12px;
            font-weight: 700;
            color: var(--color-accent);
            background: var(--color-surface);
            border-radius: 4px;
            margin-right: 10px;
            vertical-align: middle;
        }
        .stats {
            font-size: 14px;
            color: var(--color-text-secondary);
            margin-bottom: 32px;
        }
    </style>
</head>
<body>
    <header class="header">
        <nav class="nav container">
            <a href="/" class="logo">
                <span class="logo-icon">M</span>
                <span class="logo-text">aimunger</span>
            </a>
            <ul class="nav-links">
                <li><a href="/resources/">资料库</a></li>
                <li><a href="/wiki/">Wiki</a></li>
                <li><a href="/qa/">问答</a></li>
                <li><a href="/data/">数据</a></li>
                <li><a href="/ankicard/" class="active">记忆卡</a></li>
                <li><a href="/about/">关于</a></li>
            </ul>
        </nav>
    </header>

    <main class="main">
        <div class="container">
            <section class="hero">
                <h1 class="hero-title">记忆卡</h1>
                <p class="hero-desc">投资研究中的关键知识点，点击卡片查看答案。</p>
            </section>
            <p class="stats" id="stats"></p>
            <div id="app"></div>
        </div>
    </main>

    <footer class="footer">
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
    </footer>

    <script>
    var DECKS = ${cardsJson};
    var app = document.getElementById('app');
    var stats = document.getElementById('stats');
    var totalCards = 0;
    DECKS.forEach(function(d) { totalCards += d.cards.length; });
    stats.textContent = DECKS.length + ' 组，共 ' + totalCards + ' 张卡片';

    DECKS.forEach(function(deck) {
        var section = document.createElement('div');
        section.className = 'deck-section';
        var h2 = document.createElement('h2');
        h2.className = 'deck-title';
        h2.textContent = deck.title;
        var count = document.createElement('span');
        count.className = 'deck-count';
        count.textContent = deck.cards.length + ' 张';
        h2.appendChild(count);
        section.appendChild(h2);

        var grid = document.createElement('div');
        grid.className = 'cards-grid';
        deck.cards.forEach(function(c) {
            var card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = '<div class="card-q">' + esc(c.q) + '</div><div class="card-a">' + esc(c.a) + '</div>';
            card.addEventListener('click', function() { card.classList.toggle('open'); });
            grid.appendChild(card);
        });
        section.appendChild(grid);
        app.appendChild(section);
    });

    function esc(s) {
        var d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }
    </script>
</body>
</html>`;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html);
  console.log(`Generated ankicard page: ${decks.length} decks, ${decks.reduce((s, d) => s + d.cards.length, 0)} cards`);
}

run();
