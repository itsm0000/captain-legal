// @ts-check
/**
 * متجر كابتن: what the page decides by itself, kept apart from the page so that it can be tested
 * (supabase/tests/shop-page.test.ts). Nothing here decides a price, an owner or a payment: the server
 * does (supabase/migrations/20261101070000_payments.sql and the two after it). This file only words
 * what the server answers, and hides what the server would refuse anyway, with the reason.
 *
 * docs/release/ROUND_2_12.md §4 and §13.
 */

/** Iraqi mobile numbers, as the app and private.normalize_iraqi_mobile read them. */
/** @param {unknown} raw @returns {string | null} */
export function normalizePhone(raw) {
  const latin = String(raw ?? "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  let digits = latin.replace(/\D/g, "");
  if (digits.startsWith("00964")) digits = digits.slice(5);
  else if (digits.startsWith("964")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (!/^7[3-9]\d{8}$/.test(digits)) return null;
  return `+964${digits}`;
}

/** Six digits, from Latin or Arabic-Indic numerals; null for anything else. */
/** @param {unknown} raw @returns {string | null} */
export function readCode(raw) {
  const latin = String(raw ?? "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\s/g, "");
  return /^\d{6}$/.test(latin) ? latin : null;
}

/** "+9647701234567" → "0770 123 4567" */
/** @param {unknown} e164 */
export function formatPhone(e164) {
  const d = String(e164 ?? "").replace(/^\+964/, "");
  return d.length === 10 ? `0${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : String(e164 ?? "");
}

/** @param {number} value */
export function formatNumber(value) {
  const n = Math.round(Number.isFinite(value) ? value : 0);
  const sign = n < 0 ? "-" : "";
  return sign + Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** The app's way of writing money: "3,000 د.ع". */
/** @param {number} value */
export const formatIQD = (value) => `${formatNumber(value)} د.ع`;

const MONTHS = ["كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران", "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول"];

/** A date as Baghdad reads it (UTC+3 all year since 2008): "1 تشرين الثاني 2026". */
/** @param {unknown} iso */
export function formatDate(iso) {
  const at = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(at)) return "";
  const baghdad = new Date(at + 3 * 3600 * 1000);
  return `${baghdad.getUTCDate()} ${MONTHS[baghdad.getUTCMonth()]} ${baghdad.getUTCFullYear()}`;
}

/**
 * Every refusal the website can meet, in the words of the page. The first seven are the server's
 * rules for selling (pay_quote, quote_cosmetic); the test reads the migrations and fails if the
 * server raises a code in those functions that is missing here.
 */
export const ERRORS = Object.freeze({
  PARENT_CONSENT_REQUIRED: "حسابك لمن هو دون 18 سنة، فيلزم أن يوافق وليّ أمرك على الشراء. ضع علامة الموافقة ثم حاول مرة أخرى.",
  MONTHLY_CAP: "هذا الشراء يتجاوز الحد الشهري لمن هو دون 18 سنة، وهو 25,000 دينار. يتجدد الحد في أول الشهر.",
  ALREADY_OWNED: "هذا موجود في حسابك من قبل، فلا داعي لشرائه مرة أخرى.",
  ITEM_NOT_FOR_SALE: "هذا غير معروض للبيع الآن.",
  PLAN_SMALLER: "باقتك الحالية أكبر من هذه الباقة. يمكنك تجديد باقتك أو الانتقال إلى باقة أكبر.",
  NOTHING_DUE: "لا يوجد مبلغ مستحق على ملاعبك الآن.",
  PAYMENT_UNAVAILABLE: "الدفع غير متاح بعد. سيظهر هنا عند تفعيل الدفع عبر زين كاش.",
  NOT_SIGNED_IN: "لا يوجد حساب في كابتن بهذا الرقم. أنشئ حسابك في تطبيق كابتن أولاً، ثم عد إلى هنا.",
  TERMS_REQUIRED: "افتح تطبيق كابتن ووافق على شروط الاستخدام الجديدة، ثم عد إلى هنا.",
  ACCOUNT_SUSPENDED: "حسابك موقوف لمخالفة شروط الاستخدام، فلا يمكن الشراء به الآن.",
  STORE_NOT_FOUND: "لا يوجد متجر باسم حسابك. افتح متجرك في تطبيق كابتن أولاً.",
  STORE_SUSPENDED: "متجرك موقوف مؤقتاً للمراجعة، فلا يمكن شراء باقة أو تمييز له الآن.",
  SESSION_EXPIRED: "انتهت جلستك. سجّل دخولك مرة أخرى.",
  OFFLINE: "الاتصال بالإنترنت مقطوع أو ضعيف. تحقق من الشبكة وحاول مرة أخرى.",
  SERVER_ERROR: "تعذّر الوصول إلى خادم كابتن الآن. حاول بعد قليل.",
  BAD_PAY_URL: "وصل عنوان دفع غير متوقع، فلم نفتحه. حاول مرة أخرى بعد قليل، وإن تكرر فراسلنا.",
});

/** @param {string} code @returns {string} */
export const errorWords = (code) => ERRORS[/** @type {keyof typeof ERRORS} */ (code)] ?? ERRORS.SERVER_ERROR;

/** What /otp/start and /otp/verify answer, other than success. */
export const OTP_WORDS = Object.freeze({
  invalid_number: "اكتب رقم هاتف عراقي صحيح، مثل 0770 123 4567.",
  limit: "طلبت رموزاً كثيرة على هذا الرقم. حاول مرة أخرى لاحقاً.",
  barred: "لا يمكن الدخول بهذا الرقم. تواصل مع فريق كابتن.",
  unavailable: "تعذّر إرسال الرمز الآن. حاول بعد قليل.",
  wrong: "الرمز غير صحيح. تأكد منه وحاول مرة أخرى.",
  expired: "انتهت صلاحية الرمز. اطلب رمزاً جديداً.",
  bad_code: "اكتب الرمز المكوّن من 6 أرقام كما وصلك.",
});

/** @param {unknown} status @returns {string} */
export const otpWords = (status) => OTP_WORDS[/** @type {keyof typeof OTP_WORDS} */ (status)] ?? OTP_WORDS.unavailable;

/** Seconds as the countdown before another code: "0:45". */
/** @param {number} seconds */
export const countdown = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.max(0, seconds) % 60).padStart(2, "0")}`;

/**
 * The groups of the players' shelf, in order. Premium emblems are left out until job 031 gives
 * them art (ROUND_2_12.md §12): the app cannot show them yet, so the page does not sell them.
 */
export const GROUPS = Object.freeze([
  { kind: "crest_effect", title: "تأثيرات الشعار", note: "تتحرك حول شعار فريقك أينما ظهر." },
  { kind: "title_effect", title: "تأثيرات اللقب", note: "تتحرك حول لقبك على بطاقة اللاعب." },
  { kind: "title_font", title: "خطوط اللقب", note: "يُكتب بها لقبك على بطاقتك." },
  { kind: "crest_shape", title: "أشكال الشعار", note: "شكل جديد لشعار فريقك." },
  { kind: "set", title: "الأطقم", note: "طقم متحرك لبطاقة اللاعب." },
]);

export const HIDDEN_KINDS = Object.freeze(["crest_emblem"]);

const TIERS = { common: "عادي", rare: "نادر", epic: "ملحمي", legendary: "أسطوري" };
/** @param {unknown} tier @returns {string} */
export const tierWords = (tier) => TIERS[/** @type {keyof typeof TIERS} */ (tier)] ?? "";

/** What a minor may still spend this month; Infinity for an adult. */
/** @param {any} state @returns {number} */
export function monthRoom(state) {
  if (!state || state.minor !== true) return Infinity;
  const cap = Number(state.month_cap) || 0;
  const spent = Number(state.month_spent) || 0;
  return Math.max(0, cap - spent);
}

/**
 * The players' shelf: the catalogue's paid items and sets, grouped, each with what stops it for
 * this account (null when it can be bought). Signed out, nothing is owned and nothing is capped.
 */
/** @param {any} catalogue @param {any} state */
export function shelf(catalogue, state) {
  const owned = new Set([...(state?.items ?? []), ...(state?.sets ?? [])]);
  const room = monthRoom(state);
  /** @type {{ group: string, kind: string, subject: string, key: string, name: string, tier: unknown, price: number }[]} */
  const entries = [];
  for (const item of Array.isArray(catalogue?.items) ? catalogue.items : []) {
    if (!item || typeof item.id !== "string" || HIDDEN_KINDS.includes(item.kind)) continue;
    entries.push({ group: item.kind, kind: "item", subject: item.id, key: item.key ?? "", name: String(item.name ?? ""), tier: item.tier, price: Number(item.price_iqd) });
  }
  for (const set of Array.isArray(catalogue?.sets) ? catalogue.sets : []) {
    if (!set || typeof set.id !== "string") continue;
    entries.push({ group: "set", kind: "set", subject: set.id, key: set.id, name: String(set.name ?? ""), tier: set.tier, price: Number(set.price_iqd) });
  }
  return GROUPS.map((group) => ({
    ...group,
    entries: entries
      .filter((e) => e.group === group.kind && Number.isFinite(e.price) && e.price > 0)
      .map((e) => ({ ...e, owned: owned.has(e.subject), stop: owned.has(e.subject) ? "ALREADY_OWNED" : e.price > room ? "MONTHLY_CAP" : null })),
  })).filter((group) => group.entries.length > 0);
}

/** A store plan's name: "50 منتجاً". */
/** @param {number} items */
export const planWords = (items) => (items === 10 ? "10 منتجات" : `${formatNumber(items)} منتجاً`);

/**
 * The plans a store can buy, with what stops each one. A plan still running stops the smaller ones
 * (PLAN_SMALLER), as the server does; the same plan renews.
 */
/**
 * @param {any} catalogue @param {any} state
 * @returns {{ id: string, items: number, price: number, current: boolean, stop: string | null }[]}
 */
export function plans(catalogue, state) {
  const store = state?.store ?? null;
  const list = (Array.isArray(catalogue?.plans) ? catalogue.plans : []).filter((/** @type {any} */ p) => p && typeof p.id === "string" && Number(p.price_iqd) > 0);
  // The plan's own size, not the store's limit: in the free months the limit is wider than any plan.
  const runningPlan = store && store.plan_until ? list.find((/** @type {any} */ p) => p.id === store.plan) : null;
  const running = runningPlan ? Number(runningPlan.items) : 0;
  return list
    .map((/** @type {any} */ p) => ({
      id: p.id,
      items: Number(p.items),
      price: Number(p.price_iqd),
      current: !!store && store.plan === p.id,
      stop: !store ? "STORE_NOT_FOUND" : running && Number(p.items) < running ? "PLAN_SMALLER" : null,
    }));
}

/** The words of an attempt's state on the account's list. */
const STATUS = {
  created: "بانتظار الدفع",
  pending: "بانتظار تأكيد زين كاش",
  paid: "تم الدفع",
  failed: "لم يكتمل",
  expired: "انتهت مهلته",
  refunded: "أُعيد المبلغ",
};
/** @param {unknown} status @returns {string} */
export const statusWords = (status) => STATUS[/** @type {keyof typeof STATUS} */ (status)] ?? "";

/** What an attempt was for, in words, from the catalogue the page already has. */
/** @param {any} payment @param {any} catalogue @returns {string} */
export function paymentSubject(payment, catalogue) {
  if (!payment) return "";
  if (payment.kind === "venue_balance") return "رصيد رسوم الحجوزات";
  if (payment.kind === "store_feature") return "تمييز المتجر لمدة 30 يوماً";
  if (payment.kind === "store_plan") {
    const plan = (catalogue?.plans ?? []).find((/** @type {any} */ p) => p && p.id === payment.subject);
    return plan ? `باقة ${planWords(Number(plan.items))} لمدة 30 يوماً` : "باقة المتجر";
  }
  const list = payment.kind === "set" ? catalogue?.sets : catalogue?.items;
  const found = (list ?? []).find((/** @type {any} */ x) => x && x.id === payment.subject);
  return found ? String(found.name) : payment.kind === "set" ? "طقم" : "عنصر مميز";
}

/** What the page tells a buyer who came back from the gateway, read from the server's own list. */
/** @param {any} payment @returns {{ tone: "ok" | "wait" | "warn", text: string }} */
export function returnNote(payment) {
  if (!payment) return { tone: "warn", text: "لم نجد هذه العملية في حسابك. إن كنت دفعت من رقم آخر فسجّل دخولك به." };
  if (payment.status === "paid") return { tone: "ok", text: "تم الدفع، وأصبح ما اشتريته في حسابك. افتح تطبيق كابتن لتجده." };
  if (payment.status === "pending" || payment.status === "created")
    return { tone: "wait", text: "لم يؤكد زين كاش الدفع بعد. إن كنت أكملت الدفع فانتظر قليلاً ثم اضغط «تحقّق مرة أخرى»." };
  if (payment.status === "refunded") return { tone: "warn", text: "أُعيد مبلغ هذه العملية إليك." };
  return { tone: "warn", text: "لم يكتمل الدفع. إن خُصم منك مبلغ فراسلنا مع رقم العملية، ونعيده إليك." };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The attempt the gateway's way back names, if it is well-formed. Only a hint for what to show. */
/** @param {unknown} search */
export function returnedPayment(search) {
  const id = new URLSearchParams(String(search ?? "")).get("payment");
  return id && UUID.test(id) ? id.toLowerCase() : null;
}

/** Whether the page was opened from the owner's dashboard in the app. */
/** @param {unknown} search */
export const openedForVenue = (search) => new URLSearchParams(String(search ?? "")).get("pay") === "venue_balance";

/** The short reference shown on the list and asked for in a refund request: the first eight characters. */
/** @param {unknown} id */
export const paymentRef = (id) => String(id ?? "").slice(0, 8).toUpperCase();

/** Only an https address is opened as the gateway's page; anything else is refused. */
/** @param {unknown} url @returns {string | null} */
export function safePayUrl(url) {
  try {
    const parsed = new URL(String(url));
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}
