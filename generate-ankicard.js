const fs = require('fs');
const path = require('path');

const CARDS_DIR = path.join(__dirname, 'ankicards');
const SITE_DIR = path.join(__dirname, '_site');
const OUT_DIR = path.join(SITE_DIR, 'ankicard');
const INDEX_PATH = path.join(__dirname, 'index.html');

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
      return nb - na || b.localeCompare(a);
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
    <meta name="baidu-site-verification" content="codeva-nOGnNnjVUh" />
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
    <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;600;700&display=optional" rel="stylesheet">
    <link rel="stylesheet" href="/style.css">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <style>
        /* ===== Groups grid ===== */
        #view-groups { padding-bottom: 72px; }

        .groups-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(220px, 260px));
            gap: 28px;
            justify-content: center;
        }

        .group {
            cursor: pointer;
            -webkit-tap-highlight-color: transparent;
        }

        .group-stack {
            position: relative;
            aspect-ratio: 1 / 1.25;
            margin-bottom: 30px;
        }

        .group-stack-layer {
            position: absolute;
            left: 0;
            right: 0;
            bottom: 0;
            height: 100%;
            background: var(--color-card-bg);
            border: 1px solid var(--color-border);
            border-radius: 14px;
            box-shadow: 0 2px 6px rgba(16,15,15,0.06);
            transition: all 0.35s cubic-bezier(0.23,1,0.32,1);
        }

        /* Furthest back card */
        .group-stack-layer:nth-child(1) {
            left: 12px; right: 12px;
            bottom: -16px;
            opacity: 0.4;
            z-index: 0;
        }
        /* Middle card */
        .group-stack-layer:nth-child(2) {
            left: 6px; right: 6px;
            bottom: -8px;
            opacity: 0.65;
            z-index: 1;
        }
        /* Near card */
        .group-stack-layer:nth-child(3) {
            left: 2px; right: 2px;
            bottom: -4px;
            opacity: 0.85;
            z-index: 2;
        }

        .group-stack-front {
            position: absolute;
            left: 0;
            right: 0;
            top: 0;
            bottom: 0;
            background: var(--color-card-bg);
            border: 1px solid var(--color-border);
            border-radius: 14px;
            z-index: 3;
            display: flex;
            flex-direction: column;
            justify-content: center;
            padding: 24px 22px;
            box-shadow: 0 2px 8px rgba(16,15,15,0.06);
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
            -webkit-line-clamp: 3;
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

        .group:hover .group-stack-front {
            border-color: var(--color-accent);
            box-shadow: 0 8px 32px rgba(139,37,0,0.08), 0 2px 8px rgba(0,0,0,0.04);
            transform: translateY(-4px);
        }
        .group:hover .group-stack-layer:nth-child(1) {
            bottom: -18px;
            opacity: 0.5;
        }
        .group:hover .group-stack-layer:nth-child(2) {
            bottom: -10px;
            opacity: 0.75;
        }
        .group:hover .group-stack-layer:nth-child(3) {
            bottom: -5px;
            opacity: 0.9;
        }

        .group-meta { text-align: center; }
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

        /* ===== Overlay ===== */
        .overlay {
            position: fixed;
            inset: 0;
            z-index: 100;
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: none;
            opacity: 0;
        }
        .overlay.active {
            pointer-events: auto;
            opacity: 1;
        }

        .overlay-bg {
            position: absolute;
            inset: 0;
            background: rgba(250,250,249,0.9);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            opacity: 0;
            transition: opacity 0.35s ease;
        }
        .overlay.active .overlay-bg { opacity: 1; }

        .overlay-content {
            position: relative;
            z-index: 1;
            width: 92%;
            max-width: 560px;
            height: 88vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            padding: 20px 24px 16px;
            transform: scale(0.92) translateY(20px);
            opacity: 0;
            transition: transform 0.4s cubic-bezier(0.34,1.56,0.64,1),
                        opacity 0.3s ease;
        }
        .overlay.active .overlay-content {
            transform: scale(1) translateY(0);
            opacity: 1;
        }

        /* Scrollable card body */
        .review-scroll-body {
            flex: 1;
            overflow-y: auto;
            -ms-overflow-style: none;
            scrollbar-width: none;
            display: flex;
            flex-direction: column;
            justify-content: center;
            padding: 8px 0 12px;
        }
        .review-scroll-body::-webkit-scrollbar { display: none; }

        /* ===== Review card in overlay ===== */
        .review-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 16px;
        }
        .review-title {
            font-family: var(--font-serif);
            font-size: 17px;
            font-weight: 600;
            color: var(--color-text);
            line-height: 1.4;
            flex: 1;
            margin-right: 16px;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
        .review-close {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: rgba(0,0,0,0.06);
            border: none;
            color: var(--color-text);
            font-size: 18px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            transition: background 0.2s ease;
            -webkit-tap-highlight-color: transparent;
        }
        .review-close:hover { background: rgba(0,0,0,0.1); }

        .review-progress {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 28px;
        }
        .progress-bar {
            flex: 1;
            height: 2px;
            background: rgba(0,0,0,0.08);
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
            font-size: 12px;
            color: var(--color-text-secondary);
            white-space: nowrap;
        }

        .card-stage {
            position: relative;
        }
        .card-stack-layer {
            position: absolute;
            left: 0; right: 0;
            top: 0;
            height: 100%;
            background: var(--color-card-bg);
            border: 1px solid var(--color-border);
            border-radius: 16px;
            box-shadow: none;
            transition: all 0.45s cubic-bezier(0.23,1,0.32,1);
        }
        .group-stack-layer.accent,
        .card-stack-layer.accent {
            background: #8b2500;
            border-color: rgba(139,37,0,0.5);
        }
        .card-stack-layer.stack-far {
            left: 16px; right: 16px;
            top: auto; bottom: -14px;
            opacity: 0.3;
            z-index: 0;
        }
        .card-stack-layer.stack-near {
            left: 8px; right: 8px;
            top: auto; bottom: -7px;
            opacity: 0.55;
            z-index: 1;
        }

        .review-card {
            position: relative;
            z-index: 2;
            background: var(--color-card-bg);
            border: 1px solid #8b2500;
            border-radius: 16px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.06);
            overflow: hidden;
            animation: cardEnter 0.22s ease-out both;
        }
        @keyframes cardEnter {
            from { opacity: 0; transform: translateY(6px); }
            to   { opacity: 1; transform: none; }
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
            padding: 24px 28px;
        }
        .review-a-inner {
            opacity: 0;
            transition: opacity 0.35s ease;
        }
        .review-a.visible .review-a-inner {
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

        /* Accent (dark-red) front card */
        .review-card.accent {
            background: #8b2500;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .review-card.accent .review-q {
            color: rgba(255,255,255,0.92);
        }
        .review-card.accent .review-q-badge {
            background: rgba(255,255,255,0.2);
            color: #fff;
        }
        .review-card.accent .review-a {
            border-top-color: rgba(255,255,255,0.15);
        }
        .review-card.accent .review-a-badge {
            background: rgba(255,255,255,0.15);
            color: rgba(255,255,255,0.9);
        }
        .review-card.accent .review-a-text {
            color: rgba(255,255,255,0.72);
        }

        /* Action area below card */
        .review-actions {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            margin-top: 48px;
            min-height: 44px;
        }

        .btn-action {
            padding: 10px 28px;
            border: 1px solid var(--color-border);
            border-radius: 10px;
            background: transparent;
            font-family: var(--font-serif);
            font-size: 14px;
            font-weight: 500;
            color: var(--color-text-secondary);
            cursor: pointer;
            transition: background 0.2s ease, transform 0.15s ease, border-color 0.2s ease;
            -webkit-tap-highlight-color: transparent;
        }
        .btn-action:hover {
            background: var(--color-surface);
            border-color: var(--color-text-secondary);
        }
        .btn-action:active { transform: scale(0.96); }

        .btn-action.primary {
            background: var(--color-text);
            border-color: transparent;
            color: #fff;
        }
        .btn-action.primary:hover {
            background: #333;
        }

        /* Nav dots */
        .review-nav {
            display: flex;
            align-items: center;
            justify-content: center;
            margin-top: 16px;
        }
        .nav-dots {
            display: flex;
            gap: 5px;
            align-items: center;
        }
        .nav-dot {
            width: 5px;
            height: 5px;
            border-radius: 50%;
            background: rgba(0,0,0,0.12);
            transition: background 0.2s ease, transform 0.2s ease;
        }
        .nav-dot.active {
            background: var(--color-text);
            transform: scale(1.3);
        }

        .hint-keys {
            text-align: center;
            margin-top: 16px;
            font-size: 11px;
            color: var(--color-text-secondary);
            opacity: 0.6;
            white-space: nowrap;
        }

        /* Completion screen */
        .completion-screen {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            padding: 40px 24px;
        }
        .completion-title {
            font-family: var(--font-serif);
            font-size: 22px;
            font-weight: 600;
            color: var(--color-text);
            margin-bottom: 10px;
        }
        .completion-desc {
            font-size: 14px;
            color: var(--color-text-secondary);
            margin-bottom: 36px;
        }
        .completion-actions {
            display: flex;
            gap: 12px;
        }

        /* Responsive */
        @media (max-width: 600px) {
            .groups-grid {
                grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
                gap: 20px;
            }
            .overlay-content { width: 95%; }
            .review-q, .review-a { padding-left: 22px; padding-right: 22px; }
            .review-q { padding-top: 22px; padding-bottom: 18px; }
            .review-a { padding-top: 18px; padding-bottom: 22px; }
            .hint-keys { display: none; }
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
                <li><a href="/blog/">文章</a></li>
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
        </div>
    </main>

    <!-- Overlay for review -->
    <div class="overlay" id="overlay">
        <div class="overlay-bg" id="overlay-bg"></div>
        <div class="overlay-content" id="overlay-content"></div>
    </div>

    <footer class="footer">
        <div class="container">
            <div class="footer-links">
                <a href="/about/">关于</a>
                <a href="/privacy/">隐私政策</a>
                <a href="/disclaimer/">免责声明</a>
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

    var grid = document.getElementById('groups-grid');
    var overlay = document.getElementById('overlay');
    var overlayBg = document.getElementById('overlay-bg');
    var overlayContent = document.getElementById('overlay-content');

    var currentDeck = null;
    var currentIndex = 0;
    var answerRevealed = false;
    var transitioning = false;

    function esc(s) {
        var d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    // --- Build groups grid ---
    DECKS.forEach(function(deck, di) {
        var group = document.createElement('div');
        group.className = 'group';

        var stack = document.createElement('div');
        stack.className = 'group-stack';
        stack.innerHTML =
            '<div class="group-stack-layer accent"></div>' +
            '<div class="group-stack-layer"></div>' +
            '<div class="group-stack-layer accent"></div>' +
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

    // --- Open deck overlay ---
    function openDeck(di) {
        currentDeck = di;
        currentIndex = 0;
        answerRevealed = false;
        renderCard();
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeDeck() {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
        currentDeck = null;
    }

    overlayBg.addEventListener('click', closeDeck);

    function cardHTML(card, idx) {
        var accentClass = (idx % 2 !== 0) ? ' accent' : '';
        return '<div class="review-card' + accentClass + '">' +
            '<div class="review-q">' +
                '<span class="review-q-badge">Q</span>' +
                esc(card.q) +
            '</div>' +
            '<div class="review-a" id="review-a">' +
                '<div class="review-a-inner">' +
                    '<span class="review-a-badge">A</span>' +
                    '<span class="review-a-text">' + esc(card.a) + '</span>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    function goTo(idx, direction) {
        if (transitioning) return;
        var deck = DECKS[currentDeck];
        if (idx < 0 || idx >= deck.cards.length) return;

        var stageEl = document.querySelector('.card-stage');
        var oldCard = stageEl && stageEl.querySelector('.review-card');
        if (!oldCard) { currentIndex = idx; answerRevealed = false; renderCard(); return; }

        transitioning = true;
        oldCard.style.transition = 'opacity 0.13s ease';
        oldCard.style.opacity = '0';

        setTimeout(function() {
            currentIndex = idx;
            answerRevealed = false;
            renderCard();
            transitioning = false;
        }, 150);
    }

    function renderCard() {
        var deck = DECKS[currentDeck];
        var total = deck.cards.length;
        var card = deck.cards[currentIndex];
        var remaining = total - currentIndex - 1;
        var pct = Math.round(((currentIndex + 1) / total) * 100);

        // Dots (max 15 visible)
        var dotsHtml = '';
        if (total <= 15) {
            for (var i = 0; i < total; i++) {
                dotsHtml += '<span class="nav-dot' + (i === currentIndex ? ' active' : '') + '"></span>';
            }
        }

        overlayContent.innerHTML =
            '<div class="review-header">' +
                '<div class="review-title">' + esc(deck.title) + '</div>' +
                '<button class="review-close" id="btn-close">&times;</button>' +
            '</div>' +
            '<div class="review-progress">' +
                '<div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
                '<span class="progress-text">' + (currentIndex + 1) + ' / ' + total + '</span>' +
            '</div>' +
            '<div class="review-scroll-body">' +
                '<div class="card-stage">' +
                    (remaining >= 2 ? '<div class="card-stack-layer stack-far' + ((currentIndex + 2) % 2 !== 0 ? ' accent' : '') + '"></div>' : '') +
                    (remaining >= 1 ? '<div class="card-stack-layer stack-near' + ((currentIndex + 1) % 2 !== 0 ? ' accent' : '') + '"></div>' : '') +
                    cardHTML(card, currentIndex) +
                '</div>' +
                '<div class="review-actions" id="action-area"></div>' +
            '</div>' +
            (dotsHtml ? '<div class="review-nav"><div class="nav-dots">' + dotsHtml + '</div></div>' : '') +
            '<div class="hint-keys">Space 显示答案 <span style="font-family:monospace">&middot;</span> &larr; &rarr; 切换</div>';

        document.getElementById('btn-close').addEventListener('click', closeDeck);

        renderAction();
    }

    function renderAction() {
        var area = document.getElementById('action-area');
        if (!area) return;
        if (!answerRevealed) {
            area.innerHTML = '<button class="btn-action primary" id="btn-show">显示答案</button>';
            document.getElementById('btn-show').addEventListener('click', revealAnswer);
        } else {
            var isLast = currentIndex >= DECKS[currentDeck].cards.length - 1;
            if (isLast) {
                area.innerHTML = '<button class="btn-action primary" id="btn-complete">完成 ✓</button>';
                document.getElementById('btn-complete').addEventListener('click', showCompletion);
            } else {
                area.innerHTML = '<button class="btn-action primary" id="btn-next-card">下一张 →</button>';
                document.getElementById('btn-next-card').addEventListener('click', function() {
                    goTo(currentIndex + 1, 'next');
                });
            }
        }
    }

    function revealAnswer() {
        if (answerRevealed) return;
        answerRevealed = true;
        var el = document.getElementById('review-a');
        if (el) el.classList.add('visible');
        renderAction();
    }

    function showCompletion() {
        var deck = DECKS[currentDeck];
        overlayContent.innerHTML =
            '<div class="completion-screen">' +
                '<div class="completion-title">完成</div>' +
                '<div class="completion-desc">已复习完这组的 ' + deck.cards.length + ' 张卡片</div>' +
                '<div class="completion-actions">' +
                    '<button class="btn-action" id="btn-restart">重新开始</button>' +
                    '<button class="btn-action primary" id="btn-close-done">关闭</button>' +
                '</div>' +
            '</div>';
        document.getElementById('btn-restart').addEventListener('click', function() {
            currentIndex = 0;
            answerRevealed = false;
            renderCard();
        });
        document.getElementById('btn-close-done').addEventListener('click', closeDeck);
    }

    // --- Touch swipe ---
    var touchStartX = 0;
    overlayContent.addEventListener('touchstart', function(e) {
        touchStartX = e.touches[0].clientX;
    }, { passive: true });
    overlayContent.addEventListener('touchend', function(e) {
        if (currentDeck === null) return;
        var dx = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(dx) > 44) {
            if (dx < 0) goTo(currentIndex + 1, 'next');
            else goTo(currentIndex - 1, 'prev');
        }
    }, { passive: true });

    // --- Keyboard ---
    document.addEventListener('keydown', function(e) {
        if (currentDeck === null) return;

        if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault();
            if (!answerRevealed) revealAnswer();
            else goTo(currentIndex + 1, 'next');
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            goTo(currentIndex + 1, 'next');
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            goTo(currentIndex - 1, 'prev');
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeDeck();
        }
    });
    <\/script>
</body>
</html>`;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html);
  // Also write to project root ankicard/ for local dev server
  const ROOT_OUT_DIR = path.join(__dirname, 'ankicard');
  fs.mkdirSync(ROOT_OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(ROOT_OUT_DIR, 'index.html'), html);
  console.log(`Generated ankicard page: ${decks.length} decks, ${decks.reduce((s, d) => s + d.cards.length, 0)} cards`);

  // Inject latest 2 decks into root index.html
  if (decks.length > 0 && fs.existsSync(INDEX_PATH)) {
    const latestDecks = decks.slice(-2).reverse();
    const deckCards = latestDecks.map(deck => {
      const firstQ = deck.cards[0].q;
      const excerpt = escHtml(firstQ.length > 80 ? firstQ.slice(0, 80) + '...' : firstQ);
      return `                    <a href="/ankicard/" class="project-card">
                        <div class="project-card-inner">
                            <span class="project-label">记忆卡</span>
                            <h3 class="project-title">${escHtml(deck.title)}</h3>
                            <p class="project-desc">${excerpt}</p>
                            <span class="project-arrow">&rarr;</span>
                        </div>
                    </a>`;
    }).join('\n');

    const sectionContent = `
            <section class="projects">
                <h2 class="section-title">最新记忆卡</h2>
                <div class="projects-grid">
${deckCards}
                </div>
            </section>`;

    let indexHtml = fs.readFileSync(INDEX_PATH, 'utf-8');
    const startMarker = '<!-- ANKICARDS_SECTION_START -->';
    const endMarker = '<!-- ANKICARDS_SECTION_END -->';
    const start = indexHtml.indexOf(startMarker);
    const end = indexHtml.indexOf(endMarker);
    if (start !== -1 && end !== -1) {
      indexHtml = indexHtml.slice(0, start) + startMarker + sectionContent + '\n            ' + endMarker + indexHtml.slice(end + endMarker.length);
      fs.writeFileSync(INDEX_PATH, indexHtml);
      console.log(`Injected ${latestDecks.length} latest decks into index.html`);
    }
  }
}

run();
