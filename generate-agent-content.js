const fs = require('fs');
const path = require('path');
const {
  buildExcerpt,
  buildJsonLd,
  buildPublishedMarkdown,
  injectAlternateMarkdownLinkInFile,
  injectHeadSnippetInFile,
  parseSimpleMeta,
  replaceWikiLinks,
  splitFrontmatter,
} = require('./site-md-utils');

const SITE = 'https://aimunger.com';
const ROOT = __dirname;
const SITE_DIR = path.join(ROOT, '_site');
const BLOG_SOURCE_DIR = path.join(ROOT, 'blog');
const BLOG_PUBLIC_DIR = path.join(SITE_DIR, 'blog');
const WIKI_SOURCE_DIR = path.join(ROOT, 'wiki-source');
const WIKI_PUBLIC_DIR = path.join(SITE_DIR, 'wiki');
const BOOKS_SOURCE_DIR = path.join(ROOT, 'resources', 'books');
const BOOKS_PUBLIC_DIR = path.join(SITE_DIR, 'resources', 'books');
const CONTENT_DIR = path.join(SITE_DIR, 'content');
const today = new Date().toISOString().split('T')[0];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function excerpt(text, maxLen = 140) {
  return buildExcerpt(text, maxLen);
}

// Parses a frontmatter value that may be a JSON array, e.g. authors: ["A", "B"].
function parseListValue(value) {
  if (!value) return [];
  if (value.startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch (_) { /* fall through */ }
  }
  return [value];
}

function resolveLettersSourceDir() {
  const candidates = [
    path.join(ROOT, '_build', 'letters', 'src', 'content', 'letters'),
    path.join(ROOT, '..', 'letters-to-shareholders', 'src', 'content', 'letters'),
    path.join(ROOT, '..', 'letters', 'src', 'content', 'letters'),
  ];
  return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

function writeMarkdownFile(filePath, markdown) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, markdown);
}

function removeCopiedBlogMarkdown() {
  if (!fs.existsSync(BLOG_PUBLIC_DIR)) return;
  for (const entry of fs.readdirSync(BLOG_PUBLIC_DIR, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      fs.unlinkSync(path.join(BLOG_PUBLIC_DIR, entry.name));
    }
  }
}

function loadWikiSlugMap() {
  const dataPath = path.join(WIKI_PUBLIC_DIR, 'data.json');
  if (!fs.existsSync(dataPath)) return new Map();
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  return new Map((data.nodes || []).map(node => [node.id, node.slug]));
}

function buildSectionIndexMarkdown({ title, section, canonicalUrl, description, items }) {
  const lines = [
    '# ' + title,
    '',
    description,
    '',
    `更新日期：${today}`,
    '',
  ];

  for (const item of items) {
    const parts = [`- [${item.title}](${item.html_url})`, `[Markdown](${item.md_url})`];
    if (item.date) parts.push(item.date);
    let line = parts.join(' | ');
    if (item.summary) line += ` | ${item.summary}`;
    lines.push(line);
  }

  return buildPublishedMarkdown({
    extraMeta: {
      type: 'section-index',
      section,
      canonical_url: canonicalUrl,
      source_section: section,
      lang: 'zh-CN',
      updated_at: today,
    },
    body: lines.join('\n'),
  });
}

