const fs = require('fs');
const { execSync } = require('child_process');

// Returns the git commit date (YYYY-MM-DD) for a file: first commit that
// added it when { first: true }, otherwise the most recent commit. Returns
// null when the file has no git history (new file, shallow clone, no repo).
const gitDateCache = new Map();
function resolveGitDate(filePath, { first = false } = {}) {
  const key = `${first ? 'first' : 'last'}:${filePath}`;
  if (gitDateCache.has(key)) return gitDateCache.get(key);
  let date = null;
  try {
    const args = first
      ? `log --follow --diff-filter=A --format=%cs -- "${filePath}"`
      : `log -1 --format=%cs -- "${filePath}"`;
    const out = execSync(`git ${args}`, {
      cwd: require('path').dirname(filePath),
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const lines = out.split('\n').filter(Boolean);
    const picked = first ? lines[lines.length - 1] : lines[0];
    if (picked && /^\d{4}-\d{2}-\d{2}$/.test(picked)) date = picked;
  } catch (_) { /* not in git or shallow history */ }
  gitDateCache.set(key, date);
  return date;
}

// Blog posts date archival reprints by the original document's date (e.g.
// 1944-09-30), which is correct for display but wrong as a publish date in
// structured data and sitemaps. Treat frontmatter dates before 2020 as
// display-only and fall back to the git add date for machine-readable dates.
function resolvePublishDate(filePath, metaDate) {
  const frontmatterDate = (metaDate || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(frontmatterDate) && frontmatterDate >= '2020-01-01') {
    return frontmatterDate;
  }
  return resolveGitDate(filePath, { first: true });
}

function normalizeNewlines(text) {
  return String(text || '').replace(/\r\n/g, '\n');
}

function splitFrontmatter(raw) {
  const normalized = normalizeNewlines(raw);
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { hasFrontmatter: false, frontmatter: '', body: normalized.trim() };
  }
  return {
    hasFrontmatter: true,
    frontmatter: match[1].trim(),
    body: match[2].trim(),
  };
}

function parseSimpleMeta(frontmatter) {
  const meta = {};
  const text = normalizeNewlines(frontmatter);
  for (const line of text.split('\n')) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    value = value.replace(/^"(.*)"$/, '$1');
    value = value.replace(/^'(.*)'$/, '$1');
    meta[match[1]] = value;
  }
  return meta;
}

function yamlQuote(value) {
  return JSON.stringify(String(value));
}

function buildPublishedMarkdown({ extraMeta = {}, sourceFrontmatter = '', body = '' }) {
  const lines = [];
  for (const [key, value] of Object.entries(extraMeta)) {
    if (value === undefined || value === null || value === '') continue;
    lines.push(`${key}: ${yamlQuote(value)}`);
  }
  const extraKeys = new Set(Object.keys(extraMeta));
  const source = normalizeNewlines(sourceFrontmatter)
    .split('\n')
    .filter(line => {
      const match = line.match(/^([A-Za-z0-9_-]+):\s*/);
      return !(match && extraKeys.has(match[1]));
    })
    .join('\n')
    .trim();
  if (source) lines.push(source);

  return `---\n${lines.join('\n')}\n---\n\n${normalizeNewlines(body).trim()}\n`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripMarkdown(text) {
  return normalizeNewlines(text)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*={2,}\s*$/gm, '')
    .replace(/^\s*-{3,}\s*$/gm, '')
    .replace(/^\s*\*{3,}\s*$/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\n+/g, ' ')
    .trim();
}

