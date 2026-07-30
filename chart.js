// ============================================================
// chart.js — Chart instance, markers, events list, shortcuts
// Depends on: LightweightCharts (global), SIGNAL_ICONS, MODE_TIERS, currentMode (from js.js)
// Exposes: chart, series, setChart(), renderMarkers(), scrollChartToTimeLocal(),
//          renderSignalShortcutsFromEvents(), filterAndRenderEvents(),
//          setEvents(), showLoader/hideLoader, showListLoader/hideListLoader,
//          window.__chartState (for agent.js)
// ============================================================

// --- Signal icon SVGs (rally, dip, momentum, attention) ---
const SIGNAL_ICONS = {
    rally: `<svg class="inline-block w-4 h-4 mr-1 align-text-bottom" viewBox="0 0 16 16" fill="none"><path d="M8 2l5 6H9v6H7V8H3l5-6z" fill="#22c55e"/></svg>`,
    dip: `<svg class="inline-block w-4 h-4 mr-1 align-text-bottom" viewBox="0 0 16 16" fill="none"><path d="M8 14l-5-6h4V2h2v6h4l-5 6z" fill="#ef4444"/></svg>`,
    momentum: `<svg class="inline-block w-4 h-4 mr-1 align-text-bottom" viewBox="0 0 16 16" fill="none"><path d="M2 12l4-4 2 2 6-7v3h2V1h-5v2h3L9 9 7 7l-5 5z" fill="#f59e0b"/></svg>`,
    attention: `<svg class="inline-block w-4 h-4 mr-1 align-text-bottom" viewBox="0 0 16 16" fill="none"><path d="M8 1l7 13H1L8 1z" fill="#f97316"/><rect x="7.2" y="5.5" width="1.6" height="5" rx=".5" fill="#fff"/><circle cx="8" cy="12" r=".9" fill="#fff"/></svg>`,
};

// New design palette (scetch-tmp/DeepDIP Final.html): ink on paper,
// direction shown by marker position (buy below / sell above bar).
const INK = "#15171c";
const PAPER = "#f6f5f1";
const MARKER_BUY_COLOR  = INK;
const MARKER_SELL_COLOR = INK;

// --- Chart state ---
var mEvents = [];
var allAlerts = [];
let currentCandleRange = null;

// --- DOM refs (chart-specific, others in js.js) ---
const shimmer = document.getElementById("shimmerLoader");
const eventsList = document.getElementById("eventsList");
const signalShortcuts = document.getElementById("signalShortcuts");

// ============================================================
// Chart instance (LightweightCharts)
// ============================================================
const chartContainer = document.getElementById("chart");
var chart = LightweightCharts.createChart(chartContainer, {
    autoSize: true,
    handleScroll: {
        mouseWheel: false,
        pressedMouseMove: true,
        vertTouchDrag: false,
    },
    handleScale: {
        mouseWheel: false,
        pinch: false,
    },
    timeScale: {
        timeVisible: true,
        borderColor: "rgba(0,0,0, 0)",
        barSpacing: 3,
        minBarSpacing: 2,
    },
    rightPriceScale: {
        borderColor: "rgba(0,0,0, 0)",
        scaleMargins: { top: 0.1, bottom: 0.1 },
    },
    layout: {
        background: { type: "solid", color: "transparent" },
        textColor: "rgba(21,23,28, 0.45)",
        fontSize: 12,
    },
    grid: {
        horzLines: { visible: false },
        vertLines: { visible: false },
    },
    crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: { color: "rgba(21,23,28, 0.35)", width: 1, style: LightweightCharts.LineStyle.Dashed },
        horzLine: { color: "rgba(21,23,28, 0.35)", width: 1, style: LightweightCharts.LineStyle.Dashed },
    },
});

// Soft area line (design chart-svg): curved ink line, gradient fading to 0
var series = chart.addSeries(LightweightCharts.AreaSeries, {
    lineColor: "rgba(21,23,28, 0.55)",
    lineWidth: 2,
    lineType: LightweightCharts.LineType.Curved,
    topColor: "rgba(21,23,28, 0.10)",
    bottomColor: "rgba(21,23,28, 0)",
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerBorderColor: PAPER,
    crosshairMarkerBackgroundColor: INK,
    priceFormat: { type: "price", precision: 2, minMove: 0.01 },
});

