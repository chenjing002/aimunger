#!/usr/bin/env node
// Generates the /podcast/ page from the 小宇宙 RSS feed at build time.
// Output is fully static HTML (SEO-friendly, no client-side fetching).
//
// Feed fetch happens in CI on every deploy. On success the parsed feed is
// saved to podcast/episodes.json (committed snapshot); on network failure
// the snapshot is used instead so a feed outage never breaks a deploy.

const fs = require('fs');
const path = require('path');

const FEED_URL = 'https://feed.xyzfm.space/xkh7dmu4vulb';
const SNAPSHOT = path.join(__dirname, 'podcast', 'episodes.json');
const OUT_DIR = path.join(__dirname, '_site', 'podcast');
const PAGE_URL = 'https://aimunger.com/podcast/';

async function fetchFeed(url) {
    const res = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(30000),
        headers: { 'user-agent': 'aimunger-site-build (+https://aimunger.com)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
}

function decodeEntities(s) {
    return s
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
        .replace(/&amp;/g, '&');
}

function escapeHtml(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function tag(block, name) {
    const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
    if (!m) return '';
    let v = m[1].trim();
    const cdata = v.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
    if (cdata) v = cdata[1].trim();
    return decodeEntities(v);
}

function attr(block, name, attrName) {
    const m = block.match(new RegExp(`<${name}[^>]*\\b${attrName}="([^"]*)"`));
    return m ? decodeEntities(m[1]) : '';
}

function stripHtml(s) {
    return decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function parseFeed(xml) {
    const items = [];
    const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    const channelBlock = xml.slice(0, xml.indexOf('<item>'));
    for (const block of itemBlocks) {
        items.push({
            title: tag(block, 'title'),
            link: tag(block, 'link'),
            guid: tag(block, 'guid'),
            pubDate: tag(block, 'pubDate'),
            duration: tag(block, 'itunes:duration'),
            image: attr(block, 'itunes:image', 'href'),
            excerpt: stripHtml(tag(block, 'description')).slice(0, 160),
        });
    }
    return {
        title: tag(channelBlock, 'title'),
        description: tag(channelBlock, 'description'),
        link: tag(channelBlock, 'link'),
        image: attr(channelBlock, 'itunes:image', 'href'),
        episodes: items,
    };
}

function formatDate(pubDate) {
    const d = new Date(pubDate);
    if (isNaN(d)) return '';
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function isoDate(pubDate) {
    const d = new Date(pubDate);
    return isNaN(d) ? '' : d.toISOString().slice(0, 10);
}

function formatDuration(dur) {
    if (!dur) return '';
    let seconds;
    if (/^\d+$/.test(dur)) {
        seconds = Number(dur);
    } else {
        const parts = dur.split(':').map(Number);
        if (parts.some(isNaN)) return '';
        seconds = parts.reduce((acc, p) => acc * 60 + p, 0);
    }
    const min = Math.round(seconds / 60);
    return min > 0 ? `${min} 分钟` : '';
}

function renderPage(feed) {
    const desc = `${feed.title}：${feed.description}。收录全部 ${feed.episodes.length} 期播客节目。`;

    const cards = feed.episodes.map((ep) => {
        const date = formatDate(ep.pubDate);
        const duration = formatDuration(ep.duration);
        const meta = [date, duration].filter(Boolean).join(' · ');
        const cover = ep.image || feed.image;
        return `                    <a class="episode-card" href="${escapeHtml(ep.link)}" target="_blank" rel="noopener">
                        <img class="episode-cover" src="${escapeHtml(cover)}" alt="${escapeHtml(ep.title)}" loading="lazy" width="84" height="84">
                        <div class="episode-body">
                            <h2 class="episode-title">${escapeHtml(ep.title)}</h2>
                            <p class="episode-excerpt">${escapeHtml(ep.excerpt)}</p>
                            <p class="episode-meta">${escapeHtml(meta)}</p>
                        </div>
                    </a>`;
    }).join('\n');

    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'PodcastSeries',
        name: feed.title,
        description: feed.description,
        image: feed.image,
        url: PAGE_URL,
        webFeed: FEED_URL,
        inLanguage: 'zh-CN',
    };

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="baidu-site-verification" content="codeva-nOGnNnjVUh" />
    <title>播客 - aimunger</title>
    <meta name="description" content="${escapeHtml(desc)}">
    <link rel="canonical" href="${PAGE_URL}" />
    <meta property="og:title" content="播客 - aimunger" />
    <meta property="og:description" content="${escapeHtml(desc)}" />
    <meta property="og:url" content="${PAGE_URL}" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="zh_CN" />
    <meta property="og:site_name" content="aimunger" />
    <meta property="og:image" content="${escapeHtml(feed.image)}" />
    <link rel="alternate" type="application/rss+xml" title="${escapeHtml(feed.title)}" href="${FEED_URL}">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;600;700&display=optional" rel="stylesheet">
    <link rel="stylesheet" href="/style.css">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2876035394247776"
         crossorigin="anonymous"></script>
    <script type="application/ld+json">
    ${JSON.stringify(jsonLd, null, 4).split('\n').join('\n    ')}
    </script>
    <style>
        .podcast-hero {
            display: flex;
            align-items: center;
            gap: 28px;
        }
        .podcast-hero-text {
            min-width: 0;
        }
        .podcast-hero-cover {
            width: 128px;
            height: 128px;
            border-radius: 16px;
            border: 1px solid var(--color-border);
            box-shadow: 0 4px 16px rgba(26, 26, 26, 0.08);
            flex-shrink: 0;
            object-fit: cover;
        }
        .podcast-links {
            display: flex;
            gap: 12px;
            margin-top: 16px;
            flex-wrap: wrap;
        }
        .podcast-links a {
            display: inline-flex;
            align-items: center;
            padding: 7px 16px;
            border-radius: 999px;
            border: 1px solid var(--color-border);
            background: var(--color-card-bg);
            color: var(--color-text);
            font-size: 13px;
            font-weight: 500;
            text-decoration: none;
            transition: border-color 0.2s ease, color 0.2s ease;
        }
        .podcast-links a:hover {
            border-color: var(--color-accent);
            color: var(--color-accent);
        }
        .episodes-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 20px;
            padding-bottom: 72px;
        }
        .episode-card {
            min-width: 0;
            display: flex;
            gap: 16px;
            padding: 18px;
            background: var(--color-card-bg);
            border: 1px solid var(--color-border);
            border-radius: 14px;
            box-shadow: 0 1px 3px rgba(26, 26, 26, 0.04);
            text-decoration: none;
            color: var(--color-text);
            transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
        }
        .episode-card:hover {
            border-color: var(--color-accent);
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(26, 26, 26, 0.08);
        }
        .episode-cover {
            width: 84px;
            height: 84px;
            border-radius: 10px;
            object-fit: cover;
            flex-shrink: 0;
            background: var(--color-surface);
        }
        .episode-body {
            min-width: 0;
        }
        .episode-title,
        .episode-excerpt {
            overflow-wrap: anywhere;
        }
        .episode-title {
            font-family: var(--font-serif);
            font-size: 15px;
            font-weight: 600;
            line-height: 1.5;
            margin: 0 0 6px;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
        .episode-excerpt {
            font-size: 13px;
            line-height: 1.7;
            color: var(--color-text-secondary);
            margin: 0 0 8px;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
        .episode-meta {
            font-size: 12px;
            color: var(--color-text-secondary);
            margin: 0;
        }
        @media (max-width: 600px) {
            .podcast-hero {
                gap: 18px;
            }
            .podcast-hero-cover {
                width: 88px;
                height: 88px;
                border-radius: 12px;
            }
            .episodes-grid {
                grid-template-columns: 1fr;
                gap: 14px;
                padding-bottom: 56px;
            }
            .episode-card {
                padding: 14px;
            }
            .episode-cover {
                width: 72px;
                height: 72px;
            }
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
                <li><a href="/ankicard/">记忆卡</a></li>
                <li><a href="/podcast/" class="active">播客</a></li>
                <li><a href="/about/">关于</a></li>
            </ul>
        </nav>
    </header>

    <main class="main">
        <div class="container">
            <section class="hero podcast-hero">
                <img class="podcast-hero-cover" src="${escapeHtml(feed.image)}" alt="${escapeHtml(feed.title)}" width="128" height="128">
                <div class="podcast-hero-text">
                    <h1 class="hero-title">${escapeHtml(feed.title)}</h1>
                    <p class="hero-desc">${escapeHtml(feed.description)}，共 ${feed.episodes.length} 期节目。</p>
                    <div class="podcast-links">
                        <a href="${escapeHtml(feed.link)}" target="_blank" rel="noopener">在小宇宙收听</a>
                        <a href="${FEED_URL}" target="_blank" rel="noopener">RSS 订阅</a>
                    </div>
                </div>
            </section>

            <section aria-label="播客节目列表">
                <div class="episodes-grid">
${cards}
                </div>
            </section>
        </div>
    </main>

    <footer class="footer">
        <div class="container">
            <div class="footer-links">
                <a href="/about/">关于</a>
                <a href="/contact/">联系</a>
                <a href="/privacy/">隐私政策</a>
                <a href="/disclaimer/">免责声明</a>
                <a href="https://aimunger.com/letters/">letters-to-shareholders</a>
                <a href="https://aimunger.com/llm.txt">llm.txt</a>
                <a href="https://aimunger.com/sitemap.xml">sitemap</a>
                <a href="https://aimunger.com/rss.xml">rss</a>
            </div>
            <p>&copy; 2026 aimunger</p>
        </div>
    </footer>
    <script src="/memory-notify.js"></script>
</body>
</html>
`;
}

async function main() {
    let feed = null;
    try {
        const xml = await fetchFeed(FEED_URL);
        feed = parseFeed(xml);
        if (!feed.episodes.length) throw new Error('feed parsed but contains no episodes');
        fs.mkdirSync(path.dirname(SNAPSHOT), { recursive: true });
        fs.writeFileSync(SNAPSHOT, JSON.stringify(feed, null, 2) + '\n');
        console.log(`Fetched feed: ${feed.title}, ${feed.episodes.length} episodes (snapshot updated)`);
    } catch (err) {
        console.warn(`Feed fetch failed (${err.message}), falling back to snapshot`);
        feed = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
        console.log(`Using snapshot: ${feed.title}, ${feed.episodes.length} episodes`);
    }

    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, 'index.html'), renderPage(feed));
    console.log(`Wrote _site/podcast/index.html`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
