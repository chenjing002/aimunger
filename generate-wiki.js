const fs = require('fs');
const path = require('path');
const { buildJsonLd, injectAlternateMarkdownLink, resolveGitDate } = require('./site-md-utils');

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
  '孙宏斌': 'sun-hongbin',
  '巴菲特': 'warren-buffett',
  '宋卫平': 'song-weiping',
  '新鸿基': 'shkp',
  '方洪波': 'fanghongbo',
  '普洛斯': 'glp',
  '朱保全': 'zhubaoquan',
  '李如成': 'lirucheng',
  '梅志明': 'meizhiming',
  '楼继伟': 'loujiwei',
  '梁海山': 'liang-haishan',
  '比亚迪': 'byd',
  '毛大庆': 'maodaqing',
  '潘樟良': 'panzhangliang',
  '缪建民': 'miaojianmin',
  '王滨': 'wangbin',
  '王银成': 'wangyincheng',
  '白涛': 'baitao',
  '罗熹': 'luoxi',
  '蔡曼莉': 'caimanli',
  '张瑞敏': 'zhang-ruimin',
  '赵燕菁': 'zhaoyanjing',
  '郝建民': 'haojianmin',
  '陈启宗': 'ronnie-chan',
  '陈序平': 'chenxuping',
  '陈东升': 'chen-dongsheng',
  '陈曾熙': 'chan-tseng-hsi',
  '雅戈尔': 'youngor',
  '颜建国': 'yanjianguo',
  '马明哲': 'mamingzhe',
  '高西庆': 'gaoxiqing',
  '海尔': 'haier',
  '黄奇帆': 'huangqifan',
  '黄峥': 'huang-zheng',
  '深基地B': 'shenzhen-chiwan-base',
  '中国平安': 'ping-an',
  '中国太平': 'china-taiping',
  '人保集团': 'picc',
  '中国建筑': 'cscec',
  '中投公司': 'cic',
  '中海发展': 'china-overseas-land',
  '中金公司': 'cicc',
  '华润置地': 'cr-land',
  '融创中国': 'sunac-china',
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
  '豫园股份': 'yuyuan-shares',
  '滔搏': 'topsports',
  '胜华电缆': 'shenghua-cable',
  '起帆电缆': 'qifan-cable',
  '田洪': 'tianhong',
  '贾新耀': 'jiaxinyao',
  '马兴瑞': 'maxingrui',
  '林茂德': 'linmaode',
  '李西廷': 'lixiting',
};

// Old URLs published before their titles had a SLUG_MAP entry (the fallback
// used to percent-encode the title, producing directories that 404 at the
// decoded URL). Serve a redirect at the decoded path → the real slug.
const LEGACY_REDIRECTS = {
  '李西廷': 'lixiting',
};

function getSlug(title) {
  if (!SLUG_MAP[title]) {
    // A percent-encoded directory name can never match the decoded URL
    // crawlers request, so an encodeURIComponent fallback silently 404s.
    // The raw title works as a UTF-8 path; still, add a SLUG_MAP entry.
    console.warn(`SLUG_MAP missing entry for "${title}" — using raw title as slug; add an ASCII slug.`);
    return title;
  }
  return SLUG_MAP[title];
}

