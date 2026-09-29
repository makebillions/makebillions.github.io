// ============================================================
// record.js — real alerts, one tier at a time.
//
// Free and PRO are examples held as data: real lines subscribers received
// (call logs, Sep 2026) — Free written without reasoning, PRO with it —
// picked among calls that price did not contradict over the next sessions.
// Real time is the stock on the chart, as sent. The chart is live.
// ============================================================

const ICONS = {
    rally: `<svg viewBox="0 0 16 16" fill="none"><path d="M8 2l5 6H9v6H7V8H3l5-6z" fill="#22c55e"/></svg>`,
    drop: `<svg viewBox="0 0 16 16" fill="none"><path d="M8 14l-5-6h4V2h2v6h4l-5 6z" fill="#ef4444"/></svg>`,
    momentum: `<svg viewBox="0 0 16 16" fill="none"><path d="M2 12l4-4 2 2 6-7v3h2V1h-5v2h3L9 9 7 7l-5 5z" fill="#f59e0b"/></svg>`,
    attention: `<svg viewBox="0 0 16 16" fill="none"><path d="M8 1l7 13H1L8 1z" fill="#f97316"/><rect x="7.2" y="5.5" width="1.6" height="5" rx=".5" fill="#fff"/><circle cx="8" cy="12" r=".9" fill="#fff"/></svg>`,
};
ICONS.dip = ICONS.drop;
ICONS.important = ICONS.attention;

// t = unix seconds of the fire, so a card can select its dot on the chart.
const RECORD = [
    {
        stock: "SBER", t: 1790604240, when: "28 Sep 14:04",
        free: {
            icon: "drop",
            dir: "down",
            chip: "Floor under pressure · 274",
            was: "slow 11-session slide from 289.78",
            now: "opened near 276.35 and fell to 273.60 on high volume",
            st: "price lost 275.39 for the first time in 18 sessions; a drop that may accelerate if 265.86 fails",
            lt: "a recovery from a 20.3% crash that ended in July",
        },
    },
    {
        stock: "ORCL", t: 1790380440, when: "25 Sep 23:54",
        pro: {
            icon: "drop",
            dir: "down",
            chip: "Floor under pressure · 137",
            was: "a slow three-week slide from 169.12, the biggest 19% fall in five weeks",
            now: "slipped to 137.08 and sits on 137.02 above the 136.96 low, with the broader market higher",
            st: "price has slid back to 137.02, the line every one of the last 25 closes has held; the biggest fall in five weeks leaves it stretched, and a break into 114-122 means more downside",
            lt: "the 80% climb from 137.83 in April to 248.13 in June is entirely undone; price is back at the ground it left",
        },
    },
    {
        stock: "QCOM", t: 1790354160, when: "25 Sep 16:36",
        pro: {
            icon: "momentum",
            dir: "up",
            chip: "Breaking higher · 198",
            was: "Nine-session climb of 16% from 171.01, biggest in five weeks and quick",
            now: "Opened above yesterday's close, dipped to 195.20, then pushed to 198.21 as the broader market lagged",
            st: "A recovery since late July has taken price above July's stalling area, the biggest run in five weeks and stretched; a fall back into 188-195 would end the push",
            lt: "The summer's 23% slide into a 147.61 low at the end of July has been more than undone by a 34% climb back to 198",
        },
    },
    {
        stock: "COST", t: 1790353920, when: "25 Sep 16:32",
        pro: {
            icon: "rally",
            dir: "up",
            chip: "Buyers stepping in · 899",
            was: "A quick one-session bounce from 885.84, up 1.5% — modest but fast for this stock",
            now: "Slipped to 885.84, then shot back to 899.29 in the last few minutes",
            st: "Price fell under 893.85 today and won it back fast, inside a four-month, 18% slide, with the broader market barely up; a drop below 885.84, today's six-month low, would end the bounce",
            lt: "The spring rally up to May's 1094.90 peak has fully unwound in an 82-session, 18% fall, leaving price near its six-month low",
        },
    },
    {
        stock: "PLZL", t: 1790257560, when: "24 Sep 13:46",
        pro: {
            icon: "rally",
            dir: "up",
            chip: "Buyers stepping in · 956",
            was: "A slow nine-session slide of 10.5% from 1041.20 to 931.80, modest for this stock",
            now: "An early slide to 931.80 on heavy opening volume, then a climb back to 955.80",
            st: "Three weeks inside a 945.20-1068.40 band, crossing its middle three times, today's dip to 931.80 bought back above 949.52 while the market slips; a drop under 949.52 would say the bounce has failed",
            lt: "Sitting just above the floor of a 60% collapse from April to July; the fast August rally to 1367 has since been handed back",
        },
    },
    {
        stock: "NLMK", t: 1790254740, when: "24 Sep 12:59",
        pro: {
            icon: "drop",
            dir: "down",
            chip: "Floor under pressure · 70.3",
            was: "A five-session fall from 75.82 to 69.20, a slow 8.7%, modest for this stock",
            now: "Slid from 72.52 to 70.32, now at the session low, midday selling on heavier volume",
            st: "The 17% bounce off 69.20 has stalled, leaving price back under 70.39, which four sessions closed above, with the broader market barely lower; a close below keeps the nine-session 70.36-73.60 range's floor under pressure",
            lt: "A 42% crash from April to July, then a 34% rally off 57.00; today is 23% above that low, 28% below where the fall began",
        },
    },
    {
        stock: "NLMK", t: 1790028180, when: "21 Sep 22:03",
        free: {
            icon: "attention",
            dir: "up",
            chip: "Holding the floor · 70.5",
            was: "a slow 7.5% slide from 76.22 over ten sessions, gentle for this stock",
            now: "dipped to 69.36 early, climbed back to 70.50, now just above 70.41",
            st: "three days boxed in 70.36-73.60 and today's dip below 70.41 was bought back, so the floor is being tested rather than lost; a close under 70.41 would say the buyers have stepped aside",
            lt: "a 43% crash from March's 100.18 to July's 57.00, and the 34% bounce off that low has stalled well short of repairing it",
        },
    },
    {
        stock: "NVDA", t: 1789775520, when: "18 Sep 23:52",
        free: {
            icon: "momentum",
            dir: "up",
            chip: "Breaking higher · 222",
            was: "slow five-session climb from 209.11",
            now: "ran from 219.25 to 222.48 and held most of the gain",
            st: "price has won back 221.90 after six sessions below it; the recovery is steady but slow. A drop below 219.25 would mean the break failed",
            lt: "sits 5.6% below the peak of a 42.5% rally that ran through May",
        },
    },
    {
        stock: "AMD", t: 1789772100, when: "18 Sep 22:55",
        free: {
            icon: "momentum",
            dir: "up",
            chip: "Breaking higher · 557",
            was: "fast 11-session climb from 442.25, the biggest such run in five weeks",
            now: "ran from 541.89 to 557.10 and is holding the high",
            st: "a steep rally that has pushed price into a major ceiling; the move is stretched after its biggest run in over a month. A loss of 553 would be the break",
            lt: "a recovery that has erased most of the summer's biggest drop, which saw price fall 22.2% in five sessions",
        },
    },
];

// Real time is the LANDING tab. It is the only one whose cards exist for every
// stock, so it is the only one that can be a default: the example tabs cover
// a few names, and a visitor who opened on one of them and searched anything
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
