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
    <meta name="description" content="通过间隔记忆促进理解，而不是死记硬背。">
    <link rel="canonical" href="https://aimunger.com/ankicard/" />
    <meta property="og:title" content="记忆卡 - aimunger" />
    <meta property="og:description" content="通过间隔记忆促进理解，而不是死记硬背。" />
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
        /* ===== Groups grid ===== */
        #view-groups, #view-review { padding-bottom: 72px; }

        .groups-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 28px;
        }

        /* --- Stacked-card group --- */
        .group {
            cursor: pointer;
            -webkit-tap-highlight-color: transparent;
        }

        .group-stack {
            position: relative;
            aspect-ratio: 4 / 3;
            margin-bottom: 14px;
        }

        .group-stack-layer {
            position: absolute;
            inset: 0;
            background: var(--color-card-bg);
            border: 1px solid var(--color-border);
            border-radius: 14px;
            box-shadow: 0 1px 3px rgba(16,15,15,0.03);
            transition: transform 0.35s cubic-bezier(0.23,1,0.32,1),
                        box-shadow 0.35s cubic-bezier(0.23,1,0.32,1),
                        opacity 0.35s ease;
        }

        .group-stack-layer:nth-child(1) {
            transform: scale(0.91) translateY(-10px);
            opacity: 0.35;
            z-index: 1;
        }
        .group-stack-layer:nth-child(2) {
            transform: scale(0.955) translateY(-5px);
            opacity: 0.6;
            z-index: 2;
        }

        /* Front card */
        .group-stack-front {
            position: absolute;
            inset: 0;
            background: var(--color-card-bg);
            border: 1px solid var(--color-border);
            border-radius: 14px;
            z-index: 3;
            display: flex;
            flex-direction: column;
            justify-content: center;
            padding: 24px 22px;
            box-shadow: 0 1px 3px rgba(16,15,15,0.03);
            transition: border-color 0.3s ease,
                        box-shadow 0.35s cubic-bezier(0.23,1,0.32,1),
                        transform 0.35s cubic-bezier(0.23,1,0.32,1);
            overflow: hidden;
        }

        .group-stack-front .front-q {
            font-size: 14px;
            line-height: 1.8;
            color: var(--color-text);
            display: -webkit-box;
            -webkit-line-clamp: 4;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }

        .front-badge {
            display: inline-block;
            width: 20px;
            height: 20px;
            line-height: 20px;
            text-align: center;
            font-size: 11px;
            font-weight: 700;
            color: #fff;
            background: var(--color-accent);
            border-radius: 4px;
            margin-bottom: 12px;
            flex-shrink: 0;
        }

        /* Hover on group */
        .group:hover .group-stack-front {
            border-color: var(--color-accent);
            box-shadow: 0 8px 32px rgba(139,37,0,0.08), 0 2px 8px rgba(0,0,0,0.04);
            transform: translateY(-3px);
        }
        .group:hover .group-stack-layer:nth-child(1) {
            transform: scale(0.91) translateY(-13px);
            opacity: 0.45;
        }
        .group:hover .group-stack-layer:nth-child(2) {
            transform: scale(0.955) translateY(-8px);
            opacity: 0.7;
        }

        .group-meta {
            text-align: center;
        }
        .group-title {
            font-family: var(--font-serif);
            font-size: 15px;
            font-weight: 600;
            line-height: 1.5;
            color: var(--color-text);
            margin-bottom: 4px;
        }
        .group-count {
            font-size: 12px;
            color: var(--color-text-secondary);
        }

        /* ===== Review view ===== */
        #view-review { display: none; }

        .review-back {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 14px;
            color: var(--color-text-secondary);
            text-decoration: none;
            cursor: pointer;
            margin-bottom: 32px;
            transition: color 0.2s ease;
            -webkit-tap-highlight-color: transparent;
        }
        .review-back:hover { color: var(--color-accent); }

        .review-title {
            font-family: var(--font-serif);
            font-size: 20px;
            font-weight: 700;
            margin-bottom: 8px;
            line-height: 1.4;
        }

        .review-progress {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 28px;
        }
        .progress-bar {
            flex: 1;
            height: 3px;
            background: var(--color-border);
            border-radius: 2px;
            overflow: hidden;
        }
        .progress-fill {
            height: 100%;
            background: var(--color-accent);
            border-radius: 2px;
            transition: width 0.4s cubic-bezier(0.23,1,0.32,1);
        }
        .progress-text {
            font-size: 13px;
            color: var(--color-text-secondary);
            white-space: nowrap;
        }

        /* Review card */
        .review-card {
            background: var(--color-card-bg);
            border: 1px solid var(--color-border);
            border-radius: 14px;
            box-shadow: 0 1px 3px rgba(16,15,15,0.03);
            overflow: hidden;
            margin-bottom: 24px;
        }

        .review-q {
            padding: 28px 28px 24px;
            font-size: 16px;
            line-height: 1.9;
            color: var(--color-text);
        }
        .review-q-badge {
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
            vertical-align: middle;
        }

        .review-a {
            border-top: 1px solid var(--color-border);
            padding: 0 28px;
            max-height: 0;
            overflow: hidden;
            opacity: 0;
            transition: max-height 0.45s cubic-bezier(0.23,1,0.32,1),
                        padding 0.45s cubic-bezier(0.23,1,0.32,1),
                        opacity 0.35s ease 0.05s;
        }
        .review-a.visible {
            max-height: 600px;
            padding: 24px 28px;
            opacity: 1;
        }
        .review-a-badge {
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
        .review-a-text {
            font-size: 15px;
            line-height: 1.9;
            color: var(--color-text-secondary);
        }

        /* Action buttons */
        .review-actions {
            display: flex;
            gap: 12px;
        }

        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 10px 24px;
            border: 1px solid var(--color-border);
            border-radius: 8px;
            background: var(--color-card-bg);
            font-family: var(--font-serif);
            font-size: 14px;
            font-weight: 500;
            color: var(--color-text);
            cursor: pointer;
            transition: border-color 0.2s ease,
                        background 0.2s ease,
                        color 0.2s ease,
                        transform 0.15s ease;
            -webkit-tap-highlight-color: transparent;
        }
        .btn:hover {
            border-color: var(--color-accent);
            color: var(--color-accent);
        }
        .btn:active {
            transform: scale(0.97);
        }

        .btn-primary {
            background: var(--color-accent);
            border-color: var(--color-accent);
            color: #fff;
        }
        .btn-primary:hover {
            background: #7a2000;
            border-color: #7a2000;
            color: #fff;
        }

        .btn-reveal {
            width: 100%;
            padding: 14px 24px;
            font-size: 15px;
        }

        /* Done state */
        .review-done {
            text-align: center;
            padding: 64px 0;
        }
        .review-done-icon {
            font-size: 48px;
            margin-bottom: 20px;
            opacity: 0.7;
        }
        .review-done h3 {
            font-family: var(--font-serif);
            font-size: 20px;
            font-weight: 700;
            margin-bottom: 8px;
        }
        .review-done p {
            font-size: 14px;
            color: var(--color-text-secondary);
            margin-bottom: 28px;
        }

        /* View transitions */
        .fade-in {
            animation: fadeIn 0.3s ease;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0); }
        }

        .card-enter {
            animation: cardEnter 0.3s cubic-bezier(0.23,1,0.32,1);
        }
        @keyframes cardEnter {
            from { opacity: 0; transform: translateY(12px) scale(0.98); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* Responsive */
        @media (max-width: 600px) {
            .groups-grid {
                grid-template-columns: 1fr;
                gap: 24px;
                max-width: 320px;
                margin: 0 auto;
            }
            .group-stack { aspect-ratio: 5 / 3; }
            .review-q, .review-a { padding-left: 22px; padding-right: 22px; }
            .review-q { padding-top: 22px; padding-bottom: 18px; }
            .review-a.visible { padding-top: 18px; padding-bottom: 22px; }
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
            <section id="view-groups">
                <div class="hero">
                    <h1 class="hero-title">记忆卡</h1>
                    <p class="hero-desc">通过间隔记忆促进理解，而不是死记硬背。</p>
                </div>
                <div class="groups-grid" id="groups-grid"></div>
            </section>

            <section id="view-review">
                <div id="review-content"></div>
            </section>
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

    var groupsView = document.getElementById('view-groups');
    var reviewView = document.getElementById('view-review');
    var reviewContent = document.getElementById('review-content');
    var grid = document.getElementById('groups-grid');

    var currentDeck = null;
    var currentIndex = 0;
    var answerRevealed = false;

    function esc(s) {
        var d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    // --- Groups view ---
    DECKS.forEach(function(deck, di) {
        var group = document.createElement('div');
        group.className = 'group';

        var stack = document.createElement('div');
        stack.className = 'group-stack';
        stack.innerHTML =
            '<div class="group-stack-layer"></div>' +
            '<div class="group-stack-layer"></div>' +
            '<div class="group-stack-front">' +
                '<span class="front-badge">Q</span>' +
                '<div class="front-q">' + esc(deck.cards[0].q) + '</div>' +
            '</div>';

        var meta = document.createElement('div');
        meta.className = 'group-meta';
        meta.innerHTML =
            '<div class="group-title">' + esc(deck.title) + '</div>' +
            '<div class="group-count">' + deck.cards.length + ' 张卡片</div>';

        group.appendChild(stack);
        group.appendChild(meta);
        group.addEventListener('click', function() { openDeck(di); });
        grid.appendChild(group);
    });

    // --- Open a deck ---
    function openDeck(di) {
        currentDeck = di;
        currentIndex = 0;
        answerRevealed = false;

        groupsView.style.display = 'none';
        reviewView.style.display = 'block';
        renderCard();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function closeDeck() {
        reviewView.style.display = 'none';
        groupsView.style.display = 'block';
        currentDeck = null;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function renderCard() {
        var deck = DECKS[currentDeck];
        var total = deck.cards.length;
        var pct = Math.round(((currentIndex) / total) * 100);

        if (currentIndex >= total) {
            reviewContent.innerHTML =
                '<span class="review-back" id="btn-back">&larr; 返回</span>' +
                '<div class="review-done fade-in">' +
                    '<div class="review-done-icon">&#10003;</div>' +
                    '<h3>全部完成</h3>' +
                    '<p>' + esc(deck.title) + ' &middot; ' + total + ' 张卡片</p>' +
                    '<button class="btn btn-primary" id="btn-restart">再来一次</button>' +
                '</div>';
            document.getElementById('btn-back').addEventListener('click', closeDeck);
            document.getElementById('btn-restart').addEventListener('click', function() {
                currentIndex = 0;
                answerRevealed = false;
                renderCard();
            });
            return;
        }

        var card = deck.cards[currentIndex];
        answerRevealed = false;

        reviewContent.innerHTML =
            '<span class="review-back" id="btn-back">&larr; 返回</span>' +
            '<h2 class="review-title">' + esc(deck.title) + '</h2>' +
            '<div class="review-progress">' +
                '<div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
                '<span class="progress-text">' + (currentIndex + 1) + ' / ' + total + '</span>' +
            '</div>' +
            '<div class="review-card card-enter">' +
                '<div class="review-q">' +
                    '<span class="review-q-badge">Q</span>' +
                    esc(card.q) +
                '</div>' +
                '<div class="review-a" id="review-a">' +
                    '<span class="review-a-badge">A</span>' +
                    '<span class="review-a-text">' + esc(card.a) + '</span>' +
                '</div>' +
            '</div>' +
            '<div id="action-area"></div>';

        document.getElementById('btn-back').addEventListener('click', closeDeck);
        renderAction();
    }

    function renderAction() {
        var area = document.getElementById('action-area');
        if (!answerRevealed) {
            area.innerHTML = '<button class="btn btn-reveal" id="btn-show">显示答案</button>';
            document.getElementById('btn-show').addEventListener('click', function() {
                answerRevealed = true;
                document.getElementById('review-a').classList.add('visible');
                renderAction();
            });
        } else {
            area.innerHTML =
                '<div class="review-actions">' +
                    '<button class="btn btn-primary" id="btn-next">' +
                        (currentIndex < DECKS[currentDeck].cards.length - 1 ? '记住了，下一张 &rarr;' : '完成') +
                    '</button>' +
                '</div>';
            document.getElementById('btn-next').addEventListener('click', function() {
                currentIndex++;
                renderCard();
            });
        }
    }
    </script>
</body>
</html>`;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html);
  console.log(`Generated ankicard page: ${decks.length} decks, ${decks.reduce((s, d) => s + d.cards.length, 0)} cards`);
}

run();