// Traditional-character variants for entries whose names differ between
// simplified and traditional Chinese. Used as alternateName in structured
// data so zh-Hant queries (HK/TW/Macau — about a third of impressions)
// match these pages.
const TRADITIONAL_NAMES = {
  '缪建民': '繆建民',
  '陈启宗': '陳啟宗',
  '陈曾熙': '陳曾熙',
  '陈序平': '陳序平',
  '恒隆地产': '恒隆地產',
  '万科': '萬科',
  '万物云': '萬物雲',
  '美的集团': '美的集團',
  '中国平安': '中國平安',
  '中国建筑': '中國建築',
  '中海发展': '中海發展',
  '华润置地': '華潤置地',
  '融创中国': '融創中國',
  '深圳地铁': '深圳地鐵',
  '绿景地产': '綠景地產',
  '越秀地产': '越秀地產',
  '长江电力': '長江電力',
  '龙湖集团': '龍湖集團',
  '招商局集团': '招商局集團',
  '豫园股份': '豫園股份',
  '新鸿基': '新鴻基',
  '比亚迪': '比亞迪',
  '雅戈尔': '雅戈爾',
  '海尔': '海爾',
  '张旭': '張旭',
  '张瑞敏': '張瑞敏',
  '李录': '李錄',
  '孙宏斌': '孫宏斌',
  '孙文杰': '孫文傑',
  '吴亚军': '吳亞軍',
  '赵燕菁': '趙燕菁',
  '单伟建': '單偉建',
  '颜建国': '顏建國',
  '马明哲': '馬明哲',
  '黄奇帆': '黃奇帆',
  '黄峥': '黃崢',
  '华生': '華生',
  '刘元生': '劉元生',
  '郭钧': '郭鈞',
  '高西庆': '高西慶',
  '宋卫平': '宋衛平',
  '毛大庆': '毛大慶',
  '孔庆平': '孔慶平',
  '傅育宁': '傅育寧',
  '楼继伟': '樓繼偉',
  '辛杰': '辛傑',
  '马兴瑞': '馬興瑞',
  '贾新耀': '賈新耀',
  '胜华电缆': '勝華電纜',
  '起帆电缆': '起帆電纜',
};

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

  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/<\/blockquote>\n<blockquote>/g, '\n');

  html = html.split('\n\n').map(block => {
    block = block.trim();
    if (!block) return '';
    if (block.startsWith('<h') || block.startsWith('<ul') || block.startsWith('<blockquote')) return block;
    if (!/^<(h[1-6]|ul|ol|blockquote|div|table|pre|hr)/i.test(block)) return '<p>' + block + '</p>';
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
    '招商局集团', '中投公司', '中金公司', '深圳地铁', '海尔', '融创中国', '豫园股份',
    '滔搏', '胜华电缆', '起帆电缆'
  ];
  if (companies.includes(title)) return 'company';
  return 'person';
}

const TYPE_LABELS = { person: '人物', company: '公司' };

const NAV_HTML = `    <header class="header">
        <nav class="nav container">
            <a href="/" class="logo">
                <span class="logo-icon">M</span>
                <span class="logo-text">aimunger</span>
            </a>
            <ul class="nav-links">
                <li><a href="/resources/">资料库</a></li>
                <li><a href="/wiki/" class="active">Wiki</a></li>
                <li><a href="/blog/">文章</a></li>
                <li class="nav-more">
                    <button type="button" class="nav-more-toggle" aria-haspopup="true" aria-expanded="false">更多<span class="nav-more-caret" aria-hidden="true">▾</span></button>
                    <ul class="nav-more-menu">
                        <li><a href="/data/">数据</a></li>
                        <li><a href="/ankicard/">记忆卡</a></li>
                        <li><a href="/podcast/">播客</a></li>
                        <li><a href="/about/">关于</a></li>
                    </ul>
                </li>
            </ul>
        </nav>
    </header>`;

const FOOTER_HTML = `    <footer class="footer">
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
    </footer>`;

