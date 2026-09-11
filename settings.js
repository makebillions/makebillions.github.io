// ============================================================
// settings.js — the account, edited in place.
//
// Self-contained on purpose: js.js binds to landing-page elements at load and
// would throw here.
//
// TWO RULES, and everything below follows from them.
//
// 1. Every change saves itself. No Save button, and no control that cannot
//    write is left pressable.
// 2. /api/features decides what is drawn. A switch is live only where the
//    service says it honours it; where it saves but changes nothing the page
//    says so in as many words; where there is no field at all the control is
//    disabled. The endpoint existed for a while and nothing read it, so the
//    page promised three switches it did not have.
// ============================================================

// Set window.__apiHost before this script to point at a deployed API;
// the literal is only the local default.
const host = window.__apiHost || "http://localhost:4000";
const url = (p) => `${host}${p}`;

function anonId() {
    let id = localStorage.getItem("anonId");
    if (!id) {
        id = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
        localStorage.setItem("anonId", id);
    }
    return id;
}

function post(path, data = {}) {
    const headers = { "Content-Type": "application/json", "x-anon-id": anonId() };
    const token = localStorage.getItem("authToken");
    if (token) headers["Authorization"] = `Bearer ${token}`;
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
let features = {};         // what the service actually honours today
let pricing = null;        // the one place a price comes from
let batches = [];
let watched = [];          // the instruments the service actually watches
let resolved = null;       // what this account hears right now, null if unknown
let resolvedMap = {};      // ticker -> its RESOLVED settings, from the server
let notes = {};            // ticker -> the reader's own note
let sent = [];             // the alerts this account was actually sent
let scope = null;          // which stock or batch the panel below is showing
const chatHistory = {};    // per ticker, in memory

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const batchLabel = (n) => {
    const m = /^(moex|us)(\d+)$/.exec(n || "");
    return m ? `${m[1] === "us" ? "US" : "MOEX"} top ${m[2]}` : n;
};

const money = (n) => `${n} ${(pricing && pricing.currency) || "RUB"}`;

// --- writing -----------------------------------------------
// ONE INSTRUCTION PER WRITE. This used to send the whole record every time,
// built from the snapshot the page loaded with — so adding a stock in the bot
// and then touching any control here silently erased it. The account service
// does the read-modify-write; the page only says what changed.
// EVERY WRITE IS CHAINED, and it has to be. A control saves itself the moment
// it changes, so unticking two boxes in quick succession starts two whole-record
// writes at once — and each one re-renders the pane the reader is still using,
// rebuilding the very checkboxes the next change is about to be read from.
// Measured: unticking two kinds saved one of them and lost the other.
//
// Serialising also fixes the re-render, because the second write is composed
// from a DOM that the first write's render has already refreshed.
let writeChain = Promise.resolve();

function apply(path, body) {
    writeChain = writeChain.then(async () => {
        const r = await post(path, body);
        if (r.error) { flashWarn(r.error); return false; }
        account = r.payload;
        await refreshResolved();
        render();
        return r;
    });
    return writeChain;
}

// tier, status, quiet, style and lang — each a single field on the record.
const save = (patch) => apply("/api/subscription/set", patch);
const addPick = (t) => apply("/api/subscription/add", { ticker: t });
const dropPick = (t) => apply("/api/subscription/remove", { ticker: t });

async function setBatch(name, on) {
    const r = await apply("/api/subscription/group", { group: name, on });
    // The server quiets the tier when a batch is too big for "every alert".
    // The reader has to be told: their alert volume just changed.
    if (r && r.quieted)
        flashWarn("Switched to major turns only — that batch is a lot of alerts.");
    return r;
}

function flashWarn(msg) {
    const el = $("tierWarn");
    el.textContent = msg;
    el.classList.remove("hidden");
    setTimeout(() => el.classList.add("hidden"), 6000);
}

async function refreshResolved() {
    // Two calls, because they answer two different questions: WHICH stocks this
    // account hears, and WHAT each one is set to. The second walks stock then
    // batch then default on the server — doing that walk here would be a second
    // copy of the rule, and the copy is what ends up disagreeing.
    const [t, m] = await Promise.all([
        post("/api/subscription/tickers"),
        post("/api/subscription/resolved"),
    ]);
    resolved = Array.isArray(t.payload) ? t.payload : null;
    resolvedMap = m.payload && typeof m.payload === "object" ? m.payload : {};
}

// --- 1. what you watch -------------------------------------
// An account starts with nothing, so this is the first thing most people see:
// one batch, one search, and a sentence saying alerts begin today — not three
// lines each saying the list is empty.
function renderStart() {
    const bare = !account.stocks.length && !(account.groups || []).length;
    $("startPanel").classList.toggle("hidden", !bare);
    $("watchBody").classList.toggle("hidden", bare);
    if (!bare) return;
    const small = batches.filter((b) => /10$/.test(b.name)).slice(0, 2);
    $("startBatches").innerHTML = small.map((b) =>
        `<button class="set-start-batch" data-add-batch="${esc(b.name)}">` +
        `${esc(batchLabel(b.name))}<span>${b.size} stocks</span></button>`).join("");
}

function renderWatch() {
    renderStart();
    $("watchCount").textContent = resolved
        ? `Watching ${resolved.length} ${resolved.length === 1 ? "name" : "names"}`
        : "What you watch";

    $("batchChips").innerHTML = (account.groups || []).length
        ? account.groups.map((g) =>
            `<span class="sub-chip">${esc(batchLabel(g))}<span class="x" data-drop-batch="${esc(g)}" title="Remove">&times;</span></span>`).join("")
        : `<span class="sub-empty">No batches.</span>`;

    const on = new Set(account.groups || []);
    $("batchMenu").innerHTML = batches.map((b) =>
        `<button data-add-batch="${esc(b.name)}"${on.has(b.name) ? " disabled" : ""}>` +
        `${esc(batchLabel(b.name))}<span>${b.size}</span></button>`).join("");

    $("pickChips").innerHTML = account.stocks.length
        ? account.stocks.map((t) =>
            `<span class="sub-chip">${esc(t)}<span class="x" data-drop-pick="${esc(t)}" title="Remove">&times;</span></span>`).join("")
        : `<span class="sub-empty">No stocks of your own yet.</span>`;

    // ONE list for both kinds of silence. A reader asking "why am I not getting
    // VTBR" must find one place, not two.
    const rows = [];
    for (const t of account.excludes || []) {
        rows.push(`<div class="set-silent-row"><b>${esc(t)}</b><span>removed from a batch</span>` +
                  `<button data-putback="${esc(t)}">put back</button></div>`);
    }
    const now = new Date().toISOString();
    for (const [t, until] of Object.entries(account.snooze || {})) {
        if (until <= now) continue;
        const when = new Date(until).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
        rows.push(`<div class="set-silent-row"><b>${esc(t)}</b><span>asleep until ${esc(when)}</span>` +
                  `<button data-wake="${esc(t)}">wake now</button></div>`);
    }
    $("silentList").innerHTML = rows.join("") ||
        `<span class="sub-empty">Nothing is being held back.</span>`;
    $("silentGroup").classList.toggle("hidden", !rows.length);
}

// --- 2 + 3. settings, per scope ----------------------------------------
// A SETTING BELONGS TO A STOCK. There is one renderer and it draws the same
// four groups whether the scope is the account default, one batch or one
// stock — because they ARE the same four settings, and two renderers would
// drift into offering different ones.
//
// scope: null = your defaults | "SBER" = one stock | "moex30" = one batch.
// A stock is upper case and a batch is lower, which is what keeps one map on
// the record unambiguous (accounts.py::PREF_FIELDS).

const KIND_COPY = [
    ["breakout", "Breakouts", "Price pushes through a level that had held it back before."],
    ["rejected", "False breaks and rejections", "It tried to get through and was pushed back. The level held."],
    ["bounce", "Bounces off support", "A dip into a level that has held before, with buyers stepping back in."],
    ["momentum", "Momentum and surges", "The move is running faster than this stock normally moves in a day."],
    ["fading", "Exhaustion and reversals", "A long run shows its first sign of tiring, or it turns over sharply."],
    ["quiet", "Going sideways", "Drifting inside a range with nothing yet deciding which way it leaves."],
];

const STYLE_COPY = [
    ["predict", "what happened, and what may come next", false],
    ["map", "both sides of the move, and which is bigger", true],
    ["trade", "what to do, and the price that says you're wrong", true],
];

const isTicker = (scope) => !!scope && scope === scope.toUpperCase();
const prefsOf = (scope) => (scope && (account.prefs || {})[scope]) || {};

/** What this scope actually gets right now.
 *
 *  For a stock the answer comes from the SERVER (`/api/subscription/resolved`),
 *  which walks stock then batch then default. Redoing that walk here would be
 *  a second copy of the rule, and the copy is what disagrees.
 */
function effective(scope) {
    const base = {
        tier: account.tier || "M",
        quiet: !!account.quiet,
        mute_kinds: account.mute_kinds || [],
        style: account.style || "predict",
    };
    if (!scope) return base;
    if (isTicker(scope)) return resolvedMap[scope] || base;
    return { ...base, ...prefsOf(scope) };      // a batch: its own over the default
}

/** The header of one control group: what it is, and whether this scope has
 *  its own answer or is following something else. Without this an override is
 *  invisible the moment it is set. */
function groupHead(label, scope, field) {
    if (!scope) return `<div class="set-label">${label}</div>`;
    const own = prefsOf(scope)[field] !== undefined;
    const tail = own
        ? `<button class="set-reset" data-reset="${esc(field)}">use my default</button>`
        : `<span class="set-inherit">your default</span>`;
    return `<div class="set-label">${label}${tail}</div>`;
}

function controlGroups(scope) {
    const eff = effective(scope);
    const kindsLive = features.kinds !== false;
    const styleObeyed = features.style === true;
    const sel = (v, want) => (v === want ? " checked" : "");

    const tier = `<div class="set-group">
        ${groupHead("How much", scope, "tier")}
        <div class="flex flex-col gap-1.5" data-field="tier">
            <label class="sub-opt"><input type="radio" name="tier-${esc(scope || "def")}" value="M"${sel(eff.tier, "M")}>
                <span><b>Every alert</b><em>About one a day per stock. <span class="set-count" data-tiercount></span></em></span></label>
            <label class="sub-opt"><input type="radio" name="tier-${esc(scope || "def")}" value="S"${sel(eff.tier, "S")}>
                <span><b>Major turns only</b><em>A few a month per stock. No limit on how many stocks.</em></span></label>
        </div>
    </div>`;

    // QUIET IS NOT A MUTE and the wording has to carry that, or people reach
    // for pause instead and stop hearing anything at all.
    const sound = `<div class="set-group">
        ${groupHead("Sound", scope, "quiet")}
        <div class="flex flex-col gap-1.5" data-field="quiet">
            <label class="sub-opt"><input type="checkbox"${eff.quiet ? " checked" : ""}>
                <span><b>Quiet mode</b><em>Alerts still arrive, in order, at their own minute. They just do not ring.</em></span></label>
        </div>
    </div>`;

    // The record stores what is MUTED, the page shows what is ON. An empty
    // mute list is a real answer meaning "all of them", which is how a stock
    // can say "send me everything" against a default that mutes something.
    const muted = new Set(eff.mute_kinds || []);
    const kinds = `<div class="set-group${kindsLive ? "" : " pending-group"}">
        ${groupHead("Kinds of alert", scope, "mute_kinds")}
        <div class="flex flex-col gap-1.5" data-field="mute_kinds">
            ${KIND_COPY.map(([v, t, d]) => `<label class="sub-opt">
                <input type="checkbox" value="${esc(v)}"${muted.has(v) ? "" : " checked"}${kindsLive ? "" : " disabled"}>
                <span><b>${esc(t)}</b><em>${esc(d)}</em></span></label>`).join("")}
        </div>
        <p class="set-hint">A small number of alerts fit none of these six and are always sent. If you are new, leave them all on for a week and switch off whatever you find yourself ignoring.</p>
    </div>`;

    const style = `<div class="set-group${styleObeyed ? "" : " pending-group"}">
        ${groupHead("Written as", scope, "style")}
        <div class="flex flex-col gap-1.5" data-field="style">
            ${STYLE_COPY.map(([v, t, pro]) => `<label class="sub-opt">
                <input type="radio" name="style-${esc(scope || "def")}" value="${esc(v)}"${sel(eff.style, v)}>
                <span><b>${esc(t)}</b>${pro ? `<em class="set-pro">PRO</em>` : ""}</span></label>`).join("")}
        </div>
        ${styleObeyed ? "" : `<p class="set-pending-note">Your choice is remembered and will apply when we turn this on. Every alert is still written the first way: one line is written per fire and shared by everyone who follows that stock, so sending three versions means paying to write it three times. That is a decision, not a missing switch.</p>`}
    </div>`;

    return tier + sound + kinds + style;
}

/** One line saying what the fallback currently is, so the reader never has to
 *  open it to find out. */
function defaultSummaryText() {
    const muted = (account.mute_kinds || []).length;
    const bits = [account.tier === "S" ? "major turns only" : "every alert"];
    if (account.quiet) bits.push("no sound");
    const n = KIND_COPY.length;
    bits.push(muted ? `${n - muted} of ${n} kinds` : "all kinds");
    return bits.join(" · ");
}

function renderDefaults() {
    $("defaultSummary").textContent = defaultSummaryText();
    $("defaultPane").innerHTML = controlGroups(null);
    // The cap bites on how many stocks RESOLVE to every-alert, not on a sum of
    // batch sizes, so the number shown has to be the resolved one.
    const hot = Object.values(resolvedMap).filter((c) => c.tier === "M").length;
    const el = $("defaultPane").querySelector("[data-tiercount]");
    if (el) {
        el.textContent = `${hot} / 20 stocks`;
        el.classList.toggle("over", hot > 20);
    }
}

function renderPause() {
    const paused = account.status === "paused";
    $("pauseBtn").textContent = paused ? "Resume alerts" : "Pause all alerts";
    $("pauseNote").textContent = paused
        ? "Everything is paused. Your stocks and batches are kept."
        : "Pausing stops every alert without losing your list.";
}

// --- the scope picker ---------------------------------------------------
function renderScopePicker() {
    const stocks = Object.keys(resolvedMap).sort();
    const groups = (account.groups || []).slice().sort();
    if (scope && !stocks.includes(scope) && !groups.includes(scope)) scope = null;
    // A STOCK, NEVER A BATCH, unless there are no stocks at all. The picker
    // opened on a batch, and a batch has no note — so the one thing on this
    // page only the reader can supply was invisible until they thought to
    // change a dropdown. Stocks lead the list for the same reason.
    if (!scope) scope = stocks[0] || groups[0] || null;
    const opt = (v, label, on) =>
        `<option value="${esc(v)}"${v === scope ? " selected" : ""}>${esc(label)}${on ? " ·" : ""}</option>`;
    const own = (v) => Object.keys(prefsOf(v)).length > 0;
    $("scopePick").innerHTML =
        (stocks.length ? `<optgroup label="Your stocks">${stocks.map((t) =>
            opt(t, t, own(t))).join("")}</optgroup>` : "") +
        (groups.length ? `<optgroup label="A whole batch at once">${groups.map((g) =>
            opt(g, batchLabel(g), own(g))).join("")}</optgroup>` : "");
    $("scopeState").textContent = !scope ? ""
        : own(scope) ? "set up on its own"
        : "following your defaults";
}

function renderScopePane() {
    if (!scope) {
        $("scopePane").innerHTML = `<span class="sub-empty">Add a stock or a batch above and it appears here.</span>`;
        return;
    }
    const t = isTicker(scope) ? scope : null;
    // Snooze is per stock and always was — it is the setting that proves the
    // rest belong here too.
    const until = t && (account.snooze || {})[t];
    const asleep = until && until > new Date().toISOString();
    const snooze = t ? `<div class="set-group">
        <div class="set-label">Pause just ${esc(t)}</div>
        <div class="set-actions" style="margin-top:0">
            ${asleep
                ? `<button class="set-btn" data-wake="${esc(t)}">Wake ${esc(t)} now</button>
                   <span class="set-bot" style="margin-left:0">asleep until ${esc(new Date(until).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }))}</span>`
                : `<button class="set-btn" data-snooze="24">Mute for a day</button>
                   <button class="set-btn" data-snooze="168">Mute for a week</button>`}
        </div>
    </div>` : "";
    // THE NOTE COMES FIRST. It is what the reader adds to the prompt behind
    // every line about this stock, and it was sitting below four rows of
    // delivery switches where it read as an afterthought.
    $("scopePane").innerHTML = t
        ? noteForm(t) + controlGroups(scope) + snooze + askBox(t)
        : controlGroups(scope) + snooze;
}

