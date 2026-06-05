/**
 * generate-data.js
 *
 * Reads Markdown files from the IR-log/data directory, parses the tables,
 * and writes a JSON file (data/data.json) that the /data/ page consumes.
 *
 * Each file produces an entry keyed by its filename (without .md extension).
 * The entry contains:
 *   - headers: string[]           — column headers from the table
 *   - rows: (string|number)[][]   — parsed row data
 *   - meta: { created, tags, description } — frontmatter metadata
 *
 * Chart configurations are NOT generated here — they live in chart-configs.js
 * and are maintained manually per file.
 *
 * Usage:
 *   node generate-data.js          — one-shot generation
 *   node generate-data.js --watch  — watch source directory, auto-regenerate on changes
 */

const fs = require('fs');
const path = require('path');

const DATA_SOURCE = path.resolve(__dirname, '../IR-log/data');
const OUTPUT_FILE = path.resolve(__dirname, 'data/data.json');

function parseFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---\n/);
    if (!match) return { meta: {}, body: content };
    const meta = {};
    match[1].split('\n').forEach(line => {
        const m = line.match(/^(\w+):\s*(.+)$/);
        if (m) {
            let val = m[2].trim();
            if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
            if (val === '[]') val = [];
            meta[m[1]] = val;
        }
    });
    return { meta, body: content.slice(match[0].length) };
}

function parseMarkdownTable(tableText) {
    const lines = tableText.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) return null;

    const parseLine = line => {
        const parts = line.split('|').map(c => c.trim());
        // Remove leading/trailing empty strings from pipe boundaries
        const start = parts[0] === '' ? 1 : 0;
        const end = parts[parts.length - 1] === '' ? parts.length - 1 : parts.length;
        return parts.slice(start, end);
    };

    const headers = parseLine(lines[0]);

    // Skip separator line (line[1])
    const rows = [];
    for (let i = 2; i < lines.length; i++) {
        const cells = parseLine(lines[i]);
        const parsed = cells.map(cell => {
            // Remove commas from numbers, try to parse
            const cleaned = cell.replace(/,/g, '').replace(/%$/, '');
            const num = Number(cleaned);
            if (cell.endsWith('%') && !isNaN(num)) return num;
            if (!isNaN(num) && cleaned !== '') return num;
            return cell;
        });
        rows.push(parsed);
    }

    return { headers, rows };
}

function main() {
    if (!fs.existsSync(DATA_SOURCE)) {
        console.error(`Data source not found: ${DATA_SOURCE}`);
        process.exit(1);
    }

    const files = fs.readdirSync(DATA_SOURCE).filter(f => f.endsWith('.md'));
    const result = {};

    for (const file of files) {
        const name = file.replace(/\.md$/, '');
        const content = fs.readFileSync(path.join(DATA_SOURCE, file), 'utf-8');
        const { meta, body } = parseFrontmatter(content);

        // Find the first markdown table in the body
        const tableMatch = body.match(/(\|.+\|[\s\S]*?\|.+\|(?:\n|$))/);
        if (!tableMatch) {
            console.warn(`No table found in ${file}, skipping.`);
            continue;
        }

        // Extract full table (all consecutive lines starting with |)
        const bodyLines = body.split('\n');
        let tableStart = -1;
        let tableEnd = -1;
        for (let i = 0; i < bodyLines.length; i++) {
            if (bodyLines[i].trim().startsWith('|')) {
                if (tableStart === -1) tableStart = i;
                tableEnd = i;
            } else if (tableStart !== -1) {
                break;
            }
        }

        if (tableStart === -1) continue;

        const tableText = bodyLines.slice(tableStart, tableEnd + 1).join('\n');
        const table = parseMarkdownTable(tableText);
        if (!table) continue;

        result[name] = {
            meta,
            headers: table.headers,
            rows: table.rows
        };

        console.log(`Parsed: ${name} (${table.rows.length} rows, ${table.headers.length} cols)`);
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), 'utf-8');
    console.log(`\nWritten: ${OUTPUT_FILE}`);
}

main();

// --watch mode: monitor source directory and regenerate on changes
if (process.argv.includes('--watch')) {
    console.log(`\nWatching ${DATA_SOURCE} for changes...\n`);
    let debounce = null;
    fs.watch(DATA_SOURCE, { recursive: false }, (event, filename) => {
        if (!filename || !filename.endsWith('.md')) return;
        clearTimeout(debounce);
        debounce = setTimeout(() => {
            console.log(`[${new Date().toLocaleTimeString()}] Change detected: ${filename}`);
            main();
        }, 300);
    });
}