// Extracts the 简介 section as a plain-text page description; falls back to
// the beginning of the whole entry text. Appends the site's angle when there
// is room, so the snippet tells searchers what this page adds over a
// generic encyclopedia entry.
function extractDescription(entry) {
  const match = entry.rawBody && entry.rawBody.match(/##\s*简介\s*\n+([\s\S]*?)(?=\n##\s|\s*$)/);
  const source = match ? match[1] : entry.plainText;
  let plain = stripMarkdown(source);
  if (!plain) return `${entry.title} - aimunger Wiki`;
  const suffix = classifyNode(entry.title) === 'company'
    ? '本页从投资者视角整理其发展沿革、关键数据与最新动态。'
    : '本页从投资与资本配置视角整理其履历、关键决策与最新动态。';
  if (plain.length + suffix.length <= 155 && !plain.includes('视角整理')) {
    plain = `${plain.replace(/[。；;]$/, '')}。${suffix}`;
  }
  return plain.length > 160 ? `${plain.slice(0, 160)}...` : plain;
}

// Builds a differentiated <title>: "名字：身份角色 | 履历、决策与最新动态 - aimunger".
// The role clause comes from the frontmatter description or the 简介 text.
function buildPageTitle(entry) {
  const nodeType = classifyNode(entry.title);
  const descSource = (entry.meta && entry.meta.description) || '';
  const introMatch = entry.rawBody && entry.rawBody.match(/##\s*简介\s*\n+([\s\S]*?)(?=\n##\s|\s*$)/);
  const fallback = introMatch ? stripMarkdown(introMatch[1]) : '';
  let roleText = stripMarkdown(descSource) || fallback;
  // Descriptions often lead with the entry's own name ("恒隆地产（Hang Lung
  // Properties）：港资…"); strip that prefix so the role clause survives.
  if (roleText.startsWith(entry.title)) {
    roleText = roleText.slice(entry.title.length).replace(/^（[^）]*）/, '').replace(/^[：:，,、\s]+/, '');
  }
  // First clause, trimmed of trailing punctuation; skip if too long or empty.
  const role = roleText.split(/[，,。：:；;（(]/)[0].trim();
  const promise = nodeType === 'company' ? '公司沿革、数据与股东信' : '履历、决策与最新动态';
  if (role && role.length >= 4 && role.length <= 22 && role !== entry.title) {
    return `${entry.title}：${role}｜${promise} - aimunger`;
  }
  return `${entry.title}｜${promise} - aimunger Wiki`;
}

function generateArticlePage(entry) {
  const { title, htmlContent } = entry;
  // Thin, templated bios (few characters of real content) read as low-value to
  // search engines and AdSense reviewers. Keep the sparsest ones out of the
  // index and serve them ad-free until they carry enough substance.
  const contentChars = (htmlContent.replace(/<[^>]+>/g, '').match(/[一-鿿]/g) || []).length;
  const noindex = contentChars < 300;
  const pageUrl = `https://aimunger.com/wiki/${getSlug(title)}/`;
  const description = extractDescription(entry);
  const pageTitle = buildPageTitle(entry);
  const nodeType = classifyNode(title);
  const traditional = TRADITIONAL_NAMES[title];
  const createdDate = ((entry.meta && entry.meta.created) || '').slice(0, 10);
  const datePublished = /^\d{4}-\d{2}-\d{2}$/.test(createdDate) ? createdDate : null;
  const dateModified = (entry.sourcePath && resolveGitDate(entry.sourcePath)) || datePublished;

  const jsonLd = buildJsonLd({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    url: pageUrl,
    mainEntityOfPage: pageUrl,
    ...(datePublished ? { datePublished } : {}),
    ...(dateModified ? { dateModified } : {}),
    inLanguage: 'zh-CN',
    about: {
      '@type': nodeType === 'company' ? 'Organization' : 'Person',
      name: title,
      ...(traditional ? { alternateName: traditional } : {}),
      description,
    },
    isPartOf: { '@type': 'WebSite', name: 'aimunger Wiki', url: 'https://aimunger.com/wiki/' },
    publisher: { '@type': 'Organization', name: 'aimunger', url: 'https://aimunger.com' },
  });

  const breadcrumbLd = buildJsonLd({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'aimunger', item: 'https://aimunger.com/' },
      { '@type': 'ListItem', position: 2, name: 'Wiki', item: 'https://aimunger.com/wiki/' },
      { '@type': 'ListItem', position: 3, name: title, item: pageUrl },
    ],
  });

  return injectAlternateMarkdownLink(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">${noindex ? `
    <meta name="robots" content="noindex, follow" />` : ''}
    <meta name="baidu-site-verification" content="codeva-nOGnNnjVUh" />
    <title>${escHtml(pageTitle)}</title>
    <meta name="description" content="${escHtml(description)}">
    <link rel="canonical" href="${pageUrl}" />
    <meta property="og:title" content="${escHtml(pageTitle)}" />
    <meta property="og:description" content="${escHtml(description)}" />
    <meta property="og:url" content="${pageUrl}" />
    <meta property="og:type" content="article" />
    <meta property="og:locale" content="zh_CN" />
    <meta property="og:site_name" content="aimunger" />
    ${jsonLd}
    ${breadcrumbLd}
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;600;700&display=optional" rel="stylesheet">
    <link rel="stylesheet" href="/style.css">
    <link rel="stylesheet" href="/wiki/wiki.css">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">${noindex ? '' : `
    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2876035394247776"
         crossorigin="anonymous"></script>`}
</head>
<body>
${NAV_HTML}

    <main class="main">
        <div class="container">
            <article class="article">
                <div class="article-header">
                    <a href="/wiki/" class="article-back">Wiki</a>
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
</html>`, `/wiki/${getSlug(title)}.md`);
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

/* Pre-compute force layout at build time so the client skips the expensive O(n²) simulation */
function computeBuildLayout(nodes, edges) {
  const degree = {};
  nodes.forEach(n => degree[n.id] = 0);
  edges.forEach(e => {
    degree[e.source] = (degree[e.source] || 0) + 1;
    degree[e.target] = (degree[e.target] || 0) + 1;
  });

  function nodeRadius(deg) {
    return Math.min(0.34 + (deg || 0) * 0.045, 1.05);
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const rng = mulberry32(0x9e37);
  const pos = {};
  const vel = {};
  const ids = nodes.map(n => n.id);
  const radii = {};
  ids.forEach(id => { radii[id] = nodeRadius(degree[id] || 0); });
  ids.forEach(id => {
    pos[id] = [(rng() * 2 - 1) * 6, (rng() * 2 - 1) * 6, (rng() * 2 - 1) * 4.5];
    vel[id] = [0, 0, 0];
  });
  const links = edges.map(e => [e.source, e.target]);
  const REST = 3.2;

  for (let iter = 0; iter < 420; iter++) {
    const cool = 1 - iter / 460;
    for (let i = 0; i < ids.length; i++) {
      const a = pos[ids[i]], ri = radii[ids[i]], di = degree[ids[i]] || 0;
      for (let j = i + 1; j < ids.length; j++) {
        const b = pos[ids[j]], rj = radii[ids[j]], dj = degree[ids[j]] || 0;
        let dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
        let d2 = dx * dx + dy * dy + dz * dz + 0.05;
        let d = Math.sqrt(d2);
        const densityFactor = 1 + (di + dj) * 0.08;
        const minClearance = (ri + rj) * 2.8;
        const collisionBoost = d < minClearance ? (minClearance - d) * 0.35 : 0;
        const f = ((3.8 * densityFactor) / d2 + collisionBoost / d) * cool;
        const ux = dx / d, uy = dy / d, uz = dz / d;
        vel[ids[i]][0] += ux * f; vel[ids[i]][1] += uy * f; vel[ids[i]][2] += uz * f;
        vel[ids[j]][0] -= ux * f; vel[ids[j]][1] -= uy * f; vel[ids[j]][2] -= uz * f;
      }
    }
    links.forEach(([s, t]) => {
      const a = pos[s], b = pos[t];
      if (!a || !b) return;
      let dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      let d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.001;
      const f = (d - REST) * 0.06 * cool;
      const ux = dx / d, uy = dy / d, uz = dz / d;
      vel[s][0] += ux * f; vel[s][1] += uy * f; vel[s][2] += uz * f;
      vel[t][0] -= ux * f; vel[t][1] -= uy * f; vel[t][2] -= uz * f;
    });
    ids.forEach(id => {
      const p = pos[id], v = vel[id];
      v[0] -= p[0] * 0.014; v[1] -= p[1] * 0.014; v[2] -= p[2] * 0.014;
      p[0] += v[0] * 0.85; p[1] += v[1] * 0.85; p[2] += v[2] * 0.85;
      v[0] *= 0.55; v[1] *= 0.55; v[2] *= 0.55;
    });
  }

  for (let pass = 0; pass < 60; pass++) {
    for (let i = 0; i < ids.length; i++) {
      const ri = radii[ids[i]], labelClearance = 0.6;
      for (let j = i + 1; j < ids.length; j++) {
        const rj = radii[ids[j]];
        const a = pos[ids[i]], b = pos[ids[j]];
        let dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
        let d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.001;
        const minDist = (ri + rj) * 2.2 + labelClearance * 2;
        if (d < minDist) {
          const push = (minDist - d) * 0.15;
          const ux = dx / d, uy = dy / d, uz = dz / d;
          a[0] += ux * push; a[1] += uy * push; a[2] += uz * push;
          b[0] -= ux * push; b[1] -= uy * push; b[2] -= uz * push;
        }
      }
    }
  }

  const out = {};
  ids.forEach(id => {
    out[id] = [
      Math.round(pos[id][0] * 100) / 100,
      Math.round(pos[id][1] * 100) / 100,
      Math.round(pos[id][2] * 100) / 100
    ];
  });
  return out;
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
    const sourcePath = path.join(WIKI_SOURCE, file);
    const raw = fs.readFileSync(sourcePath, 'utf-8');
    const { meta, body } = parseFrontmatter(raw);
    const title = file.replace('.md', '');
    let cleaned = removeAtomicNotesSection(body);
    // The page template already renders the title as <h1>; drop the
    // markdown's own leading h1 so pages keep a single h1.
    cleaned = cleaned.replace(/^#\s+.+\n+/, '');
    const links = extractLinks(cleaned).filter(name => wikiNames.has(name));
    const htmlContent = markdownToHtml(cleaned, wikiNames);
    const plainText = stripMarkdown(cleaned);

    entries.push({ title, meta, links, htmlContent, plainText, rawBody: cleaned, sourcePath });
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
  const keepFiles = new Set(['data.json', 'index.html', 'wiki.css', 'wiki-graph.js']);
  const slugSet = new Set(entries.map(e => getSlug(e.title)));
  for (const name of Object.keys(LEGACY_REDIRECTS)) slugSet.add(name);
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
    fs.writeFileSync(path.join(dir, 'index.html'), generateArticlePage(e));
  }

  for (const [oldName, slug] of Object.entries(LEGACY_REDIRECTS)) {
    const target = `https://aimunger.com/wiki/${slug}/`;
    const dir = path.join(WIKI_DIR, oldName);
    fs.mkdirSync(dir, { recursive: true });
    // noindex keeps the stub out of the generated sitemap; crawlers treat an
    // instant meta refresh as a permanent redirect to the canonical URL.
    fs.writeFileSync(path.join(dir, 'index.html'), `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0; url=${target}">
<link rel="canonical" href="${target}">
<title>${escHtml(oldName)}</title>
</head>
<body><p>页面已迁移：<a href="${target}">${target}</a></p></body>
</html>
`);
  }

  const layout = computeBuildLayout(nodes, edges);
  const wikiData = { nodes, edges, search: searchData, layout };
  fs.writeFileSync(path.join(WIKI_DIR, 'data.json'), JSON.stringify(wikiData));
  fs.writeFileSync(path.join(WIKI_DIR, 'index.html'), generateIndexPage(entries));
  fs.writeFileSync(path.join(WIKI_DIR, 'wiki.css'), generateWikiCSS());
  fs.copyFileSync(path.join(__dirname, 'wiki-graph.js'), path.join(WIKI_DIR, 'wiki-graph.js'));

  console.log(`Generated ${entries.length} wiki pages`);
}

function generateIndexPage(entries) {
  const sorted = [...entries].sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
  const personCount = sorted.filter(e => classifyNode(e.title) === 'person').length;
  const companyCount = sorted.filter(e => classifyNode(e.title) === 'company').length;
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

  return injectAlternateMarkdownLink(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="baidu-site-verification" content="codeva-nOGnNnjVUh" />
    <title>Wiki - aimunger</title>
    <meta name="description" content="aimunger 投资知识图谱：关键人物、公司及其关联，从投资视角梳理履历、关键决策与最新动态。">
    <link rel="canonical" href="https://aimunger.com/wiki/" />
    <meta property="og:title" content="Wiki - aimunger" />
    <meta property="og:description" content="aimunger 投资知识图谱：关键人物、公司及其关联，从投资视角梳理履历、关键决策与最新动态。" />
    <meta property="og:url" content="https://aimunger.com/wiki/" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="zh_CN" />
    <meta property="og:site_name" content="aimunger" />
    ${buildJsonLd({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'aimunger Wiki',
      description: 'aimunger 投资知识图谱：关键人物、公司及其关联，从投资视角梳理履历、关键决策与最新动态。',
      url: 'https://aimunger.com/wiki/',
      inLanguage: 'zh-CN',
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: sorted.length,
        itemListElement: sorted.map((e, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: e.title,
          url: `https://aimunger.com/wiki/${getSlug(e.title)}/`,
        })),
      },
    })}
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;600;700&display=optional" rel="stylesheet">
    <link rel="stylesheet" href="/style.css">
    <link rel="stylesheet" href="/wiki/wiki.css">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <script type="importmap">
    {
      "imports": {
        "react": "https://esm.sh/react@18.3.1",
        "react/jsx-runtime": "https://esm.sh/react@18.3.1/jsx-runtime",
        "react-dom": "https://esm.sh/react-dom@18.3.1",
        "react-dom/client": "https://esm.sh/react-dom@18.3.1/client",
        "three": "https://esm.sh/three@0.160.1",
        "@react-three/fiber": "https://esm.sh/@react-three/fiber@8.17.10?external=react,react-dom,three",
        "@react-three/drei": "https://esm.sh/@react-three/drei@9.114.3?external=react,react-dom,three,@react-three/fiber",
        "gsap": "https://esm.sh/gsap@3.12.5",
        "htm": "https://esm.sh/htm@3.1.1"
      }
    }
    </script>
    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2876035394247776"
         crossorigin="anonymous"></script>
</head>
<body>
${NAV_HTML}

    <main class="main">
        <div class="container">
            <section class="hero">
                <h1 class="hero-title">Wiki</h1>
                <p class="hero-desc">投资知识图谱：关键人物、公司及其关联。</p>
                <div class="wiki-stats">
                    <span class="wiki-stat type-person"><strong>${personCount}</strong> 人物</span>
                    <span class="wiki-stat type-company"><strong>${companyCount}</strong> 公司</span>
                </div>
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

        </div>
    </main>

${FOOTER_HTML}

    <section class="wiki-graph-section" id="wiki-graph-section">
        <button class="wiki-graph-close" id="wiki-graph-close" title="关闭图谱">&times;</button>
        <div id="wiki-graph-root" class="wiki-graph-root">
            <div class="wiki-graph-loading">正在加载图谱…</div>
        </div>
    </section>

    <script>
${generateGraphScript()}
    </script>
</body>
</html>`, '/wiki/index.md');
}

function generateGraphScript() {
  return `(function() {
  'use strict';

  var searchInput = document.getElementById('wiki-search');
  var graphSection = document.getElementById('wiki-graph-section');
  var graphRoot = document.getElementById('wiki-graph-root');
  var graphClose = document.getElementById('wiki-graph-close');
  var listCards = document.querySelectorAll('.wiki-card');
  var viewBtns = document.querySelectorAll('.wiki-view-btn');
  var graphMounted = false;

  function applyListSearch(q) {
    q = (q || '').toLowerCase();
    listCards.forEach(function(card) {
      var title = card.getAttribute('data-title').toLowerCase();
      var ex = card.querySelector('.wiki-card-excerpt').textContent.toLowerCase();
      card.style.display = (title.includes(q) || ex.includes(q)) ? '' : 'none';
    });
  }

  function mountGraph() {
    if (graphMounted) return;
    graphMounted = true;
    import('/wiki/wiki-graph.js')
      .then(function(m) { m.mountWikiGraph(graphRoot); })
      .catch(function(err) {
        graphRoot.innerHTML = '<div class="wiki-graph-loading">图谱加载失败：' + String(err && err.message).replace(/</g, '&lt;') + '</div>';
      });
  }

  function openGraph() {
    graphSection.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    if (location.hash !== '#graph') history.replaceState(null, '', '#graph');
    mountGraph();
  }

  function closeGraph() {
    graphSection.classList.remove('is-open');
    document.body.style.overflow = '';
    if (location.hash === '#graph') history.replaceState(null, '', location.pathname + location.search);
    viewBtns.forEach(function(b) {
      b.classList.toggle('active', b.getAttribute('data-view') === 'list');
    });
  }

  viewBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var view = this.getAttribute('data-view');
      viewBtns.forEach(function(b) { b.classList.remove('active'); });
      this.classList.add('active');
      if (view === 'graph') {
        openGraph();
      } else {
        closeGraph();
      }
    });
  });

  graphClose.addEventListener('click', closeGraph);

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && graphSection.classList.contains('is-open')) {
      closeGraph();
    }
  });

  searchInput.addEventListener('input', function() { applyListSearch(this.value.trim()); });

  // Deep link: /wiki/#graph opens the graph view directly
  if (location.hash === '#graph') {
    viewBtns.forEach(function(b) {
      b.classList.toggle('active', b.getAttribute('data-view') === 'graph');
    });
    openGraph();
  }

  // Prefetch graph module and all dependencies during idle time
  function prefetchGraph() {
    import('/wiki/wiki-graph.js').catch(function() {});
  }
  if ('requestIdleCallback' in window) {
    requestIdleCallback(prefetchGraph);
  } else {
    setTimeout(prefetchGraph, 2000);
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
    background: #f0f0f0;
    color: #1a1a1a;
}

