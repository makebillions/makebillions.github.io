// ============================================================
// settings.js — the account, edited in place.
//
// Self-contained on purpose: js.js binds to landing-page elements at load and
// would throw here.
//
// Every change saves itself. There is no Save button, every control on the
// page does what it says, and every refusal is shown in the toast at the
// bottom of the screen, where the reader is looking.
// ============================================================

// A local copy talks to the local API, the published site to production, so
// publishing needs no edit. window.__apiHost overrides both (the test harness).
const host = window.__apiHost ||
    (["localhost", "127.0.0.1", ""].includes(location.hostname)
        ? "http://localhost:4000" : "https://api.deepdip.tech");
const url = (p) => `${host}${p}`;

function anonId() {
    let id = null;
    try { id = localStorage.getItem("anonId"); } catch (e) { /* private mode */ }
    if (!id) {
        id = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
        try { localStorage.setItem("anonId", id); } catch (e) { /* private mode */ }
    }
    return id;
}

function token() {
    try { return localStorage.getItem("authToken"); } catch (e) { return null; }
}

function post(path, data = {}) {
    const headers = { "Content-Type": "application/json", "x-anon-id": anonId() };
    const t = token();
    if (t) headers["Authorization"] = `Bearer ${t}`;
    return fetch(url(path), {
        method: "POST", headers, body: JSON.stringify(data), credentials: "include",
    })
        // One bad response must never take the page down with it. A 404 returns
        // HTML, and json() on it throws — which killed boot() before a single
        // control rendered.
        .then((r) => r.json().catch(() => ({ error: `bad response from ${path}` })))
        .catch(() => ({ error: `could not reach ${path}` }));
}

// --- state -------------------------------------------------
let account = null;
let features = {};         // what the service honours
let pricing = null;        // the one place a price comes from
let batches = [];
let catalog = [];          // everything a reader can follow: {ticker, name, market, kind}
let resolved = null;       // what this account hears right now, null if unknown
let resolvedMap = {};      // ticker -> its RESOLVED settings, from the server
let notes = {};            // ticker -> the reader's own note
let sent = [];             // the alerts this account was actually sent
let scope = null;          // the stock (upper) or batch (lower) the panel shows
const sourcesOf = {};      // ticker -> {picked, batches, via}, from the server
const chatHistory = {};    // per ticker, in memory

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const batchLabel = (n) => {
    const m = /^(moex|us)(\d+)$/.exec(n || "");
    return m ? `${m[1] === "us" ? "US" : "MOEX"} top ${m[2]}` : n;
};

/** A balance: always to the kopeck — it is money the reader owns. */
const money = (x) => `${(Number(x) || 0).toFixed(2)} ₽`;
/** A quoted price: kopecks when small, whole when large. */
const rub = (x) => {
    const v = Number(x) || 0;
    return `${Math.abs(v) < 10 ? (Math.round(v * 100) / 100).toString() : Math.round(v)} ₽`;
};

const isTicker = (s) => !!s && s === s.toUpperCase();
const prefsOf = (s) => (s && (account.prefs || {})[s]) || {};
const own = (s) => Object.keys(prefsOf(s)).length > 0;
const info = (t) => catalog.find((w) => w.ticker === t) || { ticker: t, name: t, market: "" };
const KIND_LABEL = { etf: "ETF", index: "Index", future: "Future", crypto: "Crypto" };
/** One badge: what the instrument is, or for a plain stock, where it trades. */
const badge = (w) => w.kind && w.kind !== "stock"
    ? `<span class="set-mk ${esc(w.kind)}">${KIND_LABEL[w.kind] || esc(w.kind)}</span>`
    : `<span class="set-mk ${esc(w.market)}">${w.market === "us" ? "US" : "MOEX"}</span>`;