function collectBlogItems() {
  if (!fs.existsSync(BLOG_SOURCE_DIR)) return [];
  ensureDir(BLOG_PUBLIC_DIR);
  removeCopiedBlogMarkdown();

  const items = fs.readdirSync(BLOG_SOURCE_DIR)
    .filter(file => file.endsWith('.md'))
    .map(file => {
      const raw = fs.readFileSync(path.join(BLOG_SOURCE_DIR, file), 'utf-8');
      const { frontmatter, body } = splitFrontmatter(raw);
      const meta = parseSimpleMeta(frontmatter);
      const slug = meta.slug || file.replace(/\.md$/, '');
      const title = (meta.title || file.replace(/\.md$/, '')).replace(/^"(.*)"$/, '$1');
      const date = meta.date || '';
      const htmlUrl = `${SITE}/blog/${slug}/`;
      const mdUrl = `${SITE}/blog/${slug}.md`;

      writeMarkdownFile(
        path.join(BLOG_PUBLIC_DIR, `${slug}.md`),
        buildPublishedMarkdown({
          extraMeta: {
            type: 'blog',
            slug,
            canonical_url: htmlUrl,
            source_section: 'blog',
            lang: 'zh-CN',
            updated_at: date || today,
          },
          sourceFrontmatter: frontmatter,
          body,
        })
      );

      injectAlternateMarkdownLinkInFile(
        path.join(BLOG_PUBLIC_DIR, slug, 'index.html'),
        `/blog/${slug}.md`
      );

      return {
        type: 'blog',
        title,
        slug,
        date,
        html_url: htmlUrl,
        md_url: mdUrl,
        summary: excerpt(body),
      };
    })
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  writeMarkdownFile(
    path.join(BLOG_PUBLIC_DIR, 'index.md'),
    buildSectionIndexMarkdown({
      title: 'aimunger 文章索引',
      section: 'blog',
      canonicalUrl: `${SITE}/blog/`,
      description: '按发布时间倒序排列的文章列表。优先使用本文件或对应详情页 Markdown 进行抓取。',
      items,
    })
  );
  injectAlternateMarkdownLinkInFile(path.join(BLOG_PUBLIC_DIR, 'index.html'), '/blog/index.md');

  return items;
}

