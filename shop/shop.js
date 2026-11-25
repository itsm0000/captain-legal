// @ts-check
/**
 * متجر كابتن (docs/release/ROUND_2_12.md §4 and §13). A static page: it signs in with the Google
 * account the player uses in the app (Google's button on CAPTAIN's Firebase address, firebase/public/google,
 * then the token traded here at Supabase Auth as the app trades it; docs/release/GOOGLE_SIGN_IN.md),
 * or, behind WHATSAPP_SIGN_IN, with the code the
 * sign-in function sends on WhatsApp. It reads what is sold (shop_catalogue) and what the account has
 * (shop_state, or /pay/state when something is waiting on the gateway), and opens ZainCash through
 * /pay/start. The server decides every amount and every grant; the page sends only what to buy.
 * A buyer coming back from ZainCash is never believed: the page asks the server, which asks ZainCash.
 *
 * Everything the server sends is put on the page as text, never as markup.
 */
import { BACKEND, CONTACT, GOOGLE_PAGE } from "./config.js";
import * as L from "./logic.js";

const SESSION_KEY = "captain-shop-session";
const FN = `${BACKEND.url}/functions/v1/sign-in`;

/** @typedef {{ accessToken: string, refreshToken: string, expiresAt: number, phone: string, email: string }} Session */

const page = {
  /** @type {Session | null} */ session: null,
  /** @type {any} */ catalogue: null,
  /** @type {any[]} */ trying: [],
  /** @type {any} */ account: null,
  /** @type {boolean | null} */ payAvailable: null,
  /** @type {boolean | null} */ otpAvailable: null,
  /** @type {string | null} */ serverTrouble: null,
  /** @type {string | null} */ accountTrouble: null,
  signin: { step: "phone", phone: "", retryUntil: 0, busy: false, error: "" },
  /** On the way to Google's page, or trading the token it handed back. */
  google: { busy: false },
  returned: L.returnedPayment(location.search),
  forVenue: L.openedForVenue(location.search),
  checking: false,
};

// ───────────────────────────── Elements, built as text ─────────────────────────────

/** @param {string} tag @param {Record<string, any>} [attrs] @param {...any} children */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") el.className = value;
    else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else if (value === true) el.setAttribute(key, "");
    else el.setAttribute(key, String(value));
  }
  append(el, children);
  return el;
}

/** @param {Element} el @param {any[]} children */
function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

const SVG = "http://www.w3.org/2000/svg";
/** @param {string} tag @param {Record<string, any>} [attrs] @param {...Element} children */
function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  for (const child of children) el.append(child);
  return el;
}

/** Line drawings from lucide (ISC licence), the set the app draws its icons from. */
const ICONS = {
  wallet: ["M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1", "M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"],
  store: ["m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7", "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8", "M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4", "M2 7h20", "M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"],
  check: ["M20 6 9 17l-5-5"],
  alert: ["m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3", "M12 9v4", "M12 17h.01"],
  info: ["M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20z", "M12 16v-4", "M12 8h.01"],
  loader: ["M21 12a9 9 0 1 1-6.219-8.56"],
  lock: ["M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z", "M7 11V7a5 5 0 0 1 10 0v4"],
  star: ["M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"],
  sparkles: ["M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"],
  message: ["M7.9 20A9 9 0 1 0 4 16.1L2 22Z"],
  refresh: ["M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8", "M21 3v5h-5", "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16", "M8 16H3v5"],
  clock: ["M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20z", "M12 6v6l4 2"],
  receipt: ["M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z", "M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8", "M12 17.5v-11"],
  shield: ["M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"],
  fire: ["M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"],
  lightning: ["M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"],
  poison: ["M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z", "M9.5 15.5h.01", "M14.5 15.5h.01", "M10 18.5h4"],
  ice: ["M2 12h20", "M12 2v20", "m20 16-4-4 4-4", "m4 8 4 4-4 4", "m16 4-4 4-4-4", "m8 20 4-4 4 4"],
};

