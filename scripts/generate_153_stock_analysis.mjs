import yf from 'yahoo-finance2';
import fs from 'fs';

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const baseTickers = [];
// Lightweight NASDAQ meta discovered from screeners/trending (exchange + price)
const nasdaqLight = new Map(); // symbol -> { exNameLower, exCodeUpper, price }
// Contadores globais de chamadas à API e sucessos
let apiCallsTotal = 0;
let apiCallsSuccess = 0;
// Separação de falhas esperadas de paginação vs outras
let apiCallsScreenerFail = 0;
let apiCallsOtherFail = 0;
// Marcação de tickers vindos de fallback
const fallbackSymbols = new Set();

// Parse CLI arguments for runtime behavior flags
const args = process.argv.slice(2);
const isStrict = args.includes('--strict');
const isQuiet = args.includes('--quiet');
// new flags from UI
const suppressSurvey = args.includes('--suppress-survey');
// Parse boolean args with optional "=false" to override defaults
const getArgBool = (name, def) => {
  const entry = args.find(s => s.startsWith(name));
  if (!entry) return def;
  if (entry.includes('=')) {
    const v = entry.split('=')[1].toLowerCase();
    return !(v === 'false' || v === '0' || v === 'no');
  }
  return true;
};
// Default validation controls to true; allow turning off via "--skip-validation=false" and "--no-validation-logs=false"
const skipValidation = getArgBool('--skip-validation', true);
const noValidationLogs = getArgBool('--no-validation-logs', true);
const getArgNum = (name, def) => {
  const entry = args.find(s => s.startsWith(name + '='));
  if (!entry) return def;
  const v = Number(entry.split('=')[1]);
  return Number.isFinite(v) ? v : def;
};
const getArgBoolStrict = (name, def) => {
  // Allows forms: "--flag" (true) or "--flag=false"
  const entry = args.find(s => s.startsWith(name));
  if (!entry) return def;
  if (entry.includes('=')) {
    const v = entry.split('=')[1].toLowerCase();
    return !(v === 'false' || v === '0' || v === 'no');
  }
  return true;
};
const cacheTtlHours = getArgNum('--cache-ttl-hours', 24);
const jitterMinMs = getArgNum('--jitter-min', 300);
const jitterMaxMs = getArgNum('--jitter-max', 450);
const backoffMaxMs = getArgNum('--backoff-max-ms', 6000);
const cooldownThreshold = getArgNum('--cooldown-threshold', 4);
const cooldownMs = getArgNum('--cooldown-ms', 8000);
const targetCount = getArgNum('--target-count', 200);
const minPriceCutoff = getArgNum('--min-price-cutoff', 5.00);
// New control flags for handling missing data
const excludeNa = getArgBoolStrict('--exclude-na', false);
const minFields = getArgNum('--min-fields', 0);
// Novos controles de eficiência
const noFallback = getArgBoolStrict('--no-fallback', false);
const maxScreenerPages = getArgNum('--max-screener-pages', 3);
// New flags for UI integration
const outCsvPath = (() => { const entry = args.find(s => s.startsWith('--out-csv=')); return entry ? entry.split('=')[1] : `./Comprehensive_${targetCount}_Stock_Analysis.csv`; })();
const manualTickersArg = (() => { const entry = args.find(s => s.startsWith('--manual-tickers=')); return entry ? entry.split('=')[1] : ''; })();
const manualTickers = manualTickersArg ? manualTickersArg.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean).slice(0,50) : [];
// New: allow skipping problematic tickers
const skipTickersArg = (() => { const entry = args.find(s => s.startsWith('--skip-tickers=')); return entry ? entry.split('=')[1] : ''; })();
const skipTickersSet = new Set((skipTickersArg || '').split(',').map(s=>s.trim().toUpperCase()).filter(Boolean));
// New: Sector/Industry pre-filters from UI
const sectorFilterArg = (() => { const entry = args.find(s => s.startsWith('--sector-filter=')); return entry ? entry.split('=')[1] : 'all'; })();
const sectorFiltersArg = (() => { const entry = args.find(s => s.startsWith('--sector-filters=')); return entry ? entry.split('=')[1] : ''; })();
const industryFiltersArg = (() => { const entry = args.find(s => s.startsWith('--industry-filters=')); return entry ? entry.split('=')[1] : ''; })();
// New: debug ticker and per-ticker timeout controls
const debugTickerArg = (() => {
  const entry = args.find(s => s.startsWith('--debug-ticker='));
  return entry ? entry.split('=')[1].trim().toUpperCase() : '';
})();
const tickerTimeoutMs = getArgNum('--ticker-timeout-ms', 20000);
const sectorSynonyms = new Map([
  ['all','all'], ['all of them','all'],
  ['technology','technology'], ['information technology','technology'], ['tech','technology'],
  ['healthcare','healthcare'], ['health care','healthcare'],
  ['financial services','financial-services'], ['financial','financial-services'],
  ['consumer discretionary','consumer-discretionary'], ['consumer cyclical','consumer-discretionary'],
  ['communication services','communication-services'], ['communications services','communication-services'],
  ['industrials','industrials'],
  ['consumer staples','consumer-staples'], ['consumer defensive','consumer-staples'],
  ['energy','energy'],
  ['utilities','utilities'],
  ['real estate','real-estate'],
  ['materials','materials'], ['basic materials','materials']
]);
const canonicalizeSector = (raw) => {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return 'all';
  return sectorSynonyms.get(s) || s.replace(/\s+/g, '-');
};
const selectedSectorCanonSingle = canonicalizeSector(sectorFilterArg);
const selectedSectorSet = (() => {
  const list = (sectorFiltersArg || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(canonicalizeSector);
  if (list.length > 0) return new Set(list);
  // fallback to single arg if provided and not 'all'
  return (selectedSectorCanonSingle && selectedSectorCanonSingle !== 'all') ? new Set([selectedSectorCanonSingle]) : new Set();
})();
const canonicalizeIndustry = (raw) => String(raw || '').trim().toLowerCase().replace(/\s+/g, '-');
const selectedIndustrySet = new Set(
  (industryFiltersArg || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(canonicalizeIndustry)
);
// Optionally suppress Yahoo survey notice
if (suppressSurvey && yf?.suppressNotices) {
  try { yf.suppressNotices(['yahooSurvey']); } catch {}
}
const emitProgress = args.includes('--emit-progress');
// Logging helpers respecting --quiet
const logInfo = (...a) => { if (!isQuiet) console.log(...a); };
const logWarn = (...a) => { if (!isQuiet) console.warn(...a); };
const logError = (...a) => { if (!isQuiet) console.error(...a); };
const logProgress = (type, payload = {}) => { if (emitProgress) { try { console.log('PROGRESS:', JSON.stringify({ type, ...payload })); } catch {} } };
// Log de próximo ticker em tempo real
const LOG_FILE = './LOG.TXT';
function logNextTicker(sym) {
  if (!sym) return;
  try {
    const stamp = new Date().toISOString();
    fs.appendFileSync(LOG_FILE, `${stamp} ${String(sym)}\n`);
  } catch {}
}
// Snapshot para emissão periódica de progresso com contadores de API
let lastProgressSnapshot = { processed: 0, total: 0, elapsedMs: 0, currentTicker: null };
// Track start time to compute dynamic elapsed during stalls
let progressStartMs = null;
let progressPulse = null;
let currentTicker = null;
if (emitProgress) {
  try {
    progressPulse = setInterval(() => {
      const elapsedDyn = progressStartMs ? (nowMs() - progressStartMs) : lastProgressSnapshot.elapsedMs;
      logProgress('processing', { ...lastProgressSnapshot, elapsedMs: elapsedDyn, currentTicker, apiCallsTotal, apiCallsSuccess, apiCallsScreenerFail, apiCallsOtherFail });
    }, 750);
  } catch {}
}
// Weights for composite undervaluation score
const weights = { pe: 0.22, pb: 0.18, dividendYield: 0.12, fcfMargin: 0.18, epsGrowth: 0.18, debtToEquity: 0.12 };

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const normLowerBetter = (val, good, bad) => (val == null || isNaN(val)) ? 0 : clamp01(1 - ((val - good) / (bad - good)));
const normHigherBetter = (val, good, bad) => (val == null || isNaN(val)) ? 0 : clamp01((val - good) / (bad - good));

const jitterMinMsBase = jitterMinMs;
const jitterMaxMsBase = jitterMaxMs;
const backoffMaxMsBase = backoffMaxMs;
const cooldownThresholdBase = cooldownThreshold;
const cooldownMsBase = cooldownMs;
// Linear scaling factor between 5 and 200 tickers
const minTickers = 5;
const maxTickers = 200;
const clampedTarget = Math.max(minTickers, Math.min(maxTickers, targetCount));
const scale = (clampedTarget - minTickers) / (maxTickers - minTickers); // 0 at 5, 1 at 200
// Define scaled parameters: fewer tickers -> smaller delays, many tickers -> original delays
const jitterMinMsScaled = Math.floor(jitterMinMsBase * (0.3 + 0.7 * scale));
const jitterMaxMsScaled = Math.floor(jitterMaxMsBase * (0.3 + 0.7 * scale));
const backoffMaxMsScaled = Math.floor(backoffMaxMsBase * (0.4 + 0.6 * scale));
const cooldownThresholdScaled = Math.max(2, Math.round(cooldownThresholdBase * (0.6 + 0.4 * scale)));
const cooldownMsScaled = Math.floor(cooldownMsBase * (0.5 + 0.5 * scale));

const sleepJitter = (min = jitterMinMsScaled, max = jitterMaxMsScaled) => sleep(min + Math.floor(Math.random() * (max - min + 1)));

// Disk cache paths and helpers
const CACHE_DIR = './cache';
const QUOTE_CACHE_FILE = CACHE_DIR + '/quotes.json';
const QSUMMARY_CACHE_FILE = CACHE_DIR + '/quoteSummary.json';
function ensureCacheDir() { try { if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR); } catch {} }
function readJsonSafe(p) { try { if (fs.existsSync(p)) { const s = fs.readFileSync(p,'utf8'); return JSON.parse(s); } } catch {} return null; }
function writeJsonSafe(p, obj) { try { fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8'); } catch (e) { logWarn('Cache write failed:', e?.message || e); } }
function nowMs() { return Date.now(); }
function isFresh(tsMs, ttlHours) { if (!tsMs) return false; const ttl = ttlHours * 3600 * 1000; return (nowMs() - tsMs) < ttl; }
// Global caches and failure tracking
const qSummaryCache = new Map(); // ticker -> quoteSummary result
const quoteCache = new Map(); // ticker -> quote result
let consecutiveFailures = 0;

// Hydrate caches from disk at startup and ensure cache directory exists
ensureCacheDir();
const diskQuotes = readJsonSafe(QUOTE_CACHE_FILE) || {};
const diskQSummary = readJsonSafe(QSUMMARY_CACHE_FILE) || {};
for (const k of Object.keys(diskQuotes)) { const v = diskQuotes[k]; if (v?.data) quoteCache.set(k, { ts: v.ts, data: v.data }); }
for (const k of Object.keys(diskQSummary)) { const v = diskQSummary[k]; if (v?.data) qSummaryCache.set(k, { ts: v.ts, data: v.data }); }
logInfo('Hydrated cache from disk:', Object.keys(diskQuotes).length, 'quotes;', Object.keys(diskQSummary).length, 'quoteSummary entries');
// Cookie store and fetch monkey-patch to add headers and reuse cookies for Yahoo endpoints
const cookieStore = new Map(); // host -> cookie string
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const urlStr = typeof input === 'string' ? input : (input?.url || '');
  let host = '';
  try { host = new URL(urlStr).host; } catch {}
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    ...(init?.headers || {})
  };
  const cookie = host ? cookieStore.get(host) : null;
  if (cookie && !headers['Cookie']) headers['Cookie'] = cookie;
  const res = await originalFetch(input, { ...init, headers, redirect: init?.redirect ?? 'follow' });
  const setCookie = res.headers?.get && res.headers.get('set-cookie');
  if (host && setCookie) cookieStore.set(host, setCookie);
  return res;
};

const isHtmlError = (err) => {
  const msg = String(err?.message || err || '');
  return msg.includes('Unexpected token <') || msg.includes('<!DOCTYPE');
};

// NEW: safer timeout wrapper that never rejeita; retorna null no timeout/erro
async function withTimeout(promise, ms, label = 'op') {
  try {
    let timer;
    const timeoutPromise = new Promise((resolve) => {
      timer = setTimeout(() => {
        logWarn(`Timeout ${label} after ${ms}ms`);
        resolve(null);
      }, ms);
    });
    const result = await Promise.race([promise, timeoutPromise]);
    if (timer) clearTimeout(timer);
    return result;
  } catch (e) {
    logError(`withTimeout(${label}) error:`, e?.message || e);
    return null;
  }
}

async function safeQuoteSummary(ticker) {
  // Cache first
  if (qSummaryCache.has(ticker)) {
    const cached = qSummaryCache.get(ticker);
    if (cached?.data && isFresh(cached.ts, cacheTtlHours)) return cached.data;
  }
  const maxAttempts = 5;
  let delay = 0; // first call no delay, then backoff
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (delay > 0) await sleep(delay);
    // jitter between attempts
    await sleepJitter();
    try {
      if (attempt === 1) apiCallsTotal += 1; // não contar retries
      const res = await yf.quoteSummary(
        ticker,
        { modules: ['price','summaryDetail','financialData','defaultKeyStatistics','assetProfile'] },
        {
          // apply validation controls
          validateResult: !skipValidation,
          validation: { logErrors: !noValidationLogs }
        }
      );
      apiCallsSuccess += 1;
      consecutiveFailures = 0;
      const entry = { ts: nowMs(), data: res };
      qSummaryCache.set(ticker, entry);
      return res;
    } catch (e) {
      const htmlFail = isHtmlError(e);
      logError(`QuoteSummary error [${attempt}/${maxAttempts}] for ${ticker}:`, e?.message || e);
      consecutiveFailures += 1;
      if (consecutiveFailures >= cooldownThresholdScaled) {
        logWarn(`Consecutive failures reached ${consecutiveFailures} (threshold ${cooldownThresholdScaled}). Cooling down for ${cooldownMsScaled}ms`);
        await sleep(cooldownMsScaled);
        consecutiveFailures = 0;
      }
      delay = Math.min(backoffMaxMsScaled, Math.floor((attempt ** 2) * 250));
      if (attempt === maxAttempts) throw e;
    }
  }
}
async function safeQuote(ticker) {
  if (quoteCache.has(ticker)) {
    const cached = quoteCache.get(ticker);
    if (cached?.data && isFresh(cached.ts, cacheTtlHours)) return cached.data;
  }
  if (ticker === debugTickerArg) logWarn('DBG quote start', ticker);
  const maxAttempts = 5;
  let delay = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (delay > 0) await sleep(delay);
    await sleepJitter();
    try {
      if (attempt === 1) apiCallsTotal += 1; // não contar retries
      const res = await yf.quote(
        ticker,
        undefined,
        {
          validateResult: !skipValidation,
          validation: { logErrors: !noValidationLogs }
        }
      );
      apiCallsSuccess += 1;
      consecutiveFailures = 0;
      const entry = { ts: nowMs(), data: res };
      quoteCache.set(ticker, entry);
      if (ticker === debugTickerArg) {
        try {
          const px = res?.regularMarketPrice;
          const ex = (res?.fullExchangeName || '').toLowerCase();
          logWarn('DBG quote success', ticker, 'price', px, 'ex', ex);
        } catch {}
      }
      return res;
    } catch (e) {
      const htmlFail = isHtmlError(e);
      logError(`Quote error [${attempt}/${maxAttempts}] for ${ticker}:`, e?.message || e);
      if (ticker === debugTickerArg) logWarn('DBG quote error', ticker, 'attempt', attempt, 'msg', e?.message || e);
      consecutiveFailures += 1;
      if (consecutiveFailures >= cooldownThresholdScaled) {
        logWarn(`Too many consecutive failures, cooling down for ${cooldownMsScaled}ms`);
        await sleep(cooldownMsScaled);
        consecutiveFailures = 0;
      }
      const next = (attempt === 1 ? 300 : (delay ? delay * 2 : 600)) + Math.floor(Math.random() * 150);
      delay = Math.min(backoffMaxMsScaled, next);
      if (!htmlFail && attempt >= 3) break;
      if (attempt === maxAttempts) return null;
    }
  }
  return null;
}