var volumeSeries = chart.addSeries(LightweightCharts.HistogramSeries, {
    priceFormat: { type: "volume" },
    priceScaleId: "vol",
    color: "rgba(21,23,28, 0.07)",
    priceLineVisible: false,
    lastValueVisible: false,
});
volumeSeries.priceScale().applyOptions({
    scaleMargins: { top: 0.8, bottom: 0 },
});

// v5: markers live in a plugin instance instead of series.setMarkers()
var seriesMarkers = LightweightCharts.createSeriesMarkers(series, []);
function setSeriesMarkers(markers) {
    seriesMarkers.setMarkers(markers);
}

chart.timeScale().fitContent();

// ============================================================
// Chart data loading — setChart(), renderMarkers()
// ============================================================
function setChart(data) {
    // Candle timestamps are delta-encoded ([gap, close, vol]; first bar is
    // absolute). Rebuild absolute unix time in place with a running sum.
    {
        let t = 0;
        for (const c of data.candles) c[0] = t += c[0];
    }
    // One list: every shipped alert carries its own line. Compact positional
    // tuples decode to objects once, so filters, markers and cards all read
    // the same object.
    //   [tb, t, dir(1=buy/0=sell), tier("M"|"S"), icon, chip, was, now, st, lt]
    // tb is the 2h-floored time the marker sits on; t is the exact fire
    // minute the card shows. Fields after tier are 0 when the alert has no
    // line yet — it still draws a marker, it just has no card.
    data.signals = (data.signals || []).map((s) => ({
        tb: s[0],
        time: s[1],
        dir: s[2] === 1 ? "buy" : "sell",
        tier: s[3],
        icon: s[4] || undefined,
        chip: s[5] || null,
        was: s[6] || null,
        now: s[7] || null,
        st: s[8] || null,
        lt: s[9] || null,
    }));

    const lastIndex = data.candles.length - 1;
    // Candles arrive as compact [unix_time, close] pairs; area series plots close.
    series.setData(data.candles.map((c) => ({ time: c[0], value: c[1] })));

    currentCandleRange = {
        from: data.candles[0][0],
        to: data.candles[lastIndex][0],
    };

    const firstCandleT = data.candles[0][0];
    const lastCandleT = data.candles[lastIndex][0];

    // Markers need a candle to sit on, so they are range-filtered here. The
    // feed is not — see setEvents.
    allAlerts = data.signals.filter(
        (s) => s.tb >= currentCandleRange.from && s.tb <= currentCandleRange.to
    );

    // Volume is folded into each candle as [time, close, volume]; pull it out
    // (skip 0 = no volume for that bar).
    const vol = [];
    for (let i = 0; i < data.candles.length; i++) {
        const v = data.candles[i][2];
        if (v) vol.push({ time: data.candles[i][0], value: v });
    }
    volumeSeries.setData(vol);

    // Default window: last ~28 days with the most recent candle pinned to the
    // right edge. Set this with a LOGICAL (bar-index) range, NOT a time range,
    // and only after BOTH series have data. The chart instance is reused across
    // stock switches: series.setData keeps the previous stock's scroll position,
    // and a time-based setVisibleRange right after setData doesn't reliably
    // override it (time→bar index isn't rebuilt yet) — which left the new last
    // candle stranded on the far left with blank space to the right. Bar indices
    // are exact and immediate, so the last candle always lands at the right edge.
    const WINDOW = 3600 * 24 * 28;
    const cutoff = lastCandleT - WINDOW;
    let firstVisIdx = 0;
    for (let i = lastIndex; i >= 0; i--) {
        if (data.candles[i][0] < cutoff) { firstVisIdx = i + 1; break; }
    }
    chart.timeScale().setVisibleLogicalRange({ from: firstVisIdx - 0.5, to: lastIndex + 0.5 });

    setEvents(data);
    renderMarkers();
    renderSignalShortcutsFromEvents();

    chart.priceScale("right").applyOptions({ scaleMargins: { top: 0, bottom: 0 } });
}

function renderMarkers() {
    const allowedTiers = MODE_TIERS[currentMode];

    // One dot per candle + direction: several alerts can land on the same 2h
    // bar, and they are one moment to the reader.
    const seen = new Set();
    const markers = [];
    allAlerts.forEach((s) => {
        if (!allowedTiers.includes(s.tier)) return;
        const key = `${s.tb}_${s.dir}`;
        if (seen.has(key)) return;
        seen.add(key);
        markers.push({
            time: s.tb,
            position: s.dir === "buy" ? "belowBar" : "aboveBar",
            color: s.dir === "buy" ? MARKER_BUY_COLOR : MARKER_SELL_COLOR,
            shape: "circle",
            size: 1,
            text: "",
        });
    });

    markers.sort((a, b) => a.time - b.time);
    setSeriesMarkers(markers);
}

