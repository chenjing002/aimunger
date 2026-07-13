Add new books to the books section. The user will provide book titles as $ARGUMENTS.

Follow these steps for each book. Process all books provided.

## Step 0: Parse Input and Deduplicate

- Accept book titles in English, Chinese, or mixed.
- Check each title against `resources/books/booklists/index.json` — if a book already exists (match by `title_en`), skip it and inform the user.
- For each new book, determine:
  - `title_en`: The official English title. If user gave only Chinese, look up the English title.
  - `title_zh`: The official published Chinese title if a verified Chinese edition exists. If no official Chinese translation exists, translate the English title naturally into Chinese.
  - `authors`: Array of author names as they appear on the book.
  - `slug`: Kebab-case identifier derived from the English title. Follow existing conventions — keep it concise (e.g., "Legacy: A Biography of Moses and Walter Annenberg" → `legacy-annenberg`). Remove articles ("The", "A", "An") from the start. Keep it short but recognizable.

## Step 1: Research Each Book

Use `WebSearch` and `WebFetch` to gather accurate information for each book:
- Author(s), publisher, publication year
- Core themes and content summary
- Notable recommendations from investors, entrepreneurs, authors, or public figures — **only include recommendations that can be verified**
- Find the **exact original wording** of notable recommendations/quotes, with source attribution
- Check for an official Chinese edition and its published title

## Step 2: Download Cover Images

For each new book:
- Use `WebSearch` to find a reliable cover image (Amazon, Goodreads, eBay, publisher pages, Open Library, or other credible sources)
- Download the cover using `curl` and save to: `resources/books/booklists/covers/{slug}.jpg`
- Verify the download succeeded (check file size > 0)

## Step 3: Update `booklists/index.json`

- Read the current file first
- Add each new book entry at the end of the `booklists` array, maintaining the schema:
  ```json
  {
    "title_en": "...",
    "title_zh": "...",
    "authors": ["..."],
    "cover": "covers/{slug}.jpg"
  }
  ```
- Preserve existing formatting (2-space indent, trailing newline)

## Step 4: Create Markdown Files

For each new book, create `resources/books/{slug}.md` with:

**Frontmatter:**
```yaml
---
title_en: "Full English Title"
title_zh: "中文标题"
authors: ["Author Name"]
---
```

**Body:**
- Write a 1,000–1,500 Chinese-character introduction
- Base content on the web research from Step 1
- Use natural, polished Chinese expression and standard Chinese punctuation (use `""` for quotes, `《》` for book titles, `——` for em dash, `、` for enumeration)
- Include notable recommendations with **exact original wording** and source attribution
- Avoid vague, generic, promotional, or obviously AI-generated language
- Make the introduction useful for readers interested in business, investing, management, and long-term thinking
- Do NOT invent recommendations, quotes, editions, or publication information
- When evidence is uncertain, state the uncertainty clearly or omit the claim
- Structure: typically 3–4 paragraphs covering author background, core content/arguments, notable reception/recommendations, and relevance to the target readership
- Reference existing book markdown files (e.g., `resources/books/lessons-of-history.md`) as style examples

## Step 5: Create HTML Pages

For each new book, create `resources/books/{slug}/index.html`.

