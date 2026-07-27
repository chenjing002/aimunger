const fs = require('fs');
const path = require('path');
const {
  buildExcerpt,
  buildJsonLd,
  escapeHtml,
  injectAlternateMarkdownLink,
  parseSimpleMeta,
  renderMarkdownToHtml,
  resolveGitDate,
  resolvePublishDate,
  splitFrontmatter,
} = require('./site-md-utils');

const SITE_DIR = path.join(__dirname, '_site');
const CI_QA_PATH = path.join(__dirname, '_build', 'llm-reader', 'qa.html');
const LOCAL_QA_PATH = path.join(__dirname, '..', 'LLM-reader', 'publish', 'qa.html');
const QA_HTML_PATH = fs.existsSync(CI_QA_PATH) ? CI_QA_PATH : LOCAL_QA_PATH;
const ARTICLES_DIR = path.join(SITE_DIR, 'blog');
const BLOG_DIR = path.join(__dirname, 'blog');
const INDEX_PATH = path.join(__dirname, 'index.html');
const SITE_INDEX_PATH = path.join(SITE_DIR, 'index.html');

// Pinyin mapping for Chinese name characters
const PINYIN = {
  '赵':'zhao','钱':'qian','孙':'sun','李':'li','周':'zhou','吴':'wu','郑':'zheng','王':'wang',
  '冯':'feng','陈':'chen','蒋':'jiang','沈':'shen','韩':'han','杨':'yang','朱':'zhu','秦':'qin',
  '许':'xu','何':'he','吕':'lv','张':'zhang','孔':'kong','曹':'cao','严':'yan','华':'hua',
  '金':'jin','魏':'wei','陶':'tao','姜':'jiang','谢':'xie','邹':'zou','苏':'su','潘':'pan',
  '范':'fan','彭':'peng','鲁':'lu','马':'ma','方':'fang','任':'ren','袁':'yuan','柳':'liu',
  '唐':'tang','薛':'xue','雷':'lei','贺':'he','倪':'ni','汤':'tang','罗':'luo','郝':'hao',
  '安':'an','常':'chang','于':'yu','傅':'fu','齐':'qi','康':'kang','余':'yu','顾':'gu',
  '孟':'meng','黄':'huang','萧':'xiao','尹':'yin','姚':'yao','邵':'shao','汪':'wang','毛':'mao',
  '狄':'di','贝':'bei','明':'ming','戴':'dai','宋':'song','董':'dong','梁':'liang','杜':'du',
  '郭':'guo','林':'lin','钟':'zhong','徐':'xu','高':'gao','夏':'xia','蔡':'cai','田':'tian',
  '胡':'hu','万':'wan','丁':'ding','邓':'deng','单':'shan','洪':'hong','龚':'gong','程':'cheng',
  '崔':'cui','陆':'lu','石':'shi','侯':'hou','段':'duan','龙':'long','叶':'ye','刘':'liu',
  '白':'bai','乔':'qiao','江':'jiang','童':'tong','阎':'yan','谭':'tan','廖':'liao','邱':'qiu',
  '卢':'lu','莫':'mo','贾':'jia','温':'wen','薄':'bo','窦':'dou','章':'zhang','鲍':'bao',
  '伟':'wei','建':'jian','燕':'yan','菁':'jing','国':'guo','强':'qiang','军':'jun','平':'ping',
  '文':'wen','辉':'hui','志':'zhi','永':'yong','新':'xin','海':'hai','天':'tian','杰':'jie',
  '东':'dong','波':'bo','飞':'fei','芳':'fang','英':'ying','敏':'min','刚':'gang','勇':'yong',
  '毅':'yi','俊':'jun','峰':'feng','浩':'hao','亮':'liang','磊':'lei','民':'min','德':'de',
  '忠':'zhong','良':'liang','光':'guang','清':'qing','嘉':'jia','雪':'xue','思':'si','涛':'tao',
  '超':'chao','达':'da','鹏':'peng','宇':'yu','晨':'chen','旭':'xu','阳':'yang','泽':'ze',
  '博':'bo','瑞':'rui','睿':'rui','轩':'xuan','恒':'heng','翔':'xiang','铭':'ming','晖':'hui',
  '子':'zi','远':'yuan','立':'li','聪':'cong','宏':'hong','祥':'xiang','福':'fu','兴':'xing',
  '春':'chun','玉':'yu','丽':'li','红':'hong','静':'jing','慧':'hui','琳':'lin','洁':'jie',
  '婷':'ting','雅':'ya','晴':'qing','云':'yun','成':'cheng','松':'song','庆':'qing','正':'zheng',
  '学':'xue','生':'sheng','才':'cai','富':'fu','利':'li','长':'chang','凡':'fan','佳':'jia',
  '欣':'xin','一':'yi','定':'ding','鑫':'xin','武':'wu','景':'jing','力':'li','源':'yuan',
  '进':'jin','坤':'kun','昊':'hao','尧':'yao','政':'zheng','谦':'qian','厚':'hou','义':'yi',
  '才':'cai','发':'fa','秀':'xiu','梅':'mei','兰':'lan','艳':'yan','素':'su','珍':'zhen',
  '萍':'ping','颖':'ying','琴':'qin','倩':'qian','瑶':'yao','薇':'wei','露':'lu','璐':'lu',
};