function isValidNumber(v) { return v != null && Number.isFinite(Number(v)); }

// Compute FCF-related metrics for Extras block
function computeFcfMargins(q) {
  try {
    const fd = q?.financialData || {};
    const ks = q?.defaultKeyStatistics || {};
    const price = q?.price || {};
    const fcf = Number(fd.freeCashflow);
    const revenue = Number(fd.totalRevenue);
    const fcfMargin = (Number.isFinite(fcf) && Number.isFinite(revenue) && revenue !== 0) ? (fcf / revenue) : null;
    const marketCap = Number(price.marketCap ?? ks.marketCap);
    const enterpriseValue = Number(ks.enterpriseValue ?? fd.enterpriseValue);
    const denom = (Number.isFinite(marketCap) && marketCap > 0) ? marketCap : ((Number.isFinite(enterpriseValue) && enterpriseValue > 0) ? enterpriseValue : null);
    const fcfYield = (Number.isFinite(fcf) && denom && denom > 0) ? (fcf / denom) : null;
    const roic = isValidNumber(fd.returnOnEquity) ? Number(fd.returnOnEquity) : (isValidNumber(fd.returnOnAssets) ? Number(fd.returnOnAssets) : null);
    const ebit = Number(fd.ebitda ?? fd.ebit);
    const interestExpense = Number(fd.interestExpense ?? fd.interestExpense);
    const interestCoverage = (Number.isFinite(ebit) && Number.isFinite(interestExpense) && interestExpense !== 0) ? (ebit / Math.abs(interestExpense)) : null;
    return { fcfMargin, fcfYield, roic, interestCoverage };
  } catch {
    return { fcfMargin: null, fcfYield: null, roic: null, interestCoverage: null };
  }
}