const followed = () => new Set(Object.keys(resolvedMap));
const asleep = (s) => {
    const until = (account.snooze || {})[s];
    return until && until > new Date().toISOString() ? until : null;
};
const when = (iso) => new Date(iso).toLocaleString([], {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

// --- the toast ----------------------------------------------
let toastTimer = null;
function toast(msg, kind = "warn") {
    const el = $("toast");
    const m = String(msg || "");
    el.textContent = m.charAt(0).toUpperCase() + m.slice(1);
    el.className = `set-toast ${kind}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), kind === "warn" ? 7000 : 3500);
}

// --- writing -----------------------------------------------
// ONE INSTRUCTION PER WRITE, CHAINED. A control saves itself the moment it
// changes, so two quick changes used to start two writes at once, and each
// re-rendered the controls the next one was read from. Serialised, the second
// write is composed from a DOM the first write's render already refreshed.
let writeChain = Promise.resolve();

function apply(path, body, done) {
    writeChain = writeChain.then(async () => {
        const r = await post(path, body);
        // A refused write re-renders too, so every control goes back to the
        // truth instead of sitting on the value the server just refused.
        if (r.error) { toast(r.error); render(); return false; }
        account = r.payload;
        // picks or batches may have moved, so every stock's sources may have
        for (const k of Object.keys(sourcesOf)) delete sourcesOf[k];
        await refreshResolved();
        if (isTicker(scope)) await loadSources(scope);
        render();
        if (done) toast(done, "ok");
        return r;
    });
    return writeChain;
}

const save = (patch, done) => apply("/api/subscription/set", patch, done);
const addPick = (t) => apply("/api/subscription/add", { ticker: t }, `Alerts on for ${t}`);
const dropPick = (t) => apply("/api/subscription/remove", { ticker: t }, `No more alerts on ${t}`);
const setScope = (patch) => apply("/api/subscription/prefs", { scope, patch });

async function setBatch(name, on) {
    const r = await apply("/api/subscription/group", { group: name, on },
        on ? `${batchLabel(name)} added` : `${batchLabel(name)} removed`);
    return r;
}

async function refreshResolved() {
    // Two calls, two questions: WHICH stocks this account hears, and WHAT each
    // one is set to. The second walks stock, then batch, then default on the
    // server — a copy of that walk here is the copy that ends up disagreeing.
    const [t, m] = await Promise.all([
        post("/api/subscription/tickers"),
        post("/api/subscription/resolved"),
    ]);
    resolved = Array.isArray(t.payload) ? t.payload : null;
    resolvedMap = m.payload && typeof m.payload === "object" ? m.payload : {};
}

async function loadSources(t) {
    if (!isTicker(t) || sourcesOf[t]) return;
    const r = await post("/api/subscription/sources", { ticker: t });
    if (r.payload) sourcesOf[t] = r.payload;
}

// --- 1. your stocks -----------------------------------------
// Everything the reader has made their own: a pick, a stock with its own
// settings, a stock with a note. A batch of 60 is not listed name by name —
// those are one tap away in the picker's "Yours" tab.
function myStocks() {
    const f = followed();
    const set = new Set(account.stocks || []);
    for (const t of f) if (own(t) || notes[t]) set.add(t);
    const picks = new Set(account.stocks || []);
    return [...set].sort((a, b) => (picks.has(b) - picks.has(a)) || a.localeCompare(b));
}

function stockTags(t) {
    const c = resolvedMap[t];
    if (!c) return "";
    const tags = [c.tier === "M" ? `<i class="all">every alert</i>` : `<i>major moves</i>`];
    if (c.reasoning && c.tier === "M") tags.push(`<i title="reasoning">🧠</i>`);
    if (c.quiet) tags.push(`<i title="silent">🌙</i>`);
    if (notes[t]) tags.push(`<i title="written for you">✎</i>`);
    if (asleep(t)) tags.push(`<i title="paused">💤</i>`);
    return tags.join("");
}

function renderWatch() {
    const n = resolved ? resolved.length : 0;
    $("watchCount").textContent = resolved ? `Stocks · you hear ${n}` : "Stocks";

    const mine = myStocks();
    $("myStocks").innerHTML = mine.length
        ? mine.map((t) => `<span class="set-stock${scope === t ? " on" : ""}">
              <button class="open" data-open="${esc(t)}"><b>${esc(t)}</b>
              <span class="set-stock-name">${esc(info(t).name)}</span>
              <span class="set-tags">${stockTags(t)}</span></button>
              <button class="x" data-drop="${esc(t)}" title="Stop alerts on ${esc(t)}" aria-label="Stop alerts on ${esc(t)}">&times;</button></span>`).join("")
        : `<span class="sub-empty">Nothing of your own yet — find a stock above.</span>`;

    $("batchChips").innerHTML = (account.groups || []).length
        ? account.groups.map((g) =>
            `<span class="sub-chip${scope === g ? " on" : ""}"><span class="open" data-open="${esc(g)}" title="Set this batch up">${esc(batchLabel(g))}</span><span class="x" data-drop-batch="${esc(g)}" title="Remove">&times;</span></span>`).join("")
        : `<span class="sub-empty">No batches.</span>`;

    const on = new Set(account.groups || []);
    $("batchMenu").innerHTML = batches.map((b) =>
        `<button data-add-batch="${esc(b.name)}"${on.has(b.name) ? " disabled" : ""}>` +
        `${esc(batchLabel(b.name))}<span>${b.size}</span></button>`).join("");

    // ONE list for both kinds of silence. A reader asking "why am I not getting
    // VTBR" must find one place, not two.
    const rows = [];
    for (const t of account.excludes || []) {
        rows.push(`<div class="set-silent-row"><b>${esc(t)}</b><span>removed from a batch</span>` +
                  `<button data-putback="${esc(t)}">put back</button></div>`);
    }
    for (const [s, until] of Object.entries(account.snooze || {})) {
        if (until <= new Date().toISOString()) continue;
        rows.push(`<div class="set-silent-row"><b>${esc(batchLabel(s))}</b><span>paused until ${esc(when(until))}</span>` +
                  `<button data-wake="${esc(s)}">wake now</button></div>`);
    }
    $("silentList").innerHTML = rows.join("");
    $("silentGroup").classList.toggle("hidden", !rows.length);
}

// --- the picker ---------------------------------------------
// TradingView's symbol search, cut to what we have: one field, market tabs,
// ticker and company name. A popover on a wide screen, a full-screen sheet on
// a phone. Picking a stock opens its settings below — it does not subscribe.
let pickerMarket = "all";
let pickerActive = 0;

function pickerRows() {
    const q = $("pickerInput").value.trim().toLowerCase();
    const f = followed();
    const tab = {
        all: () => true,
        mine: (w) => f.has(w.ticker),
        moex: (w) => w.market === "moex",
        us: (w) => w.market === "us",
        etf: (w) => w.kind === "etf",
        future: (w) => w.kind === "future",
        crypto: (w) => w.kind === "crypto",
    }[pickerMarket] || (() => true);
    let list = catalog.filter(tab);
    if (q) {
        const starts = [], has = [];
        for (const w of list) {
            const t = w.ticker.toLowerCase(), n = (w.name || "").toLowerCase();
            if (t.startsWith(q) || n.startsWith(q)) starts.push(w);
            else if (t.includes(q) || n.includes(q)) has.push(w);
        }
        list = starts.concat(has);
    }
    return list;
}

function renderPicker() {
    const f = followed();
    const picks = new Set(account.stocks || []);
    const rows = pickerRows();
    pickerActive = Math.min(pickerActive, Math.max(rows.length - 1, 0));
    $("pickerList").innerHTML = rows.length
        ? rows.map((w, i) => {
            const state = picks.has(w.ticker) ? "yours"
                : f.has(w.ticker) ? "in a batch" : "";
            return `<button class="set-sheet-row${i === pickerActive ? " active" : ""}" role="option" data-pick="${esc(w.ticker)}">
                <b>${esc(w.ticker)}</b><span class="nm">${esc(w.name)}</span>
                ${state ? `<span class="st">✓ ${state}</span>` : ""}
                ${badge(w)}</button>`;
        }).join("")
        : `<div class="set-menu-empty">Nothing we watch matches that.</div>`;
}

function openPicker() {
    $("pickerSheet").classList.remove("hidden");
    document.body.classList.add("sheet-open");
    $("pickerInput").value = "";
    pickerActive = 0;
    renderPicker();
    setTimeout(() => $("pickerInput").focus(), 30);
}

function closePicker() {
    $("pickerSheet").classList.add("hidden");
    document.body.classList.remove("sheet-open");
}

function pick(t) {
    closePicker();
    openScope(t);
}

$("pickerOpen").addEventListener("click", openPicker);
$("pickerClose").addEventListener("click", closePicker);
$("pickerSheet").addEventListener("click", (e) => {
    if (e.target.id === "pickerSheet") return closePicker();     // the backdrop
    const t = e.target.closest("[data-pick]")?.dataset.pick;
    if (t) pick(t);
});
$("pickerInput").addEventListener("input", () => { pickerActive = 0; renderPicker(); });
$("pickerInput").addEventListener("keydown", (e) => {
    const rows = pickerRows();
    if (e.key === "Escape") return closePicker();
    if (e.key === "ArrowDown") { pickerActive = Math.min(pickerActive + 1, rows.length - 1); }
    else if (e.key === "ArrowUp") { pickerActive = Math.max(pickerActive - 1, 0); }
    else if (e.key === "Enter") { if (rows[pickerActive]) pick(rows[pickerActive].ticker); return; }
    else return;
    e.preventDefault();
    renderPicker();
    $("pickerList").querySelector(".active")?.scrollIntoView({ block: "nearest" });
});
$("pickerTabs").addEventListener("click", (e) => {
    const m = e.target.closest("[data-market]")?.dataset.market;
    if (!m) return;
    pickerMarket = m;
    for (const b of $("pickerTabs").children) b.classList.toggle("on", b.dataset.market === m);
    pickerActive = 0;
    renderPicker();
    $("pickerInput").focus();
});
document.addEventListener("keydown", (e) => {
    // "/" opens the search, the way chart sites do
    if (e.key === "/" && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName || "")
        && !$("page").classList.contains("hidden")) {
        e.preventDefault();
        openPicker();
    }
});

// --- 2. one stock, or one batch ------------------------------
// A SETTING BELONGS TO A STOCK. Switches, not checkboxes: each one is a thing
// that is on or off, and says what "on" means. Personalisation comes last.

const KIND_COPY = [
    ["breakout", "Breakouts", "Price pushes through a level that had held it back before."],
    ["rejected", "False breaks and rejections", "It tried to get through and was pushed back. The level held."],
    ["bounce", "Bounces off support", "A dip into a level that has held before, with buyers stepping back in."],
    ["momentum", "Momentum and surges", "The move is running faster than this stock normally moves in a day."],
    ["fading", "Exhaustion and reversals", "A long run shows its first sign of tiring, or it turns over sharply."],
    ["quiet", "Going sideways", "Drifting inside a range with nothing yet deciding which way it leaves."],
];

/** What this scope actually gets right now. A stock's answer is the SERVER's
 *  (it walks stock, batch, default); a batch never resolves to every alert. */
function effective(s) {
    const base = {
        tier: account.tier || "M",
        quiet: !!account.quiet,
        reasoning: !!account.reasoning,
        mute_kinds: account.mute_kinds || [],
    };
    if (!s) return base;
    if (isTicker(s)) return resolvedMap[s] || { ...base, ...prefsOf(s) };
    const b = { ...base, ...prefsOf(s) };
    b.tier = "S";
    return b;
}

/** Where a stock's value for `field` comes from, as the reader should read
 *  it: set here, from one of their batches, or from their defaults. */
function sourceTag(s, field) {
    if (!s) return "";
    if (prefsOf(s)[field] !== undefined)
        return `<button class="set-reset" data-reset="${esc(field)}" title="Go back to what it inherits">set here · reset</button>`;
    if (!isTicker(s)) return `<span class="set-inherit">from your defaults</span>`;
    const src = sourcesOf[s];
    if (!src) return "";
    for (const g of [...(src.batches || [])].reverse())
        if (prefsOf(g)[field] !== undefined)
            return `<span class="set-inherit">from ${esc(batchLabel(g))}</span>`;
    if (field === "tier" && (src.batches || []).length && !src.picked)
        return `<span class="set-inherit">from ${esc(batchLabel(src.via))}</span>`;
    return `<span class="set-inherit">from your defaults</span>`;
}

function switchRow({ field, title, text, checked, disabled = false, tag = "", attrs = "" }) {
    return `<label class="set-switch-row${disabled ? " locked" : ""}">
        <span class="set-switch-text"><b>${title}${tag ? ` ${tag}` : ""}</b><em>${text}</em></span>
        <input type="checkbox" role="switch" class="set-switch" data-field="${esc(field)}"${attrs}${checked ? " checked" : ""}${disabled ? " disabled" : ""}>
    </label>`;
}

/** The controls every scope shares: how much, reasoning, sound, kinds. */
function controlGroups(s, name) {
    const eff = effective(s);
    const p = pricing || {};
    const pro = !!account.pro;
    const major = eff.tier === "S";
    const batch = s && !isTicker(s);
    const what = name || "these stocks";

    const tierText = batch
        ? "A batch sends the major moves. To hear every alert on one of its stocks, open that stock."
        : major
            ? `Only the big moves on ${esc(what)} — breakouts through major levels, sharp turns. Free.`
            : `Every meaningful move on ${esc(what)}.` + (pro
                ? ` Each alert costs about ${rub(p.fast)} from your balance, split with everyone who follows it.`
                : " Free accounts get every alert on one stock.");
    const tier = switchRow({ field: "tier", title: "Major moves only", text: tierText,
        checked: major, disabled: batch, tag: batch ? "" : sourceTag(s, "tier") });

    const reasonText = major
        ? "Major moves are always written by our reasoning model, at no cost to you."
        : `Every alert on ${esc(what)} written by our reasoning model instead of the fast one — up to about ${rub(p.reasoning)} each, split with everyone who asked for it. Major moves always get it free.`;
    const reasoning = switchRow({ field: "reasoning", title: "Reasoning", text: reasonText,
        checked: major || eff.reasoning, disabled: major, tag: major ? "" : sourceTag(s, "reasoning") });

    // QUIET MODE IS EVERYTHING (accounts.settings_for): the account's switch
    // silences every stock, so it is named for what it does, and while it is on
    // a stock's own switch shows on and cannot be turned off.
    const allQuiet = !!account.quiet;
    const sound = !s
        ? switchRow({ field: "quiet", title: "Quiet mode",
            text: "Every alert on every stock arrives without a sound. The 🌙 button under an alert does the same.",
            checked: allQuiet })
        : switchRow({ field: "quiet", title: "Silent",
            text: allQuiet ? "Quiet mode is on, so every alert arrives without a sound."
                : "Alerts still arrive, in order, at their own minute. They just do not ring.",
            checked: allQuiet || !!eff.quiet, disabled: allQuiet,
            tag: allQuiet ? "" : sourceTag(s, "quiet") });

    const kindsLive = features.kinds !== false;
    const muted = new Set(eff.mute_kinds || []);
    const kinds = `<div class="set-group">
        <div class="set-label">Kinds of alert ${sourceTag(s, "mute_kinds")}</div>
        <div class="set-switches">${KIND_COPY.map(([v, t, d]) => switchRow({
            field: "kind", title: esc(t), text: esc(d), checked: !muted.has(v),
            disabled: !kindsLive, attrs: ` data-kind="${esc(v)}"` })).join("")}</div>
        <p class="set-hint">A few alerts fit none of these and always arrive.</p>
    </div>`;

    return `<div class="set-group set-switches">${tier}${reasoning}${sound}</div>${kinds}`;
}

function paneHead(s) {
    if (!isTicker(s)) {
        const size = (batches.find((b) => b.name === s) || {}).size;
        return `<div class="set-pane-top"><div><b class="tk">${esc(batchLabel(s))}</b>
            <span class="nm">${size ? `${size} stocks, kept current` : "a batch"}</span></div></div>`;
    }
    const w = info(s);
    return `<div class="set-pane-top"><div><b class="tk">${esc(s)}</b>
        <span class="nm">${esc(w.name)}</span>
        ${w.market ? badge(w) : ""}</div></div>`;
}

function followRow(s) {
    if (!isTicker(s)) {
        return switchRow({ field: "follow", title: "Alerts on this batch",
            text: "Every stock in it, as the list changes.", checked: true });
    }
    const f = followed().has(s);
    const src = sourcesOf[s];
    const picked = (account.stocks || []).includes(s);
    const text = !f
        ? (account.pro || !(account.stocks || []).length
            ? "Turn on to get alerts on this stock."
            : "Free accounts follow one stock of their own, plus any batches. PRO follows as many as you like.")
        : picked ? "One of your own stocks."
        : src && src.via ? `Arrives through ${esc(batchLabel(src.via))}.` : "Arrives through one of your batches.";
    return switchRow({ field: "follow", title: `Alerts on ${esc(s)}`, text, checked: f });
}

// What the reader tells us about a stock. EVERY NAME HERE IS A NAME THE FACT
// SHEET READS (accounts.py::NOTE_FIELDS), and any field filled in turns the
// alerts on this stock into lines written to this reader.
const NOTE_FIELDS = [
    ["size", "What you own", "number", "e.g. 50"],
    ["entry", "What you paid", "number", "e.g. 285.40"],
    ["when", "When you bought", "text", "e.g. in March"],
    ["want", "What you want from it", "area", "e.g. add more if it dips below 270"],
    ["belief", "What you believe", "area", "e.g. the dip is temporary; results are on 28 October"],
    ["ask", "A standing question", "area", "e.g. should I take profit here?"],
    ["prefs", "How you want it said", "area", "e.g. short — just the levels and what to do"],
];

function noteForm(t) {
    const n = notes[t] || {};
    const p = pricing || {};
    const fields = NOTE_FIELDS.map(([k, label, kind, ph]) => {
        const v = n[k] === undefined || n[k] === null ? "" : n[k];
        const wide = kind === "area" ? ' class="wide"' : "";
        const control = kind === "area"
            ? `<textarea name="${k}" rows="2" placeholder="${esc(ph)}">${esc(v)}</textarea>`
            : `<input name="${k}" type="${kind === "number" ? "number" : "text"}" step="any" placeholder="${esc(ph)}" value="${esc(v)}">`;
        return `<label${wide}><span>${esc(label)} <i class="opt">optional</i></span>${control}</label>`;
    }).join("");
    const dated = n.at ? `<p class="set-hint">Saved ${esc(when(n.at))}.</p>` : "";
    return `<div class="set-group set-mine">
        <div class="set-label">Written for you <span id="noteSaved" class="set-saved hidden">saved</span></div>
        <p class="set-hint" style="margin-top:0;margin-bottom:.8rem">Optional. Fill in any field and every alert on ${esc(t)} is written to you — your position, your question, your way of putting it — for about ${rub(p.personal)} each from your balance${p.reasoning ? `, up to about ${rub(p.reasoning)} with reasoning on` : ""}. Leave it empty and you get the shared alert. Nobody else sees it.</p>
        <form id="noteForm" class="set-note-grid" data-ticker="${esc(t)}">${fields}</form>
        ${dated}
        <p class="set-hint">Each note is dated, because “results next week” is wrong four months later. Clear every field to delete it.</p>
    </div>`;
}

function snoozeGroup(s) {
    const until = asleep(s);
    const name = isTicker(s) ? s : batchLabel(s);
    return `<div class="set-group">
        <div class="set-label">Pause ${esc(name)}</div>
        <div class="set-actions" style="margin-top:0">${until
            ? `<button class="set-btn" data-wake="${esc(s)}">Wake it now</button>
               <span class="set-bot" style="margin-left:0">paused until ${esc(when(until))}</span>`
            : `<button class="set-btn" data-snooze="24">For a day</button>
               <button class="set-btn" data-snooze="168">For a week</button>`}</div>
    </div>`;
}

function askBox(t) {
    const msgs = chatHistory[t] || [];
    const mine = sent.filter((a) => a.stock === t);
    const alerts = mine.length
        ? `<div class="set-group"><div class="set-label">Sent to you</div>
             <div class="set-alerts">${mine.map(alertRow).join("")}</div></div>`
        : "";
    return alerts + `<div class="set-group">
        <div class="set-label">Ask about ${esc(t)}</div>
        <div class="set-thread">${msgs.map((m) =>
            `<div class="set-msg ${m.role}"><p>${esc(m.content)}</p></div>`).join("")}</div>
        <div class="set-ask">
            <input id="askInput" type="text" placeholder="ask about ${esc(t)}…" autocomplete="off">
            <button id="askSend">Ask</button>
        </div>
        <p class="set-hint">A one-off question; the answer is not kept. Free accounts get a few a day.</p>
    </div>`;
}

function alertRow(a) {
    const w = (a.time || "").replace("T", " ").slice(5, 16);
    const tone = a.dir === "buy" ? "up" : "down";
    return `<article class="set-alert">
        <div class="card-head"><span class="ticker">${esc(a.stock)}</span>
            <span class="when">${esc(w)}</span></div>
        ${a.chip ? `<span class="dir-chip ${tone}">${esc(a.chip)}</span>` : ""}
        ${a.now ? `<p class="now">${esc(a.now)}</p>` : ""}
        ${a.st ? `<div class="read-row"><span class="read-tag st"><span class="dot"></span>Short term</span><p class="read-text">${esc(a.st)}</p></div>` : ""}
        ${a.lt ? `<div class="read-row"><span class="read-tag lt"><span class="dot"></span>Long term</span><p class="read-text">${esc(a.lt)}</p></div>` : ""}
    </article>`;
}

function renderScopePane() {
    if (!scope) {
        $("scopePane").innerHTML = `<div class="set-pane-empty">Find a stock above, or tap one of yours, to set it up.</div>`;
        return;
    }
    const t = isTicker(scope) ? scope : null;
    const on = t ? followed().has(t) : (account.groups || []).includes(scope);
    const body = on
        ? controlGroups(scope, t || batchLabel(scope)) + snoozeGroup(scope)
          + (t ? noteForm(t) + askBox(t) : "")
        : (t ? askBox(t) : "");
    $("scopePane").innerHTML = paneHead(scope)
        + `<div class="set-group set-switches">${followRow(scope)}</div>`
        + body;
}

async function openScope(name, scroll = true) {
    scope = name;
    try { localStorage.setItem("setScope", name); } catch (e) { /* private mode */ }
    renderWatch();
    renderScopePane();
    if (scroll) $("scopePane").scrollIntoView({ behavior: "smooth", block: "start" });
    if (isTicker(name) && !sourcesOf[name]) {
        await loadSources(name);
        if (scope === name) renderScopePane();
    }
}

// --- 3. every other stock ------------------------------------
function defaultSummaryText() {
    const muted = (account.mute_kinds || []).length;
    const bits = [account.tier === "S" ? "major moves only" : "every alert"];
    if (account.tier !== "S" && account.reasoning) bits.push("reasoning");
    if (account.quiet) bits.push("silent");
    const n = KIND_COPY.length;
    bits.push(muted ? `${n - muted} of ${n} kinds` : "all kinds");
    return bits.join(" · ");
}

function renderDefaults() {
    $("defaultSummary").textContent = defaultSummaryText();
    $("defaultPane").innerHTML = controlGroups(null, "a stock you picked");
}

function renderPause() {
    const paused = account.status === "paused";
    $("pauseBtn").textContent = paused ? "Resume alerts" : "Pause all alerts";
    $("pauseNote").textContent = paused
        ? "Everything is paused. Your stocks and settings are kept."
        : "Pausing stops every alert without losing your list.";
}

// --- 4. language --------------------------------------------
function renderLang() {
    const pro = !!account.pro;
    const sw = $("langSwitch");
    sw.checked = pro && account.lang === "ru";
    sw.disabled = !pro;
    $("langRow").classList.toggle("locked", !pro);
    $("langNote").textContent = pro
        ? "Every alert, and the buttons under it, arrive in Russian."
        : `Comes with PRO${pricing ? ` — ${pricing.pro_month} ₽ a month` : ""}. Every alert, and the buttons under it, arrive in Russian.`;
}

// --- 5. plan and balance ------------------------------------
function renderPlan() {
    // `account.pro` is resolved server-side by accounts.py::is_pro. Reading
    // `plan` here would show PRO to someone whose plan_until has lapsed.
    const pro = !!account.pro;
    const p = pricing || {};
    const until = account.plan_until
        ? new Date(account.plan_until).toLocaleDateString([], { day: "2-digit", month: "short" })
        : null;
    $("planChip").textContent = pro ? (until ? `PRO · until ${until}` : "PRO") : "Free";
    $("planChip").classList.toggle("gold", pro);

    const n = p.free_picks || 1;
    const free = ["Batches, with every major move",
                  `${n === 1 ? "One stock" : `${n} stocks`} of your own, with every alert on ${n === 1 ? "it" : "them"}`,
                  "Reasoning, deep reads and alerts written for you, paid from your balance", "English"];
    const paid = ["Any number of stocks", "Every alert on up to 20 of them", "Alerts in Russian",
                  "Reasoning, deep reads and alerts written for you, paid from your balance"];
    const col = (title, rows, on, gold) => `<div class="set-plan${on ? " on" : ""}${gold ? " gold" : ""}">
        <div class="set-plan-head"><b>${title}</b>${on ? `<span class="set-plan-now">your plan</span>` : ""}</div>
        <ul>${rows.map((r) => `<li class="price-row${gold ? " pro" : ""}">${esc(r)}</li>`).join("")}</ul></div>`;
    $("planBody").innerHTML = `<div class="set-plans">
        ${col("Free", free, !pro, false)}
        ${col(`PRO · ${p.pro_month || 590} ₽ a month`, paid, pro, true)}</div>
        ${pro ? "" : `<div class="set-actions"><button class="set-btn primary" data-request="pro">Get PRO</button></div>`}`;
}

function renderBalance() {
    const p = pricing || {};
    const bal = Number(account.balance || 0);
    $("balanceChip").textContent = `💳 ${money(bal)}`;
    const line = (what, price) => `<li><span>${what}</span><b>${price}</b></li>`;
    $("balanceBody").innerHTML = `
        <div class="set-big">${esc(money(bal))}</div>
        <p class="set-hint" style="margin-top:.2rem">Your balance pays the models that write for you — exactly what they bill, nothing added. We earn on PRO, not on your balance.</p>
        <ul class="set-prices">
            ${line("A major move", "free")}
            ${line("An everyday alert, split with everyone who gets it", `about ${rub(p.fast)}`)}
            ${line("The same, written with reasoning", `up to about ${rub(p.reasoning)}`)}
            ${line("An alert written for you from your note", `about ${rub(p.personal)}`)}
            ${line("A deep read of one stock", `about ${rub(p.deep)}`)}
        </ul>
        <div class="set-label" style="margin-top:1rem">Top up</div>
        <div class="set-actions" style="margin-top:0">${(p.topup || [100, 300, 1000]).map((n) =>
            `<button class="set-btn" data-request="${n}">${n} ₽</button>`).join("")}</div>
        <p class="set-hint">We add it the same day and tell you in Telegram. A deep read runs in the bot — <b>/reason TICKER</b>, or 🧠 under any alert — and one that never comes back is refunded on its own.</p>`;
}

async function request(what) {
    const pro = what === "pro";
    const r = await post("/api/topup/request", { rub: pro ? (pricing?.pro_month || 590) : Number(what), what });
    toast(r.error ? r.error
        : pro ? "Request sent — we switch on PRO the same day and tell you in Telegram."
              : `Request for ${what} ₽ sent — we add it the same day and tell you in Telegram.`,
        r.error ? "warn" : "ok");
}

// --- 6. the account itself ----------------------------------
function renderLoginWays() {
    const ways = [];
    if (account.email) ways.push(`Email — <b>${esc(account.email)}</b>`);
    for (const p of Object.keys(account.oauth || {}))
        ways.push(`${p[0].toUpperCase() + p.slice(1)}`);
    if (account.tg) ways.push("Telegram — the bot code from <b>/password</b>");
    $("loginWays").innerHTML = ways.length
        ? `<ul class="set-ways">${ways.map((w) => `<li>${w}</li>`).join("")}</ul>`
        : `<span class="sub-empty">No way to log in yet.</span>`;
    $("addLoginForm").classList.toggle("hidden", !!account.email);
}

function renderTelegram() {
    $("tgRow").innerHTML = account.tg
        ? `<div class="set-row"><b>Connected</b>
             <span class="set-row-v">chat ${esc(account.tg)}</span></div>
           <div class="set-row"><span>Disconnecting stops every alert — they arrive in Telegram and nowhere else.</span>
             <button id="tgOff" class="set-btn danger">Disconnect</button></div>`
        : `<div class="set-row"><b>Not connected</b>
             <span class="set-row-v">nothing can reach you — use the bar at the top of this page</span></div>`;
}

function render() {
    document.body.classList.toggle("is-paused", account.status === "paused");
    const blocked = !!account.blocked;
    $("blockedBar").classList.toggle("hidden", !blocked);
    document.body.classList.toggle("is-blocked", blocked);
    // No telegram means no alerts at all, so it outranks everything except a
    // block — which is the same problem one step further along.
    $("linkTgBar").classList.toggle("hidden", blocked || !!account.tg);
    $("quietChip").classList.toggle("hidden", !account.quiet || account.status === "paused");
    $("pausedChip").classList.toggle("hidden", account.status !== "paused");
    $("pausedChip").classList.add("stop");
    renderWatch();
    renderScopePane();
    renderDefaults();
    renderPause();
    renderLang();
    renderPlan();
    renderBalance();
    renderLoginWays();
    renderTelegram();
    if (!$("pickerSheet").classList.contains("hidden")) renderPicker();
}

// --- events -------------------------------------------------
$("batchAdd").addEventListener("click", () => $("batchMenu").classList.toggle("hidden"));

$("batchMenu").addEventListener("click", (e) => {
    const name = e.target.closest("[data-add-batch]")?.dataset.addBatch;
    if (!name) return;
    $("batchMenu").classList.add("hidden");
    setBatch(name, true);
});

$("batchChips").addEventListener("click", (e) => {
    const open = e.target.closest("[data-open]")?.dataset.open;
    if (open) return openScope(open);
    const g = e.target.dataset.dropBatch;
    if (g) setBatch(g, false);
});

$("myStocks").addEventListener("click", (e) => {
    const drop = e.target.closest("[data-drop]")?.dataset.drop;
    if (drop) return dropPick(drop);
    const t = e.target.closest("[data-open]")?.dataset.open;
    if (t) openScope(t);
});

$("silentList").addEventListener("click", (e) => {
    const wake = e.target.dataset.wake;
    if (wake) return apply("/api/subscription/unsnooze", { scope: wake }, "Woken up");
    // add_stocks lifts the exclusion as well as adding the pick, which is what
    // "put back" means — the batch stays whole and the row disappears.
    const t = e.target.dataset.putback;
    if (t) addPick(t);
});

/** One switch in a pane: which setting, and its new value. */
function switchPatch(pane, sw) {
    const field = sw.dataset.field;
    if (field === "tier") return { tier: sw.checked ? "S" : "M" };
    if (field === "reasoning") return { reasoning: sw.checked };
    if (field === "quiet") return { quiet: sw.checked };
    if (field === "kind") {
        // What is OFF, not what is on. Sent even when empty, because "nothing
        // muted here" has to be able to beat a default that mutes something.
        return { mute_kinds: KIND_COPY.map((k) => k[0]).filter((v) =>
            !pane.querySelector(`[data-kind="${v}"]`).checked) };
    }
    return null;
}

$("scopePane").addEventListener("change", (e) => {
    const sw = e.target.closest(".set-switch");
    if (!sw || !scope) return;
    if (sw.dataset.field === "follow") {
        if (!isTicker(scope)) return setBatch(scope, sw.checked);
        return sw.checked ? addPick(scope) : dropPick(scope);
    }
    const patch = switchPatch($("scopePane"), sw);
    if (patch) setScope(patch);
});

$("defaultPane").addEventListener("change", (e) => {
    const sw = e.target.closest(".set-switch");
    if (!sw) return;
    const patch = switchPatch($("defaultPane"), sw);
    if (patch) save(patch);
});

$("scopePane").addEventListener("click", (e) => {
    const reset = e.target.closest("[data-reset]")?.dataset.reset;
    if (reset) {                       // null CLEARS, so the scope falls back
        e.preventDefault();
        return setScope({ [reset]: null });
    }
    const hours = e.target.dataset.snooze;
    if (hours) return apply("/api/subscription/snooze", { scope, hours: Number(hours) },
        `Paused for ${Number(hours) >= 168 ? "a week" : "a day"}`);
    const wake = e.target.dataset.wake;
    if (wake) apply("/api/subscription/unsnooze", { scope: wake }, "Woken up");
});

$("langSwitch").addEventListener("change", (e) =>
    save({ lang: e.target.checked ? "ru" : "en" },
         e.target.checked ? "Alerts will arrive in Russian" : "Alerts will arrive in English"));

$("pauseBtn").addEventListener("click", () =>
    save({ status: account.status === "paused" ? "active" : "paused" }));

$("secPlan").addEventListener("click", (e) => {
    const what = e.target.closest("[data-request]")?.dataset.request;
    if (what) request(what);
});

// The note is written whole: set_note REPLACES, so a partial send would drop
// every field the reader did not touch. The sends are chained, and the chain
// reads the form at SEND time, so the last write always carries every field.
function saveNote(form) {
    const ticker = form.dataset.ticker;
    const note = {};
    for (const el of form.elements) {
        const v = String(el.value || "").trim();
        if (v) note[el.name] = v;
    }
    return post("/api/subscription/note", { ticker, note }).then((r) => {
        if (r.error) { toast(r.error); return; }
        // Empty note = deleted, which is what the server returns as {}.
        if (r.payload && Object.keys(r.payload).length) notes[ticker] = r.payload;
        else delete notes[ticker];
        const flag = $("noteSaved");
        if (flag) {
            flag.classList.remove("hidden");
            setTimeout(() => flag.classList.add("hidden"), 2000);
        }
        renderWatch();
    });
}

function queueNote(form) {
    writeChain = writeChain.then(() => saveNote(form));
}

$("scopePane").addEventListener("change", (e) => {
    const form = e.target.closest("#noteForm");
    if (form) queueNote(form);
});

// AND on typing, settled: `change` fires on blur, so the last field touched is
// lost if the tab closes without moving focus out of it.
let noteTimer = null;
$("scopePane").addEventListener("input", (e) => {
    const form = e.target.closest("#noteForm");
    if (!form) return;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => queueNote(form), 900);
});

$("scopePane").addEventListener("click", async (e) => {
    if (e.target.id !== "askSend") return;
    const input = $("askInput");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    const t = scope;
    const hist = (chatHistory[t] = chatHistory[t] || []);
    hist.push({ role: "user", content: text });
    hist.push({ role: "assistant", content: "…" });
    renderScopePane();
    const r = await post("/api/chat", { ticker: t, messages: hist.slice(0, -1) });
    hist[hist.length - 1].content = r.reply
        || (r.limit ? "That is today's free questions used up." : "Service unavailable — try again in a minute.");
    renderScopePane();
});

// --- account actions ----------------------------------------
$("addLoginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("addLoginMsg");
    msg.classList.add("hidden");
    const r = await post("/api/account/login-details", {
        email: e.target.email.value.trim(),
        password: e.target.password.value,
    });
    if (r.error) {
        msg.textContent = r.error;
        msg.classList.remove("hidden");
        return;
    }
    account = r.payload;
    e.target.reset();
    render();
});

$("tgRow").addEventListener("click", async (e) => {
    if (e.target.id !== "tgOff") return;
    // Disconnecting means they hear nothing at all, so it asks first.
    if (!confirm("Disconnect Telegram? Alerts arrive there and nowhere else, so you will stop receiving them.")) return;
    const r = await post("/api/link/telegram/remove");
    const msg = $("tgMsg");
    if (r.error) {
        msg.textContent = r.error;
        msg.classList.remove("hidden");
        return;
    }
    msg.classList.add("hidden");
    account = r.payload;
    render();
});

$("logoutBtn").addEventListener("click", async () => {
    await post("/api/logout");
    localStorage.removeItem("authToken");
    location.reload();
});

$("deleteBtn").addEventListener("click", async () => {
    // `confirm` on the server must equal the uid, so a stray click cannot do
    // this. Asking twice here is the same idea one step earlier.
    if (!confirm("Delete your account? This removes your stocks, notes, credits and history, and signs you out. It cannot be undone.")) return;
    const r = await post("/api/account/delete", { confirm: account.uid });
    if (r.error) {
        $("deleteMsg").textContent = r.error;
        $("deleteMsg").classList.remove("hidden");
        return;
    }
    localStorage.removeItem("authToken");
    location.reload();
});

// --- the gate -----------------------------------------------
// Three ways in and one form. Telegram used to be the only door, which asked a
// stranger to install a bot before they could see what the product was; email
// and Google come first now and the bot code stays for people who started there.
let gateMode = "signup";

const GATE = {
    signup: { submit: "Create account", pw: "new-password", path: "/api/signup" },
    login:  { submit: "Log in",         pw: "current-password", path: "/api/login" },
    code:   { submit: "Log in",         pw: null, path: "/api/setUser" },
};

function setGateMode(mode) {
    gateMode = mode;
    const cfg = GATE[mode];
    for (const b of $("gateTabs").children) b.classList.toggle("on", b.dataset.mode === mode);
    $("gateEmailRow").classList.toggle("hidden", mode === "code");
    $("gatePwRow").classList.toggle("hidden", mode === "code");
    $("gateCodeRow").classList.toggle("hidden", mode !== "code");
    $("gateCodeHint").classList.toggle("hidden", mode !== "code");
    $("gateSubmit").textContent = cfg.submit;
    if (cfg.pw) $("gateForm").password.autocomplete = cfg.pw;
    $("gateError").classList.add("hidden");
}

function gateError(msg) {
    const err = $("gateError");
    err.textContent = msg;
    err.classList.remove("hidden");
}

/** Every way in ends the same way: a token, then boot(). */
async function enterWith(path, body) {
    const r = await post(path, body);
    if (r.token) {
        localStorage.setItem("authToken", r.token);
        boot();
        return;
    }
    gateError(r.message || r.error || "That did not work.");
}

$("gateTabs").addEventListener("click", (e) => {
    const mode = e.target.dataset?.mode;
    if (mode) setGateMode(mode);
});

$("gateForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    if (gateMode === "code") return enterWith("/api/setUser", { code: f.code.value.trim() });
    return enterWith(GATE[gateMode].path, {
        email: f.email.value.trim(),
        password: f.password.value,
    });
});

// Google Identity Services. The client id is injected at build/deploy; with
// none set the script is never loaded and the note explains the empty space
// instead of leaving a button that silently does nothing.
const GOOGLE_CLIENT_ID = window.__googleClientId || "";

let googleReady = false;
function initGoogle() {
    if (googleReady) return;                 // boot() can run more than once
    googleReady = true;
    if (!GOOGLE_CLIENT_ID) { $("googleNote").classList.remove("hidden"); return; }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onerror = () => $("googleNote").classList.remove("hidden");
    s.onload = () => {
        google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: (resp) => enterWith("/api/auth/google", { credential: resp.credential }),
        });
        google.accounts.id.renderButton($("googleBtn"), { theme: "outline", size: "large", width: 320 });
    };
    document.head.appendChild(s);
}

// --- connecting telegram ------------------------------------
// The same 6-digit code as the login box, used the other way round: there it
// proves which account to open, here it proves which chat to attach.
$("linkTgForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("linkTgError");
    err.classList.add("hidden");
    const r = await post("/api/link/telegram", { code: e.target.code.value.trim() });
    if (r.error) {
        err.textContent = r.error;
        err.classList.remove("hidden");
        return;
    }
    // The link may have ADOPTED an older telegram account and retired this one,
    // in which case the server hands back a token for the survivor. Storing it
    // is not optional — the old token points at a record that no longer exists.
    if (r.token) localStorage.setItem("authToken", r.token);
    e.target.code.value = "";
    boot();
});

// --- the section nav ----------------------------------------
const navLinks = [...$("setNav").querySelectorAll("a")];
const navSpy = new IntersectionObserver((entries) => {
    for (const en of entries) {
        if (!en.isIntersecting) continue;
        for (const a of navLinks) a.classList.toggle("on", a.hash === `#${en.target.id}`);
    }
}, { rootMargin: "-40% 0px -55% 0px" });

