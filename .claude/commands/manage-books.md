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
- Write a 1,000–1,500 Chinese-character introduction, based strictly on the Step 1 research.
- Use standard Chinese punctuation: `""` for quotes, `《》` for book titles, `——` for em dash, `、` for enumeration.
- Structure: 3–4 paragraphs — typically author background, core content/arguments, notable reception/recommendations (with **exact original wording** and source attribution), and relevance to readers of business, investing, management, and long-term thinking.
- Do NOT invent recommendations, quotes, editions, or publication facts. When evidence is uncertain, say so plainly or omit the claim.

**Write like an informed human editor, not a marketing bot. This is the part that matters most.**

The failure mode to avoid is fluent, confident prose that says nothing specific — text that could describe any book. Every paragraph must carry facts a reader couldn't guess from the title: real names, dates, numbers, concrete arguments, specific anecdotes from the book. If a sentence would survive being pasted into a different book's page, delete or rewrite it.

*Concreteness test:* prefer the specific over the abstract every time. Not "书中充满了深刻的洞见" but *which* insight — state the actual argument. Not "作者拥有丰富的经验" but the actual role, firm, and years. Not "这本书对投资者很有启发" but what specifically it changes in how a reader thinks. Name the book's actual chapters, characters, cases, or claims.

**Banned — these are the tells of AI slop. Do not use them:**
- Empty praise adjectives: 发人深省、引人入胜、鞭辟入里、字字珠玑、振聋发聩、不可多得、堪称经典、掷地有声、金玉良言.
- Hollow connective scaffolding: 不仅……更是……、无论是……还是……、正所谓、总而言之、综上所述、值得一提的是、不难看出、由此可见.
- Time-cliché openings: 在这个……的时代、在当今……的背景下、在信息爆炸的今天.
- Promotional register: 必读、强烈推荐、开卷有益、受益匪浅、不容错过、每一位……都应该读.
- Formulaic relevance closers that fit any book, e.g. a final paragraph that mechanically starts 对于关注商业、投资与长期思考的读者而言…… and then says nothing specific. If you write a relevance paragraph, ground it in this book's actual content.
- Fake balance and rhetorical filler: 既……又……、一方面……另一方面…… used only for rhythm; rhetorical questions used as transitions.

**Techniques that produce good prose:**
- Open on a concrete fact or scene, not a thesis statement. (Good model: `lessons-of-history.md` opens with the Durants' 40-year, 11-volume project and the Pulitzer, not "这是一本关于历史的经典之作".)
- Vary sentence length and paragraph openings — do not start consecutive sentences or paragraphs with the same structure.
- Attribute every evaluative claim. "本书是经典" is slop; "萨缪尔森称其为'现代经典'" is a fact. Reserve praise for quoted, sourced endorsements.
- When you cite an endorsement, give the person's real identity/role and the exact original wording (English in the original, with a natural Chinese rendering if helpful).
- It is fine to note tension, criticism, or limitations if the research supports them — real editorial writing is not uniformly laudatory, and honest caveats read as human.
- Read `resources/books/lessons-of-history.md` and one recently-added file as live style references before writing.

**Self-check before saving:** reread the draft and, for each sentence, ask "is this specific to *this* book, and is it true per my research?" Cut anything that fails either test. If a whole paragraph is generic, the fix is more research, not more adjectives.

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
    <link rel="canonical" href="https://aimunger.com/resources/books/{SLUG}/" />
    <meta property="og:title" content="{TITLE_ZH} - aimunger" />
    <meta property="og:description" content="{META_DESC}" />
    <meta property="og:url" content="https://aimunger.com/resources/books/{SLUG}/" />
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
                <a href="/resources/books/" class="book-page-back">所有书籍</a>
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
