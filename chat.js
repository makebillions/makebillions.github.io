// ============================================================
// Alert chat: conversation pinned to one alert/stock, answered by
// the LLM via /api/chat (grounded in the latest candles/digest/IMOEX).
// Globals shared with js.js/chart.js: post(), host, window.__isLoggedIn.
// ============================================================
const feedPanel = document.getElementById("feedPanel");
const chatPanel = document.getElementById("chatPanel");
const chatThread = document.getElementById("chatThread");
const chatInput = document.getElementById("chatInput");
const chatSendBtn = document.getElementById("chatSend");

let chatTicker = null;
let chatHistory = []; // [{role, content}] sent in full on each turn
let chatBusy = false;

function currentTicker() {
    return (document.getElementById("chartStockTitle")?.textContent || "")
        .trim()
        .split(/\s+/)[0] || "—";
}

// History is kept per ticker in localStorage (the server stays stateless —
// only daily counts live there). One thread per stock: opening from an
// alert or fresh lands in the same conversation.
function _openChat(ticker, title, sub, firstMsgHtml, alertText) {
    if (!chatPanel || !feedPanel) return;
    document.getElementById("chatTitle").textContent = title;
    document.getElementById("chatSub").textContent = sub;
    document.getElementById("chatFirstMsg").innerHTML = firstMsgHtml;
    chatTicker = ticker;
    document.querySelectorAll("#chatThread .chat-dyn").forEach((n) => n.remove());
    const stored = loadChatHistory(ticker);
    if (stored && stored.length) {
        chatHistory = stored;
        // Re-render prior turns; stored[0] is the original seed, already
        // represented by the pinned first message above.
        stored.slice(1).forEach((m) => appendChatMsg(m.role, m.content));
        if (alertText && stored[stored.length - 1].content !== alertText) {
            chatHistory.push({ role: "assistant", content: alertText });
        }
    } else {
        chatHistory = alertText
            ? [{ role: "assistant", content: alertText }]
            : [];
    }
    feedPanel.classList.add("hidden");
    chatPanel.classList.remove("hidden");
    chatPanel.classList.add("flex");
    chatInput?.focus();
}

function openAlertChat(card) {
    if (!card) return;
    const ticker = currentTicker();
    const when = card.querySelector(".event-when")?.textContent.trim() || "";
    const msg = card.querySelector(".read");
    _openChat(
        ticker,
        `${ticker} · this alert`,
        when ? `asking about the ${when} signal` : "asking about this signal",
        msg ? msg.innerHTML : "",
        msg ? msg.textContent.trim() : ""
    );
}

function openStockChat() {
    const ticker = currentTicker();
    if (ticker === "—") return;
    _openChat(
        ticker,
        `${ticker} · chat`,
        "ask about this stock or the broader market",
        `Ask me anything about ${ticker} — the current move, key levels, volume, or how it sits against the market.`,
        ""
    );
}

const openChatBtn = document.getElementById("openChatBtn");
if (openChatBtn) openChatBtn.addEventListener("click", openStockChat);

function closeAlertChat() {
    if (!chatPanel || !feedPanel) return;
    chatPanel.classList.add("hidden");
    chatPanel.classList.remove("flex");
    feedPanel.classList.remove("hidden");
}

const chatBackBtn = document.getElementById("chatBack");
if (chatBackBtn) chatBackBtn.addEventListener("click", closeAlertChat);

function appendChatMsg(role, text) {
    const wrap = document.createElement("div");
    wrap.classList.add("chat-dyn");
    let bubble;
    if (role === "user") {
        wrap.className += " self-end max-w-[92%]";
        bubble = document.createElement("div");
        bubble.className =
            "bg-violet text-white rounded-2xl rounded-tr-md px-4 py-3 text-[14px] leading-relaxed";
        wrap.appendChild(bubble);
    } else {
        wrap.className += " self-start max-w-[92%] flex gap-2.5";
        wrap.innerHTML =
            '<span class="shrink-0 w-7 h-7 rounded-full bg-violet-bg border border-violet-edge grid place-items-center text-violet mt-0.5">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5 10.1 10.9 5.5 9l4.6-1.4z" /></svg></span>';
        bubble = document.createElement("div");
        bubble.className =
            "bg-paper/70 border border-ink/10 rounded-2xl rounded-tl-md px-4 py-3 read text-[15px] leading-relaxed text-ink";
        wrap.appendChild(bubble);
    }
    bubble.textContent = text;
    chatThread.appendChild(wrap);
    chatThread.scrollTop = chatThread.scrollHeight;
    return bubble;
}

// --- Per-ticker history in localStorage ----------------------
const CHAT_HIST_PREFIX = "chatHist:";

function saveChatHistory() {
    if (!chatTicker) return;
    try {
        localStorage.setItem(CHAT_HIST_PREFIX + chatTicker,
            JSON.stringify(chatHistory.slice(-30)));
    } catch (e) { /* storage full/blocked — chat still works in-memory */ }
}

function loadChatHistory(ticker) {
    try {
        const h = JSON.parse(localStorage.getItem(CHAT_HIST_PREFIX + ticker));
        return Array.isArray(h) ? h : null;
    } catch (e) {
        return null;
    }
}