// --- boot ---------------------------------------------------

async function boot() {
    const r = await post("/api/subscription");
    if (r.error || !r.payload) {
        $("gate").classList.remove("hidden");
        $("page").classList.add("hidden");
        setGateMode(gateMode);
        initGoogle();
        return;
    }
    account = r.payload;
    $("gate").classList.add("hidden");
    $("page").classList.remove("hidden");
    const [b, s, f, p, h, n] = await Promise.all([
        post("/api/batches"), post("/api/catalog"), post("/api/features"),
        post("/api/pricing"), post("/api/alerts/mine"), post("/api/subscription/notes"),
    ]);
    batches = b.payload || [];
    features = f.payload && typeof f.payload === "object" ? f.payload : {};
    pricing = p.payload || null;
    sent = Array.isArray(h.payload) ? h.payload : [];
    notes = n.payload && typeof n.payload === "object" ? n.payload : {};
    catalog = Array.isArray(s.payload) ? s.payload : [];
    await refreshResolved();
    // Reopen the stock the reader last had open; else the first of their own.
    let last = null;
    try { last = localStorage.getItem("setScope"); } catch (e) { /* private mode */ }
    // A STOCK, NEVER A BATCH (owner, 09-10): a batch has no note, so opening
    // on one hides the part only the reader can fill in. That holds for the
    // remembered scope too, which is a batch whenever one was tapped last. A
    // batch-only reader opens on their biggest name — the catalog leads with
    // the live universe in liquidity order.
    const known = (x) => isTicker(x) && catalog.some((w) => w.ticker === x);
    const held = followed();
    const firstHeld = (catalog.find((w) => held.has(w.ticker)) || {}).ticker;
    scope = known(last) ? last : (myStocks()[0] || firstHeld || null);
    render();
    if (isTicker(scope)) {
        await loadSources(scope);
        renderScopePane();
    }
    for (const id of ["secStocks", "secLang", "secPlan", "secAccount"]) {
        const el = $(id);
        if (el) navSpy.observe(el);
    }
}

boot();
