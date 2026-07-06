// Generates a combined rss.xml from QA articles, letters, and LLM-reader content
const fs = require('fs');
const path = require('path');

const SITE = 'https://aimunger.com';
const SITE_DIR = path.join(__dirname, '_site');

function escXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stripMarkdown(text) {
  return (text || '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/#{1,6}\s*/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`[^`]*`/g, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\n+/g, ' ')
    .trim();
}

function excerpt(text, maxLen = 200) {
  const plain = stripMarkdown(text);
  if (plain.length <= maxLen) return plain;
  return plain.slice(0, maxLen) + '...';
}

// Collect QA articles from generated _site/qa/ pages
function collectQaItems() {
  const items = [];
  const qaDir = path.join(SITE_DIR, 'qa');
  if (!fs.existsSync(qaDir)) return items;

  for (const entry of fs.readdirSync(qaDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const htmlPath = path.join(qaDir, entry.name, 'index.html');
    if (!fs.existsSync(htmlPath)) continue;

    const html = fs.readFileSync(htmlPath, 'utf-8');
    const titleMatch = html.match(/<title>(.*?)\s*-\s*aimunger<\/title>/);
    const dateMatch = html.match(/<time[^>]*>([\d-]+)<\/time>/);
    const descMatch = html.match(/<meta name="description" content="([^"]*)">/);

    items.push({
      title: titleMatch ? titleMatch[1] : entry.name,
      link: `${SITE}/qa/${entry.name}/`,
      date: dateMatch ? dateMatch[1] : '',
      description: descMatch ? descMatch[1] : '',
      section: '文章',
    });
  }

  return items;
}

// Collect letters from _site/letters/ by scanning letter pages
function collectLetterItems() {
  const items = [];
  const letterDir = path.join(SITE_DIR, 'letters', 'letter');
  if (!fs.existsSync(letterDir)) return items;

  for (const company of fs.readdirSync(letterDir, { withFileTypes: true })) {
    if (!company.isDirectory()) continue;
    const companyDir = path.join(letterDir, company.name);

    for (const year of fs.readdirSync(companyDir, { withFileTypes: true })) {
      if (!year.isDirectory()) continue;
      const htmlPath = path.join(companyDir, year.name, 'index.html');
      if (!fs.existsSync(htmlPath)) continue;

      const html = fs.readFileSync(htmlPath, 'utf-8');
      const titleMatch = html.match(/<title>(.*?)<\/title>/);
      const title = titleMatch ? titleMatch[1].replace(/\s*[—-]\s*致股东信.*$/, '') : `${company.name} ${year.name}`;

      items.push({
        title,
        link: `${SITE}/letters/letter/${company.name}/${year.name}/`,
        date: `${year.name}-01-01`,
        description: `${title}`,
        section: '致股东信',
      });
    }
  }

  return items;
}

// Collect LLM-reader items from qa.html and insights.html
function collectLlmReaderItems() {
  const items = [];

  // QA records from llm-reader
  const qaPath = path.join(SITE_DIR, 'llm-reader', 'qa.html');
  if (fs.existsSync(qaPath)) {
    const html = fs.readFileSync(qaPath, 'utf-8');
    const match = html.match(/var DATA=(\[[\s\S]*?\]);\s*\n/);
    if (match) {
      try {
        const data = JSON.parse(match[1]);
        for (const qa of data) {
          items.push({
            title: qa.question || `LLM Reader 问答 ${qa.id}`,
            link: `${SITE}/llm-reader/qa.html`,
            guid: `${SITE}/llm-reader/qa.html#qa-${qa.id}`,
            date: (qa.created_at || '').slice(0, 10),
            description: excerpt(qa.answer),
            section: 'LLM Reader',
          });
        }
      } catch {}
    }
  }

  // Insights from llm-reader
  const insightsPath = path.join(SITE_DIR, 'llm-reader', 'insights.html');
  if (fs.existsSync(insightsPath)) {
    const html = fs.readFileSync(insightsPath, 'utf-8');
    const match = html.match(/var DATA=(\[[\s\S]*?\]);\s*\n/);
    if (match) {
      try {
        const data = JSON.parse(match[1]);
        data.forEach((ins, idx) => {
          items.push({
            title: `洞察: ${excerpt(ins.content, 60)}`,
            link: `${SITE}/llm-reader/insights.html`,
            guid: `${SITE}/llm-reader/insights.html#insight-${idx}`,
            date: (ins.created_at || '').slice(0, 10),
            description: excerpt(ins.content),
            section: 'LLM Reader',
          });
        });
      } catch {}
    }
  }

  return items;
}

// Build combined RSS
const allItems = [
  ...collectQaItems(),
  ...collectLetterItems(),
  ...collectLlmReaderItems(),
];

// Sort by date descending
allItems.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

const rssItems = allItems.map(item => `    <item>
      <title>${escXml(item.title)}</title>
      <link>${item.link}</link>
      <guid>${item.guid || item.link}</guid>
      <description>${escXml(item.description)}</description>
      <category>${escXml(item.section)}</category>${item.date && !isNaN(new Date(item.date).getTime()) ? `
      <pubDate>${new Date(item.date).toUTCString()}</pubDate>` : ''}
    </item>`).join('\n');

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>aimunger</title>
    <link>${SITE}/</link>
    <description>深度研究备忘录与投资观察</description>
    <language>zh-CN</language>
    <atom:link href="${SITE}/rss.xml" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${rssItems}
  </channel>
</rss>`;

fs.writeFileSync(path.join(SITE_DIR, 'rss.xml'), rss);
console.log(`Generated rss.xml with ${allItems.length} items`);