// --- what the reader told us about a stock ------------------------------
// EVERY NAME HERE IS A NAME THE FACT SHEET READS. The note is handed to the
// writer unchanged, so a field the sheet does not know is a question answered
// into nothing — which is what `question` and `coming` were until the names
// were aligned. See accounts.py::NOTE_FIELDS.
const NOTE_FIELDS = [
    ["size", "what you own", "number"],
    ["entry", "what you paid", "number"],
    ["when", "when you bought", "text"],
    ["want", "what you want from it", "area"],
    ["belief", "what you believe", "area"],
    ["ask", "a question", "area"],
    // THE PROMPT EXTENSION, and the one field that is an instruction rather
    // than a fact. The sheet renders it as "how this reader wants it said",
    // so whatever goes here is carried into the writer's brief for this stock.
    // It was dropped from the page as decoration and that was wrong: it is the
    // only place a reader can say anything in their own words about HOW.
    ["prefs", "how you want it said", "area"],
];

function noteForm(ticker) {
    const n = notes[ticker] || {};
    const obeyed = features.notes === true;
    const fields = NOTE_FIELDS.map(([k, label, kind]) => {
        const v = n[k] === undefined || n[k] === null ? "" : n[k];
        const wide = kind === "area" ? ' class="wide"' : "";
        const control = kind === "area"
            ? `<textarea name="${k}" rows="2">${esc(v)}</textarea>`
            : `<input name="${k}" type="${kind === "number" ? "number" : "text"}" step="any" value="${esc(v)}">`;
        return `<label${wide}><span>${esc(label)}</span>${control}</label>`;
    }).join("");
    const dated = n.at
        ? `<p class="set-hint">Saved ${esc(new Date(n.at).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }))}.</p>`
        : "";
    return `<div class="set-group set-mine">
        <div class="set-label">What you tell it about ${esc(ticker)}
            <span id="noteSaved" class="set-saved hidden">saved</span></div>
        <p class="set-hint" style="margin-top:0;margin-bottom:.8rem">This goes into what the analyst is told before it writes about ${esc(ticker)} — nobody else sees it, and it applies to every line about this stock.</p>
        <form id="noteForm" class="set-note-grid" data-ticker="${esc(ticker)}">${fields}</form>
        ${dated}
        <p class="set-hint">Each note is dated, because “earnings next week” is wrong four months later. Clear every field to delete it. A question here is a standing one — it is attached to every line about ${esc(ticker)}, which is not the same as asking once below.</p>
        ${obeyed ? "" : `<p class="set-pending-note">Saved on your account. The alerts do not read it yet — that needs a line written for you alone, which is a paid call of its own.</p>`}
    </div>`;
}

