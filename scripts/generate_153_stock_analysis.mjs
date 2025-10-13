import yf from 'yahoo-finance2';
import fs from 'fs';

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const baseTickers = [];
// Lightweight NASDAQ meta discovered from screeners/trending (exchange + price)
const nasdaqLight = new Map(); // symbol -> { exNameLower, exCodeUpper, price }

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
const cacheTtlHours = getArgNum('--cache-ttl-hours', 24);
const jitterMinMs = getArgNum('--jitter-min', 300);
const jitterMaxMs = getArgNum('--jitter-max', 450);
const backoffMaxMs = getArgNum('--backoff-max-ms', 6000);
const cooldownThreshold = getArgNum('--cooldown-threshold', 4);
const cooldownMs = getArgNum('--cooldown-ms', 8000);
const targetCount = getArgNum('--target-count', 200);
const minPriceCutoff = getArgNum('--min-price-cutoff', 5.00);
// New flags for UI integration
const outCsvPath = (() => { const entry = args.find(s => s.startsWith('--out-csv=')); return entry ? entry.split('=')[1] : `./Comprehensive_${targetCount}_Stock_Analysis.csv`; })();
const manualTickersArg = (() => { const entry = args.find(s => s.startsWith('--manual-tickers=')); return entry ? entry.split('=')[1] : ''; })();
const manualTickers = manualTickersArg ? manualTickersArg.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean).slice(0,50) : [];
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
      const res = await yf.quoteSummary(
        ticker,
        { modules: ['price','summaryDetail','financialData','defaultKeyStatistics'] },
        {
          // apply validation controls
          validateResult: !skipValidation,
          validation: { logErrors: !noValidationLogs }
        }
      );
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
  const maxAttempts = 5;
  let delay = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (delay > 0) await sleep(delay);
    await sleepJitter();
    try {
      const res = await yf.quote(
        ticker,
        undefined,
        {
          validateResult: !skipValidation,
          validation: { logErrors: !noValidationLogs }
        }
      );
      consecutiveFailures = 0;
      const entry = { ts: nowMs(), data: res };
      quoteCache.set(ticker, entry);
      return res;
    } catch (e) {
      const htmlFail = isHtmlError(e);
      logError(`Quote error [${attempt}/${maxAttempts}] for ${ticker}:`, e?.message || e);
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

function computeCompositeScore(q) {
  if (!q) return -Infinity;
  const sd = q.summaryDetail || {}; const fd = q.financialData || {}; const ks = q.defaultKeyStatistics || {};
  const pe = ks.forwardPE ?? ks.trailingPE; 
  const pb = ks.priceToBook; 
  const div = sd.dividendYield ?? 0; 
  const fcfMargin = (fd.freeCashflow && fd.totalRevenue) ? Number(fd.freeCashflow) / Number(fd.totalRevenue) : 0; 
  const epsGrowth = fd.earningsGrowth ?? 0; 
  const d2e = fd.debtToEquity; 
  const s = (
    normLowerBetter(pe, 6, 35) * weights.pe +
    normLowerBetter(pb, 0.7, 6) * weights.pb +
    clamp01(div * 4) * weights.dividendYield +
    clamp01(fcfMargin * 4) * weights.fcfMargin +
    clamp01(epsGrowth * 4) * weights.epsGrowth +
    normLowerBetter(d2e, 0.15, 2.0) * weights.debtToEquity
  );
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
    for (const offset of [0, 100, 200, 300, 400, 500, 600, 700, 800, 900]) {
      try {
        const resp = await yf.screener({ scrIds: id, count: 100, offset }, undefined, {
          validateResult: !skipValidation,
          validation: { logErrors: !noValidationLogs }
        });
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
      } catch (e) { logError('screener error', id, 'offset', offset, e?.message || e); }
      await sleepJitter();
    }
  }
  try {
    const t = await yf.trendingSymbols('US', undefined, {
      validateResult: !skipValidation,
      validation: { logErrors: !noValidationLogs }
    });
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
  } catch (e) { logError('trending error', e?.message || e); }
  // slight pause after trending
  await sleepJitter();
  // Fallback: harvest existing CSV tickers if present
  try {
    const path = './Comprehensive_153_Stock_Analysis.csv';
    if (fs.existsSync(path)) {
      const data = fs.readFileSync(path, 'utf8');
      const lines = data.split(/\r?\n/).slice(1); // skip header
      for (const line of lines) {
        if (!line || line.startsWith('Top10_')) break;
        const parts = line.split(',');
        const sym = parts[1]?.replace(/^\"|\"$/g, ''); // second column is ticker
        if (sym) symbols.add(sym);
      }
    }
  } catch (e) { logWarn('fallback csv read error', e?.message || e); }
  try {
    const path2 = `./Comprehensive_${targetCount}_Stock_Analysis.csv`;
    if (fs.existsSync(path2)) {
      const data2 = fs.readFileSync(path2, 'utf8');
      const lines2 = data2.split(/\r?\n/).slice(1);
      for (const line of lines2) {
        if (!line || line.startsWith('Top10_')) break;
        const parts2 = line.split(',');
        const sym2 = parts2[1]?.replace(/^\"|\"$/g, '');
        if (sym2) symbols.add(sym2);
      }
    }
  } catch (e) { logWarn('fallback csv2 read error', e?.message || e); }

  if (symbols.size < 500) {
    [
      'AAPL','MSFT','NVDA','AMZN','META','GOOGL','GOOG','AVGO','COST','ADBE','PEP','NFLX','INTC','CSCO','AMD','QCOM','TXN','AMAT','PDD','PYPL','SBUX','TMUS','AMGN','MDLZ','GILD','MU','ADI','KLAC','LRCX','REGN','VRTX','MRVL','PANW','FTNT','CDNS','SNPS','ORLY','IDXX','NXPI','ROP','MNST','MELI','EA','CTAS','ROST','CRWD','ADSK','CDW','ODFL','PCAR','XEL','CHTR','CTSH','ALGN','TTWO','EXC','PAYX','VRSK','SNOW','TTD','DOCU','OKTA','ZS','DDOG','NTES','BIDU','NTNX','FSLR','EPAM','LKQ','DASH','BKR','BLDR','RIVN','LCID','ABNB','LULU','MRNA','BMY','GFS','A','PTC','TER','HBAN','UAL','DAL','AAL','EXPE','CHKP','ALNY','SFM','WBA','FAST','NTRS','ZBRA','AXON','CELH','PLTR','SMCI','NVCR','SPLK','ANSS','MCHP','MPWR','QRVO','SWKS','MTCH','KDP','SIRI','INTU','GEHC','VRSN','BIIB','EXAS','PENN','PCTY','SGEN','INO','NVAX','RGEN','MNKD'
    ].forEach(s => symbols.add(s));
  }
  return Array.from(symbols);
}

async function main() {
  const usingManual = Array.isArray(manualTickers) && manualTickers.length > 0;
  const candidates = usingManual ? manualTickers : await getNasdaqCandidates();
  logInfo('Candidates discovered:', candidates.length);
  logProgress('candidates', { count: candidates.length, manual: usingManual });
  const t0 = nowMs();
  const tickersSet = new Set([...(usingManual ? manualTickers : baseTickers), ...candidates]);
  const results = [];
  const eligibleTickers = new Set();
  const exCodesNasdaq = new Set(['NMS','NGS','NCM']);
  const totalToCheck = tickersSet.size;
  let processedCount = 0;
  for (const t of tickersSet) {
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
        const qlite = await safeQuote(t);
        exNameLower = (qlite?.fullExchangeName || '').toLowerCase();
        exCodeUpper = (qlite?.exchange || '').toUpperCase();
        px = qlite?.regularMarketPrice;
        isNasdaq = exNameLower.includes('nasdaq') || exCodesNasdaq.has(exCodeUpper);
        if (!isNasdaq || !(px != null && px >= minPriceCutoff)) continue;
      } else {
        continue;
      }
    }

    eligibleTickers.add(t);

    // Only fetch full summary for eligible tickers; prefer cached summary
    let q = null;
    const cachedSummary = qSummaryCache.get(t);
    if (cachedSummary?.data && isFresh(cachedSummary.ts, cacheTtlHours)) {
      q = cachedSummary.data;
    } else {
      q = await safeQuoteSummary(t);
    }

    if (q) {
      const score = computeCompositeScore(q);
      const aspects = computeAspectScores(q);
      results.push({ ticker: t, q, score, aspects });
    }
    processedCount += 1;
    if (processedCount % 10 === 0 || processedCount === totalToCheck) {
      logProgress('processing', { processed: processedCount, total: totalToCheck, elapsedMs: nowMs() - t0 });
    }
  }
  logInfo(`Eligible tickers (NASDAQ >= $${minPriceCutoff}):`, eligibleTickers.size);
  logInfo('Scored tickers:', results.length);
  logProgress('scored', { eligible: eligibleTickers.size, scored: results.length, elapsedMs: nowMs() - t0 });
  const scored = results.filter(r => isFinite(r.score)).sort((a,b) => b.score - a.score);
  let finalTickers = scored.map(r => r.ticker).slice(0, usingManual ? manualTickers.length : targetCount);
  logInfo('Final tickers after scoring slice:', finalTickers.length);
  // Backfill only when not using manual tickers
  if (!usingManual && finalTickers.length < targetCount) {
    for (const t of Array.from(eligibleTickers)) {
      if (!finalTickers.includes(t)) {
        finalTickers.push(t);
        if (finalTickers.length >= targetCount) break;
      }
    }
    logInfo('Final tickers after eligible backfill:', finalTickers.length);
  }
  if (!usingManual && finalTickers.length < targetCount) {
    for (const t of candidates) {
      if (!finalTickers.includes(t)) {
        const qlite = await safeQuote(t);
        const fullEx = (qlite?.fullExchangeName || '').toLowerCase();
        const exCode = (qlite?.exchange || '').toUpperCase();
        const px = qlite?.regularMarketPrice;
        const exCodesNasdaq = new Set(['NMS','NGS','NCM']);
        const isNasdaq = fullEx.includes('nasdaq') || exCodesNasdaq.has(exCode);
        if (isNasdaq && px != null && px >= minPriceCutoff) {
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
      if (!finalTickers.includes(sym)) {
        const exCodesNasdaq = new Set(['NMS','NGS','NCM']);
        const isNasdaq = (meta.exNameLower || '').includes('nasdaq') || exCodesNasdaq.has(meta.exCodeUpper || '');
        if (isNasdaq && meta.price != null && meta.price >= minPriceCutoff) {
          finalTickers.push(sym);
          if (finalTickers.length >= targetCount) break;
        }
      }
    }
    logInfo('Final tickers after nasdaqLight backfill:', finalTickers.length);
  }
  if (!usingManual && !isStrict && finalTickers.length < targetCount) {
    for (const t of candidates) {
      if (!finalTickers.includes(t)) {
        finalTickers.push(t);
        if (finalTickers.length >= targetCount) break;
      }
    }
    logInfo('Final tickers after unconditional candidate pad:', finalTickers.length);
  }
  if (!usingManual && !isStrict && finalTickers.length < targetCount) {
    for (const [sym] of nasdaqLight.entries()) {
      if (!finalTickers.includes(sym)) {
        finalTickers.push(sym);
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
    const name = r?.q?.price?.longName || r?.q?.price?.shortName || t;
    const priceObj = r?.q?.price || {}; const fd = r?.q?.financialData || {}; const sd = r?.q?.summaryDetail || {}; const ks = r?.q?.defaultKeyStatistics || {};
    const marketCap = priceObj.marketCap ? Number(priceObj.marketCap) : (ks.marketCap ? Number(ks.marketCap) : null);
    const fcfMargin = (fd.freeCashflow && fd.totalRevenue) ? Number(fd.freeCashflow) / Number(fd.totalRevenue) : 0;
    const fcfYield = (fd.freeCashflow && marketCap) ? Number(fd.freeCashflow) / marketCap : '';
    const roic = (fd.returnOnAssets != null) ? fd.returnOnAssets : (fd.returnOnEquity ?? '');
    const interestCoverage = (fd.interestCoverage != null) ? fd.interestCoverage : '';

    const row = [name, t];
    // Financials
    row.push(r?.aspects?.financialsScore ?? '');
    row.push(
      clamp01(normHigherBetter(fd.grossMargins, 0.2, 0.6)),
      clamp01(normHigherBetter(fd.operatingMargins, 0.05, 0.3)),
      clamp01(normHigherBetter(fd.netMargins, 0.02, 0.25)),
      clamp01((fd.revenueGrowth ?? 0) * 4),
      clamp01((fd.earningsGrowth ?? 0) * 4),
      clamp01(fcfMargin * 4),
      normLowerBetter(fd.debtToEquity, 0.15, 2.0),
      '' // spacer
    );
    // Valuation
    row.push(r?.aspects?.valuationScore ?? '');
    row.push(
      normLowerBetter(ks.trailingPE, 6, 35),
      normLowerBetter(ks.forwardPE, 6, 35),
      normLowerBetter(ks.priceToBook, 0.7, 6),
      normLowerBetter(ks.enterpriseToEbitda, 4, 20),
      clamp01((sd.dividendYield ?? 0) * 4),
      ''
    );
    // Growth
    row.push(r?.aspects?.growthScore ?? '');
    row.push(
      clamp01((fd.earningsGrowth ?? 0) * 4),
      clamp01((fd.revenueGrowth ?? 0) * 4),
      normHigherBetter(fd.returnOnEquity, 0.05, 0.25),
      ''
    );
    // Risk
    row.push(r?.aspects?.riskScore ?? '');
    row.push(
      normLowerBetter(fd.debtToEquity, 0.15, 2.0),
      normHigherBetter(fd.currentRatio, 1.2, 3.0),
      normHigherBetter(fd.quickRatio, 1.0, 2.5),
      normLowerBetter(sd.beta, 0.8, 2.0),
      ''
    );
    // News
    row.push(r?.aspects?.newsScore ?? '');
    row.push(
      normHigherBetter(fd.targetMeanPrice && priceObj.regularMarketPrice ? (Number(fd.targetMeanPrice) - Number(priceObj.regularMarketPrice)) / Number(priceObj.regularMarketPrice) : 0, 0.05, 0.30),
      ''
    );
    // Outlook
    row.push(r?.aspects?.outlookScore ?? '');
    {
      const pe = ks.forwardPE ?? ks.trailingPE;
      const pb = ks.priceToBook;
      const div = sd.dividendYield ?? 0;
      const epsGrowth = fd.earningsGrowth ?? 0;
      const d2e = fd.debtToEquity;
      row.push(
        normLowerBetter(pe, 6, 35),
        normLowerBetter(pb, 0.7, 6),
        clamp01(div * 4),
        clamp01(fcfMargin * 4),
        clamp01(epsGrowth * 4),
        normLowerBetter(d2e, 0.15, 2.0),
        ''
      );
    }
    // Buffett
    row.push(r?.aspects?.buffettScore ?? '');
    row.push(
      clamp01((sd.dividendYield ?? 0) * 4),
      normLowerBetter(fd.debtToEquity, 0.15, 2.0),
      normHigherBetter(fd.returnOnEquity, 0.10, 0.30),
      clamp01(fcfMargin * 4),
      ''
    );
    // Technical
    row.push(r?.aspects?.technicalScore ?? '');
    row.push(
      normHigherBetter(priceObj.regularMarketChangePercent, -0.02, 0.05),
      ''
    );
    // Sentiment
    row.push(r?.aspects?.sentimentScore ?? '');
    row.push(
      normLowerBetter(fd.recommendationMean, 1.0, 4.0),
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
      arr = results.filter(r => finalTickers.includes(r.ticker)).sort((a,b) => b.score - a.score).slice(0, topRankCount).map(r=>r.ticker);
    } else {
      arr = results.filter(r => finalTickers.includes(r.ticker)).sort((a,b) => (b.aspects[key]||0) - (a.aspects[key]||0)).slice(0, topRankCount).map(r=>r.ticker);
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
  logProgress('done', { cachedQuotes: Object.keys(qOut).length, cachedSummaries: Object.keys(qsOut).length, elapsedMs: nowMs() - t0 });
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