// Builds a clean excerpt for meta descriptions and index summaries.
// Skips boilerplate lines (standalone images, bold date headers, source-URL lines)
// so the excerpt starts with real content.
function buildExcerpt(text, maxLen = 160) {
  const cleaned = normalizeNewlines(text)
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      if (/^!\[[^\]]*\]\([^)]*\)$/.test(trimmed)) return false;
      if (/^\*\*[\d年月日\s.\-/]+\*\*$/.test(trimmed)) return false;
      if (/^(>\s*)?(原文地址|原文链接|来源)[:：]/.test(trimmed) && /https?:\/\//.test(trimmed)) return false;
      if (/^={2,}$/.test(trimmed)) return false; // setext heading underline
      if (/^(导读|引言|前言|摘要)$/.test(trimmed)) return false; // section label, not content
      return true;
    })
    .join('\n');
  const plain = stripMarkdown(cleaned);
  if (plain.length <= maxLen) return plain;
  return `${plain.slice(0, maxLen)}...`;
}

// Serializes an object as a JSON-LD <script> block, escaping "</" so the
// payload cannot terminate the script element early.
function buildJsonLd(data) {
  const json = JSON.stringify(data, null, 2).replace(/<\//g, '<\\/');
  return `<script type="application/ld+json">\n${json}\n    </script>`;
}

// Injects an arbitrary snippet right before </head>. Idempotent via marker.
function injectHeadSnippetInFile(filePath, snippet, marker) {
  if (!filePath || !snippet || !fs.existsSync(filePath)) return false;
  const original = fs.readFileSync(filePath, 'utf-8');
  if (marker && original.includes(marker)) return false;
  if (!/<\/head>/i.test(original)) return false;
  const updated = original.replace(/<\/head>/i, `    ${snippet}\n</head>`);
  fs.writeFileSync(filePath, updated);
  return true;
}

function replaceWikiLinks(text, slugForTitle) {
  return normalizeNewlines(text).replace(/\[\[([^\]]+)\]\]/g, (_, title) => {
    const slug = slugForTitle(title);
    if (!slug) return title;
    return `[${title}](/wiki/${slug}/)`;
  });
}