function askBox(ticker) {
    const msgs = chatHistory[ticker] || [];
    const mine = sent.filter((a) => a.stock === ticker);
    const alerts = mine.length
        ? `<div class="set-group"><div class="set-label">Sent to you</div>
             <div class="set-alerts">${mine.map(alertRow).join("")}</div></div>`
        : "";
    return alerts + `<div class="set-group">
        <div class="set-label">Ask about ${esc(ticker)}</div>
        <div class="set-thread">${msgs.map((m) =>
            `<div class="set-msg ${m.role}"><p>${esc(m.content)}</p></div>`).join("")}</div>
        <div class="set-ask">
            <input id="askInput" type="text" placeholder="ask about ${esc(ticker)}…" autocomplete="off">
            <button id="askSend">Ask</button>
        </div>
        <p class="set-hint">Free accounts get a few questions a day. This is a one-off question, and the answer is not kept.</p>
    </div>`;
}

function alertRow(a) {
    const when = (a.time || "").replace("T", " ").slice(5, 16);
    const tone = a.dir === "buy" ? "up" : "down";
    return `<article class="set-alert">
        <div class="card-head"><span class="ticker">${esc(a.stock)}</span>
            <span class="when">${esc(when)}</span></div>
        ${a.chip ? `<span class="dir-chip ${tone}">${esc(a.chip)}</span>` : ""}
        ${a.kind ? `<span class="set-inherit">${esc(a.kind)}</span>` : ""}
        ${a.now ? `<p class="now">${esc(a.now)}</p>` : ""}
        ${a.st ? `<div class="read-row"><span class="read-tag st"><span class="dot"></span>Short term</span><p class="read-text">${esc(a.st)}</p></div>` : ""}
        ${a.lt ? `<div class="read-row"><span class="read-tag lt"><span class="dot"></span>Long term</span><p class="read-text">${esc(a.lt)}</p></div>` : ""}
    </article>`;
}