function computeCompositeScore(q) {
  if (!q) return -Infinity;
  const sd = q.summaryDetail || {}; const fd = q.financialData || {}; const ks = q.defaultKeyStatistics || {};
  const pe = ks.forwardPE ?? ks.trailingPE;
  const pb = ks.priceToBook;
  const div = sd.dividendYield;
  const fcfMargin = (isValidNumber(fd.freeCashflow) && isValidNumber(fd.totalRevenue) && Number(fd.totalRevenue) !== 0)
    ? Number(fd.freeCashflow) / Number(fd.totalRevenue)
    : null;
  const epsGrowth = fd.earningsGrowth;
  const d2e = fd.debtToEquity;

  const availability = [
    isValidNumber(pe),
    isValidNumber(pb),
    isValidNumber(div),
    isValidNumber(fcfMargin),
    isValidNumber(epsGrowth),
    isValidNumber(d2e)
  ];
  const availableCount = availability.reduce((acc, v) => acc + (v ? 1 : 0), 0);

  if (excludeNa && minFields > 0 && availableCount < minFields) return -Infinity;

  // Normalize weights by available metrics
  const parts = [];
  if (isValidNumber(pe)) parts.push({ w: weights.pe, v: normLowerBetter(pe, 6, 35) });
  if (isValidNumber(pb)) parts.push({ w: weights.pb, v: normLowerBetter(pb, 0.7, 6) });
  if (isValidNumber(div)) parts.push({ w: weights.dividendYield, v: clamp01(Number(div) * 4) });
  if (isValidNumber(fcfMargin)) parts.push({ w: weights.fcfMargin, v: clamp01(Number(fcfMargin) * 4) });
  if (isValidNumber(epsGrowth)) parts.push({ w: weights.epsGrowth, v: clamp01(Number(epsGrowth) * 4) });
  if (isValidNumber(d2e)) parts.push({ w: weights.debtToEquity, v: normLowerBetter(d2e, 0.15, 2.0) });

  if (parts.length === 0) return -Infinity;
  const wsum = parts.reduce((acc, p) => acc + p.w, 0);
  const s = parts.reduce((acc, p) => acc + p.w * p.v, 0) / (wsum || 1);
  return isFinite(s) ? s : -Infinity;
}