// ============================================================
// Events list (horizontal scroll below chart)
// ============================================================
function setEvents(data) {
    closeAlertChat(); // stock changed — drop any open alert chat
    // The feed is a list, not a chart overlay — show every comment regardless
    // of whether a candle exists at that time. (Candles can cover a shorter
    // span than the signal history; gating the feed by candle range silently
    // hid older comments. Markers still get range-filtered in renderMarkers,
    // since those genuinely need a candle to sit on.)
    // Only alerts that have a line earn a card; the rest are markers only.
    mEvents = (data.signals || []).filter((s) => s.now);
    filterAndRenderEvents();
}

function filterAndRenderEvents() {
    // Full DOM rebuild. Resets scroll to the top so the latest signal is
    // visible by default. The feed is NOT filtered by mode — every commentary
    // line shows regardless of tier (only chart markers respect the mode).
    renderEvents(mEvents);
    eventsList.scrollTop = 0;
}

// "Ask AI" pill \u2014 same in both card variants (opens the alert-pinned chat).
const ASK_AI_BTN =
    `<button class="event-chat-btn self-start inline-flex items-center gap-1.5 text-xs font-bold text-violet bg-violet-bg border border-violet-edge rounded-full px-3 py-1 group-hover:border-violet transition-colors">` +
    `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/></svg>Ask AI</button>`;

function renderEvents(events) {
    // Newest-first so the latest signal sits at the top of the overlay.
    const sorted = [...events].sort((a, b) => b.time - a.time);
    // Card header carries the instrument, same as the design's feed card — a
    // row holding only a timestamp reads as a gap above the sentence.
    const sel = selectedItems[selectedItems.length - 1] || {};
    const ticker = sel.ticker || "";
    const name = sel.name && sel.name !== ticker ? sel.name : "";
    eventsList.innerHTML = sorted
        .map((event) => {
            const date = new Date(event.time * 1000);
            const dateStr = String(date.getUTCDate()).padStart(2, "0") + "." + String(date.getUTCMonth() + 1).padStart(2, "0");
            const timeStr = String(date.getUTCHours()).padStart(2, "0") + ":" + String(date.getUTCMinutes()).padStart(2, "0");
            const dirClass = event.dir === "buy" ? "text-green-600/80" : "text-red-600/80";
            const dirArrow = event.dir === "buy" ? "\u25B2" : "\u25BC";
            const iconHtml = event.icon && SIGNAL_ICONS[event.icon] ? SIGNAL_ICONS[event.icon] : "";

            // The line has four parts and the card shows all four: `was` sets
            // the scene in a few muted words, `now` is the verdict, then the
            // two horizons. `was` used to be dropped on the floor.
            // The chip is a component (.dir-chip in index.css, shared with the
            // screener), not a pile of utilities — colour and metrics live
            // there so both surfaces stay identical.
            // The chip's anchor is dropped when the verdict already names that
            // price: "push past the Jul 16 level at 1183" over "BREAKING
            // HIGHER · 1183" printed the same number twice, in two voices.
            let chipText = event.chip || "";
            const anchor = chipText.split("·")[1];
            if (anchor && event.now && event.now.includes(anchor.trim())) {
                chipText = chipText.split("·")[0].trim();
            }
            const chipTone = event.dir === "buy"
                ? "text-up bg-up-bg border-up-edge"
                : "text-down bg-down-bg border-down-edge";
            const chipHtml = chipText
                ? `<span class="inline-flex items-center mono text-[12px] font-bold px-2.5 py-1 rounded-full border ${chipTone} mt-3">${chipText}</span>`
                : "";
            // `was` is written and stored, but not shown: the engine's own
            // wording for it ("2-session rally from 1148.40" at 1180) was
            // contradicting the verdict beside it.
            const stRow = event.st
                ? `<div class="read-row"><span class="read-tag st"><span class="dot"></span>Trader</span><p class="text-[13.5px] leading-snug text-ink/75">${event.st}</p></div>`
                : "";
            const ltRow = event.lt
                ? `<div class="read-row"><span class="read-tag lt"><span class="dot"></span>Holder</span><p class="text-[13.5px] leading-snug text-ink/75">${event.lt}</p></div>`
                : "";
            return `
            <div class="event-card group flex-shrink-0 rounded-xl2 bg-white border border-ink/12 shadow-lift overflow-hidden cursor-pointer hover:border-ink/25 transition-all" data-time="${event.tb}">
                <div class="px-5 pt-4 pb-3">
                    <div class="flex items-center gap-2.5 flex-wrap">
                        <span class="font-extrabold text-[16px] tracking-tight">${ticker}</span>
                        ${name ? `<span class="text-[13px] text-ink/45 font-medium">${name}</span>` : ""}
                        <span class="event-when text-[12px] text-ink/40 ml-auto">${dateStr} · ${timeStr}</span>
                    </div>
                    <p class="read text-[17px] leading-[1.5] text-ink mt-3">${iconHtml}${event.now}</p>
                    ${chipHtml}
                </div>
                <div class="px-5 py-4 bg-paper/40 border-t border-ink/10 flex flex-col gap-2.5">
                    ${stRow}${ltRow}
                    <div class="pt-0.5">${ASK_AI_BTN}</div>
                </div>
            </div>`;
        })
        .join("");
}