// --- 4. plan and credits -----------------------------------
function renderPlan() {
    // `account.pro` is resolved server-side by accounts.py::is_pro. Reading
    // `plan` here would show PRO to someone whose plan_until has lapsed.
    const pro = !!account.pro;
    const until = account.plan_until
        ? new Date(account.plan_until).toLocaleDateString([], { day: "2-digit", month: "short" })
        : null;
    $("planChip").textContent = pro ? (until ? `PRO · until ${until}` : "PRO") : "Free";
    $("planChip").classList.toggle("gold", pro);

    // Same rows, same order, same words as the landing page's pricing.
    const rows = pro
        ? ["every asset we watch", "our reasoning model", "alerts written for your position",
           "ask as much as you buy credits for", "Telegram"]
        : ["30 stocks", "our fast model", "read the alerts",
           "ask a few questions a day", "Telegram"];
    $("planRows").innerHTML = rows.map((r) =>
        `<li class="price-row${pro ? " pro" : ""}">${esc(r)}</li>`).join("");
}

/** The balance is real and it is joined onto the record by accounts.public.
 *  The price comes from /api/pricing, which is the only place one exists —
 *  the bot quotes the same numbers from the same call. */
function renderCredits() {
    if (features.credits === false) {
        $("creditChip").classList.add("hidden");
        $("creditBody").innerHTML = `<p class="set-pending-note">Credits are not switched on.</p>`;
        return;
    }
    const n = Number(account.credits || 0);
    $("creditChip").classList.remove("hidden");
    $("creditChip").textContent = `⬡ ${n} ${n === 1 ? "run" : "runs"}`;
    $("creditChip").classList.toggle("pending", n === 0);

    const packs = pricing && pricing.packs
        ? `<div class="set-packs">${pricing.packs.map((p) =>
            `<div class="set-pack"><b>${p.credits} runs</b><span>${esc(money(p.price))}</span></div>`).join("")}</div>`
        : "";
    const buy = pricing && pricing.topup_ready
        ? `<div class="set-actions"><button id="topupBtn" class="set-btn primary">Buy credits</button></div>`
        : `<p class="set-pending-note">Buying is not open yet — send /feedback and they are added by hand.</p>`;
    const one = pricing ? `<div class="set-big-note">One deep read costs ${esc(money(pricing.reasoning_run))}.</div>` : "";
    $("creditBody").innerHTML = `
        <div class="set-big">${n}</div>
        <div class="set-big-note">${n === 1 ? "reasoning run left" : "reasoning runs left"}</div>
        ${one}
        <p class="set-hint">Use one with <b>/reason TICKER</b>, or the button under any alert.</p>
        ${packs}
        ${buy}`;
}