function computeAspectScores(q) {
  const sd = q?.summaryDetail || {}; const fd = q?.financialData || {}; const ks = q?.defaultKeyStatistics || {}; const price = q?.price || {};
  const fcfMargin = (fd.freeCashflow && fd.totalRevenue) ? Number(fd.freeCashflow) / Number(fd.totalRevenue) : 0;
  const financialsScore = (
    normHigherBetter(fd.grossMargins, 0.2, 0.6) +
    normHigherBetter(fd.operatingMargins, 0.05, 0.3) +
    normHigherBetter(fd.netMargins, 0.02, 0.25) +
    clamp01((fd.revenueGrowth ?? 0) * 4) +
    clamp01((fd.earningsGrowth ?? 0) * 4) +
    clamp01(fcfMargin * 4) -
    normHigherBetter(fd.debtToEquity, 0.3, 2.0)
  );
  const valuationScore = (
    normLowerBetter(ks.trailingPE, 6, 35) +
    normLowerBetter(ks.forwardPE, 6, 35) +
    normLowerBetter(ks.priceToBook, 0.7, 6) +
    normLowerBetter(ks.enterpriseToEbitda, 4, 20) +
    clamp01((sd.dividendYield ?? 0) * 4)
  );
  const growthScore = (
    clamp01((fd.earningsGrowth ?? 0) * 4) +
    clamp01((fd.revenueGrowth ?? 0) * 4) +
    normHigherBetter(fd.returnOnEquity, 0.05, 0.25)
  );
  const riskScore = (
    normLowerBetter(fd.debtToEquity, 0.15, 2.0) +
    normHigherBetter(fd.currentRatio, 1.2, 3.0) +
    normHigherBetter(fd.quickRatio, 1.0, 2.5) +
    normLowerBetter(sd.beta, 0.8, 2.0)
  );
  const newsScore = normHigherBetter(fd.targetMeanPrice && price.regularMarketPrice ? (Number(fd.targetMeanPrice) - Number(price.regularMarketPrice)) / Number(price.regularMarketPrice) : 0, 0.05, 0.30);
  const outlookScore = computeCompositeScore(q);
  const buffettScore = (
    clamp01((sd.dividendYield ?? 0) * 4) +
    normLowerBetter(fd.debtToEquity, 0.15, 2.0) +
    normHigherBetter(fd.returnOnEquity, 0.10, 0.30) +
    clamp01(fcfMargin * 4)
  );
  const technicalScore = normHigherBetter(price.regularMarketChangePercent, -0.02, 0.05);
  const sentimentScore = normLowerBetter(fd.recommendationMean, 1.0, 4.0);

  // Composite variants
  const comp_st_lr = (
    0.30 * riskScore + 0.25 * valuationScore + 0.20 * financialsScore + 0.10 * technicalScore + 0.10 * outlookScore + 0.05 * growthScore
  );
  const comp_st = (
    0.25 * valuationScore + 0.20 * technicalScore + 0.15 * newsScore + 0.15 * growthScore + 0.15 * financialsScore + 0.10 * riskScore
  );
  const comp_lt_lr = (
    0.30 * financialsScore + 0.25 * buffettScore + 0.20 * riskScore + 0.15 * valuationScore + 0.10 * outlookScore
  );
  const comp_lt = (
    0.25 * growthScore + 0.20 * outlookScore + 0.20 * financialsScore + 0.15 * valuationScore + 0.10 * buffettScore + 0.10 * riskScore
  );

  return { financialsScore, valuationScore, growthScore, riskScore, newsScore, outlookScore, buffettScore, technicalScore, sentimentScore, comp_st_lr, comp_st, comp_lt_lr, comp_lt };
}

function buildAnalysis(ticker, q) {
  const price = q?.price?.regularMarketPrice; const fd = q?.financialData || {}; const sd = q?.summaryDetail || {}; const ks = q?.defaultKeyStatistics || {};
  const financials = `Revenue (ttm): ${fd.totalRevenue ?? 'N/A'}; Gross: ${fd.grossMargins ?? 'N/A'}; Oper: ${fd.operatingMargins ?? 'N/A'}; Net: ${fd.netMargins ?? 'N/A'}; EPS(fwd): ${ks.forwardEps ?? 'N/A'}; D/E: ${fd.debtToEquity ?? 'N/A'}; FCF: ${fd.freeCashflow ?? 'N/A'}`;
  const valuation = `P/E: ${ks.trailingPE ?? 'N/A'}, Fwd P/E: ${ks.forwardPE ?? 'N/A'}, P/B: ${ks.priceToBook ?? 'N/A'}, EV/EBITDA: ${ks.enterpriseToEbitda ?? 'N/A'}, Dividend: ${sd.dividendYield ?? 0}`;
  const growth = `Earnings growth: ${fd.earningsGrowth ?? 'N/A'}; Revenue growth: ${fd.revenueGrowth ?? 'N/A'}; ROE: ${fd.returnOnEquity ?? 'N/A'}; Industry: ${q?.price?.exchangeName || 'NASDAQ'}`;
  const risk = `Market: rates/geopolitical; Operational: competition/supply; Debt/Liquidity: D/E ${fd.debtToEquity ?? 'N/A'}, quick ${fd.quickRatio ?? 'N/A'}`;
  const news = `Latest earnings & announcements: review recent filings and headlines for ${ticker}.`;
  const outlook = `Bull: strengths in cash flow/returns; Bear: valuation/sector risks; Horizon: ST vs LT based on catalysts.`;
  const buffett = `${(sd.dividendYield ?? 0) >= 0.01 && (fd.debtToEquity ?? 9) < 1.0 ? 'YES' : 'NO'} - Focus on durable moats, prudent leverage, and stable cash generation.`;
  const technical = `Pattern: trend/momentum; Chg%: ${q?.price?.regularMarketChangePercent ?? 'N/A'}; Support/Resistance from recent ranges.`;
  const sentiment = `Use latest headlines to classify as Positive/Negative/Neutral with justification.`;
  return { financials, valuation, growth, risk, news, outlook, buffett, technical, sentiment };
}

