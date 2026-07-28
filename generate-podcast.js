#!/usr/bin/env node
// Generates the /podcast/ hub page AND a dedicated, indexable page for every
// episode from the 小宇宙 RSS feed at build time.
// Output is fully static HTML (SEO-friendly, no client-side fetching).
//
// Each episode gets a permanent, stable URL at /podcast/<guid>/ where <guid>
// is the immutable 小宇宙 episode id — it never changes as the feed grows, so
// links and search-engine indexes stay valid forever.
//
// Feed fetch happens in CI on every deploy. On success the parsed feed is
// saved to podcast/episodes.json (committed snapshot); on network failure
// the snapshot is used instead so a feed outage never breaks a deploy.

const fs = require('fs');
const path = require('path');

const SITE = 'https://aimunger.com';
const FEED_URL = 'https://feed.xyzfm.space/xkh7dmu4vulb';
const SNAPSHOT = path.join(__dirname, 'podcast', 'episodes.json');
const OUT_DIR = path.join(__dirname, '_site', 'podcast');
const PAGE_URL = `${SITE}/podcast/`;

function episodeUrl(slug) {
    return `${SITE}/podcast/${slug}/`;
}
function episodePath(slug) {
    return `/podcast/${slug}/`;
}

// Build an ASCII-only, SEO-friendly slug from the episode title, e.g.
// "E01.《熊市剖析》… Anatomy of the Bear" -> "e01-anatomy-of-the-bear".
// CJK is dropped entirely; the slug is the episode number plus the English
// words in the title. Titles with no English words fall back to the number
// alone (e.g. "e34"), which is still unique and stable.
function slugify(title) {
    const t = (title || '').replace(/[’'`]/g, '');
    // Episode number prefix ("E01." -> "e01"), zero-padded to two digits.
    const numMatch = t.match(/^\s*E\s*0*(\d+)/i);
    const prefix = numMatch ? `e${numMatch[1].padStart(2, '0')}` : '';
    const rest = numMatch ? t.slice(numMatch[0].length) : t;
    // Split on runs of non-ASCII (CJK/fullwidth punctuation); keep only the
    // ASCII chunks that contain an English word, then take their tokens. This
    // keeps digits that qualify a word ("100 Baggers" -> "100-baggers") while
    // dropping stray digits from Chinese text ("50年", "33位").
    const words = [];
    for (const chunk of rest.toLowerCase().split(/[^\x00-\x7f]+/)) {
        if (!/[a-z]/.test(chunk)) continue;
        for (const w of chunk.match(/[a-z0-9]+/g) || []) words.push(w);
    }
    let slug = [prefix, ...words].filter(Boolean).join('-');
    if (slug.length > 60) {
        slug = slug.slice(0, 60);
        const cut = slug.lastIndexOf('-');
        if (cut > 10) slug = slug.slice(0, cut);
        slug = slug.replace(/-+$/, '');
    }
    return slug;
}

// Reuse slugs previously assigned to each guid so a URL never changes even if
// its title is later edited — permanence is keyed on the immutable guid.
function loadSlugMap() {
    try {
        const prev = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
        const m = new Map();
        for (const e of prev.episodes || []) {
            if (e.guid && e.slug) m.set(e.guid, e.slug);
        }
        return m;
    } catch {
        return new Map();
    }
}

function assignSlugs(feed, priorSlugs) {
    const used = new Set();
    for (const ep of feed.episodes) {
        let slug = priorSlugs.get(ep.guid);
        if (!slug) {
            const base = slugify(ep.title) || ep.guid;
            slug = base;
            let n = 2;
            while (used.has(slug)) slug = `${base}-${n++}`;
        }
        ep.slug = slug;
        used.add(slug);
    }
}

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

// Like tag() but preserves the inner markup verbatim (no entity decoding) so
// the show-notes HTML inside a CDATA block survives intact for sanitizing.
function rawTag(block, name) {
    const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
    if (!m) return '';
    let v = m[1].trim();
    const cdata = v.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
    if (cdata) v = cdata[1].trim();
    return v;
}

function attr(block, name, attrName) {
    const m = block.match(new RegExp(`<${name}[^>]*\\b${attrName}="([^"]*)"`));
    return m ? decodeEntities(m[1]) : '';
}

function stripHtml(s) {
    return decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// The feed's show notes are authored by us, but flow into static HTML, so we
// pass them through a small tag allowlist: unknown tags and all attributes are
// dropped, links are forced to open safely, and images get lazy loading.
const ALLOWED_TAGS = new Set([
    'h1', 'h2', 'h3', 'h4', 'p', 'br', 'strong', 'em', 'b', 'i', 'u',
    'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'hr', 'figure', 'figcaption',
]);

function pickAttr(attrs, name) {
    const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'))
        || attrs.match(new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, 'i'));
    return m ? m[1] : '';
}

function sanitizeContent(html) {
    if (!html) return '';
    // Drop script/style blocks entirely (tag + contents).
    html = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');
    html = html.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)\/?>/g,
        (m, close, name, attrs) => {
            name = name.toLowerCase();
            if (!ALLOWED_TAGS.has(name)) return '';
            if (close) return `</${name}>`;
            if (name === 'a') {
                const href = decodeEntities(pickAttr(attrs, 'href'));
                if (!/^https?:\/\//i.test(href)) return '';
                return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener nofollow">`;
            }
            if (name === 'img') {
                const src = decodeEntities(pickAttr(attrs, 'src'));
                if (!/^https?:\/\//i.test(src)) return '';
                const alt = decodeEntities(pickAttr(attrs, 'alt'));
                return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">`;
            }
            // Every other allowed tag keeps its name but sheds all attributes.
            return `<${name}>`;
        });
    return html.trim();
}

function parseFeed(xml) {
    const items = [];
    const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    const channelBlock = xml.slice(0, xml.indexOf('<item>'));
    for (const block of itemBlocks) {
        const rawContent = rawTag(block, 'content:encoded') || rawTag(block, 'description');
        items.push({
            title: tag(block, 'title'),
            link: tag(block, 'link'),
            guid: tag(block, 'guid'),
            pubDate: tag(block, 'pubDate'),
            duration: tag(block, 'itunes:duration'),
            image: attr(block, 'itunes:image', 'href'),
            audio: attr(block, 'enclosure', 'url'),
            excerpt: stripHtml(rawContent).slice(0, 160),
            content: sanitizeContent(rawContent),
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

function durationSeconds(dur) {
    if (!dur) return 0;
    if (/^\d+$/.test(dur)) return Number(dur);
    const parts = dur.split(':').map(Number);
    if (parts.some(isNaN)) return 0;
    return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function formatDuration(dur) {
    const seconds = durationSeconds(dur);
    const min = Math.round(seconds / 60);
    return min > 0 ? `${min} 分钟` : '';
}

function isoDuration(dur) {
    const seconds = durationSeconds(dur);
    if (!seconds) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return 'PT' + (h ? `${h}H` : '') + (m ? `${m}M` : '') + (s ? `${s}S` : '');
}

// Shared chrome so the hub and episode pages stay visually identical.
const NAV = `    <header class="header">
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
    </header>`;

const FOOTER = `    <footer class="footer">
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
    </footer>`;

const HERO_STYLE = `        .podcast-hero {
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
        }`;

function renderPage(feed) {
    const desc = `${feed.title}：${feed.description}。收录全部 ${feed.episodes.length} 期播客节目，每期均有独立页面。`;

    const cards = feed.episodes.map((ep) => {
        const date = formatDate(ep.pubDate);
        const duration = formatDuration(ep.duration);
        const meta = [date, duration].filter(Boolean).join(' · ');
        const cover = ep.image || feed.image;
        return `                    <a class="episode-card" href="${escapeHtml(episodePath(ep.slug))}">
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
${HERO_STYLE}
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
${NAV}

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

${FOOTER}
    <script src="/memory-notify.js"></script>
</body>
</html>
`;
}

function renderEpisode(feed, ep, index) {
    const date = formatDate(ep.pubDate);
    const duration = formatDuration(ep.duration);
    const meta = [date, duration].filter(Boolean).join(' · ');
    const cover = ep.image || feed.image;
    const url = episodeUrl(ep.slug);
    const desc = ep.excerpt || feed.description;

    // Feed is newest-first: the newer episode sits at index-1, older at index+1.
    const newer = feed.episodes[index - 1];
    const older = feed.episodes[index + 1];

    const jsonLd = [
        {
            '@context': 'https://schema.org',
            '@type': 'PodcastEpisode',
            url,
            name: ep.title,
            datePublished: isoDate(ep.pubDate),
            description: desc,
            image: cover,
            duration: isoDuration(ep.duration) || undefined,
            associatedMedia: ep.audio
                ? { '@type': 'MediaObject', contentUrl: ep.audio }
                : undefined,
            partOfSeries: {
                '@type': 'PodcastSeries',
                name: feed.title,
                url: PAGE_URL,
            },
            inLanguage: 'zh-CN',
        },
        {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
                { '@type': 'ListItem', position: 1, name: '播客', item: PAGE_URL },
                { '@type': 'ListItem', position: 2, name: ep.title, item: url },
            ],
        },
    ];

    const audioBlock = ep.audio
        ? `                <audio class="episode-audio" controls preload="none" src="${escapeHtml(ep.audio)}">您的浏览器不支持音频播放，请前往<a href="${escapeHtml(ep.link)}">小宇宙</a>收听。</audio>\n`
        : '';

    const contentBlock = ep.content
        ? `                <div class="article-body">${ep.content}</div>`
        : `                <div class="article-body"><p>${escapeHtml(desc)}</p></div>`;

    const navLinks = [];
    if (older) {
        navLinks.push(`                    <a class="episode-nav-link episode-nav-prev" href="${escapeHtml(episodePath(older.slug))}">
                        <span class="episode-nav-label">上一期</span>
                        <span class="episode-nav-title">${escapeHtml(older.title)}</span>
                    </a>`);
    }
    if (newer) {
        navLinks.push(`                    <a class="episode-nav-link episode-nav-next" href="${escapeHtml(episodePath(newer.slug))}">
                        <span class="episode-nav-label">下一期</span>
                        <span class="episode-nav-title">${escapeHtml(newer.title)}</span>
                    </a>`);
    }
    const episodeNav = navLinks.length
        ? `                <nav class="episode-nav" aria-label="节目导航">
${navLinks.join('\n')}
                </nav>\n`
        : '';

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="baidu-site-verification" content="codeva-nOGnNnjVUh" />
    <title>${escapeHtml(ep.title)} - ${escapeHtml(feed.title)}</title>
    <meta name="description" content="${escapeHtml(desc)}">
    <link rel="canonical" href="${url}" />
    <meta property="og:title" content="${escapeHtml(ep.title)}" />
    <meta property="og:description" content="${escapeHtml(desc)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:type" content="article" />
    <meta property="og:locale" content="zh_CN" />
    <meta property="og:site_name" content="aimunger" />
    <meta property="og:image" content="${escapeHtml(cover)}" />
    <meta property="article:published_time" content="${isoDate(ep.pubDate)}" />
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
        .episode-head {
            display: flex;
            gap: 22px;
            align-items: flex-start;
        }
        .episode-head-cover {
            width: 112px;
            height: 112px;
            border-radius: 14px;
            border: 1px solid var(--color-border);
            box-shadow: 0 4px 16px rgba(26, 26, 26, 0.08);
            flex-shrink: 0;
            object-fit: cover;
        }
        .episode-head-text {
            min-width: 0;
        }
        .episode-audio {
            width: 100%;
            margin: 8px 0 32px;
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
        .episode-nav {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 16px;
            margin: 8px 0 72px;
        }
        .episode-nav-link {
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding: 16px 18px;
            border: 1px solid var(--color-border);
            border-radius: 12px;
            background: var(--color-card-bg);
            text-decoration: none;
            color: var(--color-text);
            transition: border-color 0.2s ease, transform 0.2s ease;
        }
        .episode-nav-link:hover {
            border-color: var(--color-accent);
            transform: translateY(-2px);
        }
        .episode-nav-next {
            text-align: right;
            grid-column: 2;
        }
        .episode-nav-label {
            font-size: 12px;
            color: var(--color-text-secondary);
        }
        .episode-nav-title {
            font-family: var(--font-serif);
            font-size: 14px;
            font-weight: 600;
            line-height: 1.5;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
        @media (max-width: 600px) {
            .episode-head {
                gap: 16px;
            }
            .episode-head-cover {
                width: 76px;
                height: 76px;
                border-radius: 12px;
            }
            .episode-nav {
                grid-template-columns: 1fr;
                margin-bottom: 56px;
            }
            .episode-nav-next {
                grid-column: 1;
                text-align: left;
            }
        }
    </style>
</head>
<body>
${NAV}

    <main class="main">
        <div class="container">
            <article class="article">
                <div class="article-header">
                    <a href="/podcast/" class="article-back">所有节目</a>
                    <div class="episode-head">
                        <img class="episode-head-cover" src="${escapeHtml(cover)}" alt="${escapeHtml(ep.title)}" width="112" height="112">
                        <div class="episode-head-text">
                            <h1 class="article-title">${escapeHtml(ep.title)}</h1>
                            <time class="article-date" datetime="${isoDate(ep.pubDate)}">${escapeHtml(meta)}</time>
                            <div class="podcast-links">
                                <a href="${escapeHtml(ep.link)}" target="_blank" rel="noopener">在小宇宙收听</a>
                                <a href="${FEED_URL}" target="_blank" rel="noopener">RSS 订阅</a>
                            </div>
                        </div>
                    </div>
                </div>
${audioBlock}${contentBlock}
${episodeNav}            </article>
        </div>
    </main>

${FOOTER}
    <script src="/memory-notify.js"></script>
</body>
</html>
`;
}

async function main() {
    // Load slugs assigned on prior builds first, so they survive a snapshot
    // refresh and URLs stay permanent regardless of later title edits.
    const priorSlugs = loadSlugMap();

    let feed = null;
    let fetched = false;
    try {
        const xml = await fetchFeed(FEED_URL);
        feed = parseFeed(xml);
        if (!feed.episodes.length) throw new Error('feed parsed but contains no episodes');
        fetched = true;
    } catch (err) {
        console.warn(`Feed fetch failed (${err.message}), falling back to snapshot`);
        feed = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
        console.log(`Using snapshot: ${feed.title}, ${feed.episodes.length} episodes`);
    }

    assignSlugs(feed, priorSlugs);

    if (fetched) {
        fs.mkdirSync(path.dirname(SNAPSHOT), { recursive: true });
        fs.writeFileSync(SNAPSHOT, JSON.stringify(feed, null, 2) + '\n');
        console.log(`Fetched feed: ${feed.title}, ${feed.episodes.length} episodes (snapshot updated)`);
    }

    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, 'index.html'), renderPage(feed));
    console.log(`Wrote _site/podcast/index.html`);

    let count = 0;
    for (let i = 0; i < feed.episodes.length; i++) {
        const ep = feed.episodes[i];
        if (!ep.slug) {
            console.warn(`Skipping episode with no slug: ${ep.title}`);
            continue;
        }
        const dir = path.join(OUT_DIR, ep.slug);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'index.html'), renderEpisode(feed, ep, i));
        count++;
    }
    console.log(`Wrote ${count} episode pages to _site/podcast/<slug>/index.html`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
