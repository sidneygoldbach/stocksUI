import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import yf from 'yahoo-finance2';

const app = express();
app.use(cors());
app.use(express.json());

const runs = new Map(); // runId -> { status, startedAt, endedAt, outCsv, log: [], progress: {}, proc }
// In-memory cache for analysis responses
const analysisCache = new Map(); // key: ticker, value: { ts, ttlMs, data }
const ANALYSIS_TTL_MS = 5 * 60 * 1000; // 5 minutes

function makeRunId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function suggestCsvName() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2,'0');
  const name = `Comprehensive_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.csv`;
  return name;
}

app.post('/api/run-analysis', (req, res) => {
  const {
    strict = (process.env.NODE_ENV === 'production'),
    quiet = true,
    cacheTtlHours = 24,
    jitterMin = 300,
    jitterMax = 450,
    backoffMaxMs = 6000,
    cooldownThreshold = 4,
    cooldownMs = 8000,
    outCsv = suggestCsvName(),
    targetCount,
    manualTickers = [],
    suppressSurvey = false,
    skipValidation = true,
    noValidationLogs = true,
    minPriceCutoff = 5.00,
    topRankCount = 10,
    excludeNa = strict,
    minFields = 4,
    noFallback = false,
    maxScreenerPages = 3,
    sectorFilters = [],
    industryFilters = [],
    // novo: skip tickers explicitamente
    skipTickers = [],
    // opcional: debug específico
    debugTicker = '',
  } = req.body || {};

  const runId = makeRunId();
  const outPath = path.resolve(process.cwd(), outCsv);

  const normalizedDebugTicker = (typeof debugTicker === 'string' ? debugTicker.trim().toUpperCase() : '');
  const args = [
    path.resolve(process.cwd(), 'scripts/generate_153_stock_analysis.mjs'),
    strict ? '--strict' : '',
    quiet ? '--quiet' : '',
    `--cache-ttl-hours=${cacheTtlHours}`,
    `--jitter-min=${jitterMin}`,
    `--jitter-max=${jitterMax}`,
    `--backoff-max-ms=${backoffMaxMs}`,
    `--cooldown-threshold=${cooldownThreshold}`,
    `--cooldown-ms=${cooldownMs}`,
    `--out-csv=${outPath}`,
    `--emit-progress`,
    targetCount ? `--target-count=${targetCount}` : '',
    (Array.isArray(manualTickers) && manualTickers.length > 0) ? `--manual-tickers=${manualTickers.filter(Boolean).slice(0,50).join(',')}` : '',
    `--min-price-cutoff=${Number(minPriceCutoff)}`,
    suppressSurvey ? '--suppress-survey' : '',
    skipValidation ? '--skip-validation' : '',
    noValidationLogs ? '--no-validation-logs' : '',
    `--top-rank-count=${Number(topRankCount)}`,
    excludeNa ? '--exclude-na' : '',
    `--min-fields=${Number(minFields)}`,
    noFallback ? '--no-fallback' : '',
    `--max-screener-pages=${Number(maxScreenerPages)}`,
    (Array.isArray(sectorFilters) && sectorFilters.length > 0) ? `--sector-filters=${sectorFilters.join(',')}` : '',
    (Array.isArray(industryFilters) && industryFilters.length > 0) ? `--industry-filters=${industryFilters.join(',')}` : '',
    // novo: passar skip tickers
    (Array.isArray(skipTickers) && skipTickers.length > 0) ? `--skip-tickers=${skipTickers.filter(Boolean).slice(0,200).join(',')}` : '',
    // opcional: instrumentação de debug por ticker (vindo do body)
    (typeof normalizedDebugTicker === 'string' && normalizedDebugTicker.length > 0) ? `--debug-ticker=${normalizedDebugTicker}` : '',
  ].filter(Boolean);

  console.log('[run-analysis] skipTickers:', Array.isArray(skipTickers) ? skipTickers.join(',') : '(none)');
  const proc = spawn('node', args, { cwd: process.cwd() });

  const run = { status: 'running', startedAt: Date.now(), outCsv: outPath, log: [], progress: {}, proc, suppressSurvey, noValidationLogs };
  runs.set(runId, run);

  proc.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    text.split(/\r?\n/).forEach(line => {
      if (!line) return;
      // Filters for notices/logs, controlled by advanced toggles
      if (run.suppressSurvey && (line.includes('yahoo-finance-api-feedback') || line.includes('survey') || line.includes('suppressNotices([\'yahooSurvey\'])'))) {
        return;
      }
      if (run.noValidationLogs && (
        line.includes('Expected required property') ||
        line.includes('validation.md') ||
        line.includes('validation fails') ||
        line.includes('ScreenerResult') ||
        line.includes('YahooNumber') ||
        line.includes('Expected union value') ||
        line.includes('/criteriaMeta/criteria') ||
        // Extra ruído do cliente yahoo-finance2
        line.includes('This may happen intermittently') ||
        line.includes('yahoo-finance2 v')
      )) {
        return;
      }
      if (line.startsWith('PROGRESS:')) {
        try {
          const payload = JSON.parse(line.slice('PROGRESS:'.length).trim());
          run.progress = payload;
        } catch {}
      } else {
        run.log.push(line);
      }
    });
  });

  proc.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    text.split(/\r?\n/).forEach(line => {
      if (!line) return;
      if (run.noValidationLogs && (
        line.includes('Expected required property') ||
        line.includes('validation.md') ||
        line.includes('validation fails') ||
        line.includes('ScreenerResult') ||
        line.includes('YahooNumber') ||
        line.includes('Expected union value') ||
        line.includes('/criteriaMeta/criteria') ||
        line.includes('This may happen intermittently') ||
        line.includes('yahoo-finance2 v')
      )) {
        return;
      }
      run.log.push(line);
    });
  });

  proc.on('exit', (code) => {
    run.status = code === 0 ? 'done' : (run.stoppedByUser ? 'stopped' : 'error');
    run.endedAt = Date.now();
  });

  res.json({ runId, suggestedCsv: outPath });
});