function extractData(html) {
  const match = html.match(/var DATA=(\[[\s\S]*?\]);\s*\n/);
  if (!match) return [];
  return JSON.parse(match[1]);
}

function extractName(qa) {
  const answer = (qa.answer || '').replace(/\*\*/g, '');
  const firstSegment = answer.split(/[，,。（\(\n]/)[0].trim();
  const nameMatch = firstSegment.match(/^([\u4e00-\u9fff]{2,3})/);
  if (nameMatch) return nameMatch[1];

  const qMatch = (qa.question || '').match(/([\u4e00-\u9fff]{2,3})/);
  if (qMatch) return qMatch[1];

  return null;
}

function toPinyin(name) {
  const parts = [...name].map(c => PINYIN[c]).filter(Boolean);
  return parts.length >= 2 ? parts.join('-') : null;
}

function generateSlug(qa) {
  const name = extractName(qa);
  if (name) {
    const pinyin = toPinyin(name);
    if (pinyin) return pinyin;
  }
  return `post-${qa.id}`;
}

// Pulls the first inline image URL for the social-share preview. Only matches
// absolute https URLs — the same constraint the body renderer uses — so the
// og:image always points at an image that actually renders on the page.
function extractFirstImage(markdown) {
  const m = (markdown || '').match(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/);
  return m ? m[1] : null;
}

function generateArticlePage(article) {
  const contentHtml = renderMarkdownToHtml(article.answer);
  const ogImage = extractFirstImage(article.answer);
  const dateStr = (article.created_at || '').slice(0, 10);
  const mdHref = `/blog/${article.slug}.md`;
  const pageUrl = `https://aimunger.com/blog/${article.slug}/`;
  const description = buildExcerpt(article.answer, 160);
  // Machine-readable dates: archival posts carry the original document's
  // date in frontmatter, so publish/modified dates come from git instead.
  const publishedDate = article.filePath ? resolvePublishDate(article.filePath, article.created_at) : dateStr;
  const modifiedDate = (article.filePath && resolveGitDate(article.filePath)) || publishedDate;

  const jsonLd = buildJsonLd({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description,
    url: pageUrl,
    mainEntityOfPage: pageUrl,
    ...(publishedDate ? { datePublished: publishedDate } : {}),
    ...(modifiedDate ? { dateModified: modifiedDate } : {}),
    inLanguage: 'zh-CN',
    ...(ogImage ? { image: ogImage } : {}),
    isPartOf: { '@type': 'Blog', name: 'aimunger 文章', url: 'https://aimunger.com/blog/' },
    publisher: { '@type': 'Organization', name: 'aimunger', url: 'https://aimunger.com' },
  });

  // Social-share preview: only emitted when the post has an image, so posts
  // without one keep the default (text-only) card rather than a broken image.
  const ogImageTags = ogImage ? `
    <meta property="og:image" content="${escapeHtml(ogImage)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${escapeHtml(ogImage)}" />` : '';

  return injectAlternateMarkdownLink(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="referrer" content="no-referrer">${article.noindex ? `
    <meta name="robots" content="noindex, follow" />` : ''}
    <meta name="baidu-site-verification" content="codeva-nOGnNnjVUh" />
    <title>${escapeHtml(article.title)} - aimunger</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${pageUrl}" />
    <meta property="og:title" content="${escapeHtml(article.title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${pageUrl}" />
    <meta property="og:type" content="article" />
    <meta property="og:locale" content="zh_CN" />
    <meta property="og:site_name" content="aimunger" />${ogImageTags}${publishedDate ? `
    <meta property="article:published_time" content="${escapeHtml(publishedDate)}" />` : ''}${modifiedDate ? `
    <meta property="article:modified_time" content="${escapeHtml(modifiedDate)}" />` : ''}
    ${jsonLd}
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;600;700&display=optional" rel="stylesheet">
    <link rel="stylesheet" href="/style.css">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">${article.paywallStub ? '' : `
    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2876035394247776"
         crossorigin="anonymous"></script>`}
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
                <li><a href="/blog/" class="active">文章</a></li>
                <li><a href="/data/">数据</a></li>
                <li><a href="/ankicard/">记忆卡</a></li>
                <li><a href="/about/">关于</a></li>
            </ul>
        </nav>
    </header>

    <main class="main">
        <div class="container">
            <article class="article">
                <div class="article-header">
                    <a href="/blog/" class="article-back">所有文章</a>
                    <h1 class="article-title">${escapeHtml(article.title)}</h1>
                    <time class="article-date">${escapeHtml(dateStr)}</time>
                </div>
                <div class="article-body">${contentHtml}</div>
            </article>
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
</body>
</html>`, mdHref);
}

const BLOG_INDEX_DESC = '优质长文、公司案例研究、投资人访谈与书籍笔记。';

function generateListingPage(articles) {
  const cards = articles.map(a => {
    const dateStr = (a.created_at || '').slice(0, 10);
    return `                    <a href="/blog/${a.slug}/" class="blog-link">
                            <span class="blog-link-title">${escapeHtml(a.title)}</span>
                            <time class="blog-link-date">${escapeHtml(dateStr)}</time>
                    </a>`;
  }).join('\n');

  const jsonLd = buildJsonLd({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'aimunger 文章',
    description: BLOG_INDEX_DESC,
    url: 'https://aimunger.com/blog/',
    inLanguage: 'zh-CN',
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: articles.length,
      itemListElement: articles.slice(0, 100).map((a, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: a.title,
        url: `https://aimunger.com/blog/${a.slug}/`,
      })),
    },
  });

  return injectAlternateMarkdownLink(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="baidu-site-verification" content="codeva-nOGnNnjVUh" />
    <title>文章 - aimunger</title>
    <meta name="description" content="${escapeHtml(BLOG_INDEX_DESC)}">
    <link rel="canonical" href="https://aimunger.com/blog/" />
    <meta property="og:title" content="文章 - aimunger" />
    <meta property="og:description" content="${escapeHtml(BLOG_INDEX_DESC)}" />
    <meta property="og:url" content="https://aimunger.com/blog/" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="zh_CN" />
    <meta property="og:site_name" content="aimunger" />
    ${jsonLd}
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;600;700&display=optional" rel="stylesheet">
    <link rel="stylesheet" href="/style.css">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2876035394247776"
         crossorigin="anonymous"></script>
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
                <li><a href="/blog/" class="active">文章</a></li>
                <li><a href="/data/">数据</a></li>
                <li><a href="/ankicard/">记忆卡</a></li>
                <li><a href="/about/">关于</a></li>
            </ul>
        </nav>
    </header>

    <main class="main">
        <div class="container">
            <section class="hero">
                <h1 class="hero-title">文章</h1>
                <p class="hero-desc">${escapeHtml(BLOG_INDEX_DESC)}</p>
            </section>

            <section class="projects">
                <div class="articles-list">
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
</body>
</html>`, '/blog/index.md');
}

function loadBlogArticles() {
  if (!fs.existsSync(BLOG_DIR)) return [];
  return fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.md')).map(f => {
    const filePath = path.join(BLOG_DIR, f);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter, body } = splitFrontmatter(raw);
    const meta = parseSimpleMeta(frontmatter);
    let title = meta.title || f.replace(/\.md$/, '');
    // Strip surrounding quotes from title
    title = title.replace(/^"(.*)"$/, '$1');
    const content = body.trim();
    return {
      slug: meta.slug || f.replace(/\.md$/, ''),
      title,
      answer: content,
      created_at: meta.date || '',
      filePath,
      // Posts that cite an external 原文地址 are translations/reposts syndicated
      // from the author's WeChat 公众号 (or third-party works). They are kept
      // for readers but excluded from search indexing so the site's indexed
      // surface is its original material (book notes, wiki, original essays).
      noindex: /原文地址/.test(content),
      // Paywall stubs have no on-page content — just a "本文为付费文章" notice and
      // a link out. Serving ads on a content-empty page violates AdSense policy,
      // so these (unlike full-text reposts) are also stripped of ad code.
      paywallStub: /本文为付费文章/.test(content),
    };
  });
}

function run() {
  let articles = [];

  // Load blog markdown articles only
  articles = loadBlogArticles();

  if (!articles.length) {
    console.log('No articles found');
    return;
  }

  // Sort by date descending
  articles.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

  // Deduplicate slugs
  const seen = {};
  for (const a of articles) {
    if (seen[a.slug]) {
      a.slug = `${a.slug}-${a.id}`;
    }
    seen[a.slug] = true;
  }

  fs.mkdirSync(ARTICLES_DIR, { recursive: true });
  fs.writeFileSync(path.join(ARTICLES_DIR, 'index.html'), generateListingPage(articles));

  for (const article of articles) {
    const dir = path.join(ARTICLES_DIR, article.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), generateArticlePage(article));
  }

  // Inject latest 3 posts into index.html
  const latest = articles.slice(0, 3);
  if (latest.length > 0 && fs.existsSync(INDEX_PATH)) {
    const latestCards = latest.map(a => {
      const dateStr = (a.created_at || '').slice(0, 10);
      return `                    <a href="/blog/${a.slug}/" class="blog-link">
                            <span class="blog-link-title">${escapeHtml(a.title)}</span>
                            <time class="blog-link-date">${escapeHtml(dateStr)}</time>
                    </a>`;
    }).join('\n');

    const sectionContent = `
            <section class="projects">
                <h2 class="section-title">最新文章</h2>
                <div class="articles-list">
${latestCards}
                </div>
            </section>`;

    for (const targetPath of [INDEX_PATH, SITE_INDEX_PATH]) {
      if (!fs.existsSync(targetPath)) continue;
      let indexHtml = fs.readFileSync(targetPath, 'utf-8');
      const startMarker = '<!-- POSTS_SECTION_START -->';
      const endMarker = '<!-- POSTS_SECTION_END -->';
      const start = indexHtml.indexOf(startMarker);
      const end = indexHtml.indexOf(endMarker);
      if (start !== -1 && end !== -1) {
        indexHtml = indexHtml.slice(0, start) + startMarker + sectionContent + '\n            ' + endMarker + indexHtml.slice(end + endMarker.length);
        fs.writeFileSync(targetPath, indexHtml);
      }
    }
    console.log(`Injected ${latest.length} latest posts into home page`);
  }

  console.log(`Generated ${articles.length} article pages`);
}

run();
