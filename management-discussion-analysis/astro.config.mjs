import { defineConfig } from 'astro/config';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// Turns ===text=== into <mark>text</mark> so reports can highlight key
// sentences. Self-contained (no extra dep): walks the mdast, splitting text
// nodes on the ===…=== marker and emitting raw-HTML mark spans.
function remarkMark() {
  const split = (node) => {
    if (!node.children) return;
    const out = [];
    for (const child of node.children) {
      if (child.type === 'text' && child.value.includes('===')) {
        const parts = child.value.split(/===(.+?)===/g);
        parts.forEach((part, i) => {
          if (!part) return;
          out.push(i % 2 === 1
            ? { type: 'html', value: `<mark>${part}</mark>` }
            : { type: 'text', value: part });
        });
      } else {
        split(child);
        out.push(child);
      }
    }
    node.children = out;
  };
  return (tree) => split(tree);
}

export default defineConfig({
  site: 'https://aimunger.com',
  base: '/management-discussion-analysis/',
  output: 'static',
  markdown: {
    remarkPlugins: [remarkMath, remarkMark],
    rehypePlugins: [rehypeKatex],
  },
});