app.get('/api/status/:runId', (req, res) => {
  const run = runs.get(req.params.runId);
  if (!run) return res.status(404).json({ error: 'not_found' });
  res.json({ status: run.status, progress: run.progress, logLines: run.log.slice(-200), outCsv: run.outCsv });
});

app.get('/api/stream/:runId', (req, res) => {
  const run = runs.get(req.params.runId);
  if (!run) return res.status(404).end();
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Initial state
  send('status', { status: run.status, progress: run.progress });
  send('log', { lines: run.log.slice(-50) });

  const iv = setInterval(() => {
    const r = runs.get(req.params.runId);
    if (!r) return;
    send('status', { status: r.status, progress: r.progress });
    const lines = r.log.splice(0, r.log.length); // flush
    if (lines.length) send('log', { lines });
    const endStatuses = ['done','error','stopped'];
    if (endStatuses.includes(r.status)) {
      send('done', { outCsv: r.outCsv, endedAt: r.endedAt });
      clearInterval(iv);
      res.end();
    }
  }, 1000);
});

app.get('/api/download/:runId', (req, res) => {
  const run = runs.get(req.params.runId);
  if (!run) return res.status(404).json({ error: 'not_found' });
  const p = run.outCsv;
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'file_not_ready' });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${path.basename(p)}"`);
  fs.createReadStream(p).pipe(res);
});

// Chave opcional para Alpha Vantage (fallback)
const ALPHAVANTAGE_KEY = process.env.ALPHA_VANTAGE_API_KEY || process.env.ALPHAVANTAGE_API_KEY;

