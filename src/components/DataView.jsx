import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Line, LineChart, Customized } from 'recharts';
import { useTranslation } from 'react-i18next';

const RANGE_OPTIONS = ['1d', '5d', '1m', '1y', 'ytd'];
const INTRADAY_INTERVALS = ['1m','2m','5m','15m','30m','60m'];
const DAILY_INTERVALS = ['1d','1wk','1mo'];

function formatTime(ts, range) {
  const d = new Date(ts);
  if (range === '1d' || range === '5d') {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  // Retorna formato YYYY-MM-DD
  return d.toISOString().split('T')[0];
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    return d.toISOString().split('T')[0];
  } catch {
    return dateStr;
  }
}

function computeSMA(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    const v = Number(values[i]);
    if (Number.isFinite(v)) sum += v; else sum += 0;
    if (i >= period) {
      const old = Number(values[i - period]);
      sum -= Number.isFinite(old) ? old : 0;
    }
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function computeEMA(values, period) {
  const out = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    const v = Number(values[i]);
    if (!Number.isFinite(v)) { out[i] = prev; continue; }
    if (prev == null) {
      const window = values.slice(0, Math.min(period, i + 1)).map(Number).filter(Number.isFinite);
      prev = window.length > 0 ? (window.reduce((a,b)=>a+b,0) / window.length) : v;
    } else {
      prev = (v * k) + (prev * (1 - k));
    }
    out[i] = prev;
  }
  return out;
}

function CandleLayer(props) {
  const { xAxisMap, yAxisMap, offset, chartData = [], xKey = 'ts' } = props || {};
  const data = chartData.length ? chartData : (props?.data || []);
  const xAxis = Object.values(xAxisMap || {})[0];
  const yAxis = Object.values(yAxisMap || {})[0];
  const xScale = xAxis?.scale; const yScale = yAxis?.scale;
  if (typeof xScale !== 'function' || typeof yScale !== 'function') return null;
  const upColor = '#10b981';
  const downColor = '#ef4444';
  const xBand = typeof xScale.bandwidth === 'function' ? xScale.bandwidth() : 0;
  const defaultBodyWidth = 6;
  return (
    <g>
      {data.map((d, idx) => {
        const xVal = d?.[xKey];
        if (!Number.isFinite(xVal)) return null;
        const xStart = xScale(xVal);
        if (!Number.isFinite(xStart)) return null;
        let bodyWidth = defaultBodyWidth;
        if (xBand) {
          bodyWidth = Math.max(2, Math.floor(xBand * 0.6));
        } else {
          const nextVal = data[idx+1]?.[xKey];
          const prevVal = data[idx-1]?.[xKey];
          const nextX = Number.isFinite(nextVal) ? xScale(nextVal) : null;
          const prevX = Number.isFinite(prevVal) ? xScale(prevVal) : null;
          const step = nextX != null ? (nextX - xStart) : (prevX != null ? (xStart - prevX) : null);
          if (Number.isFinite(step)) bodyWidth = Math.max(2, Math.floor(Math.abs(step) * 0.6));
        }
        const xCenter = xStart + (xBand ? xBand / 2 : 0) + (offset?.left || 0);
        const o = Number(d.open); const h = Number(d.high); const l = Number(d.low); const c = Number(d.close);
        if (![o,h,l,c].every(Number.isFinite)) return null;
        const yOpen = yScale(o) + (offset?.top || 0);
        const yClose = yScale(c) + (offset?.top || 0);
        const yHigh = yScale(h) + (offset?.top || 0);
        const yLow = yScale(l) + (offset?.top || 0);
        const color = c >= o ? upColor : downColor;
        const bodyTop = Math.min(yOpen, yClose);
        const bodyHeight = Math.abs(yClose - yOpen);
        return (
          <g key={idx}>
            <line x1={xCenter} x2={xCenter} y1={yHigh} y2={yLow} stroke={color} strokeWidth={1} />
            <rect x={xCenter - bodyWidth/2} y={bodyTop} width={Math.max(bodyWidth, 1)} height={Math.max(bodyHeight, 1)} fill={color} opacity={0.85} />
          </g>
        );
      })}
    </g>
  );
}

