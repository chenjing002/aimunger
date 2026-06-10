(function () {
    var TOKEN_KEY = 'mem_token';
    var CACHE_KEY = 'mem_due_count';
    var CACHE_TS = 'mem_due_ts';
    var CACHE_TTL = 30 * 60 * 1000; // 30 minutes
    var API = 'https://aimunger-memory.chenjingluote.workers.dev/api/memory';

    var token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    var link = document.querySelector('a[href="/memory/"]') || document.querySelector('a[href="/ankicard/"]');
    if (!link) return;

    function showDot(count) {
        if (count <= 0) return;
        if (link.querySelector('.mem-dot')) return;
        link.style.position = 'relative';
        var dot = document.createElement('span');
        dot.className = 'mem-dot';
        dot.style.cssText = 'position:absolute;top:-2px;right:-8px;width:7px;height:7px;background:#dc2626;border-radius:50%;';
        link.appendChild(dot);
    }

    // Check cache first
    var cached = localStorage.getItem(CACHE_KEY);
    var cachedTs = localStorage.getItem(CACHE_TS);
    if (cached !== null && cachedTs && (Date.now() - Number(cachedTs)) < CACHE_TTL) {
        showDot(Number(cached));
        return;
    }

    // Fetch from API
    fetch(API + '/decks', { headers: { 'Authorization': 'Bearer ' + token } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (decks) {
            if (!decks) return;
            var due = 0;
            for (var i = 0; i < decks.length; i++) {
                if (decks[i].status === 'paused') continue;
                var cards = decks[i].cards || [];
                for (var j = 0; j < cards.length; j++) {
                    var c = cards[j];
                    if (c.completed) continue;
                    if (c.nextReviewDate === null || c.nextReviewDate === undefined || c.nextReviewDate <= Date.now()) {
                        due++;
                    }
                }
            }
            localStorage.setItem(CACHE_KEY, String(due));
            localStorage.setItem(CACHE_TS, String(Date.now()));
            showDot(due);
        })
        .catch(function () {});
})();
