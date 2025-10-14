import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const app = express();
app.use(cors());
app.use(express.json());

const runs = new Map(); // runId -> { status, startedAt, endedAt, outCsv, log: [], progress: {}, proc }

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
    // new advanced toggles
    suppressSurvey = false,
    skipValidation = true,
    noValidationLogs = true,
    minPriceCutoff = 5.00,
    // new: number of stocks to show per Top list
    topRankCount = 10,
    // new: control handling of missing data
    excludeNa = strict, // default to true in production/strict
    minFields = 4,
  } = req.body || {};

  const runId = makeRunId();
  const outPath = path.resolve(process.cwd(), outCsv);

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
    // pass advanced toggles to script
    suppressSurvey ? '--suppress-survey' : '',
    skipValidation ? '--skip-validation' : '',
    noValidationLogs ? '--no-validation-logs' : '',
    // new: pass top rank count to script
    `--top-rank-count=${Number(topRankCount)}`,
    // new: missing data handling flags
    excludeNa ? '--exclude-na' : '',
    `--min-fields=${Number(minFields)}`,
  ].filter(Boolean);

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
      if (run.noValidationLogs && (line.includes('Expected required property') || line.includes('validation.md') || line.includes('validation fails') || line.includes('ScreenerResult'))) {
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
    run.log.push(chunk.toString());
  });

  proc.on('exit', (code) => {
    run.status = code === 0 ? 'done' : 'error';
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
    if (r.status !== 'running') {
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

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});