export default function DataView({ ticker }) {
  const { t } = useTranslation();
  const [range, setRange] = useState('1d');
  const [interval, setIntervalValue] = useState('1m');
  const [chartType, setChartType] = useState('mountain');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [series, setSeries] = useState([]);
  const [lastTimestamp, setLastTimestamp] = useState(null);
  const [showEMA, setShowEMA] = useState(true);
  const [showSMA, setShowSMA] = useState(true);
  const [emaPeriod, setEmaPeriod] = useState(20);
  const [smaPeriod, setSmaPeriod] = useState(50);
  const pollRef = useRef(null);
  const fileInputRef = useRef(null);

  // New: sub-tabs for Graphs and Analysis
  const [activeTab, setActiveTab] = useState('graphs');
  const [analysis, setAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  function formatNum(v) {
    if (v == null) return '-';
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    const abs = Math.abs(n);
    if (abs >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return n.toFixed(2);
  }

  const title = useMemo(() => ticker ? `DATA VIEW: ${ticker}` : 'DATA VIEW', [ticker]);

  const [serverMeta, setServerMeta] = useState({ count: 0, intervalUsed: null, rawTimestampCount: 0, rawCloseCount: 0, nullCloseCount: 0, validCloseCount: 0 });
  async function fetchChart(tk = ticker, rg = range, itv = interval) {
    if (!tk) return;
    try {
      setLoading(true);
      setError('');
      // Force development API base - direct call to backend
      const API_BASE = 'http://localhost:3002';
      const auto = (itv && String(itv).length > 0) ? 'false' : 'true';
      const url = `${API_BASE}/api/chart?ticker=${encodeURIComponent(tk)}&range=${encodeURIComponent(rg)}&interval=${encodeURIComponent(itv || '')}&auto=${auto}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      
      // Atualiza sempre a série; removido skip por timestamp
      setSeries(json.series || []);
      setLastTimestamp(json.series && json.series.length > 0 ? json.series[json.series.length - 1].ts : null);
      setServerMeta({ 
        count: (json.series || []).length, 
        intervalUsed: String(json.interval || itv),
        rawTimestampCount: Number(json?.debug?.rawTimestampCount ?? 0),
        rawCloseCount: Number(json?.debug?.rawCloseCount ?? 0),
        nullCloseCount: Number(json?.debug?.nullCloseCount ?? 0),
        validCloseCount: Number(json?.debug?.validCloseCount ?? 0),
        intervalRequested: String(json?.debug?.intervalRequested ?? ''),
        autoApplied: Boolean(json?.debug?.autoApplied ?? false),
      });
      console.debug('Chart debug', { tk, rg, itv, debug: json?.debug });
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const isIntra = range === '1d' || range === '5d';
    const defaultInterval = isIntra ? '1m' : '1d';
    if (!isIntra && INTRADAY_INTERVALS.includes(interval)) setIntervalValue(defaultInterval);
    if (isIntra && !INTRADAY_INTERVALS.includes(interval)) setIntervalValue('1m');
  }, [range]);

  useEffect(() => {
    fetchChart();
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    const isIntra = range === '1d' || range === '5d';
    if (ticker && isIntra) {
      const ms = interval === '1m' ? 30_000 : 60_000;
      pollRef.current = window.setInterval(() => fetchChart(), ms);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [ticker, range, interval]);

  const chartData = useMemo(() => {
    const base = (series || []).map(d => ({
      timeLabel: formatTime(d.ts, range),
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      volume: d.volume,
      ts: d.ts,
    }));
    const closes = base.map(b => b.close);
    const sma = showSMA ? computeSMA(closes, smaPeriod) : [];
    const ema = showEMA ? computeEMA(closes, emaPeriod) : [];
    return base.map((b, i) => ({ 
      ...b, 
      sma: showSMA ? sma[i] : null, 
      ema: showEMA ? ema[i] : null 
    }));
  }, [series, range, showSMA, showEMA, smaPeriod, emaPeriod]);

  const isIntra = range === '1d' || range === '5d';
  const intervalOptions = isIntra ? INTRADAY_INTERVALS : DAILY_INTERVALS;

  async function handleImportCsv(file) {
    try {
      const text = await file.text();
      const lines = text.trim().split(/\r?\n/);
      if (!lines.length) return;
      const header = lines[0].split(',').map(h => h.trim().toLowerCase());
      const findIdx = (name) => header.findIndex(h => h === name);
      const idxTs = findIdx('ts');
      const idxOpen = findIdx('open');
      const idxHigh = findIdx('high');
      const idxLow = findIdx('low');
      const idxClose = findIdx('close');
      const idxVol = findIdx('volume');
  
      const parsed = lines.slice(1).map(line => {
        const cols = line.split(',');
        const tsVal = cols[idxTs] ?? cols[0];
        return {
          ts: tsVal ? Number(tsVal) : null,
          open: idxOpen >= 0 ? Number(cols[idxOpen]) : undefined,
          high: idxHigh >= 0 ? Number(cols[idxHigh]) : undefined,
          low: idxLow >= 0 ? Number(cols[idxLow]) : undefined,
          close: idxClose >= 0 ? Number(cols[idxClose]) : undefined,
          volume: idxVol >= 0 ? Number(cols[idxVol]) : undefined,
        };
      }).filter(d => typeof d.ts === 'number' && !Number.isNaN(d.ts));
  
      setSeries(parsed);
      setLastTimestamp(parsed.length ? parsed[parsed.length - 1].ts : null);
      setServerMeta(prev => ({
        ...prev,
        count: parsed.length,
        intervalUsed: 'local-csv',
      }));
      setError('');
    } catch (e) {
      setError(e?.message || 'CSV inválido');
    }
  }

  const candleTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const p = payload[0]?.payload || {};
      const up = Number(p.close) >= Number(p.open);
      const label = formatTime(p.ts, range);
      return (
        <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 6, padding: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '4px 12px', fontSize: 12 }}>
            <span>Open</span><span style={{ color: '#374151' }}>{p.open ?? '-'}</span>
            <span>High</span><span style={{ color: '#374151' }}>{p.high ?? '-'}</span>
            <span>Low</span><span style={{ color: '#374151' }}>{p.low ?? '-'}</span>
            <span>Close</span><span style={{ color: up ? '#10b981' : '#ef4444' }}>{p.close ?? '-'}</span>
            <span>Volume</span><span style={{ color: '#374151' }}>{p.volume ?? '-'}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  // Analysis: fetch when tab active
  async function fetchAnalysisData(forceRefresh = false) {
    if (!ticker) return;
    try {
      setAnalysisLoading(true);
      setAnalysisError('');
      // Force development API base - direct call to backend
      const API_BASE = 'http://localhost:3002';
      const url = `${API_BASE}/api/analysis/${encodeURIComponent(ticker)}${forceRefresh ? '?refresh=1' : ''}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      setAnalysis(json);
    } catch (err) {
      setAnalysisError(err?.message || String(err));
    } finally {
      setAnalysisLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === 'analysis' && ticker) fetchAnalysisData();
  }, [activeTab, ticker]);

  return (
    <div style={{ padding: '8px' }}>
      {/* Sub-menu tabs */}
      <div className="relative flex items-center justify-start mb-2">
        <div className="flex space-x-1 overflow-x-auto no-scrollbar">
          <div
            role="button"
            tabIndex={0}
            onClick={()=>setActiveTab('graphs')}
            className={`chrome-tab ${activeTab==='graphs' ? 'active' : ''}`}
          >
            <div className="favicon">📈</div>
            <div className="title">{t('dataView.tabs.graphs','Graphs')}</div>
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={()=>setActiveTab('analysis')}
            className={`chrome-tab ${activeTab==='analysis' ? 'active' : ''}`}
          >
            <div className="favicon">🧠</div>
            <div className="title">{t('dataView.tabs.analysis','Analysis')}</div>
          </div>
        </div>
      </div>
      <div className="chrome-tab-panel">
      {/* Header title and controls only for Graphs */}
      {activeTab === 'graphs' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <h3 style={{ margin: 0 }}>{title}</h3>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' }}>
              <label style={{ fontSize: 12, color: '#555' }}>Tipo:</label>
              <select value={chartType} onChange={(e)=>setChartType(e.target.value)} style={{ padding: '6px', borderRadius: 4, border: '1px solid #ccc' }}>
                <option value="mountain">Mountain</option>
                <option value="line">Linha</option>
                <option value="candlestick">Candlestick (OHLC)</option>
              </select>
              {RANGE_OPTIONS.map(opt => (
                <button
                  key={opt}
                  onClick={() => setRange(opt)}
                  className={`chrome-pill-btn text-xs ${range === opt ? 'ring-2 ring-blue-500' : ''}`}
                >{opt}</button>
              ))}
              <label style={{ fontSize: 12, color: '#555' }}>Intervalo:</label>
              <select value={interval} onChange={(e)=>setIntervalValue(e.target.value)} style={{ padding: '6px', borderRadius: 4, border: '1px solid #ccc' }}>
                {intervalOptions.map(it => (
                  <option key={it} value={it}>{it}</option>
                ))}
              </select>
              <button
                className="chrome-pill-btn text-xs"
                disabled={!ticker || loading}
                onClick={() => fetchChart()}
              >
                {t('dataView.graphs.refresh','Refresh')}
              </button>
            </div>
          </div>

          {/* Indicator Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '12px' }}>
            <label style={{ color: '#555' }}>{t('dataView.indicators')}</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input type="checkbox" checked={showEMA} onChange={(e)=>setShowEMA(e.target.checked)} />
              <span>{t('dataView.ema')}</span>
              <select value={emaPeriod} onChange={(e)=>setEmaPeriod(Number(e.target.value))} disabled={!showEMA} style={{ padding: '2px 4px', borderRadius: 3, border: '1px solid #ccc', fontSize: '11px' }}>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={200}>200</option>
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input type="checkbox" checked={showSMA} onChange={(e)=>setShowSMA(e.target.checked)} />
              <span>{t('dataView.sma')}</span>
              <select value={smaPeriod} onChange={(e)=>setSmaPeriod(Number(e.target.value))} disabled={!showSMA} style={{ padding: '2px 4px', borderRadius: 3, border: '1px solid #ccc', fontSize: '11px' }}>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={200}>200</option>
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <button className="chrome-pill-btn text-xs" onClick={() => fileInputRef.current?.click()}>Import local CSV</button>
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportCsv(f); e.target.value=''; }} />
          </div>
          {!ticker && (
            <div style={{ color: '#777', marginBottom: '12px' }}>{t('dataView.selectTickerHint')}</div>
          )}
          {error && (
            <div style={{ color: 'crimson', marginBottom: '12px' }}>{t('dataView.errorLoadingChart')}: {error}</div>
          )}

          {/* Charts */}
          <div style={{ height: '460px', border: '1px solid #ddd', borderRadius: 6 }}>
            {/* Main Price Chart - 70% height */}
            <div style={{ height: '70%', borderBottom: '1px solid #eee' }}>
              {chartData.length > 0 && (
                <ResponsiveContainer width="100%" height="100%">
                  {chartType === 'candlestick' ? (
                    <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis 
                        dataKey="ts" 
                        tick={{ fontSize: 10 }}
                        tickFormatter={(ts) => formatTime(ts, range)}
                      />
                      <YAxis tick={{ fontSize: 10 }} domain={['dataMin - 0.5', 'dataMax + 0.5']} />
                      <Tooltip 
                        labelFormatter={(ts) => formatTime(ts, range)}
                        formatter={(value, name) => [value?.toFixed(2), name]}
                      />
                      <Customized component={CandleLayer} />
                      {showSMA && (
                        <Line type="monotone" dataKey="sma" stroke="#ff7300" strokeWidth={1} dot={false} />
                      )}
                      {showEMA && (
                        <Line type="monotone" dataKey="ema" stroke="#8884d8" strokeWidth={1} dot={false} />
                      )}
                    </ComposedChart>
                  ) : (
                    <AreaChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis 
                        dataKey="ts" 
                        tick={{ fontSize: 10 }}
                        tickFormatter={(ts) => formatTime(ts, range)}
                      />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip 
                        labelFormatter={(ts) => formatTime(ts, range)}
                        formatter={(value, name) => [value?.toFixed(2), name]}
                      />
                      {chartType === 'mountain' ? (
                        <Area 
                          type="monotone" 
                          dataKey="close" 
                          stroke="#8884d8" 
                          fill="url(#colorClose)" 
                          strokeWidth={2}
                        />
                      ) : (
                        <Line type="monotone" dataKey="close" stroke="#8884d8" strokeWidth={2} dot={false} />
                      )}
                      {showSMA && (
                        <Line type="monotone" dataKey="sma" stroke="#ff7300" strokeWidth={1} dot={false} />
                      )}
                      {showEMA && (
                        <Line type="monotone" dataKey="ema" stroke="#8884d8" strokeWidth={1} dot={false} />
                      )}
                      <defs>
                        <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              )}
            </div>
            {/* Volume Chart - 30% height */}
            <div style={{ height: '30%' }}>
              {chartData.length > 0 && (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis 
                      dataKey="ts" 
                      tick={{ fontSize: 10 }}
                      tickFormatter={(ts) => formatTime(ts, range)}
                    />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip 
                      labelFormatter={(ts) => formatTime(ts, range)}
                      formatter={(value) => [value?.toLocaleString(), 'Volume']}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="volume" 
                      stroke="#82ca9d" 
                      fill="#82ca9d" 
                      fillOpacity={0.6}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
          {loading && <div style={{ marginTop: 8, color: '#555' }}>{t('dataView.loading')}</div>}
          <div className="flex items-center gap-3 text-xs text-gray-600 mt-2">
            <span>{t('dataView.points')}: {`${serverMeta.count ?? 0}`}</span>
            <span>• {t('dataView.intervalUsed')}: {`${serverMeta.intervalUsed || interval}`}</span>
            <span>• {t('dataView.rawTs')}: {`${serverMeta.rawTimestampCount ?? 0}`}</span>
            <span>• {t('dataView.rawCloses')}: {`${serverMeta.rawCloseCount ?? 0}`}</span>
            <span>• {t('dataView.nullCloses')}: {`${serverMeta.nullCloseCount ?? 0}`}</span>
            <span>• {t('dataView.validCloses')}: {`${serverMeta.validCloseCount ?? 0}`}</span>
          </div>

          {/* Painel de pontos (1d/5d) */}
          <div style={{ marginTop: 10 }}>
            {isIntra ? (
              <div>
                {/* ... existing points table block ... */}
              </div>
            ) : null}
          </div>
        </>
      )}

      {/* Analysis Tab Content */}
      {activeTab === 'analysis' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <h3 style={{ margin: 0 }}>{title}</h3>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button
                className="chrome-pill-btn text-xs"
                disabled={!ticker || analysisLoading}
                onClick={() => fetchAnalysisData(true)}
              >
                {t('dataView.analysis.refresh','Refresh')}
              </button>
              <span style={{ color: '#666', fontSize: 12 }}>
                {analysisLoading ? t('common.loading','Loading...') : null}
                {analysisError ? `${t('common.error','Error')}: ${analysisError}` : null}
              </span>
            </div>
          </div>
          {!ticker && (
            <div style={{ color: '#777', marginBottom: '12px' }}>{t('dataView.selectTickerHint')}</div>
          )}
          {/* 2x2 grid of analysis cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* EPS */}
            <div className="chrome-card">
              <div className="chrome-card-header">{t('dataView.analysis.epsTitle','Earnings Per Share')}</div>
              <div className="chrome-card-body text-sm">
                <div className="flex flex-col gap-2">
                  <div>Trailing EPS: <strong>{formatNum(analysis?.eps?.trailingEPS)}</strong></div>
                  <div>Forward EPS: <strong>{formatNum(analysis?.eps?.forwardEPS)}</strong></div>
                  <div>Current Q Est.: <strong>{formatNum(analysis?.eps?.currentQuarterEstimate)}</strong></div>
                  <div>Next Q Est.: <strong>{formatNum(analysis?.eps?.nextQuarterEstimate)}</strong></div>
                  <div>Last Actual ({formatDate(analysis?.eps?.lastQuarter)}): <strong>{formatNum(analysis?.eps?.lastActual)}</strong></div>
                </div>
              </div>
            </div>

            {/* Revenue vs Earnings */}
            <div className="chrome-card">
              <div className="chrome-card-header">{t('dataView.analysis.revenueVsEarningsTitle','Revenue vs. Earnings')}</div>
              <div className="chrome-card-body">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left p-2">Period</th>
                      <th className="text-left p-2">Revenue</th>
                      <th className="text-left p-2">Earnings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(analysis?.revenueVsEarnings || []).map((row, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="p-2">{formatDate(row?.period) !== '-' ? formatDate(row?.period) : (row?.period || `Q${row.quarterIndex}`)}</td>
                        <td className="p-2">{formatNum(row?.revenue)}</td>
                        <td className="p-2">{formatNum(row?.earnings)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Analyst Recommendations */}
            <div className="chrome-card">
              <div className="chrome-card-header">{t('dataView.analysis.analystRecommendationsTitle','Analyst Recommendations')}</div>
              <div className="chrome-card-body text-sm">
                <div className="grid grid-cols-5 gap-2 text-center">
                  <div>
                    <div className="text-xs text-gray-600">{t('stockCard.aiRecommendation.strongBuy','Strong Buy')}</div>
                    <div className="text-lg font-semibold text-green-600">{analysis?.recommendations?.strongBuy ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600">{t('stockCard.aiRecommendation.buy','Buy')}</div>
                    <div className="text-lg font-semibold text-green-500">{analysis?.recommendations?.buy ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600">{t('stockCard.aiRecommendation.hold','Hold')}</div>
                    <div className="text-lg font-semibold text-yellow-600">{analysis?.recommendations?.hold ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600">{t('stockCard.aiRecommendation.sell','Sell')}</div>
                    <div className="text-lg font-semibold text-red-600">{analysis?.recommendations?.sell ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600">{t('stockCard.aiRecommendation.strongSell','Strong Sell')}</div>
                    <div className="text-lg font-semibold text-red-700">{analysis?.recommendations?.strongSell ?? 0}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Analyst Price Targets */}
            <div className="chrome-card">
              <div className="chrome-card-header">{t('dataView.analysis.priceTargetsTitle','Analyst Price Targets')}</div>
              <div className="chrome-card-body text-sm">
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div>
                    <div className="text-xs text-gray-600">{t('dataView.analysis.low','Low')}</div>
                    <div className="text-lg font-semibold">{formatNum(analysis?.targets?.low)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600">{t('dataView.analysis.current','Current')}</div>
                    <div className="text-lg font-semibold">{formatNum(analysis?.targets?.current)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600">{t('dataView.analysis.average','Average')}</div>
                    <div className="text-lg font-semibold">{formatNum(analysis?.targets?.average)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600">{t('dataView.analysis.high','High')}</div>
                    <div className="text-lg font-semibold">{formatNum(analysis?.targets?.high)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}