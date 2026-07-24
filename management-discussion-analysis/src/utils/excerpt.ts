// Build a plain-text excerpt from raw markdown, for hub lists and meta descriptions.
export function makeExcerpt(markdown: string, maxLen = 110): string {
  const lines = markdown.split('\n').map((l) => l.trim()).filter(
    (l) =>
      l &&
      !l.startsWith('|') &&
      !l.startsWith('#') &&
      !l.startsWith('>') &&
      !l.startsWith('```') &&
      !l.startsWith('<') &&
      !/^[-*_]{3,}$/.test(l)
  );
  const text = lines
    .join(' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxLen ? text.slice(0, maxLen).trim() + '……' : text;
}