Use this exact template (substitute values for `{TITLE_ZH}`, `{TITLE_EN}`, `{AUTHORS_COMMA_SEPARATED}`, `{SLUG}`, `{META_DESC}`, `{BODY_PARAGRAPHS}`):

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{TITLE_ZH} - aimunger</title>
    <meta name="description" content="{META_DESC}">
    <link rel="canonical" href="https://aimunger.com/resources/books/{SLUG}" />
    <meta property="og:title" content="{TITLE_ZH} - aimunger" />
    <meta property="og:description" content="{META_DESC}" />
    <meta property="og:url" content="https://aimunger.com/resources/books/{SLUG}" />
    <meta property="og:type" content="article" />
    <meta property="og:locale" content="zh_CN" />
    <meta property="og:site_name" content="aimunger" />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;600;700&display=optional" rel="stylesheet">
    <link rel="stylesheet" href="/style.css">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <style>
        .book-page-header {
            padding: 80px 0 40px;
        }
        .book-page-back {
            display: inline-block;
            font-size: 14px;
            color: var(--color-text-secondary);
            text-decoration: none;
            margin-bottom: 28px;
            transition: color 0.2s ease;
        }
        .book-page-back:hover {
            color: var(--color-accent);
        }
        .book-page-top {
            display: flex;
            gap: 28px;
            margin-bottom: 8px;
        }
        .book-page-cover {
            width: 140px;
            flex-shrink: 0;
            border-radius: 6px;
            overflow: hidden;
            border: 1px solid var(--color-border);
            box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
        }
        .book-page-cover img {
            width: 100%;
            display: block;
        }
        .book-page-meta {
            display: flex;
            flex-direction: column;
            justify-content: center;
        }
        .book-page-title-zh {
            font-family: var(--font-serif);
            font-size: 24px;
            font-weight: 700;
            line-height: 1.4;
            margin-bottom: 8px;
        }
        .book-page-title-en {
            font-size: 14px;
            color: var(--color-text-secondary);
            line-height: 1.5;
            margin-bottom: 10px;
            font-style: italic;
        }
        .book-page-authors {
            font-size: 14px;
            color: var(--color-text-secondary);
        }
        .book-page-body {
            padding-bottom: 96px;
            font-size: 16px;
            line-height: 2;
            color: var(--color-text);
        }
        .book-page-body p {
            margin-bottom: 16px;
        }
        @media (max-width: 600px) {
            .book-page-header {
                padding: 56px 0 32px;
            }
            .book-page-top {
                gap: 20px;
            }
            .book-page-cover {
                width: 100px;
            }
            .book-page-title-zh {
                font-size: 20px;
            }
            .book-page-body {
                font-size: 15px;
                padding-bottom: 64px;
            }
        }
    </style>
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
                <li><a href="/resources/" class="active">资料库</a></li>
                <li><a href="/wiki/">Wiki</a></li>
                <li><a href="/blog/">文章</a></li>
                <li><a href="/data/">数据</a></li>
                <li><a href="/ankicard/">记忆卡</a></li>
                <li><a href="/about/">关于</a></li>
            </ul>
        </nav>
    </header>

    <main class="main">
        <div class="container">
            <div class="book-page-header">
                <a href="/resources/books" class="book-page-back">&larr; 所有书籍</a>
                <div class="book-page-top">
                    <div class="book-page-cover">
                        <img src="../booklists/covers/{SLUG}.jpg" alt="{TITLE_ZH}">
                    </div>
                    <div class="book-page-meta">
                        <h1 class="book-page-title-zh">{TITLE_ZH}</h1>
                        <div class="book-page-title-en">{TITLE_EN}</div>
                        <div class="book-page-authors">{AUTHORS_COMMA_SEPARATED}</div>
                    </div>
                </div>
            </div>
            <div class="book-page-body">
                    {BODY_PARAGRAPHS}
            </div>
        </div>
    </main>

    <footer class="footer">
        <div class="container">
            <div class="footer-links">
                <a href="https://aimunger.com/letters/">letters-to-shareholders</a>
                <a href="https://aimunger.com/llm-reader/">llm-reader</a>
                <a href="https://aimunger.com/llm.txt">llm.txt</a>
                <a href="https://aimunger.com/sitemap.xml">sitemap</a>
                <a href="https://aimunger.com/rss.xml">rss</a>
            </div>
            <p>&copy; 2026 aimunger</p>
        </div>
    </footer>
    <script src="/memory-notify.js"></script>
</body>
</html>
```

Where:
- `{META_DESC}` is the first ~150 characters of the first paragraph of the Chinese introduction, ending with `...`
- `{BODY_PARAGRAPHS}` consists of each markdown paragraph wrapped in `<p>...</p>` tags with 20-space indentation, HTML-escaped (`"` → `&quot;`, `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`)

## Step 6: Update the Listing Page

Edit `resources/books/index.html` to add each new book's slug mapping to the `slugMap` object in the `<script>` section.

Add a new line for each book in the format:
```javascript
'Full English Title': 'slug-name',
```

Place new entries at the end of the `slugMap` object, before the closing `};`.

## Step 7: Summary

After completing all steps, report to the user:
- Which books were added (with titles)
- Which books were skipped (already existed)
- Any issues encountered (e.g., cover download failures, unverifiable recommendations)