async function getNasdaqCandidates() {
  const scrIds = ['most_actives','day_gainers','day_losers','undervalued_large_caps','undervalued_growth_stocks','small_cap_gainers','aggressive_small_caps','most_shorted_stocks','portfolio_anchors','solid_large_growth_funds','solid_midcap_growth_funds'];
  const symbols = new Set();
  for (const id of scrIds) {
    for (let page = 0; page < maxScreenerPages; page += 1) {
      const offset = page * 100;
      try {
        apiCallsTotal += 1;
        const resp = await yf.screener({ scrIds: id, count: 100, offset }, undefined, {
          validateResult: !skipValidation,
          validation: { logErrors: !noValidationLogs }
        });
        apiCallsSuccess += 1;
        const quotes = resp?.quotes || resp?.[0]?.quotes || [];
        for (const q of quotes) {
          const exNameLower = (q.fullExchangeName || q.exchange || '').toLowerCase();
          const exCodeUpper = (q.exchange || '').toUpperCase();
          const price = q.regularMarketPrice;
          if (exNameLower.includes('nasdaq')) {
            symbols.add(q.symbol);
            nasdaqLight.set(q.symbol, { exNameLower, exCodeUpper, price });
          }
        }
      } catch (e) { apiCallsScreenerFail += 1; logError('screener error', id, 'offset', offset, e?.message || e); }
      await sleepJitter();
    }
  }
  try {
    apiCallsTotal += 1;
    const t = await yf.trendingSymbols('US', undefined, {
      validateResult: !skipValidation,
      validation: { logErrors: !noValidationLogs }
    });
    apiCallsSuccess += 1;
    const quotes = t?.quotes || t?.symbols || [];
    for (const q of quotes) {
      const sym = q.symbol || q;
      const exNameLower = (q.fullExchangeName || q.exchange || '').toLowerCase();
      const exCodeUpper = (q.exchange || '').toUpperCase();
      const price = q.regularMarketPrice;
      if (!exNameLower || exNameLower.includes('nasdaq')) {
        symbols.add(sym);
        nasdaqLight.set(sym, { exNameLower, exCodeUpper, price });
      }
    }
  } catch (e) { apiCallsOtherFail += 1; logError('trending error', e?.message || e); }
  // slight pause after trending
  await sleepJitter();
  // Fallback: harvest existing CSV tickers if present
  try {
    const path = './Comprehensive_153_Stock_Analysis.csv';
    if (!noFallback && fs.existsSync(path)) {
      const data = fs.readFileSync(path, 'utf8');
      const lines = data.split(/\r?\n/).slice(1); // skip header
      for (const line of lines) {
        if (!line || line.startsWith('Top10_')) break;
        const parts = line.split(',');
        const sym = parts[1]?.replace(/^\"|\"$/g, ''); // second column is ticker
        if (sym) { symbols.add(sym); fallbackSymbols.add(sym); }
      }
    }
  } catch (e) { logWarn('fallback csv read error', e?.message || e); }
  try {
    const path2 = `./Comprehensive_${targetCount}_Stock_Analysis.csv`;
    if (!noFallback && fs.existsSync(path2)) {
      const data2 = fs.readFileSync(path2, 'utf8');
      const lines2 = data2.split(/\r?\n/).slice(1);
      for (const line of lines2) {
        if (!line || line.startsWith('Top10_')) break;
        const parts2 = line.split(',');
        const sym2 = parts2[1]?.replace(/^\"|\"$/g, '');
        if (sym2) { symbols.add(sym2); fallbackSymbols.add(sym2); }
      }
    }
  } catch (e) { logWarn('fallback csv2 read error', e?.message || e); }

  if (!noFallback && symbols.size < 500) {
    [
      'AAPL','MSFT','NVDA','AMZN','META','GOOGL','GOOG','AVGO','COST','ADBE','PEP','NFLX','INTC','CSCO','AMD','QCOM','TXN','AMAT','PDD','PYPL','SBUX','TMUS','AMGN','MDLZ','GILD','MU','ADI','KLAC','LRCX','REGN','VRTX','MRVL','PANW','FTNT','CDNS','SNPS','ORLY','IDXX','NXPI','ROP','MNST','MELI','EA','CTAS','ROST','CRWD','ADSK','CDW','ODFL','PCAR','XEL','CHTR','CTSH','ALGN','TTWO','EXC','PAYX','VRSK','SNOW','TTD','DOCU','OKTA','ZS','DDOG','NTES','BIDU','NTNX','FSLR','EPAM','LKQ','DASH','BKR','BLDR','RIVN','LCID','ABNB','LULU','MRNA','BMY','GFS','A','PTC','TER','HBAN','UAL','DAL','AAL','EXPE','CHKP','ALNY','SFM','WBA','FAST','NTRS','ZBRA','AXON','CELH','PLTR','SMCI','NVCR','SPLK','ANSS','MCHP','MPWR','QRVO','SWKS','MTCH','KDP','SIRI','INTU','GEHC','VRSN','BIIB','EXAS','PENN','PCTY','SGEN','INO','NVAX','RGEN','MNKD'
    ].forEach(s => { symbols.add(s); fallbackSymbols.add(s); });
  }
  return Array.from(symbols);
}

async function main() {
  const usingManual = Array.isArray(manualTickers) && manualTickers.length > 0;
  const candidates = usingManual ? manualTickers : await getNasdaqCandidates();
  logInfo('Candidates discovered:', candidates.length);
  logProgress('candidates', { count: candidates.length, manual: usingManual });
  const t0 = nowMs();
  progressStartMs = t0;
  const tickersSet = new Set([...(usingManual ? manualTickers : baseTickers), ...candidates]);
  const tickers = Array.from(tickersSet);
  const results = [];
  const eligibleTickers = new Set();
  const exCodesNasdaq = new Set(['NMS','NGS','NCM']);
  const totalToCheck = tickers.length;
  let processedCount = 0;
  lastProgressSnapshot = { processed: 0, total: totalToCheck, elapsedMs: 0, currentTicker: null };
  for (let i = 0; i < tickers.length; i += 1) {
    const t = tickers[i];
    const next = (i + 1) < tickers.length ? tickers[i + 1] : null;
    // Skip tickers explicitly listed (case-insensitive), do it before any work
    const tUpper = String(t).trim().toUpperCase();
    if (skipTickersSet.has(tUpper)) {
      processedCount += 1;
      lastProgressSnapshot = { processed: processedCount, total: totalToCheck, elapsedMs: nowMs() - t0, currentTicker: `skipped:${t}` };
      logProgress('processing', { ...lastProgressSnapshot, apiCallsTotal, apiCallsSuccess, apiCallsScreenerFail, apiCallsOtherFail });
      if (t === debugTickerArg) logWarn('DBG skipped ticker', t, 'index', i);
      currentTicker = next;
      lastProgressSnapshot.currentTicker = next;
      logNextTicker(next);
      continue;
    }
    currentTicker = t;
    lastProgressSnapshot.currentTicker = t;
    if (t === debugTickerArg) logWarn('DBG begin ticker', t, 'index', i);
    await sleepJitter();
    // Aggressive local reuse: derive eligibility from nasdaqLight or disk/in-memory caches first
    let exNameLower = nasdaqLight.get(t)?.exNameLower || '';
    let exCodeUpper = nasdaqLight.get(t)?.exCodeUpper || '';
    let px = nasdaqLight.get(t)?.price;

    if ((!exNameLower || px == null)) {
      const cachedSummary = qSummaryCache.get(t);
      if (cachedSummary?.data && isFresh(cachedSummary.ts, cacheTtlHours)) {
        const qCached = cachedSummary.data;
        exNameLower = (qCached?.price?.fullExchangeName || qCached?.price?.exchangeName || '').toLowerCase();
        exCodeUpper = (qCached?.price?.exchange || '').toUpperCase();
        px = qCached?.price?.regularMarketPrice;
      } else {
        const cachedQuote = quoteCache.get(t);
        if (cachedQuote?.data && isFresh(cachedQuote.ts, cacheTtlHours)) {
          const qlCached = cachedQuote.data;
          exNameLower = (qlCached?.fullExchangeName || '').toLowerCase();
          exCodeUpper = (qlCached?.exchange || '').toUpperCase();
          px = qlCached?.regularMarketPrice;
        }
      }
    }

    let isNasdaq = exNameLower.includes('nasdaq') || exCodesNasdaq.has(exCodeUpper);
    if (!isNasdaq || !(px != null && px >= minPriceCutoff)) {
      // If eligibility unknown (no local meta), do a lightweight quote check once
      const needsCheck = (!exNameLower && px == null);
      if (needsCheck) {
        const qlite = await withTimeout(safeQuote(t), Math.max(10000, Math.floor(tickerTimeoutMs * 0.5)), `safeQuote:${t}`);
        exNameLower = (qlite?.fullExchangeName || '').toLowerCase();
        exCodeUpper = (qlite?.exchange || '').toUpperCase();
        px = qlite?.regularMarketPrice;
        isNasdaq = exNameLower.includes('nasdaq') || exCodesNasdaq.has(exCodeUpper);
        if (!isNasdaq || !(px != null && px >= minPriceCutoff)) { logNextTicker(next); continue; }
      } else {
        logNextTicker(next); continue;
      }
    }

    eligibleTickers.add(t);

    // Only fetch full summary for eligible tickers; prefer cached summary
    let q = null;
    const cachedSummary = qSummaryCache.get(t);
    if (cachedSummary?.data && isFresh(cachedSummary.ts, cacheTtlHours)) {
      q = cachedSummary.data;
    } else {
      q = await withTimeout(safeQuoteSummary(t), Math.max(15000, Math.floor(tickerTimeoutMs * 0.75)), `quoteSummary:${t}`);
    }

    if (q) {
      // Pre-filters: Sector and Industry
      if (selectedSectorSet.size > 0) {
        const secCanon = canonicalizeSector(q?.assetProfile?.sector || '');
        if (!secCanon || !selectedSectorSet.has(secCanon)) {
          processedCount += 1;
          lastProgressSnapshot = { processed: processedCount, total: totalToCheck, elapsedMs: nowMs() - t0, currentTicker };
          logProgress('processing', { ...lastProgressSnapshot, apiCallsTotal, apiCallsSuccess, apiCallsScreenerFail, apiCallsOtherFail });
          logNextTicker(next);
          continue;
        }
      }
      if (selectedIndustrySet.size > 0) {
        const indCanon = canonicalizeIndustry(q?.assetProfile?.industry || '');
        if (!indCanon || !selectedIndustrySet.has(indCanon)) {
          processedCount += 1;
          lastProgressSnapshot = { processed: processedCount, total: totalToCheck, elapsedMs: nowMs() - t0, currentTicker };
          logProgress('processing', { ...lastProgressSnapshot, apiCallsTotal, apiCallsSuccess, apiCallsScreenerFail, apiCallsOtherFail });
          logNextTicker(next);
          continue;
        }
      }
      const score = computeCompositeScore(q);
      const aspects = computeAspectScores(q);
      results.push({ ticker: t, q, score, aspects });
    }
    processedCount += 1;
    lastProgressSnapshot = { processed: processedCount, total: totalToCheck, elapsedMs: nowMs() - t0, currentTicker };
    logProgress('processing', { ...lastProgressSnapshot, apiCallsTotal, apiCallsSuccess, apiCallsScreenerFail, apiCallsOtherFail });
    logNextTicker(next);
  }
  logInfo(`Eligible tickers (NASDAQ >= $${minPriceCutoff}):`, eligibleTickers.size);
  logInfo('Scored tickers:', results.length);
  logProgress('scored', { eligible: eligibleTickers.size, scored: results.length, elapsedMs: nowMs() - t0 });
  const scored = results.filter(r => isFinite(r.score)).sort((a,b) => b.score - a.score);
  let finalTickers = scored.map(r => r.ticker).slice(0, usingManual ? manualTickers.length : targetCount);
  logInfo('Final tickers after scoring slice:', finalTickers.length);
  // Helper: ensure backfills respect the selected filters
  const passesPreFilters = async (sym) => {
    const needSector = selectedSectorSet.size > 0;
    const needIndustry = selectedIndustrySet.size > 0;
    if (!needSector && !needIndustry) return true;
    const cached = qSummaryCache.get(sym);
    const q = cached?.data || null;
    const check = (qq) => {
      if (!qq) return false;
      if (needSector) {
        const secCanon = canonicalizeSector(qq?.assetProfile?.sector || '');
        if (!(secCanon && selectedSectorSet.has(secCanon))) return false;
      }
      if (needIndustry) {
        const indCanon = canonicalizeIndustry(qq?.assetProfile?.industry || '');
        if (!(indCanon && selectedIndustrySet.has(indCanon))) return false;
      }
      return true;
    };
    if (check(q)) return true;
    try {
      const q2 = await safeQuoteSummary(sym);
      return check(q2);
    } catch {
      return false;
    }
  };
  // Backfill only when not using manual tickers
  if (!usingManual && finalTickers.length < targetCount) {
    for (const t of Array.from(eligibleTickers)) {
      if (skipTickersSet.has(t)) continue;
      if (!finalTickers.includes(t)) {
        if (await passesPreFilters(t)) {
          finalTickers.push(t);
        }
        if (finalTickers.length >= targetCount) break;
      }
    }
    logInfo('Final tickers after eligible backfill:', finalTickers.length);
  }
  if (!usingManual && finalTickers.length < targetCount) {
    for (const t of candidates) {
      if (skipTickersSet.has(String(t).trim().toUpperCase())) continue;
      if (!finalTickers.includes(t)) {
        const qlite = await withTimeout(safeQuote(t), Math.max(10000, Math.floor(tickerTimeoutMs * 0.5)), `safeQuote:${t}`);
        const fullEx = (qlite?.fullExchangeName || '').toLowerCase();
        const exCode = (qlite?.exchange || '').toUpperCase();
        const px = qlite?.regularMarketPrice;
        const exCodesNasdaq = new Set(['NMS','NGS','NCM']);
        const isNasdaq = fullEx.includes('nasdaq') || exCodesNasdaq.has(exCode);
        if (isNasdaq && px != null && px >= minPriceCutoff && await passesPreFilters(t)) {
          finalTickers.push(t);
          if (finalTickers.length >= targetCount) break;
        }
      }
      await sleepJitter();
    }
    logInfo('Final tickers after candidate backfill:', finalTickers.length);
  }
  if (!usingManual && finalTickers.length < targetCount) {
    for (const [sym, meta] of nasdaqLight.entries()) {
      if (skipTickersSet.has(String(sym).trim().toUpperCase())) continue;
      if (!finalTickers.includes(sym)) {
        const exCodesNasdaq = new Set(['NMS','NGS','NCM']);
        const isNasdaq = (meta.exNameLower || '').includes('nasdaq') || exCodesNasdaq.has(meta.exCodeUpper || '');
        if (isNasdaq && meta.price != null && meta.price >= minPriceCutoff && await passesPreFilters(sym)) {
          finalTickers.push(sym);
          if (finalTickers.length >= targetCount) break;
        }
      }
    }
    logInfo('Final tickers after nasdaqLight backfill:', finalTickers.length);
  }
  if (!usingManual && !isStrict && finalTickers.length < targetCount) {
    for (const t of candidates) {
      if (skipTickersSet.has(String(t).trim().toUpperCase())) continue;
      if (!finalTickers.includes(t)) {
        if (await passesPreFilters(t)) {
          finalTickers.push(t);
        }
        if (finalTickers.length >= targetCount) break;
      }
    }
    logInfo('Final tickers after unconditional candidate pad:', finalTickers.length);
  }
  if (!usingManual && !isStrict && finalTickers.length < targetCount) {
    for (const [sym] of nasdaqLight.entries()) {
      if (skipTickersSet.has(sym)) continue;
      if (!finalTickers.includes(sym)) {
        if (await passesPreFilters(sym)) {
          finalTickers.push(sym);
        }
        if (finalTickers.length >= targetCount) break;
      }
    }
    logInfo('Final tickers after nasdaqLight pad:', finalTickers.length);
  }
  // Configurável: quantos tickers aparecem nas listas Top N no final do CSV
  const topRankCount = getArgNum('--top-rank-count', 10);
  const groupDefs = [
    { name: 'Financials', key: 'financialsScore', subs: [
      { title: 'Gross Margins (norm)', expl: 'Normalized [0..1], higher better; gross margins; good ~20%-60%' },
      { title: 'Operating Margins (norm)', expl: 'Normalized [0..1], higher better; operating margins; good ~5%-30%' },
      { title: 'Net Margins (norm)', expl: 'Normalized [0..1], higher better; net margins; good ~2%-25%' },
      { title: 'Revenue Growth (norm)', expl: 'Normalized [0..1] of revenue growth ×4; higher better' },
      { title: 'Earnings Growth (norm)', expl: 'Normalized [0..1] of earnings growth ×4; higher better' },
      { title: 'FCF Margin (norm)', expl: 'Normalized [0..1] of free cash flow margin ×4; higher better' },
      { title: 'Debt/Equity (lower-better norm)', expl: 'Normalized [0..1], lower D/E is better; range ~0.15–2.0' },
    ] },
    { name: 'Valuation', key: 'valuationScore', subs: [
      { title: 'Trailing P/E (lower-better norm)', expl: 'Normalized [0..1], lower better; range ~6–35' },
      { title: 'Forward P/E (lower-better norm)', expl: 'Normalized [0..1], lower better; range ~6–35' },
      { title: 'P/B (lower-better norm)', expl: 'Normalized [0..1], lower better; range ~0.7–6' },
      { title: 'EV/EBITDA (lower-better norm)', expl: 'Normalized [0..1], lower better; range ~4–20' },
      { title: 'Dividend Yield (norm)', expl: 'Normalized [0..1] of dividend yield ×4; higher better' },
    ] },
    { name: 'Growth', key: 'growthScore', subs: [
      { title: 'Earnings Growth (norm)', expl: 'Normalized [0..1] of earnings growth ×4; higher better' },
      { title: 'Revenue Growth (norm)', expl: 'Normalized [0..1] of revenue growth ×4; higher better' },
      { title: 'Return on Equity (norm)', expl: 'Normalized [0..1], higher better; range ~5%–25%' },
    ] },
    { name: 'Risk', key: 'riskScore', subs: [
      { title: 'Debt/Equity (lower-better norm)', expl: 'Normalized [0..1], lower D/E is better; range ~0.15–2.0' },
      { title: 'Current Ratio (norm)', expl: 'Normalized [0..1], higher better; range ~1.2–3.0' },
      { title: 'Quick Ratio (norm)', expl: 'Normalized [0..1], higher better; range ~1.0–2.5' },
      { title: 'Beta (lower-better norm)', expl: 'Normalized [0..1], lower beta is better; range ~0.8–2.0' },
    ] },
    { name: 'News', key: 'newsScore', subs: [
      { title: 'Target Premium (norm)', expl: 'Normalized [0..1] of (targetMeanPrice - price)/price; higher better; range ~5%–30%' },
    ] },
    { name: 'Outlook', key: 'outlookScore', subs: [
      { title: 'P/E (lower-better norm)', expl: 'Normalized [0..1], lower better; range ~6–35; uses Fwd/Trailing' },
      { title: 'P/B (lower-better norm)', expl: 'Normalized [0..1], lower better; range ~0.7–6' },
      { title: 'Dividend Yield (norm)', expl: 'Normalized [0..1] of dividend yield ×4; higher better' },
      { title: 'FCF Margin (norm)', expl: 'Normalized [0..1] of free cash flow margin ×4; higher better' },
      { title: 'EPS Growth (norm)', expl: 'Normalized [0..1] of earnings growth ×4; higher better' },
      { title: 'Debt/Equity (lower-better norm)', expl: 'Normalized [0..1], lower D/E is better; range ~0.15–2.0' },
    ] },
    { name: 'Buffett', key: 'buffettScore', subs: [
      { title: 'Dividend Yield (norm)', expl: 'Normalized [0..1] of dividend yield ×4; higher better' },
      { title: 'Debt/Equity (lower-better norm)', expl: 'Normalized [0..1], lower D/E is better; range ~0.15–2.0' },
      { title: 'Return on Equity (norm)', expl: 'Normalized [0..1], higher better; range ~10%–30%' },
      { title: 'FCF Margin (norm)', expl: 'Normalized [0..1] of free cash flow margin ×4; higher better' },
    ] },
    { name: 'Technical', key: 'technicalScore', subs: [
      { title: 'Change % (norm)', expl: 'Normalized [0..1] of recent change %; higher better; range ~-2%–+5%' },
    ] },
    { name: 'Sentiment', key: 'sentimentScore', subs: [
      { title: 'Recommendation Mean (lower-better norm)', expl: 'Normalized [0..1], lower better; range ~1.0–4.0' },
    ] },
  ];
  const extrasDefs = { name: 'Extras', subs: [
    { title: 'FCF Yield', expl: 'Free cash flow divided by market cap; raw ratio' },
    { title: 'ROIC/ROE', expl: 'Return on assets or equity; raw value' },
    { title: 'Interest Coverage', expl: 'Ability to cover interest expenses; raw value' },
  ]};
  const compositesDefs = { name: 'Composites', subs: [
    { title: 'Composite_ST_LR', expl: 'Short-term (low risk) weighted composite' },
    { title: 'Composite_ST', expl: 'Short-term momentum/valuation composite' },
    { title: 'Composite_LT_LR', expl: 'Long-term (low risk) weighted composite' },
    { title: 'Composite_LT', expl: 'Long-term growth/quality composite' },
  ]};

  const headerRow1 = ['Company Name', 'Ticker'];
  const headerRow2 = ['', ''];
  const headerRow3 = ['', ''];
  for (const g of groupDefs) {
    headerRow1.push(g.name);
    for (let i = 0; i < g.subs.length; i++) headerRow1.push('');
    headerRow1.push(''); // spacer
    headerRow2.push('Score');
    for (const sub of g.subs) headerRow2.push(sub.title);
    headerRow2.push('');
    headerRow3.push('Score agregado [0..1] do grupo');
    for (const sub of g.subs) headerRow3.push(sub.expl);
    headerRow3.push('');
  }
  // Append Extras block
  headerRow1.push(extrasDefs.name, '', '', '');
  headerRow2.push(...extrasDefs.subs.map(s=>s.title));
  headerRow3.push(...extrasDefs.subs.map(s=>s.expl));
  // Append Composites block
  headerRow1.push(compositesDefs.name, '', '', '', '');
  headerRow2.push(...compositesDefs.subs.map(s=>s.title));
  headerRow3.push(...compositesDefs.subs.map(s=>s.expl));

  let csv = headerRow1.join(',') + '\n' + headerRow2.join(',') + '\n' + headerRow3.join(',') + '\n';

  for (const t of finalTickers) {
    const r = results.find(x => x.ticker === t);
    const name = (r?.q?.price?.longName || r?.q?.price?.shortName || r?.q?.price?.symbol || t);
    const priceObj = r?.q?.price || {};
    const ks = r?.q?.defaultKeyStatistics || {};
    const fd = r?.q?.financialData || {};
    const sd = r?.q?.summaryDetail || {};
    const industry = (r?.q?.price?.exchangeName || 'NASDAQ');
    const fcfMargins = computeFcfMargins(r?.q);
    const fcfMarginVal = fcfMargins.fcfMargin;
    const fcfYield = fcfMargins.fcfYield;
    const roic = fcfMargins.roic;
    const interestCoverage = fcfMargins.interestCoverage;

    const displayTicker = fallbackSymbols.has(t) ? ('*' + t) : t;
    const row = [name, displayTicker];
    // Financials
    row.push(r?.aspects?.financialsScore ?? '');
    row.push(
      isValidNumber(fd.grossMargins) ? clamp01(normHigherBetter(fd.grossMargins, 0.2, 0.6)) : '',
      isValidNumber(fd.operatingMargins) ? clamp01(normHigherBetter(fd.operatingMargins, 0.05, 0.3)) : '',
      isValidNumber(fd.netMargins) ? clamp01(normHigherBetter(fd.netMargins, 0.02, 0.25)) : '',
      isValidNumber(fd.revenueGrowth) ? clamp01(Number(fd.revenueGrowth) * 4) : '',
      isValidNumber(fd.earningsGrowth) ? clamp01(Number(fd.earningsGrowth) * 4) : '',
      isValidNumber(fcfMarginVal) ? clamp01(Number(fcfMarginVal) * 4) : '',
      isValidNumber(fd.debtToEquity) ? normLowerBetter(fd.debtToEquity, 0.15, 2.0) : '',
      '' // spacer
    );
    // Valuation
    row.push(r?.aspects?.valuationScore ?? '');
    row.push(
      isValidNumber(ks.trailingPE) ? normLowerBetter(ks.trailingPE, 6, 35) : '',
      isValidNumber(ks.forwardPE) ? normLowerBetter(ks.forwardPE, 6, 35) : '',
      isValidNumber(ks.priceToBook) ? normLowerBetter(ks.priceToBook, 0.7, 6) : '',
      isValidNumber(ks.enterpriseToEbitda) ? normLowerBetter(ks.enterpriseToEbitda, 4, 20) : '',
      isValidNumber(sd.dividendYield) ? clamp01(Number(sd.dividendYield) * 4) : '',
      ''
    );
    // Growth
    row.push(r?.aspects?.growthScore ?? '');
    row.push(
      isValidNumber(fd.earningsGrowth) ? clamp01(Number(fd.earningsGrowth) * 4) : '',
      isValidNumber(fd.revenueGrowth) ? clamp01(Number(fd.revenueGrowth) * 4) : '',
      isValidNumber(fd.returnOnEquity) ? normHigherBetter(fd.returnOnEquity, 0.05, 0.25) : '',
      ''
    );
    // Risk
    row.push(r?.aspects?.riskScore ?? '');
    row.push(
      isValidNumber(fd.debtToEquity) ? normLowerBetter(fd.debtToEquity, 0.15, 2.0) : '',
      isValidNumber(fd.currentRatio) ? normHigherBetter(fd.currentRatio, 1.2, 3.0) : '',
      isValidNumber(fd.quickRatio) ? normHigherBetter(fd.quickRatio, 1.0, 2.5) : '',
      isValidNumber(sd.beta) ? normLowerBetter(sd.beta, 0.8, 2.0) : '',
      ''
    );
    // News
    row.push(r?.aspects?.newsScore ?? '');
    row.push(
      (isValidNumber(fd.targetMeanPrice) && isValidNumber(priceObj.regularMarketPrice) && Number(priceObj.regularMarketPrice) !== 0)
        ? normHigherBetter((Number(fd.targetMeanPrice) - Number(priceObj.regularMarketPrice)) / Number(priceObj.regularMarketPrice), 0.05, 0.30)
        : '',
      ''
    );
    // Outlook
    row.push(r?.aspects?.outlookScore ?? '');
    {
      const pe = ks.forwardPE ?? ks.trailingPE;
      const pb = ks.priceToBook;
      const div = sd.dividendYield;
      const epsGrowth = fd.earningsGrowth;
      const d2e = fd.debtToEquity;
      row.push(
        isValidNumber(pe) ? normLowerBetter(pe, 6, 35) : '',
        isValidNumber(pb) ? normLowerBetter(pb, 0.7, 6) : '',
        isValidNumber(div) ? clamp01(Number(div) * 4) : '',
        isValidNumber(fcfMarginVal) ? clamp01(Number(fcfMarginVal) * 4) : '',
        isValidNumber(epsGrowth) ? clamp01(Number(epsGrowth) * 4) : '',
        isValidNumber(d2e) ? normLowerBetter(d2e, 0.15, 2.0) : '',
        ''
      );
    }
    // Buffett
    row.push(r?.aspects?.buffettScore ?? '');
    row.push(
      isValidNumber(sd.dividendYield) ? clamp01(Number(sd.dividendYield) * 4) : '',
      isValidNumber(fd.debtToEquity) ? normLowerBetter(fd.debtToEquity, 0.15, 2.0) : '',
      isValidNumber(fd.returnOnEquity) ? normHigherBetter(fd.returnOnEquity, 0.10, 0.30) : '',
      isValidNumber(fcfMarginVal) ? clamp01(Number(fcfMarginVal) * 4) : '',
      ''
    );
    // Technical
    row.push(r?.aspects?.technicalScore ?? '');
    row.push(
      isValidNumber(priceObj.regularMarketChangePercent) ? normHigherBetter(priceObj.regularMarketChangePercent, -0.02, 0.05) : '',
      ''
    );
    // Sentiment
    row.push(r?.aspects?.sentimentScore ?? '');
    row.push(
      isValidNumber(fd.recommendationMean) ? normLowerBetter(fd.recommendationMean, 1.0, 4.0) : '',
      ''
    );

    // Extras
    row.push(fcfYield, roic, interestCoverage);

    // Composites
    row.push(
      r?.aspects?.comp_st_lr ?? '',
      r?.aspects?.comp_st ?? '',
      r?.aspects?.comp_lt_lr ?? '',
      r?.aspects?.comp_lt ?? ''
    );

    csv += row.map((v) => '"' + String(v ?? '').replace(/"/g,'""') + '"').join(',') + '\n';
  }

  const labels = [
    ['Top_Financials','financialsScore'],
    ['Top_Valuation','valuationScore'],
    ['Top_Growth','growthScore'],
    ['Top_Risk','riskScore'],
    ['Top_News','newsScore'],
    ['Top_Outlook','outlookScore'],
    ['Top_Buffett','buffettScore'],
    ['Top_Technical','technicalScore'],
    ['Top_Sentiment','sentimentScore'],
    ['Top_Composite','score'],
    ['Top_Composite_ST_LR','comp_st_lr'],
    ['Top_Composite_ST','comp_st'],
    ['Top_Composite_LT_LR','comp_lt_lr'],
    ['Top_Composite_LT','comp_lt']
  ];
  for (const [label,key] of labels) {
    let arr;
    if (key === 'score') {
      arr = results
        .filter(r => finalTickers.includes(r.ticker))
        .sort((a,b) => b.score - a.score)
        .slice(0, topRankCount)
        .map(r => (fallbackSymbols.has(r.ticker) ? ('*' + r.ticker) : r.ticker));
    } else {
      arr = results
        .filter(r => finalTickers.includes(r.ticker))
        .sort((a,b) => (b.aspects[key]||0) - (a.aspects[key]||0))
        .slice(0, topRankCount)
        .map(r => (fallbackSymbols.has(r.ticker) ? ('*' + r.ticker) : r.ticker));
    }
    csv += label + ',' + arr.join(',') + '\n';
  }

  const outPath = outCsvPath;
  logProgress('writing_csv', { filename: outPath, rows: finalTickers.length, elapsedMs: nowMs() - t0 });
  fs.writeFileSync(outPath, csv, 'utf8');
  logInfo(`Generated ${outPath} with ${finalTickers.length} tickers.`);
  // Persist caches to disk at end
  const qOut = {}; for (const [k,v] of quoteCache.entries()) { if (v?.data) qOut[k] = { ts: v.ts || nowMs(), data: v.data }; }
  const qsOut = {}; for (const [k,v] of qSummaryCache.entries()) { if (v?.data) qsOut[k] = { ts: v.ts || nowMs(), data: v.data }; }
  ensureCacheDir();
  writeJsonSafe(QUOTE_CACHE_FILE, qOut);
  writeJsonSafe(QSUMMARY_CACHE_FILE, qsOut);
  if (progressPulse) { try { clearInterval(progressPulse); } catch {} }
  logProgress('done', { cachedQuotes: Object.keys(qOut).length, cachedSummaries: Object.keys(qsOut).length, elapsedMs: nowMs() - t0, apiCallsTotal, apiCallsSuccess, apiCallsScreenerFail, apiCallsOtherFail });
}
// Invoke main at top-level to execute the workflow
(async () => {
  try {
    await main();
    logInfo('Run completed.');
  } catch (e) {
    logError('Fatal error in main:', e?.stack || e);
  }
})();