// --- 5. the account itself ---------------------------------
// Says which doors are open, and offers the missing one. A bot-first account
// has no email, and linking will not hand it one, so it is added here.
function renderLoginWays() {
    const ways = [];
    if (account.email) ways.push(`Email — <b>${esc(account.email)}</b>`);
    for (const p of Object.keys(account.oauth || {}))
        ways.push(`${p[0].toUpperCase() + p.slice(1)}`);
    if (account.tg) ways.push("Telegram — the bot code from <b>/password</b>");
    $("loginWays").innerHTML = ways.length
        ? `<ul class="set-ways">${ways.map((w) => `<li>${w}</li>`).join("")}</ul>`
        : `<span class="sub-empty">No way to log in yet.</span>`;
    // Nothing to add once an email is on the account; changing it is its own job.
    $("addLoginForm").classList.toggle("hidden", !!account.email);
}

/** Telegram is the delivery channel, so this row states plainly whether
 *  anything can reach them. Disconnecting is offered, with what it costs. */
function renderTelegram() {
    $("tgRow").innerHTML = account.tg
        ? `<div class="set-row"><b>Connected</b>
             <span class="set-row-v">chat ${esc(account.tg)}</span></div>
           <div class="set-row"><span>Disconnecting stops every alert — they arrive in Telegram and nowhere else.</span>
             <button id="tgOff" class="set-btn danger">Disconnect</button></div>`
        : `<div class="set-row"><b>Not connected</b>
             <span class="set-row-v">nothing can reach you — use the bar at the top of this page</span></div>`;
}

