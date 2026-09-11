// ============================================================
// record.js — the frozen record: real alerts, one tier at a time.
//
// The cards here are NOT fetched. They are the checked alert text from the
// brief, held as data so the Free/PRO tab swaps a read of the SAME fire
// rather than a different event. The chart beside them is live and keeps
// running past each alert; only the words are frozen.
// ============================================================

const ICONS = {
    rally: `<svg viewBox="0 0 16 16" fill="none"><path d="M8 2l5 6H9v6H7V8H3l5-6z" fill="#22c55e"/></svg>`,
    drop: `<svg viewBox="0 0 16 16" fill="none"><path d="M8 14l-5-6h4V2h2v6h4l-5 6z" fill="#ef4444"/></svg>`,
    momentum: `<svg viewBox="0 0 16 16" fill="none"><path d="M2 12l4-4 2 2 6-7v3h2V1h-5v2h3L9 9 7 7l-5 5z" fill="#f59e0b"/></svg>`,
    attention: `<svg viewBox="0 0 16 16" fill="none"><path d="M8 1l7 13H1L8 1z" fill="#f97316"/><rect x="7.2" y="5.5" width="1.6" height="5" rx=".5" fill="#fff"/><circle cx="8" cy="12" r=".9" fill="#fff"/></svg>`,
};

// t = unix seconds of the fire, so a card can select its dot on the chart.
const RECORD = [
    {
        stock: "AVGO",
        t: Date.UTC(2026, 7, 14, 16, 30) / 1000,
        when: "14 Aug 16:30",
        next: "Price reached 391 the next session, cut through 383-400 the day after, and touched 357.89 three sessions later — the top of the second zone the PRO line named.",
        free: {
            icon: "drop", dir: "down", chip: "Floor under pressure · 408",
            was: "5-session slide from 432.31",
            now: "dropped to 407.68",
            st: "the 383-400 area is the next floor and it is 3.8% away, so a further slide may occur while the broader market remains flat",
            lt: "the summer floor at 358-375 remains the primary support for the long-term recovery",
        },
        pro: {
            icon: "drop", dir: "down", chip: "Sharp drop · 408",
            was: "five-session slide from 432.31 into today",
            now: "broke under 412.07 to 407.68, market flat",
            st: "Wait for a test of 383-400 before buying; the downside view is wrong if price rallies back into 424-434, 5.2% above.",
            lt: "If the slide continues through 383-400, the next floor could be 358-375, 10.5% below, the summer low, within a few weeks.",
        },
    },
    {
        stock: "AMZN",
        t: Date.UTC(2026, 7, 14, 17, 36) / 1000,
        when: "14 Aug 17:36",
        next: "Nothing. Over the next four sessions the stock moved about one and a half percent and never came near the zone the alert named. The alert said wait, and waiting was the right thing to do.",
        free: null,   // no free-voice line exists for this fire yet
        pro: {
            icon: "drop", dir: "down", chip: "Breaking down · 264",
            was: "five-session slide from 279.98 into today",
            now: "lost the 270-276 floor, now 263.77",
            st: "The broader market is flat, so this is stock-specific; wait for a slide toward 227-240 before buying, with the down view wrong if price climbs back into 270-276, 3.5% above.",
            lt: "If the slide continues, the next real floor is 227-240, 11.7% below, within a few weeks, with 199-211 below that at 22.3%.",
        },
    },
    {
        stock: "TSLA",
        t: Date.UTC(2026, 7, 14, 17, 44) / 1000,
        when: "14 Aug 17:44",
        next: "Price slid to 331.47 over two sessions — inside the floor the PRO line named — then rallied and stopped at 351.39, one tick past the 350.90 the PRO line said had to be cleared first.",
        free: {
            icon: "momentum", dir: "up", chip: "Breaking higher · 343",
            was: "3-session climb from 323.68",
            now: "broke above the 328-337 ceiling",
            st: "369-385 is the next major shelf and the broader market is flat, so a move toward it may be slow",
            lt: "the recovery from 298 is only two weeks old, but getting back to 425-453 would mark a full return to the May peak",
        },
        pro: {
            icon: "drop", dir: "down", chip: "Losing steam · 343",
            was: "2-session climb from 327.20",
            now: "stalled and turned back from 350.90",
            st: "a slide has room to the 328-337 floor, 2.9% below, while a renewed push would need to clear today's 350.90 high before the 369-385 shelf opens up — the bigger move is down",
            lt: "a holder is watching whether the floor that caught the August recovery can hold again, with the crash low at 297-312 below it",
        },
    },
];

// Real time is the LANDING tab. It is the only one whose cards exist for every
// stock, so it is the only one that can be a default: the frozen tabs cover
// three names, and a visitor who opened on one of them and searched anything
// else got a chart with nothing on it.
let recordTier = "live";   // free | pro | live

const TIER_BAND = {
    free: ["Free", "our fast model"],
    pro: ["PRO", "our reasoning model"],
    live: ["Live", "as sent"],
};

function currentRecordTicker() {
    const t = (document.getElementById("chartStockTitle")?.textContent || "").trim();
    return t.split(/\s+/)[0].toUpperCase();
}