/** @param {keyof typeof ICONS} name @param {string} [cls] */
function icon(name, cls = "icon") {
  return s("svg", { viewBox: "0 0 24 24", class: cls, fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" },
    ...ICONS[name].map((d) => s("path", { d })));
}

// ───────────────────────────── The pictures of what is sold ─────────────────────────────

/** The crest shapes of apps/mobile/lib/art/crest.ts, on its 100 × 114 canvas. */
const SHAPES = {
  shield: "M10 8H90V56C90 80 70 96 50 104C30 96 10 80 10 56Z",
  kite: "M50 4L88 40L50 108L12 40Z",
  notched: "M10 8H34L42 18H58L66 8H90V58C90 80 70 96 50 104C30 96 10 80 10 58Z",
  ticket: "M8 12H92V42A12 12 0 0 0 92 66V96H8V66A12 12 0 0 0 8 42Z",
  star: "M50 6L67.63 31.73L97.55 40.55L78.53 65.27L79.39 96.45L50 86L20.61 96.45L21.47 65.27L2.45 40.55L32.37 31.73Z",
};
const STAR = "M50 36L55.3 47.6L68 49L58.6 57.6L61.1 70L50 63.8L38.9 70L41.4 57.6L32 49L44.7 47.6Z";

/** Each effect's two colours, as the effects in apps/mobile/lib/art/effects.ts read. */
const EFFECT = { fire: ["#FF6B1A", "#FFD166"], lightning: ["#FFE14D", "#7DD3FC"], poison: ["#7BE36B", "#2F9E44"], ice: ["#BFF0FF", "#5AC8FA"] };

let art = 0;
/** A crest on the dark tile, with an effect around it when one is given. */
function crestArt(shapePath, effect) {
  const id = `a${++art}`;
  const [c1, c2] = effect ? EFFECT[effect] : ["#F2C94C", "#C99A1D"];
  const svg = s("svg", { viewBox: "-8 -8 116 130", role: "img", "aria-hidden": "true" },
    s("defs", {},
      s("linearGradient", { id: `${id}g`, x1: 0, y1: 0, x2: 0, y2: 1 }, s("stop", { offset: 0, "stop-color": "#6D63F6" }), s("stop", { offset: 1, "stop-color": "#2B1A8F" })),
      s("linearGradient", { id: `${id}e`, x1: 0, y1: 0, x2: 1, y2: 1 }, s("stop", { offset: 0, "stop-color": c1 }), s("stop", { offset: 1, "stop-color": c2 })),
      s("filter", { id: `${id}f`, x: "-30%", y: "-30%", width: "160%", height: "160%" }, s("feGaussianBlur", { stdDeviation: 4 }))),
  );
  if (effect) svg.append(s("path", { d: shapePath, fill: "none", stroke: `url(#${id}e)`, "stroke-width": 10, filter: `url(#${id}f)`, opacity: 0.9 }));
  svg.append(
    s("path", { d: shapePath, fill: `url(#${id}g)`, stroke: effect ? `url(#${id}e)` : "#F2C94C", "stroke-width": 3 }),
    s("path", { d: STAR, fill: effect ? `url(#${id}e)` : "#F2C94C" }),
  );
  if (effect) {
    // The effect's own glyph on the crest's shoulder, so the four read apart at a glance.
    const glyph = s("g", { transform: "translate(66 -4) scale(1.4)", fill: "none", stroke: c1, "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" },
      ...ICONS[/** @type {keyof typeof ICONS} */ (effect)].map((d) => s("path", { d })));
    svg.append(glyph);
  }
  return svg;
}

const STILL = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Films play only while on screen, so a phone downloads and decodes only what is looked at. */
const watcher = typeof IntersectionObserver === "function"
  ? new IntersectionObserver((seen) => {
      for (const e of seen) {
        const video = /** @type {HTMLVideoElement} */ (e.target);
        if (e.isIntersecting) {
          if (video.preload !== "auto") video.preload = "auto";
          video.play().catch(() => {});
        } else video.pause();
      }
    }, { rootMargin: "200px 0px" })
  : null;

/**
 * The item as the app draws it: its film (scripts/shop-media.mjs), or its picture with motion off.
 * @param {any} entry @param {{ video: string | null, poster: string }} media
 */
function mediaArt(entry, media) {
  const box = h("div", { class: `art media ${entry.group === "set" ? "card-art" : ""}`, "aria-hidden": "true" });
  if (media.video && !STILL) {
    const video = /** @type {HTMLVideoElement} */ (h("video", { muted: true, loop: true, playsinline: true, preload: "none", poster: media.poster, disablepictureinpicture: true, disableremoteplayback: true }));
    video.muted = true;
    video.src = media.video;
    if (watcher) watcher.observe(video);
    else video.autoplay = true;
    box.append(video);
  } else box.append(h("img", { src: media.poster, alt: "", loading: "lazy", decoding: "async" }));
  return box;
}

/** @param {any} entry */
function itemArt(entry) {
  const media = L.mediaOf(entry);
  if (media) return mediaArt(entry, media);
  const box = h("div", { class: "art", "aria-hidden": "true" });
  if (entry.group === "crest_effect" && EFFECT[entry.key]) box.append(crestArt(SHAPES.shield, entry.key));
  else if (entry.group === "crest_shape" && SHAPES[entry.key]) box.append(crestArt(SHAPES[entry.key], null));
  else if (entry.group === "title_effect" && EFFECT[entry.key]) {
    const glyph = () => {
      const g = icon(/** @type {keyof typeof ICONS} */ (entry.key), "icon");
      g.setAttribute("stroke", EFFECT[entry.key][0]);
      return g;
    };
    box.append(h("div", { class: "plate row" }, glyph(), "القنّاص", glyph()));
  } else if (entry.group === "title_font") box.append(h("div", { class: `plate font-${entry.key}` }, "البرق"));
  else {
    const g = icon("sparkles", "icon");
    g.setAttribute("stroke", "#F2C94C");
    g.setAttribute("width", "72");
    g.setAttribute("height", "72");
    box.append(g);
  }
  return box;
}

// ───────────────────────────── Talking to the server ─────────────────────────────

class Trouble extends Error {
  /** @param {string} code */
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/**
 * The sign-in function's routes. No apikey header: the function needs none, and the browser would
 * have to ask leave for it first (corsHeaders allows authorization and content-type only).
 * @param {string} path @param {{ method?: string, body?: any, token?: string }} [init]
 */
async function fn(path, init = {}) {
  /** @type {Record<string, string>} */
  const headers = {};
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  let response;
  try {
    response = await fetch(FN + path, { method: init.method ?? "POST", headers, body: init.body === undefined ? undefined : JSON.stringify(init.body), credentials: "omit", cache: "no-store" });
  } catch {
    throw new Trouble("OFFLINE");
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { status: response.status, ok: response.ok, data };
}

/** Supabase's own services: Auth and the database's entry points. @param {string} path @param {{ body?: any, token?: string }} [init] */
async function api(path, init = {}) {
  /** @type {Record<string, string>} */
  const headers = { apikey: BACKEND.key, "Content-Type": "application/json" };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  let response;
  try {
    response = await fetch(BACKEND.url + path, { method: "POST", headers, body: JSON.stringify(init.body ?? {}), credentials: "omit", cache: "no-store" });
  } catch {
    throw new Trouble("OFFLINE");
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { status: response.status, ok: response.ok, data };
}

/** A database refusal carries its rule as the message (raise exception 'MONTHLY_CAP'). */
function refusal(result) {
  const message = result.data && typeof result.data.message === "string" ? result.data.message : "";
  if (/^[A-Z_]+$/.test(message)) return new Trouble(message);
  if (result.status === 401) return new Trouble("SESSION_EXPIRED");
  return new Trouble("SERVER_ERROR");
}

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed.accessToken === "string" && typeof parsed.refreshToken === "string") return parsed;
  } catch {
    /* A private window or blocked storage: the buyer signs in again. */
  }
  return null;
}

/** @param {Session | null} next */
function saveSession(next) {
  page.session = next;
  try {
    if (next) sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* Kept in memory for this visit only. */
  }
}

/** @param {any} data @returns {Session} */
function toSession(data) {
  if (!data || typeof data.access_token !== "string" || typeof data.refresh_token !== "string") throw new Trouble("SERVER_ERROR");
  const phone = typeof data.user?.phone === "string" ? data.user.phone : "";
  const lifetime = typeof data.expires_in === "number" ? data.expires_in : 3600;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + lifetime * 1000,
    phone: !phone ? "" : phone.startsWith("+") ? phone : `+${phone}`,
    email: L.googleEmail(data.user),
  };
}