// Track when the user last scrolled the overlay themselves \u2014 chart-pan
// auto-sync defers to manual scroll for ~2s so we don't yank position.
let _userScrollAt = 0;
const _markUserScroll = () => { _userScrollAt = Date.now(); };
// Manually drive scroll on wheel: the chart canvas sits underneath and
// LightweightCharts attaches its own wheel listeners on the surrounding
// element with preventDefault, which can block native scrolling on
// overlapping siblings. Doing scrollTop += deltaY ourselves bypasses
// that entirely and gives the user a reliable scroll feel.
eventsList.addEventListener("wheel", (e) => {
    eventsList.scrollTop += e.deltaY;
    e.preventDefault();
    _markUserScroll();
}, { passive: false });
eventsList.addEventListener("touchstart", _markUserScroll, { passive: true });

function syncScrollToTimeRange(timeRange) {
    if (!timeRange) return;
    if (Date.now() - _userScrollAt < 2000) return;
    const cards = [...eventsList.querySelectorAll(".event-card")];
    if (!cards.length) return;
    // Cards sorted newest-first; first one whose time \u2264 visible-range end
    // is the latest event currently on-chart \u2014 scroll it into view.
    const target = cards.find((c) => Number(c.dataset.time) <= timeRange.to);
    if (target) {
        eventsList.scrollTop = Math.max(0, target.offsetTop - 8);
    }
}

// Drag-to-scroll on events list (now vertical inside the overlay)
let _dragStart = null;
eventsList.addEventListener("mousedown", (e) => {
    _dragStart = { y: e.pageY, top: eventsList.scrollTop };
    eventsList.style.cursor = "grabbing";
    eventsList.style.userSelect = "none";
});
document.addEventListener("mousemove", (e) => {
    if (!_dragStart) return;
    eventsList.scrollTop = _dragStart.top - (e.pageY - _dragStart.y);
    _markUserScroll();
});
document.addEventListener("mouseup", () => {
    _dragStart = null;
    eventsList.style.cursor = "";
    eventsList.style.userSelect = "";
});

// Sync events overlay scroll to chart pan — no DOM rebuild, just scrollTop.
const debouncedTimeRangeCallback = debounce(() => {
    syncScrollToTimeRange(chart.timeScale().getVisibleRange());
}, 150);
chart.timeScale().subscribeVisibleTimeRangeChange(debouncedTimeRangeCallback);

// Reverse sync: user scrolls the signals list → chart follows the topmost
// visible card. Gated on recent manual scroll so programmatic scrollTop
// changes (stock change reset, chart→list sync) don't bounce back.
const _syncChartToListScroll = debounce(() => {
    if (Date.now() - _userScrollAt > 2000) return;
    const cards = [...eventsList.querySelectorAll(".event-card")];
    if (!cards.length) return;
    const viewTop = eventsList.scrollTop + eventsList.offsetTop;
    const target = cards.find((c) => c.offsetTop + c.offsetHeight > viewTop) || cards[cards.length - 1];
    const t = Number(target.dataset.time);
    if (t) scrollChartToTimeLocal(t);
}, 150);
eventsList.addEventListener("scroll", _syncChartToListScroll);