function renderInlineMarkdown(text) {
  const codeSpans = [];
  let html = escapeHtml(text).replace(/`([^`]+)`/g, (_, code) => {
    const idx = codeSpans.push(`<code>${escapeHtml(code)}</code>`) - 1;
    return `@@CODESPAN_${idx}@@`;
  });

  html = html.replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, (_, alt, src) => {
    return `<img src="${src}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">`;
  });
  html = html.replace(/&lt;(https?:\/\/[^&]+)&gt;/g, '<a href="$1">$1</a>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/===(.+?)===/g, '<mark>$1</mark>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  return html.replace(/@@CODESPAN_(\d+)@@/g, (_, idx) => codeSpans[Number(idx)]);
}

function renderMarkdownToHtml(markdown) {
  const normalized = normalizeNewlines(markdown).trim();
  if (!normalized) return '';

  const codeBlocks = [];
  const text = normalized.replace(/```([A-Za-z0-9_-]+)?\n([\s\S]*?)```/g, (_, lang, code) => {
    const classAttr = lang ? ` class="language-${escapeHtml(lang)}"` : '';
    const idx = codeBlocks.push(`<pre><code${classAttr}>${escapeHtml(code.trimEnd())}</code></pre>`) - 1;
    return `@@CODEBLOCK_${idx}@@`;
  });

  const blocks = text.split(/\n{2,}/).map(block => block.trim()).filter(Boolean);

  const htmlBlocks = blocks.map(block => {
    const codeMatch = block.match(/^@@CODEBLOCK_(\d+)@@$/);
    if (codeMatch) return codeBlocks[Number(codeMatch[1])];

    if (/^<[a-zA-Z!/]/.test(block)) return block;

    if (/^(?:-{3,}|\*{3,}|(?:\*\s+){2,}\*?)$/.test(block)) {
      return '<hr>';
    }

    const heading = block.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      // Body h1s are demoted to h2 — the page template owns the single h1.
      const level = Math.max(heading[1].length, 2);
      return `<h${level}>${renderInlineMarkdown(heading[2].trim())}</h${level}>`;
    }

    // Setext heading ("标题\n====") — rendered as h2 since the page template
    // already provides the single h1.
    const setext = block.match(/^([^\n]+)\n={2,}\s*$/);
    if (setext) {
      return `<h2>${renderInlineMarkdown(setext[1].trim())}</h2>`;
    }

    const lines = block.split('\n').map(line => line.trimEnd());

    if (lines.every(line => /^\s*>\s?/.test(line))) {
      const inner = lines.map(line => line.replace(/^\s*>\s?/, '')).join('\n');
      return `<blockquote>${renderMarkdownToHtml(inner)}</blockquote>`;
    }

    if (lines.every(line => /^\s*[-*+]\s+/.test(line) || /^\s*$/.test(line))) {
      const items = lines
        .filter(Boolean)
        .map(line => line.replace(/^\s*[-*+]\s+(?:•\s+)?/, ''))
        .map(item => `<li>${renderInlineMarkdown(item)}</li>`)
        .join('');
      return `<ul>${items}</ul>`;
    }

    if (lines.every(line => /^\s*\d+\.\s+/.test(line) || /^\s*$/.test(line))) {
      const items = lines
        .filter(Boolean)
        .map(line => line.replace(/^\s*\d+\.\s+/, ''))
        .map(item => `<li>${renderInlineMarkdown(item)}</li>`)
        .join('');
      return `<ol>${items}</ol>`;
    }

    // Table: all lines start with |, second line is a separator row
    if (
      lines.length >= 2 &&
      lines.every(line => /^\|/.test(line.trim())) &&
      /^\|[\s\-:|]+\|/.test(lines[1].trim())
    ) {
      const parseCells = row =>
        row.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
      const parseAlignments = row =>
        parseCells(row).map(cell => {
          if (/^:.*:$/.test(cell.trim())) return 'center';
          if (/:$/.test(cell.trim())) return 'right';
          if (/^:/.test(cell.trim())) return 'left';
          return '';
        });
      const renderCell = (cell, align, tag) => {
        const style = align ? ` style="text-align:${align}"` : '';
        return `<${tag}${style}>${renderInlineMarkdown(cell)}</${tag}>`;
      };
      const headers = parseCells(lines[0]);
      const alignments = parseAlignments(lines[1]);
      const headerHtml = `<tr>${headers.map((cell, i) => renderCell(cell, alignments[i], 'th')).join('')}</tr>`;
      const bodyHtml = lines.slice(2).map(row => {
        const cells = parseCells(row);
        return `<tr>${cells.map((cell, i) => renderCell(cell, alignments[i], 'td')).join('')}</tr>`;
      }).join('');
      return `<table><thead>${headerHtml}</thead><tbody>${bodyHtml}</tbody></table>`;
    }

    return `<p>${lines.map(line => renderInlineMarkdown(line)).join('<br>')}</p>`;
  });

  return htmlBlocks.join('\n');
}

function injectAlternateMarkdownLink(html, href) {
  if (!html || !href) return html;
  if (/rel=["']alternate["'][^>]*type=["']text\/markdown["']/.test(html)) return html;

  const link = `    <link rel="alternate" type="text/markdown" href="${href}" />\n`;
  if (/<link rel="canonical"[^>]*>\n?/i.test(html)) {
    return html.replace(/(<link rel="canonical"[^>]*>\n?)/i, `$1${link}`);
  }
  return html.replace(/<\/head>/i, `${link}</head>`);
}

function injectAlternateMarkdownLinkInFile(filePath, href) {
  if (!filePath || !href || !fs.existsSync(filePath)) return false;
  const original = fs.readFileSync(filePath, 'utf-8');
  const updated = injectAlternateMarkdownLink(original, href);
  if (updated === original) return false;
  fs.writeFileSync(filePath, updated);
  return true;
}

module.exports = {
  buildExcerpt,
  buildJsonLd,
  buildPublishedMarkdown,
  escapeHtml,
  injectAlternateMarkdownLink,
  injectAlternateMarkdownLinkInFile,
  injectHeadSnippetInFile,
  parseSimpleMeta,
  renderMarkdownToHtml,
  replaceWikiLinks,
  resolveGitDate,
  resolvePublishDate,
  splitFrontmatter,
  stripMarkdown,
};