.wiki-card-type.type-company {
    background: #fbe8e4;
    color: #8b2500;
}

.wiki-stats {
    display: flex;
    gap: 10px;
    margin-top: 18px;
    flex-wrap: wrap;
}

.wiki-stat {
    font-size: 13px;
    padding: 4px 12px;
    border-radius: 999px;
    font-weight: 500;
}

.wiki-stat strong {
    font-weight: 700;
}

.wiki-stat.type-person {
    background: #f0f0f0;
    color: #1a1a1a;
}

.wiki-stat.type-company {
    background: #fbe8e4;
    color: #8b2500;
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

/* === Spatial graph (full-screen overlay, slides in from right) === */
.wiki-graph-section {
    --g-panel-w: 400px;
    --g-ink: #26241f;
    --g-ink-soft: #8a857b;
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: #ebe8e2;
    transform: translateX(100%);
    transition: transform 0.45s cubic-bezier(0.32, 0.72, 0, 1);
    will-change: transform;
}
.wiki-graph-section.is-open {
    transform: translateX(0);
}
.wiki-graph-close {
    position: absolute;
    top: 18px;
    right: 22px;
    z-index: 40; /* above node labels and canvas overlays */
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 1px solid rgba(58, 54, 46, 0.18);
    background: rgba(255, 255, 255, 0.65);
    color: #3a382f;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s ease, border-color 0.2s ease;
    backdrop-filter: blur(4px);
}
.wiki-graph-close:hover {
    background: rgba(255, 255, 255, 0.95);
    border-color: rgba(58, 54, 46, 0.4);
}
.wiki-graph-root {
    width: 100%;
    height: 100%;
}
.wiki-graph-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--g-ink-soft);
    font-size: 14px;
    letter-spacing: 0.04em;
}

