const fs = require('fs');

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
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\n+/g, ' ')
    .trim();
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

    if (/^(?:-{3,}|\*{3,}|(?:\*\s+){2,}\*?)$/.test(block)) {
      return '<hr>';
    }

    const heading = block.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      return `<h${level}>${renderInlineMarkdown(heading[2].trim())}</h${level}>`;
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
  buildPublishedMarkdown,
  escapeHtml,
  injectAlternateMarkdownLink,
  injectAlternateMarkdownLinkInFile,
  parseSimpleMeta,
  renderMarkdownToHtml,
  replaceWikiLinks,
  splitFrontmatter,
  stripMarkdown,
};