// Click chart candle → scroll events list to closest signal
chart.subscribeClick((param) => {
    if (!param.time) return;
    const items = [...eventsList.querySelectorAll(".event-card")];
    const closest = items.reduce((prev, cur) =>
        Math.abs(Number(cur.dataset.time) - param.time) < Math.abs(Number(prev.dataset.time) - param.time) ? cur : prev
    , items[0]);
    if (closest) eventsList.scrollTo({ top: closest.offsetTop - eventsList.offsetTop - eventsList.offsetHeight / 2, behavior: "smooth" });
});

// Click event card → scroll chart to that time; "Open chat" → chat panel
eventsList.addEventListener("click", (e) => {
    const card = e.target.closest(".event-card");
    if (!card) return;
    if (e.target.closest(".event-chat-btn")) {
        openAlertChat(card);
        return;
    }
    const t = Number(card.dataset.time);
    if (t) scrollChartToTimeLocal(t);
});

// ============================================================
// Signal shortcuts (icon buttons in chart header, top-right)
// Only for events that have an icon (rally, dip, momentum, attention)
// ============================================================
function renderSignalShortcutsFromEvents() {
    if (!signalShortcuts) return;
    signalShortcuts.innerHTML = "";
    const withIcons = mEvents.filter((e) => e.icon && SIGNAL_ICONS[e.icon]);
    const recent = [...withIcons].sort((a, b) => b.time - a.time).slice(0, 6);
    recent.reverse();
    recent.forEach((ev) => {
        const btn = document.createElement("button");
        btn.className = "signal-shortcut";
        const date = new Date(ev.time * 1000);
        const label = String(date.getUTCDate()).padStart(2, "0") + "." +
            String(date.getUTCMonth() + 1).padStart(2, "0") + " " +
            String(date.getUTCHours()).padStart(2, "0") + ":" +
            String(date.getUTCMinutes()).padStart(2, "0");
        btn.innerHTML = `${SIGNAL_ICONS[ev.icon]}${label}`;
        btn.addEventListener("click", () => {
            scrollChartToTimeLocal(ev.time);
            signalShortcuts.querySelectorAll(".signal-shortcut").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
        });
        signalShortcuts.appendChild(btn);
    });
}

// ============================================================
// Scroll helpers
// ============================================================
// Scroll chart preserving current zoom level. Works in time units so it
// also reaches times far outside the visible window (coordinate-based
// conversion returns null there).
function scrollChartToTimeLocal(time) {
    const range = chart.timeScale().getVisibleRange();
    if (!range) return;
    const span = range.to - range.from;
    let from = time - span / 2;
    let to = time + span / 2;
    // Never pan into empty space past the candle data — clamp the window to
    // where candles exist (this is what made the chart "fly left" when a card
    // or marker pointed at a time outside the loaded candle range).
    if (currentCandleRange) {
        if (from < currentCandleRange.from) { from = currentCandleRange.from; to = from + span; }
        if (to > currentCandleRange.to)     { to = currentCandleRange.to;   from = to - span; }
    }
    chart.timeScale().setVisibleRange({ from, to });
}

// ============================================================
// Loaders
// ============================================================
function showLoader() {
    const chartEl = document.getElementById("chart");
    const loader = document.getElementById("chartLoader");
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    loader.style.width = chartEl.offsetWidth + "px";
    loader.style.height = chartEl.offsetHeight + "px";
    const rect = chartEl.getBoundingClientRect();
    loader.style.top = rect.top + scrollTop + "px";
    loader.style.left = rect.left + "px";
    loader.classList.remove("hidden");
}

function hideLoader() {
    document.getElementById("chartLoader").classList.add("hidden");
}

function showListLoader() {
    shimmer.classList.remove("hidden");
    eventsList.classList.add("hidden", "opacity-50", "pointer-events-none");
}

function hideListLoader() {
    eventsList.classList.remove("hidden");
    shimmer.classList.add("hidden");
    eventsList.scrollTop = 0;
    eventsList.classList.remove("opacity-50", "pointer-events-none");
}

// ============================================================
// Expose to agent.js via window.__chartState
// ============================================================
window.__chartState = {
    get chart() { return chart; },
    get series() { return series; },
    get allAlerts() { return allAlerts; },
    get currentCandleRange() { return currentCandleRange; },
    setChart,
    renderMarkers,
    setSeriesMarkers,
    loadChart,
    showLoader,
    hideLoader,
    showListLoader,
    hideListLoader,
    setEvents,
    get currentMode() { return currentMode; },
};