// Função auxiliar: obter intraday da Alpha Vantage quando Yahoo falhar ou limitar
async function alphaVantageIntraday(ticker, range, interval) {
  try {
    if (!ALPHAVANTAGE_KEY) return null;
    const map = { '1m': '1min', '2m': '1min', '5m': '5min', '15m': '15min', '30m': '30min', '60m': '60min' };
    const avInterval = map[interval] || '1min';
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${encodeURIComponent(ticker)}&interval=${avInterval}&outputsize=full&apikey=${ALPHAVANTAGE_KEY}`;
    const resp = await (globalThis.fetch ? fetch(url) : Promise.reject(new Error('fetch_unavailable')));
    if (!resp || !resp.ok) return null;
    const json = await resp.json();
    const key = Object.keys(json).find(k => k.toLowerCase().includes('time series') && k.toLowerCase().includes(avInterval));
    const seriesObj = key ? json[key] : null;
    if (!seriesObj || typeof seriesObj !== 'object') return null;
    const now = Date.now();
    const rangeDays = (r) => (r === '1d' ? 1 : (r === '5d' ? 5 : 5));
    const cutoffMs = now - rangeDays(range) * 86400000;
    const out = [];
    for (const [tsStr, vals] of Object.entries(seriesObj)) {
      const tsMs = new Date(tsStr).getTime();
      if (!tsMs || tsMs < cutoffMs) continue;
      const o = Number(vals['1. open']);
      const h = Number(vals['2. high']);
      const l = Number(vals['3. low']);
      const c = Number(vals['4. close']);
      const v = Number(vals['5. volume']);
      if (Number.isNaN(c)) continue;
      out.push({ ts: tsMs, date: new Date(tsMs).toISOString(), open: o, high: h, low: l, close: c, volume: v });
    }
    out.sort((a,b) => a.ts - b.ts);
    return { interval: avInterval, series: out };
  } catch (e) {
    return null;
  }
}

// New: Chart API for intraday/daily historical data
app.get('/api/chart', async (req, res) => {
  try {
    const ticker = String(req.query.ticker || '').trim().toUpperCase();
    let range = String(req.query.range || '1d').trim().toLowerCase();
    let interval = String(req.query.interval || '').trim().toLowerCase();
    const autoParam = String(req.query.auto || '').trim().toLowerCase();
    const autoInterval = autoParam ? ['true','1','yes'].includes(autoParam) : (!req.query.interval);
    if (!ticker) return res.status(400).json({ error: 'missing_ticker' });
    if (range === '1m') range = '1mo';
    if (!interval) {
      if (range === '1d') interval = '1m';
      else if (range === '5d') interval = '5m';
      else interval = '1d';
    }
    let result;
    let series = [];
    let provider = 'yahoo_finance';
    const buildSeriesFromChart = (chartResult) => {
      const out = [];
      const timestamps = chartResult?.timestamp || chartResult?.chart?.result?.[0]?.timestamp || [];
      const quote = chartResult?.indicators?.quote?.[0] || chartResult?.chart?.result?.[0]?.indicators?.quote?.[0] || {};
      for (let i = 0; i < timestamps.length; i++) {
        const ts = Number(timestamps[i]) * 1000;
        const o = quote.open?.[i];
        const h = quote.high?.[i];
        const l = quote.low?.[i];
        const c = quote.close?.[i];
        const v = quote.volume?.[i];
        if (c == null || Number.isNaN(c)) continue;
        out.push({ ts, date: new Date(ts).toISOString(), open: o, high: h, low: l, close: c, volume: v });
      }
      out.sort((a,b) => a.ts - b.ts);
      return out;
    };
    try {
      result = await yf.chart(ticker, { range, interval, includePrePost: true });
      series = buildSeriesFromChart(result);
      const isIntra = (range === '1d' || range === '5d');
      const candidates = isIntra
        ? (range === '1d' ? ['1m','2m','5m','15m','30m','60m'] : ['1m','5m','15m','30m','60m'])
        : [];
      // Ajuste: se intraday retornar poucos pontos, tentar intervalos alternativos automaticamente
      const minThreshold = (range === '1d' ? 100 : (range === '5d' ? 200 : 0));
      if (isIntra && (autoInterval || series.length < minThreshold)) {
        let best = { interval, series, raw: result };
        for (const cand of candidates) {
          try {
            const r = await yf.chart(ticker, { range, interval: cand, includePrePost: true });
            const s = buildSeriesFromChart(r);
            if ((s || []).length > (best.series || []).length) {
              best = { interval: cand, series: s, raw: r };
            }
          } catch {}
        }
        interval = best.interval;
        series = best.series;
        result = best.raw;
      }
      const tsArr = result?.timestamp || result?.chart?.result?.[0]?.timestamp || [];
      const quote = result?.indicators?.quote?.[0] || result?.chart?.result?.[0]?.indicators?.quote?.[0] || {};
      const closes = quote?.close || [];
      const nullCloseCount = (closes || []).filter(c => c == null || Number.isNaN(c)).length;
      const validCloseCount = (closes || []).length - nullCloseCount;
      req._chartDebug = {
        rawTimestampCount: (tsArr || []).length,
        rawCloseCount: (closes || []).length,
        nullCloseCount,
        validCloseCount,
        intervalRequested: String(req.query.interval || ''),
        autoApplied: Boolean(isIntra && (autoInterval || series.length < minThreshold)),
        rawTimestamps: tsArr,
        rawCloses: closes,
        provider,
      };

      // Fallback para Alpha Vantage se intraday continuar com poucos pontos
      if (isIntra && series.length <= 2) {
        const av = await alphaVantageIntraday(ticker, range, interval);
        if (av && (av.series || []).length > series.length) {
          provider = 'alpha_vantage';
          series = av.series;
          interval = av.interval;
          req._chartDebug.provider = provider;
          req._chartDebug.alphaInterval = av.interval;
          req._chartDebug.alphaCount = av.series.length;
        }
      }
    } catch (primaryErr) {
      // Fallback: daily historical
      try {
        const now = new Date();
        let period1 = new Date(now.getTime() - 7 * 86400000); // default 7d
        const rangeDays = (r) => {
          if (r === '1d') return 1; if (r === '5d') return 5; if (r === '1mo') return 30; if (r === '6mo') return 180; if (r === '1y') return 365; return 180;
        };
        if (range === 'ytd') {
          period1 = new Date(now.getFullYear(), 0, 1);
        } else {
          period1 = new Date(now.getTime() - rangeDays(range) * 86400000);
        }
        const hist = await yf.historical(ticker, { period1, period2: now });
        series = (hist || []).map(pt => ({ ts: new Date(pt.date).getTime(), date: new Date(pt.date).toISOString(), close: pt.close, volume: pt.volume }));
        // Ensure ascending order
        series.sort((a,b) => a.ts - b.ts);
        // Metadados simplificados para histórico diário
        req._chartDebug = {
          rawTimestampCount: (series || []).length,
          rawCloseCount: (series || []).length,
          nullCloseCount: 0,
          validCloseCount: (series || []).length,
          intervalRequested: String(req.query.interval || ''),
          autoApplied: false,
          provider: 'yahoo_finance',
        };
      } catch (fallbackErr) {
        throw primaryErr; // original error
      }
    }
    res.json({ ticker, range, interval, provider, count: series.length, series, debug: req._chartDebug });
  } catch (err) {
    res.status(500).json({ error: 'chart_error', message: err?.message || String(err) });
  }
});

// Serve built frontend (Vite dist) under configurable base only in production
try {
  const distDir = path.resolve(process.cwd(), 'dist');
  const shouldServeDist = (process.env.NODE_ENV === 'production') || (String(process.env.SERVE_DIST).toLowerCase() === 'true');
  const BASE = (process.env.VITE_BASE_PATH || '/stocksUI/').replace(/\/+$/, '');
  if (shouldServeDist && fs.existsSync(distDir)) {
    app.use(BASE, express.static(distDir));
    // SPA entry for main app
    app.get(BASE, (req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });

    // Explicit mappings for secondary entry and favicon
    app.get(`${BASE}/INDEX2.html`, (req, res) => {
      res.sendFile(path.join(distDir, 'INDEX2.html'));
    });
    app.get(`${BASE}/favicon.svg`, (req, res) => {
      res.sendFile(path.join(distDir, 'favicon.svg'));
    });
  }
} catch {}

const argPort = (process.argv.find(a => a.startsWith('--port=')) || '').split('=')[1];
const argHost = (process.argv.find(a => a.startsWith('--host=')) || '').split('=')[1];
const PORT = Number(process.env.PORT || argPort || 3001);
const HOST = process.env.HOST || process.env.BIND_ADDR || argHost || '0.0.0.0';
const server = app.listen(PORT, HOST, () => {
  const addr = server.address();
  if (typeof addr === 'string') {
    console.log('Server listening', addr);
  } else {
    console.log('Server listening', { host: addr.address, port: addr.port });
  }
});

app.get('/api/latest-csv', (req, res) => {
  try {
    const dir = process.cwd();
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const csvs = entries
      .filter((e) => e.isFile() && e.name.endsWith('.csv') && e.name.startsWith('Comprehensive_'))
      .map((e) => {
        const p = path.resolve(dir, e.name);
        const st = fs.statSync(p);
        return { name: e.name, path: p, mtimeMs: st.mtimeMs };
      });
    if (csvs.length === 0) return res.status(404).json({ error: 'no_csv_found' });
    csvs.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const top = csvs[0];
    const text = fs.readFileSync(top.path, 'utf8');
    res.json({ filename: top.name, mtimeMs: top.mtimeMs, text });
  } catch (err) {
    res.status(500).json({ error: 'latest_csv_error', message: err?.message || String(err) });
  }
});

app.post('/api/pause/:runId', (req, res) => {
  const run = runs.get(req.params.runId);
  if (!run || !run.proc) return res.status(404).json({ error: 'not_found' });
  try {
    run.proc.kill('SIGSTOP');
    run.status = 'paused';
    run.pausedAt = Date.now();
    res.json({ ok: true, status: run.status });
  } catch (err) {
    res.status(500).json({ error: 'pause_failed', message: err?.message || String(err) });
  }
});

app.post('/api/resume/:runId', (req, res) => {
  const run = runs.get(req.params.runId);
  if (!run || !run.proc) return res.status(404).json({ error: 'not_found' });
  try {
    run.proc.kill('SIGCONT');
    run.status = 'running';
    run.resumedAt = Date.now();
    res.json({ ok: true, status: run.status });
  } catch (err) {
    res.status(500).json({ error: 'resume_failed', message: err?.message || String(err) });
  }
});

app.post('/api/stop/:runId', (req, res) => {
  const run = runs.get(req.params.runId);
  if (!run || !run.proc) return res.status(404).json({ error: 'not_found' });
  try {
    run.stoppedByUser = true;
    run.proc.kill('SIGTERM');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'stop_failed', message: err?.message || String(err) });
  }
});

// New: Quote Summary / Analysis API
app.get('/api/analysis/:ticker', async (req, res) => {
  try {
    const raw = String(req.params.ticker || '').trim();
    const ticker = raw.toUpperCase();
    if (!ticker) return res.status(400).json({ error: 'missing_ticker' });

    const cached = analysisCache.get(ticker);
    const now = Date.now();
    if (cached && (now - cached.ts) < (cached.ttlMs || ANALYSIS_TTL_MS)) {
      return res.json({ ticker, cached: true, ...cached.data });
    }

    const modules = [
      'price',
      'financialData',
      'defaultKeyStatistics',
      'recommendationTrend',
      'earnings',
      'earningsHistory',
      'earningsTrend',
      'incomeStatementHistory'
    ];
    const q = await yf.quoteSummary(ticker, { modules, validateResult: false });

    const price = q?.price || {};
    const fd = q?.financialData || {};
    const ks = q?.defaultKeyStatistics || {};
    const rtAll = (q?.recommendationTrend?.trend || []);
    const rt = rtAll[0] || {};
    const eh = q?.earningsHistory?.history || [];
    const et = q?.earningsTrend?.trend || [];
    const ish = (q?.incomeStatementHistory?.incomeStatementHistory || []);

    // EPS summary (latest estimates and actuals)
    const eps = {
      trailingEPS: ks.trailingEps ?? null,
      forwardEPS: ks.forwardEps ?? null,
      currentQuarterEstimate: et[0]?.epsTrend?.current?.raw ?? et[0]?.epsForward?.raw ?? null,
      nextQuarterEstimate: et[0]?.epsTrend?.nextQuarter?.raw ?? et[1]?.epsForward?.raw ?? null,
      lastActual: eh[0]?.epsActual ?? null,
      lastQuarter: eh[0]?.quarter ?? null
    };

    // Revenue vs Earnings: last 4 entries
    const revenueVsEarnings = (ish || []).slice(0,4).map((row, idx) => ({
      quarterIndex: idx,
      revenue: row?.totalRevenue?.raw ?? row?.totalRevenue ?? null,
      earnings: row?.netIncome?.raw ?? row?.netIncome ?? null,
      period: row?.endDate?.fmt || row?.endDate || null
    }));

    // Analyst recommendations (latest snapshot)
    const recommendations = {
      strongBuy: rt.strongBuy ?? 0,
      buy: rt.buy ?? 0,
      hold: rt.hold ?? 0,
      sell: rt.sell ?? 0,
      strongSell: rt.strongSell ?? 0,
      period: rt.period || null
    };

    // Recommendation trend (last up to 4 entries)
    const recommendationTrend = (rtAll || []).slice(0,4).map(e => ({
      period: e?.period || null,
      strongBuy: e?.strongBuy ?? 0,
      buy: e?.buy ?? 0,
      hold: e?.hold ?? 0,
      sell: e?.sell ?? 0,
      strongSell: e?.strongSell ?? 0,
    }));

    // Market cap (prefer raw where available)
    const marketCap = (
      ks?.marketCap?.raw ??
      ks?.marketCap ??
      price?.marketCap?.raw ??
      price?.marketCap ?? null
    );

    // Price targets
    const targets = {
      average: fd.targetMeanPrice ?? null,
      low: fd.targetLowPrice ?? null,
      high: fd.targetHighPrice ?? null,
      current: price.regularMarketPrice ?? null
    };

    const metrics = { marketCap };
    const mapped = { ticker, eps, revenueVsEarnings, recommendations, recommendationTrend, targets, metrics };
    analysisCache.set(ticker, { ts: now, ttlMs: ANALYSIS_TTL_MS, data: mapped });
    return res.json(mapped);
  } catch (err) {
    console.error('[analysis] error', err?.message || err);
    return res.status(500).json({ error: 'analysis_failed', message: err?.message || String(err) });
  }
});