/** SAVED AND READ BY NOTHING. Not the writer, not the bot's own wording — I
 *  checked. So the choice is stored and the page says plainly that it does not
 *  change a line yet, rather than presenting a switch that does nothing. */
function renderLang() {
    const input = document.querySelector(`#langChoice input[value="${account.lang === "ru" ? "ru" : "en"}"]`);
    if (input) input.checked = true;
    const obeyed = features.lang === true;
    $("langGroup").classList.toggle("pending-group", !obeyed);
    $("langNote").classList.toggle("hidden", obeyed);
    $("langNote").textContent = obeyed ? ""
        : "Your choice is remembered. Every alert is still written in English — the writer does not read this yet.";
}

function render() {
    document.body.classList.toggle("is-paused", account.status === "paused");
    const blocked = !!account.blocked;
    $("blockedBar").classList.toggle("hidden", !blocked);
    document.body.classList.toggle("is-blocked", blocked);
    // No telegram means no alerts at all, so it outranks everything except a
    // block — which is the same problem one step further along.
    $("linkTgBar").classList.toggle("hidden", blocked || !!account.tg);
    // The two states someone forgets they set. Both belong beside the plan,
    // where the eye already goes.
    $("quietChip").classList.toggle("hidden", !account.quiet || account.status === "paused");
    $("pausedChip").classList.toggle("hidden", account.status !== "paused");
    renderWatch();
    renderDefaults();
    renderPause();
    renderScopePicker();
    renderScopePane();
    renderPlan();
    renderCredits();
    renderLoginWays();
    renderTelegram();
    renderLang();
}

