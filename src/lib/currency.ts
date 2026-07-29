// Multi-currency support (Phase 14, see PROJECT_PLAN.md §16). No exchange-rate
// conversion anywhere — a currency is tagged per-bill, Splitwise-style, and
// bills are never summed or converted across currencies.

// ISO 4217 currencies whose minor unit isn't 2 decimal places. Anything not
// listed here defaults to 2 (the vast majority of currencies).
const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW",
  "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
]);
const THREE_DECIMAL_CURRENCIES = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);

export function getMinorUnitExponent(currencyCode: string): number {
  if (ZERO_DECIMAL_CURRENCIES.has(currencyCode)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(currencyCode)) return 3;
  return 2;
}

// The *currency* (which symbol, how many decimals) comes from the bill; the
// *grouping/decimal-separator convention* (1,234.56 vs 1.234,56 vs 1 234,56)
// should come from the viewer's own device, not a hardcoded locale — e.g. a
// EUR amount looks like "€1,234.56" to a US-locale viewer but "1.234,56 €" to
// a de-DE viewer. There's no single "correct" locale per currency (the Euro
// alone spans dozens of formatting conventions), so this defaults to
// `navigator.language` per-viewer instead of guessing from the currency code.
function defaultLocale(): string {
  if (typeof navigator === "undefined") return "en-US";
  return navigator.language || "en-US";
}

// Renders integer minor units (e.g. 1050) as a fully formatted amount in its
// own currency (e.g. "$10.50", "¥1050", "₹500.00"). `narrowSymbol` (not the
// default `symbol`) avoids country-prefixed forms like "US$" — a bill only
// ever shows one currency at a time, so there's nothing to disambiguate.
export function formatMoney(units: number, currencyCode: string, locale = defaultLocale()): string {
  const exponent = getMinorUnitExponent(currencyCode);
  const amount = units / 10 ** exponent;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
      currencyDisplay: "narrowSymbol",
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(exponent)}`;
  }
}

// Just the glyph (₹, €, £, ¥, $) for a currency, used as an input prefix badge.
export function getCurrencySymbol(currencyCode: string, locale = defaultLocale()): string {
  try {
    const parts = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? currencyCode;
  } catch {
    return currencyCode;
  }
}

// Editable-input helpers: plain decimal strings (no symbol/grouping), at the
// correct number of decimal places for the given currency.
export function minorUnitsToDecimalString(units: number | null | undefined, currencyCode: string): string {
  if (units == null) return "";
  const exponent = getMinorUnitExponent(currencyCode);
  return (units / 10 ** exponent).toFixed(exponent);
}

export function decimalStringToMinorUnits(str: string, currencyCode: string): number {
  const n = parseFloat(str);
  if (isNaN(n)) return 0;
  return Math.round(n * 10 ** getMinorUnitExponent(currencyCode));
}

export function formatDecimalBlur(str: string, currencyCode: string): string {
  const exponent = getMinorUnitExponent(currencyCode);
  const n = parseFloat(str);
  return (isNaN(n) ? 0 : n).toFixed(exponent);
}

// Label for currency pickers, e.g. "$ - USD" — the dash makes the boundary
// between symbol and code unambiguous even for symbols that are letters
// themselves (e.g. "kr" for SEK/NOK/DKK) rather than a distinct glyph.
export function formatCurrencyOption(currencyCode: string, locale = defaultLocale()): string {
  return `${getCurrencySymbol(currencyCode, locale)} - ${currencyCode}`;
}

// Common currencies offered in the bill review picker — not exhaustive, just
// the household's likely set for a household-splitting app going global.
export const COMMON_CURRENCIES = [
  "USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY", "CNY", "SGD", "AED",
  "CHF", "MXN", "BRL", "ZAR", "NZD", "HKD", "SEK", "NOK", "DKK", "KRW",
] as const;

// ISO-3166 region code -> ISO-4217 currency, for the device-locale fallback
// (household creation, Phase 14.3). Not exhaustive — covers regions a
// household is actually likely to be created from. No network call, no paid
// API, matches the project's $0-cost default.
const REGION_TO_CURRENCY: Record<string, string> = {
  US: "USD", CA: "CAD", MX: "MXN", BR: "BRL", AR: "ARS",
  GB: "GBP", IE: "EUR", FR: "EUR", DE: "EUR", ES: "EUR", IT: "EUR",
  PT: "EUR", NL: "EUR", BE: "EUR", AT: "EUR", GR: "EUR", FI: "EUR",
  CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN",
  IN: "INR", PK: "PKR", BD: "BDT", LK: "LKR", NP: "NPR",
  CN: "CNY", JP: "JPY", KR: "KRW", HK: "HKD", TW: "TWD", SG: "SGD",
  MY: "MYR", TH: "THB", VN: "VND", PH: "PHP", ID: "IDR",
  AE: "AED", SA: "SAR", QA: "QAR", IL: "ILS", TR: "TRY",
  AU: "AUD", NZ: "NZD", ZA: "ZAR", NG: "NGN", EG: "EGP", KE: "KES",
};

export function detectDeviceCurrency(): string {
  if (typeof navigator === "undefined") return "USD";
  const region = (navigator.language || "en-US").split("-")[1]?.toUpperCase();
  return (region && REGION_TO_CURRENCY[region]) || "USD";
}