function collectWikiItems() {
  if (!fs.existsSync(WIKI_SOURCE_DIR)) return [];
  ensureDir(WIKI_PUBLIC_DIR);

  const slugMap = loadWikiSlugMap();
  const items = fs.readdirSync(WIKI_SOURCE_DIR)
    .filter(file => file.endsWith('.md'))
    .map(file => {
      const title = file.replace(/\.md$/, '');
      const slug = slugMap.get(title);
      if (!slug) return null;

      const raw = fs.readFileSync(path.join(WIKI_SOURCE_DIR, file), 'utf-8');
      const { frontmatter, body } = splitFrontmatter(raw);
      const cleanedBody = body.replace(/## 相关原子笔记[\s\S]*?(?=\n## |\n*$)/, '').trim();
      const linkedBody = replaceWikiLinks(cleanedBody, name => slugMap.get(name));
      const htmlUrl = `${SITE}/wiki/${slug}/`;
      const mdUrl = `${SITE}/wiki/${slug}.md`;

      writeMarkdownFile(
        path.join(WIKI_PUBLIC_DIR, `${slug}.md`),
        buildPublishedMarkdown({
          extraMeta: {
            type: 'wiki',
            title,
            slug,
            canonical_url: htmlUrl,
            source_section: 'wiki',
            lang: 'zh-CN',
            updated_at: today,
          },
          sourceFrontmatter: frontmatter,
          body: linkedBody,
        })
      );

      injectAlternateMarkdownLinkInFile(
        path.join(WIKI_PUBLIC_DIR, slug, 'index.html'),
        `/wiki/${slug}.md`
      );

      return {
        type: 'wiki',
        title,
        slug,
        date: '',
        html_url: htmlUrl,
        md_url: mdUrl,
        summary: excerpt(cleanedBody),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));

  const validMarkdownFiles = new Set(['index.md', ...items.map(item => `${item.slug}.md`)]);
  for (const entry of fs.readdirSync(WIKI_PUBLIC_DIR, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.md')) continue;
    if (validMarkdownFiles.has(entry.name)) continue;
    fs.unlinkSync(path.join(WIKI_PUBLIC_DIR, entry.name));
  }

  writeMarkdownFile(
    path.join(WIKI_PUBLIC_DIR, 'index.md'),
    buildSectionIndexMarkdown({
      title: 'aimunger Wiki 索引',
      section: 'wiki',
      canonicalUrl: `${SITE}/wiki/`,
      description: '人物、公司与关键概念的参考索引。优先使用对应详情页 Markdown 获取结构化内容。',
      items,
    })
  );
  injectAlternateMarkdownLinkInFile(path.join(WIKI_PUBLIC_DIR, 'index.html'), '/wiki/index.md');

  return items;
}

function collectBookItems() {
  if (!fs.existsSync(BOOKS_SOURCE_DIR)) return [];
  ensureDir(BOOKS_PUBLIC_DIR);

  const items = fs.readdirSync(BOOKS_SOURCE_DIR)
    .filter(file => file.endsWith('.md'))
    .map(file => {
      const slug = file.replace(/\.md$/, '');
      const raw = fs.readFileSync(path.join(BOOKS_SOURCE_DIR, file), 'utf-8');
      const { frontmatter, body } = splitFrontmatter(raw);
      const meta = parseSimpleMeta(frontmatter);
      const title = meta.title_zh || meta.title_en || slug;
      const authors = parseListValue(meta.authors);
      const htmlUrl = `${SITE}/resources/books/${slug}/`;
      const mdUrl = `${SITE}/resources/books/${slug}.md`;
      const summary = excerpt(body);

      const bookJsonLd = buildJsonLd({
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: title,
        description: summary,
        url: htmlUrl,
        mainEntityOfPage: htmlUrl,
        inLanguage: 'zh-CN',
        about: {
          '@type': 'Book',
          name: meta.title_zh || title,
          ...(meta.title_en ? { alternateName: meta.title_en } : {}),
          ...(authors.length
            ? { author: authors.map(name => ({ '@type': 'Person', name })) }
            : {}),
        },
        publisher: { '@type': 'Organization', name: 'aimunger', url: SITE },
      });
      injectHeadSnippetInFile(
        path.join(BOOKS_PUBLIC_DIR, slug, 'index.html'),
        bookJsonLd,
        'application/ld+json'
      );

      writeMarkdownFile(
        path.join(BOOKS_PUBLIC_DIR, `${slug}.md`),
        buildPublishedMarkdown({
          extraMeta: {
            type: 'book',
            slug,
            canonical_url: htmlUrl,
            source_section: 'resources/books',
            lang: 'zh-CN',
            updated_at: today,
          },
          sourceFrontmatter: frontmatter,
          body,
        })
      );

      injectAlternateMarkdownLinkInFile(
        path.join(BOOKS_PUBLIC_DIR, slug, 'index.html'),
        `/resources/books/${slug}.md`
      );

      return {
        type: 'book',
        title,
        slug,
        date: '',
        html_url: htmlUrl,
        md_url: mdUrl,
        summary,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));

  writeMarkdownFile(
    path.join(BOOKS_PUBLIC_DIR, 'index.md'),
    buildSectionIndexMarkdown({
      title: 'aimunger 书籍资料索引',
      section: 'resources/books',
      canonicalUrl: `${SITE}/resources/books/`,
      description: '书摘、书评与学习笔记索引。优先使用对应图书详情页 Markdown 获取正文。',
      items,
    })
  );
  injectAlternateMarkdownLinkInFile(path.join(BOOKS_PUBLIC_DIR, 'index.html'), '/resources/books/index.md');

  return items;
}

function walkLetterFiles(dir, base = dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkLetterFiles(fullPath, base));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(path.relative(base, fullPath));
    }
  }
  return files;
}

function collectLetterItems() {
  const lettersSourceDir = resolveLettersSourceDir();
  const lettersPublicDir = path.join(SITE_DIR, 'letters');
  if (!lettersSourceDir) return [];
  ensureDir(lettersPublicDir);

  const items = walkLetterFiles(lettersSourceDir)
    .map(relativePath => {
      const raw = fs.readFileSync(path.join(lettersSourceDir, relativePath), 'utf-8');
      const { frontmatter, body } = splitFrontmatter(raw);
      const meta = parseSimpleMeta(frontmatter);
      const parts = relativePath.split(path.sep);
      if (parts.length < 2) return null;
      const companySlug = parts[0];
      const year = parts[parts.length - 1].replace(/\.md$/, '');
      const title = meta.company ? `${meta.company} ${year} 致股东信` : `${companySlug} ${year} 致股东信`;
      const htmlUrl = `${SITE}/letters/letter/${companySlug}/${year}/`;
      const mdUrl = `${SITE}/letters/letter/${companySlug}/${year}.md`;

      writeMarkdownFile(
        path.join(lettersPublicDir, 'letter', companySlug, `${year}.md`),
        buildPublishedMarkdown({
          extraMeta: {
            type: 'letter',
            slug: `${companySlug}-${year}`,
            canonical_url: htmlUrl,
            source_section: 'letters',
            lang: 'zh-CN',
            updated_at: today,
          },
          sourceFrontmatter: frontmatter,
          body,
        })
      );

      injectAlternateMarkdownLinkInFile(
        path.join(lettersPublicDir, 'letter', companySlug, year, 'index.html'),
        `/letters/letter/${companySlug}/${year}.md`
      );

      return {
        type: 'letter',
        title,
        slug: `${companySlug}-${year}`,
        date: /^\d{4}$/.test(year) ? `${year}-01-01` : '',
        html_url: htmlUrl,
        md_url: mdUrl,
        summary: excerpt(body),
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.title.localeCompare(b.title, 'zh-CN'));

  writeMarkdownFile(
    path.join(lettersPublicDir, 'index.md'),
    buildSectionIndexMarkdown({
      title: 'aimunger 致股东信索引',
      section: 'letters',
      canonicalUrl: `${SITE}/letters/`,
      description: '中国上市公司致股东信索引。优先使用详情页 Markdown 或本索引进行抓取。',
      items,
    })
  );
  injectAlternateMarkdownLinkInFile(path.join(lettersPublicDir, 'index.html'), '/letters/index.md');

  return items;
}

function writeContentIndexes(sections) {
  ensureDir(CONTENT_DIR);

  const sectionSummaries = sections.map(section => ({
    id: section.id,
    title: section.title,
    html_url: section.html_url,
    md_url: section.md_url,
    item_count: section.items.length,
  }));

  const flatItems = sections.flatMap(section =>
    section.items.map(item => ({
      ...item,
      section: section.id,
    }))
  );

  const payload = {
    generated_at: today,
    site: SITE,
    section_count: sections.length,
    item_count: flatItems.length,
    sections: sectionSummaries,
    items: flatItems,
  };

  fs.writeFileSync(path.join(CONTENT_DIR, 'index.json'), JSON.stringify(payload, null, 2));

  const lines = [
    '# aimunger Machine Content Index',
    '',
    `生成日期：${today}`,
    '',
    '- JSON 索引：' + `${SITE}/content/index.json`,
    '- Markdown sitemap：' + `${SITE}/sitemap-md.xml`,
    '- llms.txt：' + `${SITE}/llms.txt`,
    '- llms-full.txt（文章/Wiki/书籍全文合集）：' + `${SITE}/llms-full.txt`,
    '',
    '## Sections',
    '',
  ];

  for (const section of sectionSummaries) {
    lines.push(`- [${section.title}](${section.html_url}) | [Markdown](${section.md_url}) | ${section.item_count} items`);
  }

  writeMarkdownFile(
    path.join(CONTENT_DIR, 'index.md'),
    buildPublishedMarkdown({
      extraMeta: {
        type: 'content-index',
        canonical_url: `${SITE}/content/index.md`,
        source_section: 'content',
        lang: 'zh-CN',
        updated_at: today,
      },
      body: lines.join('\n'),
    })
  );
}

function localPathForMdUrl(mdUrl) {
  return path.join(SITE_DIR, ...mdUrl.slice(SITE.length + 1).split('/'));
}

// llms.txt following the llmstxt.org convention: H1 + blockquote summary,
// then H2 sections whose links point at the published Markdown endpoints.
function writeLlmsTxt(sections) {
  const lines = [
    '# aimunger',
    '',
    '> 中文的中国股票与长期投资研究资料库：投资长文与案例研究、人物/公司 Wiki、书籍笔记、上市公司致股东信与财务数据。',
    '',
    `全站每个内容页都有对应的 Markdown 版本（同路径 \`.md\` 后缀）。抓取指引与站点结构说明见 [llm.txt](${SITE}/llm.txt)；全文合集见 [llms-full.txt](${SITE}/llms-full.txt)。更新日期：${today}。`,
    '',
    '## 站点入口',
    '',
    `- [首页](${SITE}/): 站点概览与最新文章`,
    `- [内容索引 JSON](${SITE}/content/index.json): 全站条目的机器可读索引`,
    `- [内容索引 Markdown](${SITE}/content/index.md): 各栏目索引入口`,
    `- [Sitemap](${SITE}/sitemap.xml): 全部 HTML 页面`,
    `- [Markdown Sitemap](${SITE}/sitemap-md.xml): 全部 Markdown 页面`,
    `- [RSS](${SITE}/rss.xml): 最新内容订阅`,
  ];

  for (const section of sections) {
    lines.push('', `## ${section.title}`, '');
    lines.push(`- [${section.title}索引](${section.md_url})`);
    for (const item of section.items) {
      lines.push(`- [${item.title}](${item.md_url})`);
    }
  }

  lines.push(
    '',
    '## Optional',
    '',
    `- [财务数据 JSON](${SITE}/data/data.json): 中国上市公司历史财务数据（/data/ 图表页的底层数据）`,
    `- [记忆卡](${SITE}/ankicard/): 由学习材料生成的间隔重复记忆卡`,
    `- [关于](${SITE}/about/): 站点说明与联系方式`,
    ''
  );

  fs.writeFileSync(path.join(SITE_DIR, 'llms.txt'), lines.join('\n'));
}

// llms-full.txt: full text of blog, wiki, and book notes in one file.
// Letters are excluded to keep the file size reasonable; they are listed in
// llms.txt and available per-letter as Markdown.
function writeLlmsFullTxt(sections) {
  const parts = [
    '# aimunger llms-full.txt',
    '',
    `> 全站文章、Wiki 与书籍笔记的完整 Markdown 合集。生成日期：${today}。`,
    `> 致股东信未收录于本文件，请通过 ${SITE}/letters/index.md 获取。`,
    `> 每篇文档以 "<!-- ===== url ===== -->" 分隔，frontmatter 中的 canonical_url 为引用地址。`,
  ];

  for (const section of sections) {
    if (section.id === 'letters') continue;
    for (const item of section.items) {
      const localPath = localPathForMdUrl(item.md_url);
      if (!fs.existsSync(localPath)) continue;
      parts.push('', `<!-- ===== ${item.md_url} ===== -->`, '', fs.readFileSync(localPath, 'utf-8').trim());
    }
  }

  parts.push('');
  fs.writeFileSync(path.join(SITE_DIR, 'llms-full.txt'), parts.join('\n'));
}

function writeMarkdownSitemap(sections) {
  const urls = new Set([
    `${SITE}/content/index.md`,
  ]);

  for (const section of sections) {
    urls.add(section.md_url);
    for (const item of section.items) urls.add(item.md_url);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...urls].sort().map(url => `  <url>
    <loc>${url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`).join('\n')}
</urlset>
`;

  fs.writeFileSync(path.join(SITE_DIR, 'sitemap-md.xml'), xml);
}

function run() {
  if (!fs.existsSync(SITE_DIR)) {
    console.log('_site directory not found, skipping agent content generation');
    return;
  }

  const blogItems = collectBlogItems();
  const wikiItems = collectWikiItems();
  const bookItems = collectBookItems();
  const letterItems = collectLetterItems();

  const sections = [
    {
      id: 'blog',
      title: '文章',
      html_url: `${SITE}/blog/`,
      md_url: `${SITE}/blog/index.md`,
      items: blogItems,
    },
    {
      id: 'wiki',
      title: 'Wiki',
      html_url: `${SITE}/wiki/`,
      md_url: `${SITE}/wiki/index.md`,
      items: wikiItems,
    },
    {
      id: 'resources/books',
      title: '书籍资料',
      html_url: `${SITE}/resources/books`,
      md_url: `${SITE}/resources/books/index.md`,
      items: bookItems,
    },
    {
      id: 'letters',
      title: '致股东信',
      html_url: `${SITE}/letters/`,
      md_url: `${SITE}/letters/index.md`,
      items: letterItems,
    },
  ].filter(section => section.items.length > 0);

  writeContentIndexes(sections);
  writeMarkdownSitemap(sections);
  writeLlmsTxt(sections);
  writeLlmsFullTxt(sections);

  console.log(`Generated agent-friendly markdown endpoints for ${sections.reduce((sum, section) => sum + section.items.length, 0)} items`);
}

run();