function alertCardHtml(ticker, row, a, selected) {
    const tone = a.dir === "up" ? "up" : "down";
    return `
    <article class="event-card alert-card tier-${recordTier}${selected ? " on-chart" : ""}" data-time="${row.t}" data-stock="${ticker}">
        <div class="tier-band">
            <span class="tier-name">${TIER_BAND[recordTier][0]}</span>
            <span class="tier-model">${TIER_BAND[recordTier][1]}</span>
        </div>
        <div class="px-5 pt-4 pb-3">
            <div class="card-head">
                <span class="ticker">${ticker}</span>
                <span class="event-when when">${row.when}</span>
            </div>
            ${a.icon || a.chip ? `<div class="chip-row">
                ${a.icon && ICONS[a.icon] ? `<span class="ico">${ICONS[a.icon]}</span>` : ""}
                ${a.chip ? `<span class="dir-chip ${tone}">${a.chip}</span>` : ""}
            </div>` : ""}
            ${a.was ? `<p class="was">${a.was}</p>` : ""}
            ${a.now ? `<p class="now read">${a.now}</p>` : ""}
        </div>
        ${a.st || a.lt ? `<div class="card-foot">
            ${a.st ? `<div class="read-row"><span class="read-tag st"><span class="dot"></span>Short term</span><p class="read-text">${a.st}</p></div>` : ""}
            ${a.lt ? `<div class="read-row"><span class="read-tag lt"><span class="dot"></span>Long term</span><p class="read-text">${a.lt}</p></div>` : ""}
        </div>` : ""}
        ${row.next ? `<div class="next-strip"><span class="next-label">What happened next</span><p>${row.next}</p></div>` : ""}
    </article>`;
}

function liveRows(ticker) {
    // chart.js decodes the shipped signals; shape them like a record row so one
    // card renderer serves both. No outcome strip — a live alert has no "next".
    return (window.__liveAlerts || []).slice().sort((a, b) => b.time - a.time).map((s) => {
        const d = new Date(s.time * 1000);
        const when = `${String(d.getUTCDate()).padStart(2, "0")} ` +
            ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getUTCMonth()] +
            ` ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
        return { stock: ticker, t: s.tb, when, next: "",
                 live: { icon: s.icon, dir: s.dir === "buy" ? "up" : "down",
                         chip: s.chip, was: s.was, now: s.now, st: s.st, lt: s.lt } };
    });
}

function renderRecord() {
    const list = document.getElementById("eventsList");
    if (!list) return;
    const rows = recordTier === "live"
        ? liveRows(currentRecordTicker())
        : RECORD.filter((r) => r[recordTier]);
    const selected = currentRecordTicker();
    list.innerHTML = rows.length
        ? rows.map((r) => alertCardHtml(r.stock, r, r[recordTier],
                                        r.stock === selected)).join("")
        : `<p class="record-empty">Alerts for this stock arrive in Telegram once you're set up.</p>`;
    list.scrollTop = 0;
}

// The tab swaps the READ, never the event: same stock, same minute.
document.getElementById("recordTabs")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".rec-tab");
    if (!btn || btn.dataset.tier === recordTier) return;
    recordTier = btn.dataset.tier;
    document.querySelectorAll("#recordTabs .rec-tab").forEach((b) => {
        b.classList.toggle("rec-tab-on", b.dataset.tier === recordTier);
    });
    renderRecord();
    if (typeof renderMarkers === "function") renderMarkers();
});

// The demo pills drive the record DIRECTLY. The record is frozen text, so it
// must switch even when the chart API is unreachable — js.js only wires these
// pills after /api/stocks answers, and the words should never wait on that.
function selectRecordStock(ticker) {
    const title = document.getElementById("chartStockTitle");
    if (title) title.textContent = ticker;
    document.querySelectorAll("#presetPills .preset-pill").forEach((b) =>
        b.classList.toggle("active", b.dataset.ticker === ticker));
    const stock = (window.__allStocks || []).find((s) => s.ticker === ticker);
    if (stock && typeof setStock === "function") setStock([stock]);
    else renderRecord();
}

document.getElementById("presetPills")?.addEventListener("click", (e) => {
    const pill = e.target.closest(".preset-pill");
    if (pill) selectRecordStock(pill.dataset.ticker);
});

// A card still points at its own bar on the chart.
document.getElementById("eventsList")?.addEventListener("click", (e) => {
    const card = e.target.closest(".event-card");
    if (!card) return;
    const stock = card.dataset.stock;
    if (stock && stock !== currentRecordTicker()) {
        selectRecordStock(stock);
        return;
    }
    const t = Number(card.dataset.time);
    if (t && typeof scrollChartToTimeLocal === "function") scrollChartToTimeLocal(t);
});

window.__renderRecord = renderRecord;

// The chart's dots must BE the alerts in the list. Without this the markers
// come from the pre-computed signal file and point at unrelated dates, which
// destroys the one thing this section is for: an alert you can check against
// the bars beside it.
window.__recordTier = () => recordTier;

// Searching a name the frozen week does not cover would otherwise leave three
// unrelated cards beside its chart. Real time always has something to say
// about the stock actually on screen.
window.__forceLiveTab = () => {
    if (recordTier === "live") return;
    recordTier = "live";
    document.querySelectorAll("#recordTabs .rec-tab").forEach((b) =>
        b.classList.toggle("rec-tab-on", b.dataset.tier === "live"));
};

window.__recordMarks = (ticker) =>
    RECORD.filter((r) => r.stock === ticker && r[recordTier])
          .map((r) => ({ t: r.t, dir: r[recordTier].dir }));

// The record is frozen data, so it must not wait on a chart fetch. If the API
// is slow or down the words still stand — they are the product; the chart is
// reference.
// Paint the tab strip from `recordTier` rather than trusting the markup: the
// default lives in one place, and HTML that disagreed with it would show a
// highlighted tab whose content is not on screen.
document.querySelectorAll("#recordTabs .rec-tab").forEach((b) =>
    b.classList.toggle("rec-tab-on", b.dataset.tier === recordTier));
renderRecord();