// --- events -------------------------------------------------
$("batchAdd").addEventListener("click", () => $("batchMenu").classList.toggle("hidden"));

// The quiet-tier rule for a first or oversized batch is the server's now
// (api/accounts.ts::addGroupQuiet), so the bot and this page cannot drift.
$("startBatches").addEventListener("click", (e) => {
    const name = e.target.closest("[data-add-batch]")?.dataset.addBatch;
    if (name) setBatch(name, true);
});

$("batchMenu").addEventListener("click", (e) => {
    const name = e.target.closest("[data-add-batch]")?.dataset.addBatch;
    if (!name) return;
    $("batchMenu").classList.add("hidden");
    setBatch(name, true);
});

$("batchChips").addEventListener("click", (e) => {
    const g = e.target.dataset.dropBatch;
    if (g) setBatch(g, false);
});

$("pickChips").addEventListener("click", (e) => {
    const t = e.target.dataset.dropPick;
    // Records an exclusion as well, so a stock that arrived through a batch
    // actually goes quiet instead of coming back on the next index build.
    if (t) dropPick(t);
});

$("silentList").addEventListener("click", async (e) => {
    const wake = e.target.dataset.wake;
    if (wake) {
        apply("/api/subscription/unsnooze", { ticker: wake });
        return;
    }
    const t = e.target.dataset.putback;
    // add_stocks lifts the exclusion as well as adding the pick, which is what
    // "put back" means — the batch stays whole and the row disappears.
    if (t) addPick(t);
});

function wireSearch(inputId, menuId) {
    const input = $(inputId), menu = $(menuId);
    if (!input || !menu) return;
    input.addEventListener("input", () => {
        const q = input.value.trim().toLowerCase();
        const have = new Set(account.stocks);
        const hits = watched
            .filter((s) => !have.has(s.ticker) &&
                (s.ticker.toLowerCase().includes(q) || (s.name || "").toLowerCase().includes(q)))
            .slice(0, 8);
        menu.innerHTML = hits.map((s) =>
            `<button data-add-pick="${esc(s.ticker)}">${esc(s.ticker)}<span>${esc(s.name || "")}</span></button>`).join("")
            || `<div class="set-menu-empty">Nothing we watch matches that.</div>`;
        menu.classList.toggle("hidden", !q);
    });
    input.addEventListener("blur", () => setTimeout(() => menu.classList.add("hidden"), 150));
    menu.addEventListener("mousedown", (e) => {
        const t = e.target.closest("[data-add-pick]")?.dataset.addPick;
        if (!t) return;
        input.value = "";
        menu.classList.add("hidden");
        addPick(t);
    });
}
wireSearch("startInput", "startMenu");
wireSearch("pickInput", "pickMenu");

/** One control group changed. `field` says which; the value is read off the
 *  group so a checkbox list and a radio set go the same way. */
function readField(group) {
    const field = group.dataset.field;
    if (field === "tier" || field === "style")
        return group.querySelector("input:checked")?.value ?? null;
    if (field === "quiet") return !!group.querySelector("input").checked;
    if (field === "mute_kinds") {
        // What is OFF, not what is on. Sent even when empty, because "nothing
        // muted here" has to be able to beat a default that mutes something.
        return KIND_COPY.map((k) => k[0])
            .filter((v) => !group.querySelector(`input[value="${v}"]`).checked);
    }
    return null;
}