/* layout */
.g-root {
    display: flex;
    width: 100%;
    height: 100%;
    background: #ebe8e2;
}
.g-canvas-wrap {
    position: relative;
    flex: 1;
    min-width: 0;
    height: 100%;
}
.g-canvas-wrap canvas {
    display: block;
    touch-action: none;
}
.g-panel {
    width: var(--g-panel-w);
    flex-shrink: 0;
    height: 100%;
    box-sizing: border-box;
    padding: 40px 36px 26px;
    background: #ffffff;
    border-left: 1px solid rgba(58, 54, 46, 0.13);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

/* overlays on the canvas */
.g-brand {
    position: absolute;
    left: 28px;
    bottom: 22px;
    font-size: 10.5px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--g-ink-soft);
    pointer-events: none;
}
.g-legend {
    position: absolute;
    left: 28px;
    bottom: 24px;
    z-index: 30;
    display: flex;
    gap: 16px;
    font-size: 11px;
    color: #6f6a60;
    pointer-events: none;
}
.g-legend span {
    display: inline-flex;
    align-items: center;
    gap: 7px;
}
.g-legend-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
}
.g-legend-dot.is-pe { background: #2a2723; }
.g-legend-dot.is-co { background: #8b2500; }
.g-search {
    position: absolute;
    top: 26px;
    left: 28px;
    width: 230px;
    z-index: 30; /* above node labels (zIndexRange caps at 10) */
}
.g-search-input {
    width: 100%;
    box-sizing: border-box;
    padding: 9px 14px;
    font-family: var(--font-serif);
    font-size: 13.5px;
    color: var(--g-ink);
    background: rgba(255, 255, 255, 0.55);
    border: 1px solid rgba(58, 54, 46, 0.16);
    border-radius: 100px;
    outline: none;
    transition: border-color 0.2s ease, background 0.2s ease;
}
.g-search-input:focus {
    border-color: #8b2500;
    background: rgba(255, 255, 255, 0.85);
}
.g-search-results {
    margin-top: 8px;
    background: rgba(252, 251, 248, 0.96);
    border: 1px solid rgba(58, 54, 46, 0.12);
    border-radius: 12px;
    padding: 6px;
    box-shadow: 0 12px 40px -16px rgba(40, 37, 30, 0.35);
    backdrop-filter: blur(6px);
}
.g-search-item {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    padding: 8px 10px;
    border: none;
    background: none;
    border-radius: 8px;
    font-family: var(--font-serif);
    font-size: 13.5px;
    color: #3a382f;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease;
}
.g-search-item:hover {
    background: rgba(58, 54, 46, 0.07);
}
.g-zoom {
    position: absolute;
    right: 22px;
    bottom: 22px;
    z-index: 30; /* above node labels */
    display: flex;
    flex-direction: column;
    gap: 7px;
}
.g-zoom button {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 1px solid rgba(58, 54, 46, 0.16);
    background: rgba(255, 255, 255, 0.55);
    color: #3a382f;
    font-size: 17px;
    line-height: 1;
    cursor: pointer;
    transition: background 0.18s ease, border-color 0.18s ease;
}
.g-zoom button:hover {
    background: rgba(255, 255, 255, 0.9);
    border-color: rgba(58, 54, 46, 0.35);
}

/* node labels (billboarded via drei Html) */
.g-label {
    font-family: var(--font-serif);
    font-size: 10px;
    letter-spacing: 0.12em;
    color: #8a857b;
    white-space: nowrap;
    pointer-events: auto;
    cursor: pointer;
    user-select: none;
    transition: opacity 0.4s ease, transform 0.4s ease;
    animation: gLabelIn 0.5s ease both;
}
.g-label-focus {
    color: #1f1d18;
    font-weight: 600;
    font-size: 13px;
    letter-spacing: 0.04em;
    opacity: 1;
    background: rgba(235, 232, 226, 0.88);
    padding: 2px 8px;
    border-radius: 4px;
}
.g-label-neighbor {
    color: #4a473f;
    font-size: 11px;
    letter-spacing: 0.1em;
    opacity: 0.85;
}
.g-label-hover {
    color: #2a2723;
    font-size: 12px;
    letter-spacing: 0.06em;
    opacity: 1;
}
.g-label-idle {
    color: #635f57;
    font-size: 10.5px;
    opacity: 0.95;
}
@keyframes gLabelIn {
    from { opacity: 0; transform: translateY(4px); }
    to { transform: translateY(0); }
}

/* right detail panel content */
.g-panel-inner {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    animation: panelFadeIn 0.45s cubic-bezier(0.22, 0.61, 0.36, 1) both;
}
@keyframes panelFadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}
.g-eyebrow {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-size: 10.5px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #9a958b;
    margin-bottom: 20px;
}
.g-count {
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.1em;
}
.g-title {
    font-family: var(--font-serif);
    font-size: 38px;
    line-height: 1.14;
    font-weight: 600;
    color: var(--g-ink);
    letter-spacing: -0.01em;
    margin: 0 0 18px;
}
.g-desc {
    font-size: 14px;
    line-height: 1.85;
    color: #524e45;
    margin: 0 0 28px;
}
.g-section-label {
    font-size: 10.5px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #9a958b;
    margin-bottom: 13px;
}
.g-section-label.g-muted {
    color: #b3aea4;
}
.g-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 28px;
}
.g-pill {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 7px 13px;
    border: 1px solid rgba(58, 54, 46, 0.18);
    border-radius: 100px;
    background: transparent;
    font-family: var(--font-serif);
    font-size: 13px;
    color: #3a382f;
    cursor: pointer;
    transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}