// --- Limits -------------------------------------------------
// Anonymous users get a couple of free messages per day, signed-up users
// more. The server enforces real counts (Redis, keyed by signed cookie /
// uid); localStorage is just the soft pre-check to avoid useless requests.
const ANON_CHAT_LIMIT = 2;
const ANON_COUNT_KEY = "chatAnonCount";

function anonChatCount() {
    // "YYYY-MM-DD:N" — per-day count, resets on a new day.
    const raw = (localStorage.getItem(ANON_COUNT_KEY) || "").split(":");
    const today = new Date().toISOString().slice(0, 10);
    return raw[0] === today ? parseInt(raw[1], 10) || 0 : 0;
}

function bumpAnonChatCount() {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(ANON_COUNT_KEY, `${today}:${anonChatCount() + 1}`);
}

function anonLimitReached() {
    return !window.__isLoggedIn && anonChatCount() >= ANON_CHAT_LIMIT;
}

// --- Offer cards --------------------------------------------
function appendSignupCard() {
    if (chatThread.querySelector(".signup-offer")) return;
    const card = document.createElement("div");
    card.className =
        "chat-dyn signup-offer self-start max-w-[92%] ml-9 rounded-xl border border-violet-edge bg-violet-bg px-4 py-3";
    card.innerHTML =
        '<div class="text-[12px] font-bold text-violet mb-1">You’ve used your free questions for today</div>' +
        '<p class="text-[13px] text-ink/70 leading-snug mb-2.5">Sign up free — connect the Telegram bot — to keep chatting and get these alerts live.</p>' +
        '<button class="px-4 py-1.5 text-[13px] font-bold text-white bg-violet hover:bg-violet-dark rounded-full transition-colors">Sign up free</button>';
    card.querySelector("button").addEventListener("click", () => {
        document.getElementById("signupSection")?.scrollIntoView({ behavior: "smooth" });
    });
    chatThread.appendChild(card);
    chatThread.scrollTop = chatThread.scrollHeight;
}

function appendProOffer(title, text) {
    // Gold offer card — shown when the model needed a PRO-only capability,
    // or when a signed-up user hits the daily limit.
    if (chatThread.querySelector(".pro-offer")) return;
    title = title || "This needs a PRO account";
    text = text || "Market-wide signal scans and personal level alerts are part of PRO.";
    const card = document.createElement("div");
    card.className =
        "chat-dyn pro-offer self-start max-w-[92%] ml-9 rounded-xl border border-gold-edge bg-gold-bg px-4 py-3";
    card.innerHTML =
        '<div class="flex items-center gap-2 text-[12px] font-bold text-gold mb-1">' +
        '<span class="inline-flex items-center text-[10px] font-bold text-gold bg-white border border-gold-edge rounded-full px-1.5 py-0.5">PRO</span>' +
        `${title}</div>` +
        `<p class="text-[13px] text-ink/70 leading-snug mb-2.5">${text}</p>` +
        '<button class="px-4 py-1.5 text-[13px] font-bold text-white bg-gold rounded-full hover:opacity-90 transition-opacity">Get PRO</button>';
    card.querySelector("button").addEventListener("click", () => {
        document.getElementById("signupSection")?.scrollIntoView({ behavior: "smooth" });
    });
    chatThread.appendChild(card);
    chatThread.scrollTop = chatThread.scrollHeight;
}

// --- Send ---------------------------------------------------
async function sendChatMessage() {
    const text = (chatInput?.value || "").trim();
    if (!text || chatBusy || !chatTicker) return;
    if (anonLimitReached()) {
        appendSignupCard();
        return;
    }
    chatInput.value = "";
    appendChatMsg("user", text);
    chatHistory.push({ role: "user", content: text });
    chatBusy = true;
    const bubble = appendChatMsg("assistant", "…");
    try {
        const data = await post(`${host}/api/chat`, {
            ticker: chatTicker,
            messages: chatHistory,
        });
        if (data && data.reply) {
            bubble.textContent = data.reply;
            chatHistory.push({ role: "assistant", content: data.reply });
            saveChatHistory();
            if (!window.__isLoggedIn) {
                bumpAnonChatCount();
                if (anonLimitReached()) appendSignupCard();
            }
            if (data.pro_required) appendProOffer();
        } else if (data && data.limit) {
            // Server-side daily limit hit (authoritative over localStorage).
            bubble.parentElement.remove();
            chatHistory.pop();
            saveChatHistory();
            if (data.limit === "anon") appendSignupCard();
            else appendProOffer(
                "Daily limit reached",
                "You’ve used today’s free questions. PRO removes the limits — and adds market-wide scans and personal alerts.");
        } else {
            bubble.textContent = "Service unavailable — try again in a minute.";
        }
    } catch (e) {
        bubble.textContent = "Service unavailable — try again in a minute.";
    } finally {
        chatBusy = false;
        chatThread.scrollTop = chatThread.scrollHeight;
    }
}

if (chatSendBtn) chatSendBtn.addEventListener("click", sendChatMessage);
if (chatInput)
    chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendChatMessage();
        }
    });
document.querySelectorAll(".chat-suggestion").forEach((chip) => {
    chip.addEventListener("click", () => {
        if (!chatInput) return;
        chatInput.value = chip.textContent.replace(/\s+/g, " ").trim();
        sendChatMessage();
    });
});
