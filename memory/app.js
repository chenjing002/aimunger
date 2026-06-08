'use strict';

// ============================================================
// Configuration
// ============================================================

// Will be set after deploy — the workers.dev URL for the API
const API_BASE = 'https://aimunger-memory.chenjingluote.workers.dev/api/memory';
const TOKEN_KEY = 'mem_token';

// ============================================================
// Constants
// ============================================================

const STAGES = [
    { name: '初始',     days: 0,   color: '#9ca3af' },
    { name: '1 周',     days: 7,   color: '#d97706' },
    { name: '3 周',     days: 21,  color: '#b45309' },
    { name: '1 个月',   days: 30,  color: '#059669' },
    { name: '3 个月',   days: 90,  color: '#2563eb' },
    { name: '长期记忆',  days: -1,  color: '#8b2500' }
];

// ============================================================
// State
// ============================================================

let currentUser = null;
let decks = [];
let currentFilter = 'all';
let reviewSession = null;

// ============================================================
// Helpers
// ============================================================

function uid() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatDate(ts) {
    if (!ts) return '--';
    const d = new Date(ts);
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return m + '/' + day;
}

function formatDateFull(ts) {
    if (!ts) return '--';
    const d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function daysFromNow(ts) {
    if (!ts) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const target = new Date(ts);
    target.setHours(0, 0, 0, 0);
    return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

function dueLabel(ts) {
    const days = daysFromNow(ts);
    if (days === null) return '';
    if (days <= 0) return '待复习';
    if (days === 1) return '明天';
    if (days <= 7) return days + '天后';
    return formatDate(ts);
}

function getNextReviewDate(currentStage) {
    const nextStage = currentStage + 1;
    if (nextStage >= STAGES.length) return null;
    const days = STAGES[nextStage].days;
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

function isCardDue(card) {
    if (card.completed) return false;
    if (card.nextReviewDate === null || card.nextReviewDate === undefined) return true;
    return card.nextReviewDate <= Date.now();
}

function getDeckStats(deck) {
    const cards = deck.cards || [];
    const total = cards.length;
    const completed = cards.filter(c => c.completed).length;
    const due = cards.filter(c => isCardDue(c)).length;
    const stageCounts = STAGES.map((_, i) => cards.filter(c => c.stage === i).length);
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
    let nextReview = null;
    for (const c of cards) {
        if (!c.completed && c.nextReviewDate) {
            if (!nextReview || c.nextReviewDate < nextReview) {
                nextReview = c.nextReviewDate;
            }
        }
    }
    return { total, completed, due, stageCounts, progress, nextReview };
}

function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2000);
}

// ============================================================
// API Client
// ============================================================

function authHeaders() {
    const token = localStorage.getItem(TOKEN_KEY);
    const h = {};
    if (token) h['Authorization'] = 'Bearer ' + token;
    return h;
}

async function apiGet(path) {
    const res = await fetch(API_BASE + path, { headers: authHeaders() });
    if (!res.ok) return null;
    return res.json();
}

async function apiPost(path, data) {
    const res = await fetch(API_BASE + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('API error');
    return res.json();
}

async function apiPut(path, data) {
    const res = await fetch(API_BASE + path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('API error');
    return res.json();
}

async function apiDelete(path) {
    await fetch(API_BASE + path, { method: 'DELETE', headers: authHeaders() });
}

// ============================================================
// Auth
// ============================================================

function signIn() {
    window.location.href = API_BASE + '/auth/login';
}

async function doSignOut() {
    localStorage.removeItem(TOKEN_KEY);
    currentUser = null;
    navigate('/');
    handleRoute();
}

// ============================================================
// Database
// ============================================================

async function loadDecks() {
    decks = (await apiGet('/decks')) || [];
    return decks;
}

async function loadDeck(id) {
    return apiGet('/decks/' + id);
}

async function saveDeck(deck) {
    const { id, ...data } = deck;
    if (id) {
        await apiPut('/decks/' + id, data);
        return id;
    } else {
        const result = await apiPost('/decks', data);
        return result.id;
    }
}

async function deleteDeckById(id) {
    await apiDelete('/decks/' + id);
}

// ============================================================
// Import Parser
// ============================================================

function parseImportText(text) {
    const content = text.trim();
    if (!content) return { title: '', cards: [] };

    let title = '';
    let body = content;

    // Extract title if present
    const firstQ = body.search(/Q[.．]\s/);
    if (firstQ > 0) {
        const before = body.substring(0, firstQ).trim();
        title = before.replace(/^(?:Title|标题)[:：]\s*/i, '').trim();
        body = body.substring(firstQ);
    }

    // Split by Q. markers
    const segments = body.split(/Q[.．]\s+/).filter(s => s.trim());
    const cards = [];

    for (const seg of segments) {
        const aIdx = seg.search(/A[.．]\s/);
        if (aIdx === -1) continue;
        const question = seg.substring(0, aIdx).trim();
        const answer = seg.substring(aIdx).replace(/^A[.．]\s+/, '').trim();
        if (question && answer) {
            cards.push({
                id: uid(),
                question,
                answer,
                stage: 0,
                nextReviewDate: null,
                lastReviewDate: null,
                completed: false,
                reviewHistory: []
            });
        }
    }

    return { title, cards };
}

// ============================================================
// Router
// ============================================================

function navigate(path) {
    window.location.hash = path;
}

function getRoute() {
    const hash = window.location.hash.slice(1) || '/';
    const parts = hash.split('/').filter(Boolean);
    return { hash, parts };
}

async function handleRoute() {
    const route = getRoute();

    // Handle OAuth callback: #/auth/JWT_TOKEN
    if (route.parts[0] === 'auth' && route.parts[1]) {
        localStorage.setItem(TOKEN_KEY, route.parts[1]);
        // Verify the token
        const user = await apiGet('/auth/me');
        if (user && user.id) {
            currentUser = user;
        }
        // Clean the URL
        window.location.hash = '/';
        return;
    }

    if (!currentUser) {
        renderLogin();
        return;
    }

    const app = document.getElementById('app');

    if (route.parts[0] === 'deck' && route.parts[1]) {
        app.innerHTML = '<div class="mem-loading">加载中...</div>';
        const deck = await loadDeck(route.parts[1]);
        if (deck) {
            renderDeckDetail(deck);
        } else {
            navigate('/');
        }
    } else if (route.parts[0] === 'review' && route.parts[1]) {
        app.innerHTML = '<div class="mem-loading">加载中...</div>';
        const deck = await loadDeck(route.parts[1]);
        if (deck) {
            startReview(deck);
        } else {
            navigate('/');
        }
    } else if (route.parts[0] === 'import') {
        const deckId = route.parts[1] || null;
        renderImport(deckId);
    } else {
        app.innerHTML = '<div class="mem-loading">加载中...</div>';
        await loadDecks();
        renderDeckList();
    }
}

// ============================================================
// Google SVG Icon
// ============================================================

const GOOGLE_ICON = '<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>';

// ============================================================
// View: Login
// ============================================================

function renderLogin() {
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="mem-login">
            <h1 class="mem-login-title">间隔重复记忆</h1>
            <p class="mem-login-desc">通过科学的间隔重复法，将重要知识转化为长期记忆。</p>
            <button class="mem-google-btn" data-action="sign-in">
                ${GOOGLE_ICON}
                使用 Google 账号登录
            </button>
        </div>
    `;
}

// ============================================================
// View: Deck List
// ============================================================

function renderDeckList() {
    const app = document.getElementById('app');

    let filtered = decks;
    if (currentFilter === 'due') {
        filtered = decks.filter(d => d.status !== 'paused' && getDeckStats(d).due > 0);
    } else if (currentFilter === 'paused') {
        filtered = decks.filter(d => d.status === 'paused');
    } else if (currentFilter === 'active') {
        filtered = decks.filter(d => d.status !== 'paused');
    }

    const totalDue = decks.reduce((sum, d) => sum + (d.status !== 'paused' ? getDeckStats(d).due : 0), 0);

    let html = `
        <div class="mem-user-bar">
            <div class="mem-user-info">
                ${currentUser.photoURL ? `<img class="mem-user-avatar" src="${escHtml(currentUser.photoURL)}" alt="">` : ''}
                <span>${escHtml(currentUser.displayName || currentUser.email)}</span>
            </div>
            <button class="mem-signout" data-action="sign-out">退出</button>
        </div>
        <div class="mem-page-header">
            <h1 class="mem-page-title">我的记忆库</h1>
            <div class="mem-page-actions">
                <button class="mem-btn mem-btn-sm" data-action="show-import">批量导入</button>
                <button class="mem-btn mem-btn-sm mem-btn-primary" data-action="show-create-deck">+ 新建</button>
            </div>
        </div>
        <div class="mem-tabs">
            <button class="mem-tab ${currentFilter === 'all' ? 'active' : ''}" data-action="filter" data-filter="all">全部 (${decks.length})</button>
            <button class="mem-tab ${currentFilter === 'due' ? 'active' : ''}" data-action="filter" data-filter="due">待复习${totalDue > 0 ? ' (' + totalDue + ')' : ''}</button>
            <button class="mem-tab ${currentFilter === 'paused' ? 'active' : ''}" data-action="filter" data-filter="paused">已暂停</button>
        </div>
    `;

    if (filtered.length === 0) {
        if (decks.length === 0) {
            html += `
                <div class="mem-empty">
                    <div class="mem-empty-icon">&#x1D4DC;</div>
                    <div class="mem-empty-title">还没有记忆组</div>
                    <div class="mem-empty-desc">创建你的第一个记忆组，或批量导入卡片。</div>
                    <button class="mem-btn mem-btn-primary" data-action="show-create-deck">创建记忆组</button>
                </div>
            `;
        } else {
            html += `
                <div class="mem-empty">
                    <div class="mem-empty-title">无匹配结果</div>
                    <div class="mem-empty-desc">当前筛选条件下没有记忆组。</div>
                </div>
            `;
        }
    } else {
        html += '<div class="mem-deck-grid">';
        for (const deck of filtered) {
            const stats = getDeckStats(deck);
            const paused = deck.status === 'paused';
            html += `
                <div class="mem-deck-card ${paused ? 'paused' : ''}" data-action="open-deck" data-id="${deck.id}">
                    <div class="mem-deck-title">${escHtml(deck.title)}</div>
                    <div class="mem-deck-meta">
                        ${stats.total} 张卡片
                        ${paused ? '<span class="mem-deck-paused-badge">已暂停</span>' : ''}
                        ${!paused && stats.due > 0 ? `<span class="mem-deck-due">${stats.due} 张待复习</span>` : ''}
                    </div>
                    ${!paused && stats.nextReview ? `<div class="mem-deck-meta">${dueLabel(stats.nextReview)}</div>` : ''}
                    <div class="mem-stage-bar">
                        ${stats.stageCounts.map((count, i) =>
                            count > 0 ? `<div class="mem-stage-bar-seg" style="width:${(count / stats.total * 100)}%;background:${STAGES[i].color}"></div>` : ''
                        ).join('')}
                    </div>
                </div>
            `;
        }
        html += '</div>';
    }

    app.innerHTML = html;
}

// ============================================================
// View: Deck Detail
// ============================================================

function renderDeckDetail(deck) {
    const app = document.getElementById('app');
    const stats = getDeckStats(deck);
    const paused = deck.status === 'paused';
    const cards = deck.cards || [];

    let html = `
        <button class="mem-back" data-action="go-home">&larr; 返回记忆库</button>
        <div class="mem-page-header">
            <h1 class="mem-detail-title">${escHtml(deck.title)}</h1>
        </div>
        <div class="mem-stats">
            <div class="mem-stat">
                <div class="mem-stat-value">${stats.total}</div>
                <div class="mem-stat-label">总卡片</div>
            </div>
            <div class="mem-stat">
                <div class="mem-stat-value">${stats.due}</div>
                <div class="mem-stat-label">待复习</div>
            </div>
            <div class="mem-stat">
                <div class="mem-stat-value">${stats.progress}%</div>
                <div class="mem-stat-label">完成度</div>
            </div>
            ${stats.nextReview ? `
            <div class="mem-stat">
                <div class="mem-stat-value">${dueLabel(stats.nextReview)}</div>
                <div class="mem-stat-label">下次复习</div>
            </div>
            ` : ''}
        </div>
        <div class="mem-stage-bar" style="height:8px;border-radius:4px;margin:0 0 8px">
            ${stats.stageCounts.map((count, i) =>
                count > 0 ? `<div class="mem-stage-bar-seg" style="width:${(count / stats.total * 100)}%;background:${STAGES[i].color}"></div>` : ''
            ).join('')}
        </div>
        <div class="mem-stage-legend">
            ${STAGES.map((s, i) => stats.stageCounts[i] > 0 ? `
                <span class="mem-stage-legend-item">
                    <span class="mem-stage-dot" style="background:${s.color}"></span>
                    ${s.name} (${stats.stageCounts[i]})
                </span>
            ` : '').join('')}
        </div>
        <div class="mem-detail-actions">
            ${stats.due > 0 && !paused ? `<button class="mem-btn mem-btn-primary" data-action="start-review" data-id="${deck.id}">开始复习 (${stats.due})</button>` : ''}
            <button class="mem-btn mem-btn-sm" data-action="show-add-card" data-id="${deck.id}">+ 添加卡片</button>
            <button class="mem-btn mem-btn-sm" data-action="show-bulk-add" data-id="${deck.id}">批量添加</button>
            <button class="mem-btn mem-btn-sm" data-action="toggle-status" data-id="${deck.id}">${paused ? '恢复' : '暂停'}</button>
            <button class="mem-btn mem-btn-sm" data-action="show-reset-confirm" data-id="${deck.id}">重置</button>
            <button class="mem-btn mem-btn-sm mem-btn-danger" data-action="show-delete-confirm" data-id="${deck.id}">删除</button>
        </div>
    `;

    if (cards.length === 0) {
        html += `
            <div class="mem-empty">
                <div class="mem-empty-title">还没有卡片</div>
                <div class="mem-empty-desc">添加卡片开始记忆。</div>
            </div>
        `;
    } else {
        html += '<div class="mem-card-list">';
        cards.forEach((card, i) => {
            let dateInfo = '';
            if (card.completed) {
                dateInfo = '已掌握';
            } else if (card.nextReviewDate) {
                dateInfo = dueLabel(card.nextReviewDate);
            } else {
                dateInfo = '待首次复习';
            }
            html += `
                <div class="mem-card-item">
                    <div class="mem-card-content">
                        <div class="mem-card-question">
                            <span class="mem-card-num">${i + 1}.</span>${escHtml(card.question)}
                        </div>
                        <div class="mem-card-info">
                            <span class="mem-stage-badge mem-stage-${card.stage}">${STAGES[card.stage].name}</span>
                            <span>${dateInfo}</span>
                            ${card.reviewHistory && card.reviewHistory.length > 0 ? `<span>已复习 ${card.reviewHistory.length} 次</span>` : ''}
                        </div>
                    </div>
                    <div class="mem-card-actions-inline">
                        <button class="mem-icon-btn" data-action="show-edit-card" data-deck-id="${deck.id}" data-card-id="${card.id}" title="编辑">&#9998;</button>
                        <button class="mem-icon-btn" data-action="delete-card" data-deck-id="${deck.id}" data-card-id="${card.id}" title="删除">&times;</button>
                    </div>
                </div>
            `;
        });
        html += '</div>';
    }

    app.innerHTML = html;
}

// ============================================================
// View: Review Mode
// ============================================================

function startReview(deck) {
    const dueCards = (deck.cards || []).filter(c => isCardDue(c));
    if (dueCards.length === 0) {
        showToast('没有待复习的卡片');
        navigate('/deck/' + deck.id);
        return;
    }
    // Shuffle cards
    for (let i = dueCards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [dueCards[i], dueCards[j]] = [dueCards[j], dueCards[i]];
    }
    reviewSession = {
        deck: deck,
        cards: dueCards,
        currentIndex: 0,
        showAnswer: false,
        passCount: 0,
        failCount: 0
    };
    renderReviewCard();
}

function renderReviewCard() {
    const app = document.getElementById('app');
    const s = reviewSession;

    if (s.currentIndex >= s.cards.length) {
        renderReviewSummary();
        return;
    }

    const card = s.cards[s.currentIndex];
    const progress = ((s.currentIndex) / s.cards.length * 100);
    const total = s.cards.length;
    const current = s.currentIndex + 1;

    let html = `
        <div class="mem-review">
            <div class="mem-review-header">
                <button class="mem-back" data-action="exit-review" data-id="${s.deck.id}">&larr; 退出复习</button>
                <span class="mem-review-count">${current} / ${total}</span>
            </div>
            <div class="mem-review-progress">
                <div class="mem-review-progress-fill" style="width:${progress}%"></div>
            </div>
            <div class="mem-review-card">
                <div class="mem-review-stage">
                    <span class="mem-stage-badge mem-stage-${card.stage}">${STAGES[card.stage].name}</span>
                </div>
                <div class="mem-review-q-label">Q</div>
                <div class="mem-review-question">${escHtml(card.question)}</div>
    `;

    if (s.showAnswer) {
        html += `
                <hr class="mem-review-divider">
                <div class="mem-review-a-label">A</div>
                <div class="mem-review-answer">${escHtml(card.answer)}</div>
                <div class="mem-review-actions">
                    <button class="mem-btn mem-btn-danger mem-btn-lg" data-action="review-fail">再看看</button>
                    <button class="mem-btn mem-btn-success mem-btn-lg" data-action="review-pass">记住了</button>
                </div>
        `;
    } else {
        html += `
                <div class="mem-review-show">
                    <button class="mem-btn mem-btn-lg" data-action="show-answer">显示答案</button>
                </div>
                <div class="mem-review-hint">按空格键显示答案</div>
        `;
    }

    html += `
            </div>
        </div>
    `;

    app.innerHTML = html;
}

function renderReviewSummary() {
    const app = document.getElementById('app');
    const s = reviewSession;

    app.innerHTML = `
        <div class="mem-review">
            <div class="mem-review-summary">
                <div class="mem-review-summary-title">复习完成</div>
                <div class="mem-review-summary-stats">
                    <div>
                        <div class="mem-summary-stat-value pass">${s.passCount}</div>
                        <div class="mem-summary-stat-label">记住了</div>
                    </div>
                    <div>
                        <div class="mem-summary-stat-value fail">${s.failCount}</div>
                        <div class="mem-summary-stat-label">需要再看</div>
                    </div>
                    <div>
                        <div class="mem-summary-stat-value">${s.cards.length}</div>
                        <div class="mem-summary-stat-label">总计</div>
                    </div>
                </div>
                <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
                    <button class="mem-btn mem-btn-primary" data-action="open-deck-nav" data-id="${s.deck.id}">返回记忆组</button>
                    <button class="mem-btn" data-action="go-home">返回记忆库</button>
                </div>
            </div>
        </div>
    `;
    reviewSession = null;
}

// ============================================================
// View: Import
// ============================================================

function renderImport(deckId) {
    const app = document.getElementById('app');
    app.innerHTML = `
        <button class="mem-back" data-action="${deckId ? 'open-deck-nav' : 'go-home'}" data-id="${deckId || ''}">&larr; 返回</button>
        <div class="mem-page-header">
            <h1 class="mem-page-title">${deckId ? '批量添加卡片' : '批量导入'}</h1>
        </div>
        <div class="mem-import-section">
            <p class="mem-import-desc">
                将文本粘贴到下方，系统会自动识别问答对。
            </p>
            <div class="mem-import-format">
                格式：Title:标题 Q. 问题 A. 答案 Q. 问题 A. 答案 ...
            </div>
            ${!deckId ? `
            <div class="mem-field">
                <label class="mem-label">记忆组标题（可选，会被文本中的 Title 覆盖）</label>
                <input class="mem-input" id="import-title" placeholder="输入标题">
            </div>
            ` : ''}
            <div class="mem-field">
                <label class="mem-label">文本内容</label>
                <textarea class="mem-textarea" id="import-text" rows="10" placeholder="粘贴 Q./A. 格式的文本..."></textarea>
            </div>
            <button class="mem-btn" data-action="preview-import">预览</button>
            <div id="import-preview"></div>
            <div id="import-actions" style="margin-top:16px"></div>
        </div>
    `;
}

function previewImport() {
    const text = document.getElementById('import-text').value;
    const result = parseImportText(text);
    const previewEl = document.getElementById('import-preview');
    const actionsEl = document.getElementById('import-actions');

    if (result.cards.length === 0) {
        previewEl.innerHTML = '<p style="color:var(--color-text-secondary);font-size:14px;margin-top:16px">未识别到任何问答对。请检查格式。</p>';
        actionsEl.innerHTML = '';
        return;
    }

    const titleInput = document.getElementById('import-title');
    if (titleInput && result.title) {
        titleInput.value = result.title;
    }

    let html = `
        <div class="mem-import-preview">
            <div class="mem-import-preview-title">识别到 ${result.cards.length} 张卡片${result.title ? '（标题: ' + escHtml(result.title) + '）' : ''}</div>
    `;
    for (const card of result.cards) {
        html += `
            <div class="mem-import-preview-card">
                <div class="mem-import-preview-q">Q. ${escHtml(card.question.substring(0, 100))}${card.question.length > 100 ? '...' : ''}</div>
                <div class="mem-import-preview-a">A. ${escHtml(card.answer.substring(0, 100))}${card.answer.length > 100 ? '...' : ''}</div>
            </div>
        `;
    }
    html += '</div>';
    previewEl.innerHTML = html;

    actionsEl.innerHTML = `<button class="mem-btn mem-btn-primary" data-action="do-import">确认导入 (${result.cards.length} 张)</button>`;
}

async function doImport() {
    const text = document.getElementById('import-text').value;
    const result = parseImportText(text);
    if (result.cards.length === 0) return;

    const route = getRoute();
    const deckId = route.parts[1] || null;

    if (deckId) {
        // Add cards to existing deck
        const deck = await loadDeck(deckId);
        if (!deck) { showToast('记忆组不存在'); return; }
        deck.cards = (deck.cards || []).concat(result.cards);
        await saveDeck(deck);
        showToast(`已添加 ${result.cards.length} 张卡片`);
        navigate('/deck/' + deckId);
    } else {
        // Create new deck
        const titleInput = document.getElementById('import-title');
        const title = (titleInput && titleInput.value.trim()) || result.title || '未命名记忆组';
        const deck = {
            title: title,
            status: 'active',
            cards: result.cards
        };
        const newId = await saveDeck(deck);
        showToast(`已创建记忆组，${result.cards.length} 张卡片`);
        navigate('/deck/' + newId);
    }
}

// ============================================================
// Modals
// ============================================================

function showModal(title, bodyHtml, footerHtml) {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
        <div class="mem-modal-overlay" data-action="close-modal">
            <div class="mem-modal" onclick="event.stopPropagation()">
                <div class="mem-modal-header">
                    <span class="mem-modal-title">${title}</span>
                    <button class="mem-modal-close" data-action="close-modal">&times;</button>
                </div>
                <div class="mem-modal-body">${bodyHtml}</div>
                <div class="mem-modal-footer">${footerHtml}</div>
            </div>
        </div>
    `;
}

function closeModal() {
    document.getElementById('modal-root').innerHTML = '';
}

function showCreateDeckModal() {
    showModal(
        '新建记忆组',
        `<div class="mem-field">
            <label class="mem-label">标题</label>
            <input class="mem-input" id="modal-deck-title" placeholder="记忆组标题" autofocus>
        </div>`,
        `<button class="mem-btn mem-btn-ghost" data-action="close-modal">取消</button>
         <button class="mem-btn mem-btn-primary" data-action="create-deck">创建</button>`
    );
    setTimeout(() => {
        const input = document.getElementById('modal-deck-title');
        if (input) input.focus();
    }, 100);
}

async function createDeck() {
    const input = document.getElementById('modal-deck-title');
    const title = input ? input.value.trim() : '';
    if (!title) { showToast('请输入标题'); return; }
    const id = await saveDeck({ title, status: 'active', cards: [] });
    closeModal();
    showToast('已创建');
    navigate('/deck/' + id);
}

function showAddCardModal(deckId) {
    showModal(
        '添加卡片',
        `<div class="mem-field">
            <label class="mem-label">问题</label>
            <textarea class="mem-textarea" id="modal-card-q" rows="3" placeholder="输入问题"></textarea>
        </div>
        <div class="mem-field">
            <label class="mem-label">答案</label>
            <textarea class="mem-textarea" id="modal-card-a" rows="4" placeholder="输入答案"></textarea>
        </div>`,
        `<button class="mem-btn mem-btn-ghost" data-action="close-modal">取消</button>
         <button class="mem-btn mem-btn-primary" data-action="save-new-card" data-deck-id="${deckId}">添加</button>`
    );
    setTimeout(() => {
        const input = document.getElementById('modal-card-q');
        if (input) input.focus();
    }, 100);
}

async function saveNewCard(deckId) {
    const q = document.getElementById('modal-card-q').value.trim();
    const a = document.getElementById('modal-card-a').value.trim();
    if (!q || !a) { showToast('请填写问题和答案'); return; }
    const deck = await loadDeck(deckId);
    if (!deck) return;
    if (!deck.cards) deck.cards = [];
    deck.cards.push({
        id: uid(),
        question: q,
        answer: a,
        stage: 0,
        nextReviewDate: null,
        lastReviewDate: null,
        completed: false,
        reviewHistory: []
    });
    await saveDeck(deck);
    closeModal();
    showToast('已添加');
    renderDeckDetail(deck);
}

function showEditCardModal(deckId, cardId) {
    const findCard = async () => {
        const deck = await loadDeck(deckId);
        if (!deck) return;
        const card = (deck.cards || []).find(c => c.id === cardId);
        if (!card) return;
        showModal(
            '编辑卡片',
            `<div class="mem-field">
                <label class="mem-label">问题</label>
                <textarea class="mem-textarea" id="modal-card-q" rows="3">${escHtml(card.question)}</textarea>
            </div>
            <div class="mem-field">
                <label class="mem-label">答案</label>
                <textarea class="mem-textarea" id="modal-card-a" rows="4">${escHtml(card.answer)}</textarea>
            </div>
            ${card.reviewHistory && card.reviewHistory.length > 0 ? `
            <div class="mem-field">
                <label class="mem-label">复习记录 (${card.reviewHistory.length} 次)</label>
                <div class="mem-history">
                    ${card.reviewHistory.slice(-5).map(h => `
                        <div class="mem-history-item">
                            ${formatDateFull(h.date)} &middot; ${STAGES[h.from] ? STAGES[h.from].name : '?'} &rarr; ${STAGES[h.to] ? STAGES[h.to].name : '?'} &middot; ${h.result === 'pass' ? '通过' : '未通过'}
                        </div>
                    `).join('')}
                </div>
            </div>` : ''}`,
            `<button class="mem-btn mem-btn-ghost" data-action="close-modal">取消</button>
             <button class="mem-btn mem-btn-primary" data-action="save-edit-card" data-deck-id="${deckId}" data-card-id="${cardId}">保存</button>`
        );
    };
    findCard();
}

async function saveEditCard(deckId, cardId) {
    const q = document.getElementById('modal-card-q').value.trim();
    const a = document.getElementById('modal-card-a').value.trim();
    if (!q || !a) { showToast('请填写问题和答案'); return; }
    const deck = await loadDeck(deckId);
    if (!deck) return;
    const card = (deck.cards || []).find(c => c.id === cardId);
    if (!card) return;
    card.question = q;
    card.answer = a;
    await saveDeck(deck);
    closeModal();
    showToast('已保存');
    renderDeckDetail(deck);
}

async function deleteCard(deckId, cardId) {
    const deck = await loadDeck(deckId);
    if (!deck) return;
    deck.cards = (deck.cards || []).filter(c => c.id !== cardId);
    await saveDeck(deck);
    showToast('已删除');
    renderDeckDetail(deck);
}

function showDeleteConfirm(deckId) {
    showModal(
        '删除确认',
        `<div class="mem-confirm-text">确定要删除这个记忆组吗？</div>
         <div class="mem-confirm-sub">此操作不可恢复，所有卡片和复习记录将被永久删除。</div>`,
        `<button class="mem-btn mem-btn-ghost" data-action="close-modal">取消</button>
         <button class="mem-btn mem-btn-danger" data-action="confirm-delete-deck" data-id="${deckId}">删除</button>`
    );
}

async function confirmDeleteDeck(deckId) {
    await deleteDeckById(deckId);
    closeModal();
    showToast('已删除');
    navigate('/');
}

function showResetConfirm(deckId) {
    showModal(
        '重置确认',
        `<div class="mem-confirm-text">确定要重置这个记忆组的所有进度吗？</div>
         <div class="mem-confirm-sub">所有卡片将回到初始阶段，复习记录将被保留。</div>`,
        `<button class="mem-btn mem-btn-ghost" data-action="close-modal">取消</button>
         <button class="mem-btn mem-btn-danger" data-action="confirm-reset-deck" data-id="${deckId}">重置</button>`
    );
}

async function confirmResetDeck(deckId) {
    const deck = await loadDeck(deckId);
    if (!deck) return;
    for (const card of (deck.cards || [])) {
        card.stage = 0;
        card.nextReviewDate = null;
        card.lastReviewDate = null;
        card.completed = false;
    }
    await saveDeck(deck);
    closeModal();
    showToast('已重置');
    renderDeckDetail(deck);
}

async function toggleDeckStatus(deckId) {
    const deck = await loadDeck(deckId);
    if (!deck) return;
    deck.status = deck.status === 'paused' ? 'active' : 'paused';
    await saveDeck(deck);
    showToast(deck.status === 'paused' ? '已暂停' : '已恢复');
    renderDeckDetail(deck);
}

// ============================================================
// Review Actions
// ============================================================

async function handleReviewPass() {
    const s = reviewSession;
    if (!s) return;
    const card = s.cards[s.currentIndex];
    const oldStage = card.stage;
    card.stage = Math.min(oldStage + 1, STAGES.length - 1);
    card.lastReviewDate = Date.now();
    card.completed = card.stage === STAGES.length - 1;
    card.nextReviewDate = card.completed ? null : getNextReviewDate(oldStage);
    if (!card.reviewHistory) card.reviewHistory = [];
    card.reviewHistory.push({ date: Date.now(), from: oldStage, to: card.stage, result: 'pass' });

    // Update in deck
    const deck = s.deck;
    const idx = deck.cards.findIndex(c => c.id === card.id);
    if (idx >= 0) deck.cards[idx] = card;
    await saveDeck(deck);

    s.passCount++;
    s.currentIndex++;
    s.showAnswer = false;
    renderReviewCard();
}

async function handleReviewFail() {
    const s = reviewSession;
    if (!s) return;
    const card = s.cards[s.currentIndex];
    const oldStage = card.stage;
    card.stage = 0;
    card.lastReviewDate = Date.now();
    card.completed = false;
    card.nextReviewDate = Date.now();
    if (!card.reviewHistory) card.reviewHistory = [];
    card.reviewHistory.push({ date: Date.now(), from: oldStage, to: 0, result: 'fail' });

    const deck = s.deck;
    const idx = deck.cards.findIndex(c => c.id === card.id);
    if (idx >= 0) deck.cards[idx] = card;
    await saveDeck(deck);

    s.failCount++;
    s.currentIndex++;
    s.showAnswer = false;
    renderReviewCard();
}

// ============================================================
// Event Delegation
// ============================================================

function handleAction(action, dataset) {
    switch (action) {
        case 'sign-in':
            signIn();
            break;
        case 'sign-out':
            doSignOut();
            break;
        case 'go-home':
            navigate('/');
            break;
        case 'open-deck':
            navigate('/deck/' + dataset.id);
            break;
        case 'open-deck-nav':
            navigate('/deck/' + dataset.id);
            break;
        case 'start-review':
            navigate('/review/' + dataset.id);
            break;
        case 'exit-review':
            reviewSession = null;
            navigate('/deck/' + dataset.id);
            break;
        case 'show-answer':
            if (reviewSession) {
                reviewSession.showAnswer = true;
                renderReviewCard();
            }
            break;
        case 'review-pass':
            handleReviewPass();
            break;
        case 'review-fail':
            handleReviewFail();
            break;
        case 'filter':
            currentFilter = dataset.filter;
            renderDeckList();
            break;
        case 'show-create-deck':
            showCreateDeckModal();
            break;
        case 'create-deck':
            createDeck();
            break;
        case 'show-add-card':
            showAddCardModal(dataset.id);
            break;
        case 'save-new-card':
            saveNewCard(dataset.deckId);
            break;
        case 'show-edit-card':
            showEditCardModal(dataset.deckId, dataset.cardId);
            break;
        case 'save-edit-card':
            saveEditCard(dataset.deckId, dataset.cardId);
            break;
        case 'delete-card':
            deleteCard(dataset.deckId, dataset.cardId);
            break;
        case 'show-delete-confirm':
            showDeleteConfirm(dataset.id);
            break;
        case 'confirm-delete-deck':
            confirmDeleteDeck(dataset.id);
            break;
        case 'show-reset-confirm':
            showResetConfirm(dataset.id);
            break;
        case 'confirm-reset-deck':
            confirmResetDeck(dataset.id);
            break;
        case 'toggle-status':
            toggleDeckStatus(dataset.id);
            break;
        case 'show-import':
            navigate('/import');
            break;
        case 'show-bulk-add':
            navigate('/import/' + dataset.id);
            break;
        case 'preview-import':
            previewImport();
            break;
        case 'do-import':
            doImport();
            break;
        case 'close-modal':
            closeModal();
            break;
    }
}

document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (el) {
        e.preventDefault();
        handleAction(el.dataset.action, el.dataset);
    }
});

// Keyboard shortcuts for review
document.addEventListener('keydown', (e) => {
    if (!reviewSession) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.code === 'Space' && !reviewSession.showAnswer) {
        e.preventDefault();
        reviewSession.showAnswer = true;
        renderReviewCard();
    } else if (reviewSession.showAnswer) {
        if (e.code === 'ArrowLeft' || e.key === '1') {
            e.preventDefault();
            handleReviewFail();
        } else if (e.code === 'ArrowRight' || e.key === '2') {
            e.preventDefault();
            handleReviewPass();
        }
    }
});

// Handle Enter in modal inputs
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const modal = document.querySelector('.mem-modal');
    if (!modal) return;
    if (e.target.tagName === 'TEXTAREA') return;
    const primaryBtn = modal.querySelector('.mem-btn-primary');
    if (primaryBtn) {
        e.preventDefault();
        primaryBtn.click();
    }
});

// ============================================================
// Initialize
// ============================================================

async function init() {
    // Check for existing token in localStorage
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
        try {
            const user = await apiGet('/auth/me');
            if (user && user.id) {
                currentUser = user;
            } else {
                localStorage.removeItem(TOKEN_KEY);
            }
        } catch (e) {
            localStorage.removeItem(TOKEN_KEY);
        }
    }
    handleRoute();
    window.addEventListener('hashchange', handleRoute);
}

document.addEventListener('DOMContentLoaded', init);