/** A token that will last the next call, renewed first when it is about to run out. */
async function token() {
  const current = page.session;
  if (!current) throw new Trouble("SESSION_EXPIRED");
  if (current.expiresAt - Date.now() > 60_000) return current.accessToken;
  const result = await api("/auth/v1/token?grant_type=refresh_token", { body: { refresh_token: current.refreshToken } });
  if (!result.ok) {
    if (result.status >= 500) throw new Trouble("SERVER_ERROR");
    saveSession(null);
    throw new Trouble("SESSION_EXPIRED");
  }
  saveSession(toSession(result.data));
  return /** @type {Session} */ (page.session).accessToken;
}

/** Every set of the catalogue with its state, so sets still free to try show beside those for sale. */
async function readSets() {
  let response;
  try {
    response = await fetch(`${BACKEND.url}/rest/v1/cosmetic_sets?select=id,name,tier,status,price_iqd&order=sort`, { headers: { apikey: BACKEND.key }, credentials: "omit", cache: "no-store" });
  } catch {
    return [];
  }
  if (!response.ok) return [];
  const data = await response.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

async function readCatalogue() {
  const result = await api("/rest/v1/rpc/shop_catalogue");
  if (!result.ok) throw refusal(result);
  return result.data;
}

/** Whether a route answers yes; false for a server that does not have it yet. @param {string} path */
async function available(path) {
  const result = await fn(path, { method: "GET" });
  if (result.ok) return result.data?.available === true;
  if (result.status === 404) return false;
  throw new Trouble("SERVER_ERROR");
}

/**
 * The account's page. shop_state reads the books; /pay/state first asks ZainCash about every attempt
 * still open, so it is used when the buyer comes back and while anything is waiting.
 * @param {boolean} askGateway
 */
async function readAccount(askGateway) {
  if (askGateway) {
    const result = await fn("/pay/state", { method: "GET", token: await token() });
    if (result.status === 401) {
      saveSession(null);
      throw new Trouble("SESSION_EXPIRED");
    }
    if (!result.ok) throw new Trouble("SERVER_ERROR");
    if (!result.data || typeof result.data !== "object") throw new Trouble("NOT_SIGNED_IN");
    return result.data;
  }
  const result = await api("/rest/v1/rpc/shop_state", { token: await token() });
  if (!result.ok) throw refusal(result);
  if (!result.data || typeof result.data !== "object") throw new Trouble("NOT_SIGNED_IN");
  return result.data;
}

const waiting = (account) => (account?.payments ?? []).some((p) => p.status === "pending" || p.status === "created");

async function refreshAccount() {
  page.accountTrouble = null;
  try {
    let account = await readAccount(page.returned !== null);
    if (page.returned === null && waiting(account)) account = await readAccount(true);
    page.account = account;
  } catch (error) {
    const code = error instanceof Trouble ? error.code : "SERVER_ERROR";
    page.account = null;
    if (code === "SESSION_EXPIRED") {
      saveSession(null);
      page.signin.error = L.errorWords(code);
    } else page.accountTrouble = code;
  }
}

// ───────────────────────────── Signing in with Google ─────────────────────────────

/** What this tab keeps while the buyer is on Google's page: the raw nonce, and the address to restore. */
const GOOGLE_KEY = "captain-shop-google";

/**
 * Goes to Google's page on CAPTAIN's Firebase address (firebase/public/google), the one browser
 * origin the Google client trusts. Only the nonce's hash leaves this tab; the raw nonce waits here.
 */
async function goToGoogle() {
  page.signin.error = "";
  page.google.busy = true;
  renderSignin();
  const nonce = await L.makeNonce();
  try {
    sessionStorage.setItem(GOOGLE_KEY, JSON.stringify({ raw: nonce.raw, search: location.search }));
  } catch {
    page.google.busy = false;
    page.signin.error = L.errorWords("GOOGLE_RETRY");
    return renderSignin();
  }
  location.assign(L.googlePageAddress(GOOGLE_PAGE, nonce.hashed, location.origin + location.pathname));
}

/**
 * The token Google's page handed back in the fragment, with the raw nonce this tab kept for it.
 * The fragment leaves the address bar at once. Null when the page was not opened that way.
 * @returns {{ credential: string, raw: string } | null}
 */
function takeGoogleHandoff() {
  const credential = L.handedToken(location.hash);
  if (credential === null) return null;
  let kept = null;
  try {
    kept = JSON.parse(sessionStorage.getItem(GOOGLE_KEY) ?? "null");
    sessionStorage.removeItem(GOOGLE_KEY);
  } catch {
    kept = null;
  }
  const search = typeof kept?.search === "string" && kept.search.startsWith("?") ? kept.search : "";
  history.replaceState(null, "", location.pathname + search);
  page.returned = L.returnedPayment(search);
  page.forVenue = L.openedForVenue(search);
  return { credential, raw: typeof kept?.raw === "string" ? kept.raw : "" };
}

/**
 * Trades Google's token at Supabase Auth for a session, as the app does. A Google account with no
 * CAPTAIN account is told to sign up in the app, and the empty account Supabase Auth made for it is
 * forgotten at once, so the same Google account can still be linked to a number account in حسابي
 * (supabase/migrations/20261125100000_shop_forgets_unused_google.sql).
 * @param {{ credential: string, raw: string }} handed
 */
async function signInWithGoogle(handed) {
  page.signin.error = "";
  page.google.busy = true;
  renderSignin();
  try {
    if (!handed.raw) throw new Trouble("GOOGLE_RETRY");
    const result = await api("/auth/v1/token?grant_type=id_token", { body: { provider: "google", id_token: handed.credential, nonce: handed.raw } });
    if (!result.ok) throw new Trouble(L.googleRefusal(result.status, result.data));
    const session = toSession(result.data);
    saveSession(session);
    await refreshAccount();
    if (page.accountTrouble === "NOT_SIGNED_IN") {
      await api("/rest/v1/rpc/forget_unused_google_account", { token: session.accessToken }).catch(() => null);
      saveSession(null);
      page.account = null;
      page.accountTrouble = null;
      page.signin.error = L.errorWords("GOOGLE_NO_ACCOUNT");
    }
  } catch (error) {
    page.signin.error = L.errorWords(error instanceof Trouble ? error.code : "SERVER_ERROR");
  }
  page.google.busy = false;
}

/** Google's "G", drawn as Google's sign-in guidelines ask for a button of one's own. */
function googleMark() {
  return s("svg", { viewBox: "0 0 48 48", class: "icon", "aria-hidden": "true" },
    s("path", { fill: "#EA4335", d: "M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" }),
    s("path", { fill: "#4285F4", d: "M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" }),
    s("path", { fill: "#FBBC05", d: "M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" }),
    s("path", { fill: "#34A853", d: "M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" }));
}

// ───────────────────────────── Signing in with a WhatsApp code ─────────────────────────────

async function sendCode(event) {
  event.preventDefault();
  const form = /** @type {HTMLFormElement} */ (event.target);
  const phone = L.normalizePhone(/** @type {HTMLInputElement} */ (form.elements.namedItem("phone")).value);
  page.signin.error = "";
  if (!phone) {
    page.signin.error = L.otpWords("invalid_number");
    return renderSignin();
  }
  page.signin.busy = true;
  renderSignin();
  try {
    const result = await fn("/otp/start", { body: { phone } });
    if (!result.ok) throw new Trouble("SERVER_ERROR");
    const status = result.data?.status;
    const retry = typeof result.data?.retry_after === "number" ? result.data.retry_after : 60;
    if (status === "sent" || status === "wait") {
      page.signin = { step: "code", phone, retryUntil: Date.now() + retry * 1000, busy: false, error: status === "wait" ? "أرسلنا رمزاً إلى هذا الرقم قبل قليل. استخدمه، أو اطلب غيره بعد انتهاء العدّ." : "" };
    } else page.signin.error = L.otpWords(status);
  } catch (error) {
    page.signin.error = L.errorWords(error instanceof Trouble ? error.code : "SERVER_ERROR");
  }
  page.signin.busy = false;
  renderSignin();
  /** @type {HTMLInputElement | null} */ (document.querySelector("#otp-code"))?.focus();
}

async function verifyCode(event) {
  event.preventDefault();
  const form = /** @type {HTMLFormElement} */ (event.target);
  const code = L.readCode(/** @type {HTMLInputElement} */ (form.elements.namedItem("code")).value);
  page.signin.error = "";
  if (!code) {
    page.signin.error = L.otpWords("bad_code");
    return renderSignin();
  }
  page.signin.busy = true;
  renderSignin();
  try {
    const result = await fn("/otp/verify", { body: { phone: page.signin.phone, code } });
    if (!result.ok) throw new Trouble("SERVER_ERROR");
    if (result.data?.status !== "verified") {
      page.signin.error = L.otpWords(result.data?.status === "wrong" ? "wrong" : "expired");
      page.signin.busy = false;
      return renderSignin();
    }
    const exchanged = await api("/auth/v1/verify", { body: { type: "magiclink", token_hash: result.data.token_hash } });
    if (!exchanged.ok) throw new Trouble(exchanged.status >= 500 ? "SERVER_ERROR" : "SESSION_EXPIRED");
    saveSession(toSession(exchanged.data));
    page.signin = { step: "phone", phone: "", retryUntil: 0, busy: false, error: "" };
    await refreshAccount();
  } catch (error) {
    page.signin.error = L.errorWords(error instanceof Trouble ? error.code : "SERVER_ERROR");
  }
  page.signin.busy = false;
  render();
}

async function signOut() {
  const current = page.session;
  saveSession(null);
  page.account = null;
  page.accountTrouble = null;
  render();
  // Ends the session on the server too; the page has already forgotten it either way.
  if (current) api("/auth/v1/logout", { token: current.accessToken }).catch(() => {});
}

let ticker = 0;
function renderSignin() {
  const box = /** @type {HTMLElement} */ (document.querySelector("#signin"));
  box.hidden = page.session !== null;
  if (page.session) return;
  clearInterval(ticker);
  box.replaceChildren();
  box.append(
    h("h2", {}, icon("lock"), page.forVenue ? "ادخل بحساب Google لتدفع رصيد ملاعبك" : "الدخول بحساب Google"),
    h("p", { class: "sub" }, "ادخل بحساب Google نفسه الذي تدخل به تطبيق كابتن، فتظهر لك مشترياتك ويصل ما تشتريه إلى حسابك."),
  );
  const busy = page.google.busy;
  box.append(
    h("button", { id: "google-button", class: "btn google", type: "button", onclick: goToGoogle, disabled: busy }, busy ? icon("loader", "icon spin") : googleMark(), "الدخول بحساب Google"),
    h("p", { class: "error", role: "alert" }, page.signin.error),
  );
  if (L.WHATSAPP_SIGN_IN) {
    const other = h("details", { class: "other-way", open: page.signin.step === "code" }, h("summary", {}, icon("message"), "أو ادخل برمز يصلك على واتساب"));
    box.append(other);
    renderCodeSignin(other);
  }
}

/** The WhatsApp code, under the Google button while WHATSAPP_SIGN_IN is on. @param {HTMLElement} box */
function renderCodeSignin(box) {
  const busy = page.signin.busy;
  box.append(h("p", { class: "sub" }, "يصلك رمز من 6 أرقام على واتساب، وقد يصل عبر تيليغرام أو رسالة نصية إن تعذّر واتساب. استخدم الرقم نفسه الذي تدخل به التطبيق."));
  if (page.otpAvailable === false) {
    box.append(banner("warn", "alert", "تسجيل الدخول غير متاح الآن", "لا يمكن إرسال رموز الدخول في هذه اللحظة. حاول مرة أخرى لاحقاً."));
    return;
  }
  if (page.signin.step === "phone") {
    box.append(
      h("form", { onsubmit: sendCode, novalidate: true },
        h("div", { class: "field" },
          h("label", { for: "otp-phone" }, "رقم الهاتف"),
          h("input", { id: "otp-phone", name: "phone", type: "tel", inputmode: "tel", autocomplete: "tel", placeholder: "0770 123 4567", required: true, disabled: busy })),
        h("button", { class: "btn", type: "submit", disabled: busy }, busy ? icon("loader", "icon spin") : null, "أرسل الرمز")),
    );
    return;
  }
  const wait = h("span", {});
  const again = h("button", { class: "btn ghost small", type: "button", onclick: resend }, "أرسل رمزاً جديداً");
  const tick = () => {
    const left = Math.ceil((page.signin.retryUntil - Date.now()) / 1000);
    again.toggleAttribute("disabled", left > 0 || busy);
    wait.textContent = left > 0 ? `يمكنك طلب رمز جديد بعد ${L.countdown(left)}` : "";
    if (left <= 0) clearInterval(ticker);
  };
  box.append(
    h("form", { onsubmit: verifyCode, novalidate: true },
      h("p", { class: "hint" }, "أرسلنا الرمز إلى ", h("span", { class: "ltr" }, L.formatPhone(page.signin.phone)), ". ", h("button", { class: "link", type: "button", onclick: changeNumber }, "تغيير الرقم")),
      h("div", { class: "field" },
        h("label", { for: "otp-code" }, "الرمز"),
        h("input", { id: "otp-code", name: "code", type: "text", inputmode: "numeric", autocomplete: "one-time-code", maxlength: 6, placeholder: "••••••", required: true, disabled: busy })),
      h("div", { class: "row" }, h("button", { class: "btn", type: "submit", disabled: busy }, busy ? icon("loader", "icon spin") : null, "دخول"), again, h("span", { class: "hint" }, wait))),
  );
  tick();
  ticker = window.setInterval(tick, 1000);
}

function changeNumber() {
  page.signin = { step: "phone", phone: "", retryUntil: 0, busy: false, error: "" };
  renderSignin();
}

async function resend() {
  page.signin.busy = true;
  renderSignin();
  try {
    const result = await fn("/otp/start", { body: { phone: page.signin.phone } });
    const status = result.data?.status;
    const retry = typeof result.data?.retry_after === "number" ? result.data.retry_after : 60;
    if (status === "sent" || status === "wait") {
      page.signin.retryUntil = Date.now() + retry * 1000;
      page.signin.error = "";
    } else page.signin.error = L.otpWords(status);
  } catch (error) {
    page.signin.error = L.errorWords(error instanceof Trouble ? error.code : "SERVER_ERROR");
  }
  page.signin.busy = false;
  renderSignin();
}

// ───────────────────────────── Buying ─────────────────────────────

/**
 * Asks before opening ZainCash. The amount shown is the catalogue's; the server prices the attempt
 * again and ZainCash shows the amount it will take.
 * @param {{ kind: string, subject: string, name: string, price: number, cosmetic: boolean, verb?: string }} what
 */
function askToBuy(what) {
  const dialog = /** @type {HTMLDialogElement} */ (document.querySelector("#buy"));
  const minor = page.account?.minor === true && what.cosmetic;
  const error = h("p", { class: "error", role: "alert" });
  const consent = h("input", { type: "checkbox", id: "buy-consent" });
  const pay = h("button", { class: "btn full", type: "button" }, icon("wallet"), "ادفع عبر زين كاش");
  const close = h("button", { class: "btn ghost full", type: "button", onclick: () => dialog.close() }, "إلغاء");
  pay.addEventListener("click", async () => {
    error.textContent = "";
    if (minor && !(/** @type {HTMLInputElement} */ (consent).checked)) {
      error.textContent = L.errorWords("PARENT_CONSENT_REQUIRED");
      return;
    }
    pay.setAttribute("disabled", "");
    close.setAttribute("disabled", "");
    pay.replaceChildren(icon("loader", "icon spin"), "نفتح صفحة زين كاش…");
    try {
      const result = await fn("/pay/start", { body: { kind: what.kind, subject: what.subject, parent_consent: minor && /** @type {HTMLInputElement} */ (consent).checked }, token: await token() });
      if (result.status === 401) throw new Trouble("SESSION_EXPIRED");
      if (!result.ok) throw new Trouble("SERVER_ERROR");
      if (typeof result.data?.error === "string") throw new Trouble(result.data.error);
      const url = L.safePayUrl(result.data?.url);
      if (!url) throw new Trouble("BAD_PAY_URL");
      location.assign(url);
    } catch (e) {
      const code = e instanceof Trouble ? e.code : "SERVER_ERROR";
      error.textContent = L.errorWords(code);
      pay.removeAttribute("disabled");
      close.removeAttribute("disabled");
      pay.replaceChildren(icon("wallet"), "ادفع عبر زين كاش");
      if (code === "SESSION_EXPIRED") {
        dialog.close();
        saveSession(null);
        page.signin.error = L.errorWords(code);
        render();
      } else if (code === "PAYMENT_UNAVAILABLE") {
        page.payAvailable = false;
        render();
      }
    }
  });
  const room = L.monthRoom(page.account);
  dialog.replaceChildren(
    h("div", { class: "sheet" },
      h("h2", { id: "buy-title" }, what.name),
      h("div", { class: "total" }, h("span", {}, "المبلغ"), h("strong", {}, L.formatIQD(what.price))),
      minor
        ? h("label", { class: "consent", for: "buy-consent" }, consent,
            h("span", {}, "وليّ أمري يعلم بهذا الشراء ويوافق عليه. ", h("span", { class: "hint" }, `يبقى من حدّك هذا الشهر ${L.formatIQD(room)}.`)))
        : null,
      h("p", { class: "small-print" }, "تنتقل إلى صفحة زين كاش لتدفع من محفظتك، ثم تعود إلى هنا. لا يُمنح شيء قبل أن يؤكد زين كاش الدفع لخادم كابتن. بالدفع توافق على ", h("a", { href: "../terms/#shop" }, "شروط البيع"), "."),
      error,
      pay,
      close),
  );
  dialog.showModal();
}

/**
 * The button of something for sale, with the reason when it cannot be bought now.
 * @param {{ kind: string, subject: string, name: string, price: number, cosmetic: boolean, verb?: string }} what @param {string | null} stop
 */
function buyButton(what, stop) {
  if (stop === "TRYING") return h("span", { class: "state trying" }, icon("sparkles"), "مجاني خلال التجربة");
  if (!page.session) return h("button", { class: "btn ghost full", type: "button", onclick: toSignin }, icon("lock"), "ادخل لتشتري");
  if (stop === "ALREADY_OWNED") return h("span", { class: "state ok" }, icon("check"), "في حسابك");
  if (stop) return h("button", { class: "btn ghost full", type: "button", disabled: true, title: L.errorWords(stop) }, stop === "MONTHLY_CAP" ? "يتجاوز حدّك الشهري" : stop === "PLAN_SMALLER" ? "أصغر من باقتك الحالية" : "غير متاح");
  if (page.payAvailable !== true) return h("button", { class: "btn ghost full", type: "button", disabled: true }, "الدفع غير متاح بعد");
  return h("button", { class: "btn full", type: "button", onclick: () => askToBuy(what) }, what.verb ?? "اشترِ");
}

function toSignin() {
  const box = document.querySelector("#signin");
  box?.scrollIntoView({ behavior: "smooth", block: "center" });
  /** @type {HTMLButtonElement | null} */ (document.querySelector("#google-button"))?.focus({ preventScroll: true });
}

// ───────────────────────────── The page ─────────────────────────────

/** @param {"warn"|"ok"|"wait"|"bad"} tone @param {keyof typeof ICONS} name @param {string} title @param {any} [text] */
function banner(tone, name, title, text) {
  return h("div", { class: `banner tone-${tone}`, role: tone === "bad" ? "alert" : "status" }, icon(name), h("p", {}, h("strong", {}, title), text ?? null));
}

function renderChip() {
  const slot = /** @type {HTMLElement} */ (document.querySelector("#account-chip"));
  slot.replaceChildren();
  if (!page.session) return;
  const name = page.account?.name ? String(page.account.name) : "";
  slot.append(h("div", { class: "chip" }, h("span", { class: "who" }, name ? `${name} · ` : "", h("span", { class: "ltr" }, page.session.email || L.formatPhone(page.session.phone))), h("button", { type: "button", onclick: signOut }, "خروج")));
}

function renderBanner() {
  const box = /** @type {HTMLElement} */ (document.querySelector("#banner"));
  box.replaceChildren();
  if (page.serverTrouble) box.append(banner("bad", "alert", "تعذّر الوصول إلى خادم كابتن", L.errorWords(page.serverTrouble)));
  else if (page.payAvailable === false)
    box.append(banner("warn", "info", "الدفع غير متاح بعد", "نعمل على تفعيل الدفع عبر زين كاش. يمكنك تصفح المتجر الآن، وستعمل أزرار الدفع عند التفعيل."));
  if (page.session && page.accountTrouble) box.append(banner("bad", "alert", "تعذّر فتح حسابك", L.errorWords(page.accountTrouble)));
  if (page.account?.minor === true) {
    const room = L.monthRoom(page.account);
    box.append(banner("wait", "shield", "حسابك لمن هو دون 18 سنة",
      ` كل شراء يحتاج موافقة وليّ أمرك، والحد ${L.formatIQD(Number(page.account.month_cap) || 0)} في الشهر. يبقى لك هذا الشهر ${L.formatIQD(room)}.`));
  }
}

function renderReturned() {
  const box = /** @type {HTMLElement} */ (document.querySelector("#returned"));
  box.replaceChildren();
  if (!page.returned) return;
  if (!page.session) {
    box.append(banner("wait", "info", "عدت من زين كاش", "ادخل بحسابك لنتحقق من عمليتك مع زين كاش."));
    return;
  }
  if (!page.account) return;
  const payment = (page.account.payments ?? []).find((p) => p.id === page.returned) ?? null;
  const note = L.returnNote(payment);
  const title = payment ? `${L.paymentSubject(payment, page.catalogue)} · ${L.formatIQD(payment.amount_iqd)}` : "عملية غير معروفة";
  const again = note.tone === "wait" ? h("button", { class: "btn small", type: "button", onclick: checkAgain, disabled: page.checking }, page.checking ? icon("loader", "icon spin") : icon("refresh"), "تحقّق مرة أخرى") : null;
  box.append(h("div", { class: `banner tone-${note.tone}`, role: "status" }, icon(note.tone === "ok" ? "check" : note.tone === "wait" ? "clock" : "alert"),
    h("div", {}, h("p", {}, h("strong", {}, title), note.text, payment ? ` رقم العملية: ${L.paymentRef(payment.id)}.` : ""), again ? h("div", { class: "row" }, again) : null)));
}

async function checkAgain() {
  page.checking = true;
  renderReturned();
  await refreshAccount();
  page.checking = false;
  render();
}

function renderVenue() {
  const box = /** @type {HTMLElement} */ (document.querySelector("#venue"));
  const due = Number(page.account?.venue_due) || 0;
  box.hidden = !page.account || !(due > 0 || page.forVenue);
  box.replaceChildren();
  if (box.hidden) return;
  box.append(
    h("h2", {}, icon("wallet"), "رصيد ملاعبك"),
    h("p", { class: "sub" }, "رسوم الحجوزات التي تمت عبر التطبيق ولُعبت، بعد أشهرك المجانية. الكشف بالتفصيل في لوحة ملعبك في التطبيق."),
    h("p", { class: "due" }, L.formatIQD(due)),
  );
  if (due > 0) box.append(buyButton({ kind: "venue_balance", subject: "balance", name: "رصيد رسوم الحجوزات", price: due, cosmetic: false, verb: "ادفع الرصيد" }, null));
  else box.append(h("p", { class: "state ok" }, icon("check"), L.errorWords("NOTHING_DUE")));
}

function renderStore() {
  const box = /** @type {HTMLElement} */ (document.querySelector("#store"));
  const store = page.account?.store ?? null;
  const list = L.plans(page.catalogue, page.account);
  const feature = Number(page.catalogue?.feature_price) || 0;
  box.hidden = page.session ? !store : list.length === 0;
  box.replaceChildren();
  if (box.hidden) return;
  box.append(h("h2", {}, icon("store"), "لأصحاب المتاجر"), h("p", { class: "sub" }, "يعرض المتجر 10 منتجات مجاناً بعد أشهره الثلاثة الأولى. الباقة تعرض أكثر، والتمييز يضع متجرك أول نتائج البحث بإطار ذهبي على الخريطة. كل شراء لمدة 30 يوماً، ولا يتجدد تلقائياً."));
  if (store) {
    const facts = [
      ["باقتك", store.plan === "free" ? "المجانية" : L.planWords(Number(list.find((p) => p.id === store.plan)?.items) || Number(store.limit))],
      store.plan_until ? ["تنتهي في", L.formatDate(store.plan_until)] : null,
      store.free_until && Date.parse(store.free_until) > Date.now() ? ["مجاناً حتى", L.formatDate(store.free_until)] : null,
      ["المعروض الآن", `${L.formatNumber(Math.min(Number(store.items) || 0, Number(store.limit) || 0))} من ${L.formatNumber(Number(store.limit) || 0)}`],
      Array.isArray(store.not_shown) && store.not_shown.length ? ["غير معروضة", L.formatNumber(store.not_shown.length)] : null,
      ["التمييز", store.featured_until ? `حتى ${L.formatDate(store.featured_until)}` : "غير مميز"],
    ].filter(Boolean);
    box.append(h("dl", { class: "facts" }, facts.map((f) => h("div", { class: "fact" }, h("dt", {}, f[0]), h("dd", {}, f[1])))));
  }
  const offers = list.map((p) =>
    h("div", { class: `offer${p.current ? " current" : ""}` },
      h("h3", {}, icon("store"), `باقة ${L.planWords(p.items)}`),
      h("span", { class: "price" }, `${L.formatIQD(p.price)} لـ 30 يوماً`),
      p.current ? h("span", { class: "state" }, "باقتك الحالية. الشراء يضيف 30 يوماً.") : null,
      buyButton({ kind: "store_plan", subject: p.id, name: `باقة ${L.planWords(p.items)} لمدة 30 يوماً`, price: p.price, cosmetic: false, verb: p.current ? "جدّد الباقة" : "اشترِ الباقة" }, page.session ? p.stop : null)));
  if (feature > 0)
    offers.push(h("div", { class: "offer" },
      h("h3", {}, icon("star"), "تمييز المتجر"),
      h("span", { class: "price" }, `${L.formatIQD(feature)} لـ 30 يوماً`),
      store?.featured_until ? h("span", { class: "state" }, "متجرك مميز الآن. الشراء يضيف 30 يوماً.") : null,
      buyButton({ kind: "store_feature", subject: "feature", name: "تمييز المتجر لمدة 30 يوماً", price: feature, cosmetic: false, verb: store?.featured_until ? "مدّد التمييز" : "ميّز متجرك" }, page.session && !store ? "STORE_NOT_FOUND" : null)));
  box.append(h("div", { class: "offers" }, offers));
}

function renderShelf() {
  const box = /** @type {HTMLElement} */ (document.querySelector("#shelf"));
  box.replaceChildren();
  if (!page.catalogue) return;
  const groups = L.shelf(page.catalogue, page.account, page.trying);
  if (!groups.length) {
    box.append(h("div", { class: "card" }, h("p", {}, "لا توجد عناصر معروضة للبيع الآن.")));
    return;
  }
  box.append(h("ol", { class: "steps" },
    h("li", {}, "ادخل بحساب Google الذي تدخل به تطبيق كابتن."),
    h("li", {}, "اختر ما يعجبك وادفع عبر زين كاش."),
    h("li", {}, "تجده في تطبيق كابتن بعد تأكيد الدفع.")));
  for (const group of groups) {
    box.append(h("section", { class: "group" },
      h("h2", {}, icon("sparkles"), group.title),
      h("p", { class: "sub" }, group.note),
      h("div", { class: `grid${group.kind === "set" ? " sets" : ""}` }, group.entries.map((entry) =>
        h("article", { class: `item${entry.owned ? " owned" : ""}` },
          itemArt(entry),
          h("div", { class: "item-body" },
            h("p", { class: "item-name" }, h("span", {}, entry.name), L.tierWords(entry.tier) ? h("span", { class: "tier" }, L.tierWords(entry.tier)) : null),
            h("span", { class: "price" }, L.formatIQD(entry.price)),
            buyButton({ kind: entry.kind, subject: entry.subject, name: entry.name, price: entry.price, cosmetic: true }, page.session || entry.stop === "TRYING" ? entry.stop : null)))))));
  }
}

function renderHistory() {
  const box = /** @type {HTMLElement} */ (document.querySelector("#history"));
  const list = page.account?.payments ?? [];
  box.hidden = !page.account || list.length === 0;
  box.replaceChildren();
  if (box.hidden) return;
  box.append(
    h("h2", {}, icon("receipt"), "عملياتك"),
    h("p", { class: "sub" }, `لطلب استرداد راسلنا على ${CONTACT} مع رقم العملية.`),
    h("ul", { class: "pays" }, list.map((p) =>
      h("li", {},
        h("span", { class: "what" }, L.paymentSubject(p, page.catalogue)),
        h("span", { class: "amount" }, L.formatIQD(p.amount_iqd)),
        h("span", { class: "meta" }, `${L.formatDate(p.created_at)} · رقم العملية ${L.paymentRef(p.id)}`),
        h("span", { class: `status ${p.status}` }, L.statusWords(p.status))))),
  );
}

function render() {
  renderChip();
  renderBanner();
  renderReturned();
  renderSignin();
  renderVenue();
  renderStore();
  renderShelf();
  renderHistory();
}

async function start() {
  const contact = document.querySelector("#contact");
  if (contact) {
    contact.setAttribute("href", `mailto:${CONTACT}`);
    contact.textContent = CONTACT;
  }
  const handed = takeGoogleHandoff();
  page.session = handed ? null : loadSession();
  if (handed) page.google.busy = true;
  render();
  const [catalogue, otp, pay, sets] = await Promise.allSettled([readCatalogue(), L.WHATSAPP_SIGN_IN ? available("/otp/available") : Promise.resolve(false), available("/pay/available"), readSets()]);
  page.trying = sets.status === "fulfilled" ? sets.value : [];
  if (catalogue.status === "fulfilled") page.catalogue = catalogue.value;
  else page.serverTrouble = catalogue.reason instanceof Trouble ? catalogue.reason.code : "SERVER_ERROR";
  page.otpAvailable = otp.status === "fulfilled" ? otp.value : null;
  page.payAvailable = pay.status === "fulfilled" ? pay.value : null;
  if (handed) await signInWithGoogle(handed);
  else if (page.session) await refreshAccount();
  render();
  // The hint stays in memory until the buyer has signed in; a reload should not show the note again.
  if (page.returned) {
    const query = new URLSearchParams(location.search);
    query.delete("payment");
    history.replaceState(null, "", location.pathname + (query.toString() ? `?${query}` : ""));
  }
}

start();