$("defaultPane").addEventListener("change", (e) => {
    const group = e.target.closest("[data-field]");
    if (!group) return;
    save({ [group.dataset.field]: readField(group) });
});

$("langChoice").addEventListener("change", (e) => {
    if (e.target.name === "setLang") save({ lang: e.target.value });
});

$("pauseBtn").addEventListener("click", () =>
    save({ status: account.status === "paused" ? "active" : "paused" }));

$("scopePick").addEventListener("change", (e) => {
    scope = e.target.value || null;
    renderScopePicker();
    renderScopePane();
});

/** Everything inside the per-scope panel writes to THAT scope, never to the
 *  account. The account default is the pane above and nothing else. */
$("scopePane").addEventListener("change", (e) => {
    const group = e.target.closest("[data-field]");
    if (!group || !scope) return;
    setScope({ [group.dataset.field]: readField(group) });
});

$("scopePane").addEventListener("click", async (e) => {
    const reset = e.target.dataset.reset;
    if (reset) {                       // null CLEARS, so the scope falls back
        setScope({ [reset]: null });
        return;
    }
    const hours = e.target.dataset.snooze;
    if (hours && isTicker(scope)) {
        apply("/api/subscription/snooze", { ticker: scope, hours: Number(hours) });
        return;
    }
    const wake = e.target.dataset.wake;
    if (wake) {
        apply("/api/subscription/unsnooze", { ticker: wake });
    }
});

const setScope = (patch) =>
    apply("/api/subscription/prefs", { scope, patch });

// The note is written whole: set_note REPLACES, so a partial send would drop
// every field the reader did not touch. `change` fires when a text field is
// left after an edit, which keeps the page's no-Save-button rule.
//
// THE SENDS ARE CHAINED, and they have to be. Moving through the fields fires
// one whole-note write per field, and two in flight at once can land in either
// order — measured: filling `entry` then `ask` saved only `entry`, because the
// first request replaced the record after the second had. The chain also reads
// the form at SEND time, so the last write always carries every field.
function saveNote(form) {
    const ticker = form.dataset.ticker;
    const note = {};
    for (const el of form.elements) {
        const v = String(el.value || "").trim();
        if (v) note[el.name] = v;
    }
    return post("/api/subscription/note", { ticker, note }).then((r) => {
        if (r.error) { flashWarn(r.error); return; }
        // Empty note = deleted, which is what the server returns as {}.
        if (r.payload && Object.keys(r.payload).length) notes[ticker] = r.payload;
        else delete notes[ticker];
        const flag = $("noteSaved");
        if (flag) {
            flag.classList.remove("hidden");
            setTimeout(() => flag.classList.add("hidden"), 2000);
        }
    });
}

function queueNote(form) {
    writeChain = writeChain.then(() => saveNote(form));
}

$("scopePane").addEventListener("change", (e) => {
    const form = e.target.closest("#noteForm");
    if (form) queueNote(form);
});

// AND on typing, settled. `change` alone fires on blur, so whatever is in the
// LAST field the reader touches is lost if they close the tab without moving
// focus out of it — which is the ordinary way to finish filling a form.
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
// Five sections is past the point where one long scroll is findable.
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
    // Everything the page needs to know what is real, fetched once. `features`
    // decides which controls are live, `pricing` is the only place a price
    // comes from, and both are cheap.
    const [b, s, f, p, h, n] = await Promise.all([
        post("/api/batches"), post("/api/stocks"), post("/api/features"),
        post("/api/pricing"), post("/api/alerts/mine"), post("/api/subscription/notes"),
    ]);
    batches = b.payload || [];
    features = f.payload && typeof f.payload === "object" ? f.payload : {};
    pricing = p.payload || null;
    sent = Array.isArray(h.payload) ? h.payload : [];
    notes = n.payload && typeof n.payload === "object" ? n.payload : {};
    // Only what the service watches can be subscribed to — offering the rest
    // accepts a subscription that can never produce an alert.
    watched = (s.payload || []).filter((x) => x.watched);
    await refreshResolved();
    render();
    for (const id of ["secStocks", "secAlerts", "secStock", "secPlan", "secAccount"]) {
        const el = $(id);
        if (el) navSpy.observe(el);
    }
}

boot();