.g-pill:hover {
    background: var(--g-ink);
    color: #f3f1ec;
    border-color: var(--g-ink);
}
.g-pill:hover .g-pill-dot {
    background: #cfcabf;
}
.g-pill-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
}
.g-pill-dot.is-pe { background: #262320; }
.g-pill-dot.is-co { background: #8b2500; } /* match company node color */
.g-actions {
    margin-bottom: 22px;
}
.g-read {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 11px 20px;
    background: var(--g-ink);
    color: #f3f1ec;
    border-radius: 100px;
    font-family: var(--font-serif);
    font-size: 13.5px;
    text-decoration: none;
    transition: opacity 0.2s ease;
}
.g-read:hover { opacity: 0.85; }
.g-arrow { font-size: 12px; }
.g-nav {
    display: flex;
    gap: 14px;
    margin-top: auto;
    padding-top: 18px;
    border-top: 1px solid rgba(58, 54, 46, 0.13);
}
.g-nav-btn {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    padding: 2px 0;
    transition: opacity 0.18s ease;
}
.g-nav-btn:hover { opacity: 0.6; }
.g-nav-next {
    text-align: right;
    align-items: flex-end;
}
.g-nav-k {
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #9a958b;
}
.g-nav-t {
    font-family: var(--font-serif);
    font-size: 14px;
    color: #3a382f;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
}

/* Graph: stack panel as a bottom sheet on narrow screens */
@media (max-width: 880px) {
    .wiki-graph-close {
        top: 12px;
        right: 14px;
        width: 36px;
        height: 36px;
    }
    .g-root {
        flex-direction: column;
    }
    .g-canvas-wrap {
        height: auto;
        min-height: 0;
        flex: 1 1 56%;
    }
    .g-panel {
        width: 100%;
        flex: 0 0 auto;
        height: auto;
        max-height: 46%;
        border-left: none;
        border-top: 1px solid rgba(58, 54, 46, 0.13);
        padding: 22px 22px 18px;
        overflow-y: auto;
    }
    .g-panel-inner {
        flex: none;
    }
    .g-nav {
        margin-top: 16px;
    }
    .g-title {
        font-size: 28px;
    }
    .g-search {
        width: 180px;
    }
}

`;
}

run();
