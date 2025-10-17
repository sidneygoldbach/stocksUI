import React, { useEffect, useMemo, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { Rocket, Settings, Gauge, Timer, FileText, RefreshCw, Play } from 'lucide-react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import Papa from 'papaparse';

const defaultConfig = {
  strict: true,
  quiet: true,
  cacheTtlHours: 24,
  jitterMin: 300,
  jitterMax: 450,
  backoffMaxMs: 6000,
  cooldownThreshold: 4,
  cooldownMs: 8000,
  outCsv: '',
  targetCount: 200,
  minPriceCutoff: 5.00,
  // new advanced toggles (default OFF)
  suppressSurvey: false,
  skipValidation: false,
  noValidationLogs: false,
  // new: how many stocks to rank in each Top list at the bottom of CSV
  topRankCount: 10,
  // missing-data handling (advanced)
  excludeNa: false,
  minFields: 0,
  // pré-filtros de geração
  sectorFilters: [],
  industryFilters: [],
};

function suggestCsv() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `Comprehensive_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.csv`;
}

const TabButton = ({ active, onClick, icon: Icon, label }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm font-medium ${
      active ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-700 hover:bg-gray-50'
    }`}
  >
    <Icon className="w-4 h-4" />
    <span>{label}</span>
  </button>
);

const GroupCard = ({ title, children }) => (
  <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
    <h3 className="text-base font-semibold mb-3 text-gray-900">{title}</h3>
    {children}
  </div>
);

const ControlPanel = (props, ref) => {
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('active_tab') || 'geral');
  // Resultado sub-tabs (visual grouping of CSV)
  const RESULT_SUBTABS = ['Financials','Valuation','Growth','Risk','News','Outlook','Other Metrics','Composites'];
  const [resultSubtab, setResultSubtab] = useState(() => localStorage.getItem('result_subtab') || 'Financials');
  const gridApisByGroup = useRef({});
  const gridColsByGroupRef = useRef({});
  const [groupColumnDefs, setGroupColumnDefs] = useState({});
  const [initialSortByGroup, setInitialSortByGroup] = useState({});
  const [header2State, setHeader2State] = useState([]);
  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem('analysis_config');
    const base = saved ? JSON.parse(saved) : defaultConfig;
    // migrate legacy single sectorFilter -> sectorFilters[]
    const migratedSectorFilters = Array.isArray(base.sectorFilters)
      ? base.sectorFilters
      : (base.sectorFilter && base.sectorFilter !== 'all' ? [base.sectorFilter] : []);
    const migratedIndustryFilters = Array.isArray(base.industryFilters) ? base.industryFilters : [];
    return {
      ...base,
      outCsv: base.outCsv || suggestCsv(),
      manualTickers: base.manualTickers || Array(50).fill(''),
      sectorFilters: migratedSectorFilters,
      industryFilters: migratedIndustryFilters,
    };
  });
  const [runId, setRunId] = useState(null);
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState({});
  const [logs, setLogs] = useState([]);
  const logsRef = useRef(null);
  // Auto-scroll para o fim ao receber novas linhas de log
  useEffect(() => {
    const el = logsRef.current;
    if (!el) return;
    try {
      // usar RAF para garantir que o DOM foi pintado
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    } catch {}
  }, [logs]);
  // Persistir aba ativa para restaurar automaticamente a última aba usada
  useEffect(() => {
    if (activeTab) localStorage.setItem('active_tab', activeTab);
  }, [activeTab]);
  // estado para resultado (AG Grid)
  const [gridColumns, setGridColumns] = useState([]);
  const [gridRows, setGridRows] = useState([]);
  const [pinnedBottomRows, setPinnedBottomRows] = useState([]);
  const [gridQuickFilter, setGridQuickFilter] = useState('');
  const gridApiRef = useRef(null);
  const gridColumnApiRef = useRef(null);
  // Setor: coluna detectada e opções
  const [sectorFieldId, setSectorFieldId] = useState(null);
  const [sectorOptions, setSectorOptions] = useState([]);
  // Lista estática de setores para pré-filtro (UI), começa com "All of them"
  const STATIC_SECTORS = useMemo(() => ([
    'Technology',
    'Healthcare',
    'Financial Services',
    'Consumer Discretionary',
    'Communication Services',
    'Industrials',
    'Consumer Staples',
    'Energy',
    'Utilities',
    'Real Estate',
    'Materials'
  ]), []);
  // canonical group mapping for row1
  const CANONICAL_GROUPS = useMemo(() => ({
    Financials: new Set(['Financials','Financial Statements Analysis']),
    Valuation: new Set(['Valuation','Valuation Metrics']),
    Growth: new Set(['Growth','Growth Potential & Competitive Positioning']),
    Risk: new Set(['Risk','Risk Analysis']),
    News: new Set(['News','Recent News & Catalysts']),
    Outlook: new Set(['Outlook','Investment Outlook & Conclusion']),
    Buffett: new Set(['Buffett','Warren Buffett Analysis','Buffet']),
    Technical: new Set(['Technical','Technical Analysis']),
    Sentiment: new Set(['Sentiment','Sentiment Analysis']),
    Extras: new Set(['Extras']),
    Composites: new Set(['Composites']),
  }), []);
  const toCanonicalGroup = (label) => {
    const l = String(label || '').trim();
    for (const [canon, set] of Object.entries(CANONICAL_GROUPS)) {
      if (set.has(l)) return canon;
    }
    return l || '';
  };
  // Heurística de categoria por métrica (para pesos compostos)
  const CATEGORY_KEYS = ['finance','risk','technical','sentiment','news'];
  const CATEGORY_WEIGHTS = {
    ST:        { technical: 0.35, sentiment: 0.25, news: 0.20, finance: 0.15, risk: 0.05 },
    ST_LR:     { technical: 0.30, sentiment: 0.20, news: 0.15, finance: 0.15, risk: 0.20 },
    LT:        { finance: 0.40, risk: 0.20, technical: 0.15, sentiment: 0.10, news: 0.15 },
    LT_LR:     { finance: 0.35, risk: 0.35, technical: 0.10, sentiment: 0.10, news: 0.10 },
  };
  const metricCategory = (groupLabel, metricName) => {
    const g = String(groupLabel || '').toLowerCase();
    const m = String(metricName || '').toLowerCase();
    // defaults by group
    let cat = 'finance';
    if (g.includes('risk')) cat = 'risk';
    else if (g.includes('technical')) cat = 'technical';
    else if (g.includes('sentiment')) cat = 'sentiment';
    else if (g.includes('news') || g.includes('outlook')) cat = 'news';
    else if (g.includes('valuation') || g.includes('growth') || g.includes('financial')) cat = 'finance';
    else if (g.includes('buffett')) cat = 'finance';
    else if (g.includes('extras')) cat = 'finance';
    // overrides by keywords
    if (/(beta|volat|drawdown|risk|debt|liabilit|interest coverage|short interest|lower-better)/.test(m)) cat = 'risk';
    if (/(rsi|macd|sma|ema|adx|stochastic|momentum)/.test(m)) cat = 'technical';
    if (/(sentiment|analyst|recommendation|rating)/.test(m)) cat = 'sentiment';
    if (/(news|catalyst|earnings surprise|guidance|outlook)/.test(m)) cat = 'news';
    if (/(fcf|cash flow|roe|roic|margin|revenue|eps|dividend|pe|p\/e|ev|ebitda|price to book|pb)/.test(m)) cat = 'finance';
    return cat;
  };

  // Recalcular TOP N ao alterar N, dados ou filtro por Setor
  useEffect(() => {
    try {
      if (!header2State?.length || !gridRows?.length) { setPinnedBottomRows([]); return; }
      const header2 = header2State;
      // aplicar filtro por Setor (linhas visíveis) quando houver seleção
      const rowObjs = (() => {
        const filters = Array.isArray(config.sectorFilters) ? config.sectorFilters : [];
        if (sectorFieldId && filters.length) {
          const selected = new Set(filters.map(s => String(s).trim().toLowerCase()));
          return gridRows.filter((r) => {
            const v = r[sectorFieldId];
            if (v == null) return false;
            const val = String(v).trim().toLowerCase();
            return selected.has(val);
          });
        }
        return gridRows;
      })();
      const N = Math.max(1, Number(config.topRankCount) || 1);
      const topPerCol = {};
      // calcula min/max por coluna e normaliza, invertendo para métricas "lower-better"
      for (let i = 2; i < header2.length; i++) {
        let min = Infinity, max = -Infinity;
        const values = [];
        for (let r = 0; r < rowObjs.length; r++) {
          const raw = rowObjs[r][`c${i}`];
          if (raw == null || raw === '') continue;
          let s = String(raw).trim();
          s = s.replace(/%$/, '');
          const num = Number(s);
          if (Number.isFinite(num)) {
            values.push({ r, num });
            if (num < min) min = num;
            if (num > max) max = num;
          }
        }
        const lowerBetter = /lower-better/i.test(String(header2[i] || ''));
        const scores = [];
        for (const { r, num } of values) {
          let norm = 0;
          if (max > min) norm = (num - min) / (max - min);
          else norm = 0; // todos iguais
          if (lowerBetter) norm = 1 - norm;
          const tk = String(rowObjs[r]['c1'] || '').trim();
          scores.push({ tk, v: norm });
        }
        scores.sort((a, b) => b.v - a.v);
        topPerCol[i] = scores.slice(0, N).map(s => s.tk);
      }
      const pinned = [];
      for (let k = 0; k < N; k++) {
        const prow = { c0: `top #${k + 1}` };
        for (let i = 2; i < header2.length; i++) {
          prow[`c${i}`] = (topPerCol[i] && topPerCol[i][k]) ? topPerCol[i][k] : '';
        }
        pinned.push(prow);
      }
      setPinnedBottomRows(pinned);
    } catch {}
  }, [config.topRankCount, gridRows, header2State, sectorFieldId, config.sectorFilters]);

  // Helpers para construir colunas com auto-size baseado em dados
  const isNumeric = (val) => {
    if (val === null || val === undefined) return false;
    if (typeof val === 'number') return true;
    const s = String(val).trim().replace(/%$/,'');
    if (s === '') return false;
    return !isNaN(Number(s));
  };
  const buildColumnDefs = (header2, dataRows, header1Opt) => {
    const cols = header2.map((h, idx) => ({ headerName: String(h || ''), field: `c${idx}`, resizable: true }));
    // detectar tipo de filtro e calcular largura por dados
    const widths = new Array(cols.length).fill(80);
    for (let i = 0; i < cols.length; i++) {
      let maxLen = 4; // mínimo
      let numericCount = 0;
      let sampleCount = 0;
      for (let r = 0; r < dataRows.length; r++) {
        const cell = dataRows[r][i];
        const str = cell == null ? '' : String(cell);
        maxLen = Math.max(maxLen, str.length);
        if (sampleCount < 50) { // limitar custo
          if (isNumeric(cell)) numericCount++;
          sampleCount++;
        }
      }
      // largura estimada: caracteres * 9 + padding
      widths[i] = Math.min(600, Math.max(60, Math.round(maxLen * 9 + 28)));
      const isMostlyNumeric = numericCount >= Math.floor(Math.min(sampleCount, 50) * 0.7);
      cols[i].filter = isMostlyNumeric ? 'agNumberColumnFilter' : 'agTextColumnFilter';
      cols[i].width = widths[i];
    }
    // fixar nomes dos dois primeiros campos caso header2 vazio
    if (header1Opt && cols[0] && !String(cols[0].headerName).trim()) cols[0].headerName = String(header1Opt[0] || 'Company Name');
    if (header1Opt && cols[1] && !String(cols[1].headerName).trim()) cols[1].headerName = String(header1Opt[1] || 'Ticker');
    return cols;
  };

  // Helper: parseia CSV e preenche o grid
  const parseCsvAndSetGrid = (text) => {
    try {
      const parsed = Papa.parse(text, { delimiter: ',', skipEmptyLines: true });
      const rows = parsed.data || [];
      if (rows.length < 4) {
        setLogs((l)=>[...l, 'CSV não possui cabeçalho esperado (3 linhas)']);
        return false;
      }
      const header1 = rows[0];
      const header2 = rows[1];
      const dataRowsRaw = rows.slice(3);
      // Remover linhas 'Top_*' verticais indevidas do final do CSV
      const dataRows = dataRowsRaw.filter((arr) => !(arr && String(arr[0] || '').startsWith('Top_')));
      const cols = buildColumnDefs(header2, dataRows, header1);
      const rowObjs = dataRows.map((arr) => {
        const o = {};
        for (let i=0;i<cols.length;i++) o[`c${i}`] = arr[i] ?? '';
        return o;
      });
      setHeader2State(header2);
      // detectar coluna de setor e coletar opções (suporta 'Sector', 'GICS Sector', 'Industry')
      const norm = (s) => String(s || '').trim().toLowerCase();
      const sectorIdxPrimary = header2.findIndex((h2) => /sector/.test(norm(h2)) || /gics/.test(norm(h2)));
      const sectorIdxFallback = header2.findIndex((h2) => /industry/.test(norm(h2)) || /segment/.test(norm(h2)));
      const sectorIdx = sectorIdxPrimary >= 0 ? sectorIdxPrimary : sectorIdxFallback;
      if (sectorIdx >= 0) {
        const fieldId = `c${sectorIdx}`;
        setSectorFieldId(fieldId);
        const optsSet = new Set();
        for (const r of rowObjs) {
          const v = String(r[fieldId] || '').trim();
          if (v) optsSet.add(v);
        }
        setSectorOptions(Array.from(optsSet).sort((a,b)=>a.localeCompare(b)));
      } else {
        setSectorFieldId(null);
        setSectorOptions([]);
      }
      // mapeamento dos grupos por coluna (linha 1) com faixa contínua
      const groupIndices = {};
      let currentCanon = '';
      for (let i=2;i<header1.length;i++) {
        const raw = String(header1[i] || '').trim();
        if (raw) currentCanon = toCanonicalGroup(raw);
        if (!currentCanon) continue;
        if (!groupIndices[currentCanon]) groupIndices[currentCanon] = [];
        groupIndices[currentCanon].push(i);
      }
      // calcular Composite_Geral
      const compositeIdxs = (groupIndices['Composites'] || []).slice();
      // propriedades por coluna para normalização
      const colProps = header2.map((h2, i) => {
        const s = String(h2 || '').toLowerCase();
        const isScore = s.includes('score') || s.includes('(norm)');
        const lowerBetter = s.includes('lower-better');
        let min = Infinity, max = -Infinity;
        if (!isScore) {
          for (let r=0;r<dataRows.length;r++) {
            const v = parseFloat(dataRows[r][i]);
            if (!isNaN(v)) { min = Math.min(min, v); max = Math.max(max, v); }
          }
        }
        return { isScore, lowerBetter, min, max };
      });
      // índices do conjunto Other Metrics (Buffett + Technical + Sentiment + Extras)
      const otherIdxs = [
        ...(groupIndices['Buffett'] || []),
        ...(groupIndices['Technical'] || []),
        ...(groupIndices['Sentiment'] || []),
        ...(groupIndices['Extras'] || []),
      ];
      // normalização e scores
      const normalizeAt = (i, raw) => {
        const p = colProps[i];
        let v = parseFloat(raw);
        if (isNaN(v)) return null;
        if (p.isScore) {
          v = Math.max(0, Math.min(1, v));
        } else {
          if (isFinite(p.min) && isFinite(p.max) && p.max > p.min) {
            v = (v - p.min) / (p.max - p.min);
          } else {
            // fallback: clamp to [0,1] if seems like percentage
            v = Math.max(0, Math.min(1, v));
          }
        }
        if (p.lowerBetter) v = 1 - v;
        return Math.max(0, Math.min(1, v));
      };
      // compute derived fields per row
      for (let r=0;r<rowObjs.length;r++) {
        // composite geral: média simples dos quatro composites
        let compVals = [];
        for (const i of compositeIdxs) {
          const v = parseFloat(rowObjs[r][`c${i}`]);
          if (!isNaN(v)) compVals.push(v);
        }
        const compMean = compVals.length ? (compVals.reduce((a,b)=>a+b,0)/compVals.length) : 0;
        rowObjs[r].computedComposite = compMean;
        // Other Metrics score: média das métricas normalizadas de Buffett/Technical/Sentiment/Extras
        let otherVals = [];
        for (const i of otherIdxs) {
          const vNorm = normalizeAt(i, rowObjs[r][`c${i}`]);
          if (vNorm != null) otherVals.push(vNorm);
        }
        const otherMean = otherVals.length ? (otherVals.reduce((a,b)=>a+b,0)/otherVals.length) : 0;
        rowObjs[r].computedOtherScore = otherMean;
        // Composite Geral Ponderado (inclui Special e demais grupos via categorias)
        // coleciona valores normalizados por categoria
        const catVals = { finance: [], risk: [], technical: [], sentiment: [], news: [] };
        for (let i=2;i<header2.length;i++) {
          const vNorm = normalizeAt(i, rowObjs[r][`c${i}`]);
          if (vNorm == null) continue;
          const cat = metricCategory(header1[i], header2[i]);
          if (!CATEGORY_KEYS.includes(cat)) continue;
          catVals[cat].push(vNorm);
        }
        const catMeans = Object.fromEntries(CATEGORY_KEYS.map((k)=>{
          const arr = catVals[k];
          const mean = arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length) : 0;
          return [k, mean];
        }));
        const wsum = (W) => {
          let s = 0;
          for (const k of CATEGORY_KEYS) s += (W[k] || 0) * (catMeans[k] || 0);
          return s;
        };
        const cST    = wsum(CATEGORY_WEIGHTS.ST);
        const cSTLR  = wsum(CATEGORY_WEIGHTS.ST_LR);
        const cLT    = wsum(CATEGORY_WEIGHTS.LT);
        const cLTLR  = wsum(CATEGORY_WEIGHTS.LT_LR);
        const compW  = (cST + cSTLR + cLT + cLTLR) / 4;
        rowObjs[r].computedCompositeST = cST;
        rowObjs[r].computedCompositeSTLR = cSTLR;
        rowObjs[r].computedCompositeLT = cLT;
        rowObjs[r].computedCompositeLTLR = cLTLR;
        rowObjs[r].computedCompositeW = compW;
      }
      setGridColumns(cols);
      setGridRows(rowObjs);
      // Construir linhas inferiores fixas (pinned) com Top N por coluna
      try {
        const N = Math.max(1, Number(config.topRankCount) || 1);
        const topPerCol = {};
        for (let i=2;i<header2.length;i++) {
          const scores = [];
          for (let r=0;r<rowObjs.length;r++) {
            const vNorm = normalizeAt(i, rowObjs[r][`c${i}`]);
            if (vNorm == null) continue;
            const tk = String(rowObjs[r]['c1'] || '').trim();
            scores.push({ tk, v: vNorm });
          }
          scores.sort((a,b) => b.v - a.v);
          topPerCol[i] = scores.slice(0, N).map(s => s.tk);
        }
        const pinned = [];
        for (let k=0;k<N;k++) {
          const prow = { c0: `top #${k+1}` };
          for (let i=2;i<header2.length;i++) {
            prow[`c${i}`] = (topPerCol[i] && topPerCol[i][k]) ? topPerCol[i][k] : '';
          }
          pinned.push(prow);
        }
        setPinnedBottomRows(pinned);
      } catch {}
      // construir colunas por grupo para sub-abas
      const nameTickerPinned = [
        {
          headerName: String(header1[0] || 'Company Name'),
          field: 'c0',
          filter: 'agTextColumnFilter',
          pinned: 'left',
          width: 180,
          resizable: true,
        },
        {
          headerName: String(header1[1] || 'Ticker'),
          field: 'c1',
          filter: 'agTextColumnFilter',
          pinned: 'left',
          width: 120,
          resizable: true,
        },
      ];
      const groupDefs = {};
      const initialSort = {};
      const cloneDef = (i) => ({ ...cols[i] });
      const addCommon = (arr) => ([ ...nameTickerPinned, ...arr ]);
      // big groups
      for (const g of ['Financials','Valuation','Growth','Risk','News','Outlook']) {
        const idxs = groupIndices[g] || [];
        const defs = idxs.map((i) => cloneDef(i));
        groupDefs[g] = addCommon(defs);
        const scoreIdx = idxs.find((i)=>String(header2[i] || '').trim().toLowerCase() === 'score');
        initialSort[g] = scoreIdx != null ? `c${scoreIdx}` : null;
      }
      // composites
      {
        const idxs = compositeIdxs || [];
        // Para evitar duplicidade com colunas do CSV, mantemos apenas os dois agregados calculados
        const defs = [
          { headerName: 'Composite_Geral_Ponderado', field: 'computedCompositeW', filter: 'agNumberColumnFilter', resizable: true, width: 190 },
          { headerName: 'Composite_Geral (Igual)', field: 'computedComposite', filter: 'agNumberColumnFilter', resizable: true, width: 170 },
          ...idxs.map((i)=>cloneDef(i))
        ];
        groupDefs['Composites'] = addCommon(defs);
        initialSort['Composites'] = 'computedCompositeW';
      }
      // Other Metrics (Buffett + Technical + Sentiment + Extras)
      {
        const idxs = otherIdxs || [];
        // Helper: detectar coluna "em branco" (sem header significativo E sem dados)
        const isBlankColumn = (i) => {
          const raw = String(header2[i] || '').trim();
          // se o header contém apenas separadores/pontuação, tratar como em branco
          const compact = raw.replace(/[\|–—\-_.\s]/g, '');
          if (raw && compact.length === 0) return true;
          if (raw) return false;
          // header vazio: verificar se há algum dado não vazio
          for (let r=0;r<rowObjs.length;r++) {
            const v = rowObjs[r][`c${i}`];
            if (v != null && String(v).trim() !== '') return false;
          }
          return true;
        };
        // Remover colunas duplicadas de Score, quaisquer "Composite_*" e colunas em branco
        const filteredIdxs = idxs.filter((i) => {
          const h2 = String(header2[i] || '').trim().toLowerCase();
          if (isBlankColumn(i)) return false;
          if (h2.includes('score')) return false; // manter apenas o Score agregado calculado
          if (h2.startsWith('composite')) return false; // composites só no subgrupo Composites
          return true;
        });
        const defs = [
          { headerName: 'Score', field: 'computedOtherScore', filter: 'agNumberColumnFilter', resizable: true, width: 140 },
          ...filteredIdxs.map((i)=>cloneDef(i))
        ];
        groupDefs['Other Metrics'] = addCommon(defs);
        initialSort['Other Metrics'] = 'computedOtherScore';
      }
      setGroupColumnDefs(groupDefs);
      setInitialSortByGroup(initialSort);
      gridColsByGroupRef.current = groupDefs;
      // Ajuste fino de colunas após dados carregados
      setTimeout(() => {
        try {
          // size current tab if available
          const api = gridApisByGroup.current?.[resultSubtab] || gridApiRef.current;
          api?.sizeColumnsToFit();
        } catch {}
      }, 0);
      return true;
    } catch (err) {
      setLogs((l)=>[...l, `Erro ao processar CSV: ${err.message}`]);
      return false;
    }
  };

  // Helper: baixa CSV da última execução e carrega no grid
  const loadLatestRunCsv = async () => {
    if (!runId) return false;
    try {
      const resp = await fetch(`/api/download/${runId}`);
      if (!resp.ok) {
        setLogs((l)=>[...l, `Falha ao baixar CSV: ${resp.status}`]);
        return false;
      }
      const text = await resp.text();
      return parseCsvAndSetGrid(text);
    } catch (err) {
      setLogs((l)=>[...l, `Erro ao baixar CSV: ${err.message}`]);
      return false;
    }
  };

  useEffect(() => {
    localStorage.setItem('analysis_config', JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    if (resultSubtab) localStorage.setItem('result_subtab', resultSubtab);
  }, [resultSubtab]);

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs]);

  // Garantir que os setores selecionados existam nas opções atuais (filtro de exibição)
  useEffect(() => {
    if (sectorOptions.length && Array.isArray(config?.sectorFilters)) {
      const filtered = config.sectorFilters.filter((s) => sectorOptions.includes(s));
      if (filtered.length !== config.sectorFilters.length) {
        setConfig((c) => ({ ...c, sectorFilters: filtered }));
      }
    }
  }, [sectorOptions]);

  // Linhas visíveis conforme filtro por setor
  const visibleRows = useMemo(() => {
    const selected = (config?.sectorFilters || []).map((s) => String(s).trim().toLowerCase());
    if (!sectorFieldId || selected.length === 0) return gridRows;
    return gridRows.filter((r) => {
      const v = r[sectorFieldId];
      if (v == null) return false;
      const val = String(v).trim().toLowerCase();
      return selected.includes(val);
    });
  }, [gridRows, sectorFieldId, config?.sectorFilters]);

  const resetConfig = () => {
    const next = { ...defaultConfig, outCsv: suggestCsv(), manualTickers: Array(50).fill('') };
    setConfig(next);
    localStorage.setItem('analysis_config', JSON.stringify(next));
  };

  const startRun = async () => {
    setStatus('starting');
    // Ir para a aba de Progresso durante a execução
    setActiveTab('progresso');
    const newCsvName = suggestCsv();
    // Atualiza nome do arquivo com data/hora a cada início
    setConfig((prev) => ({ ...prev, outCsv: newCsvName }));
    setLogs((l) => [...l, 'Iniciando análise...', `Arquivo de saída definido: ${newCsvName}`]);
    const resp = await fetch('/api/run-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strict: config.strict,
        quiet: config.quiet,
        cacheTtlHours: Number(config.cacheTtlHours),
        jitterMin: Number(config.jitterMin),
        jitterMax: Number(config.jitterMax),
        backoffMaxMs: Number(config.backoffMaxMs),
        cooldownThreshold: Number(config.cooldownThreshold),
        cooldownMs: Number(config.cooldownMs),
        outCsv: newCsvName,
        targetCount: Number(config.targetCount),
        minPriceCutoff: Number(String(config.minPriceCutoff).replace(',', '.')),
        // pass advanced toggles
        suppressSurvey: !!config.suppressSurvey,
        skipValidation: !!config.skipValidation,
        noValidationLogs: !!config.noValidationLogs,
        manualTickers: (config.manualTickers || []).filter(Boolean).slice(0,50),
        // new param: top rank count
        topRankCount: Number(config.topRankCount),
        // missing-data handling to backend
        excludeNa: !!config.excludeNa,
        minFields: Number(config.minFields),
        // pré-filtros: setores e indústrias (vazios = All of them)
        sectorFilters: Array.isArray(config.sectorFilters) ? config.sectorFilters : [],
        industryFilters: Array.isArray(config.industryFilters) ? config.industryFilters : [],
      })
    });
    const data = await resp.json();
    setRunId(data.runId);
    setStatus('running');
    setLogs((l) => [...l, `Run ID: ${data.runId}`]);
    const es = new EventSource(`/api/stream/${data.runId}`);
    es.addEventListener('status', (e) => {
      const payload = JSON.parse(e.data);
      setProgress(payload.progress || {});
      setStatus(payload.status);
    });
    es.addEventListener('log', (e) => {
      const payload = JSON.parse(e.data);
      setLogs((l) => [...l, ...(payload.lines || [])]);
    });
    es.addEventListener('done', (e) => {
      const payload = JSON.parse(e.data);
      setStatus('done');
      setLogs((l) => [...l, `Finalizado. Arquivo: ${payload.outCsv}`]);
      es.close();
      // Auto-carregar CSV e abrir aba Resultado
      (async () => {
        setLogs((l)=>[...l, 'Carregando CSV para a aba Resultado...']);
        const ok = await loadLatestRunCsv();
        if (ok) {
          setLogs((l)=>[...l, 'CSV carregado. Exibindo Resultado.']);
          setActiveTab('resultado');
        }
      })();
    });
  };
  useImperativeHandle(ref, () => ({ startRun }))

  const progressPct = useMemo(() => {
    if (progress.type === 'processing' && progress.total) {
      return Math.min(100, Math.round((progress.processed / progress.total) * 100));
    }
    if (status === 'done') return 100;
    return 0;
  }, [progress, status]);

  const etaText = useMemo(() => {
    if (status === 'done') return 'Concluído';
    if (progress.type === 'processing' && progress.total) {
      if (progress.processed >= progress.total) return 'Concluído';
      if (progress.processed) {
        const elapsedSec = Math.max(1, Math.round((progress.elapsedMs || 0) / 1000));
        const ratePerSec = progress.processed / elapsedSec; // itens por segundo
        const remaining = Math.max(0, progress.total - progress.processed);
        const etaSec = Math.ceil(remaining / Math.max(0.0001, ratePerSec));
        const mins = Math.floor(etaSec / 60);
        const secs = etaSec % 60;
        return `${mins}m ${secs}s`;
      }
    }
    return 'Calculando...';
  }, [progress, status]);

  return (
    <div className="p-6 space-y-6 bg-white">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">
          Painel de Controle de Análise
        </h1>
        <div className="flex space-x-2">
          <TabButton active={activeTab==='geral'} onClick={()=>setActiveTab('geral')} icon={Gauge} label="Geral" />
          <TabButton active={activeTab==='rede'} onClick={()=>setActiveTab('rede')} icon={Timer} label="Rede & Backoff" />
          <TabButton active={activeTab==='avancado'} onClick={()=>setActiveTab('avancado')} icon={Settings} label="Avançado" />
          <TabButton active={activeTab==='manual'} onClick={()=>setActiveTab('manual')} icon={FileText} label="Manual" />
          {/* novo: aba de progresso no final */}
          <TabButton active={activeTab==='progresso'} onClick={()=>setActiveTab('progresso')} icon={RefreshCw} label="Progresso" />
          {/* nova aba: resultado */}
          <TabButton active={activeTab==='resultado'} onClick={()=>setActiveTab('resultado')} icon={Play} label="Resultado" />
        </div>
      </div>

      {/* Config groups */}
      {activeTab === 'geral' && (
        <GroupCard title="Parâmetros Principais">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-sm md:col-span-3">
              <label className="block font-medium mb-1">Quantidade de stocks subavaliados</label>
              <input type="number" min="1" value={config.targetCount} onChange={(e)=>{
                const next = { ...config, targetCount: Number(e.target.value) };
                setConfig(next);
              }} className="w-40 p-2 rounded-md border" />
              <p className="text-gray-600 text-xs mt-1">Define quantos tickers serão selecionados no relatório (atual: {config.targetCount}).</p>
              {config.targetCount > 500 && (
                <div className="mt-2 p-2 rounded-md bg-yellow-50 border border-yellow-200 text-yellow-700 text-xs">
                  Aviso: valores acima de 500 podem aumentar significativamente o tempo de execução e risco de rate limiting.
                </div>
              )}
            </div>
            <div className="text-sm md:col-span-3">
              <label className="block font-medium mb-1">Preço mínimo para não ser Penny Stock (US$)</label>
              <input
                type="text"
                inputMode="decimal"
                value={String(config.minPriceCutoff)}
                onChange={(e)=>{
                  const raw = e.target.value;
                  const normalized = raw.replace(/,/g, '.').replace(/[^0-9.]/g, '');
                  const nextVal = normalized.length ? parseFloat(normalized) : '';
                  setConfig({ ...config, minPriceCutoff: nextVal });
                }}
                className="w-40 p-2 rounded-md border"
                placeholder="5.00"
              />
              <p className="text-gray-600 text-xs mt-1">Valor de corte para excluir penny stocks (atual: {typeof config.minPriceCutoff === 'number' ? config.minPriceCutoff.toFixed(2) : '5.00'}). Aceita centavos.</p>
            </div>
            {/* Filtro por Setor (pré-análise, multi-seleção) */}
            <div className="text-sm md:col-span-3">
              <label className="block font-medium mb-1">Filtrar por Setor (multi)</label>
              <div className="flex flex-col gap-2 p-2 border rounded-md w-[320px] max-w-full">
                <div className="flex flex-wrap gap-3">
                  {STATIC_SECTORS.map((s) => {
                    const checked = (config.sectorFilters || []).includes(s);
                    return (
                      <label key={s} className="inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const prev = new Set(config.sectorFilters || []);
                            if (e.target.checked) prev.add(s); else prev.delete(s);
                            setConfig({ ...config, sectorFilters: Array.from(prev) });
                          }}
                        />
                        {s}
                      </label>
                    );
                  })}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200"
                    onClick={() => setConfig({ ...config, sectorFilters: [] })}
                  >
                    Clear selection (All of them)
                  </button>
                </div>
              </div>
              <p className="text-gray-600 text-xs mt-1">
                Aplica-se antes de gerar: só inclui tickers dos setores marcados. Sem seleção = All of them (sem filtro).
              </p>
            </div>
            {/* Filtro por Indústria (pré-análise) */}
            <div className="text-sm md:col-span-3">
              <label className="block font-medium mb-1">Filtrar por Indústria</label>
              <input
                type="text"
                placeholder="Ex.: Semiconductors, Software Infrastructure, Banks"
                value={(config.industryFilters || []).join(', ')}
                onChange={(e) => {
                  const arr = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                  setConfig({ ...config, industryFilters: arr });
                }}
                className="w-[360px] max-w-full p-2 rounded-md border"
              />
              <p className="text-gray-600 text-xs mt-1">
                Aplica-se antes de gerar: mantém apenas indústrias informadas (case-insensitive). Vazio = All of them.
              </p>
            </div>
            {/* new: top rank count input */}
            <div className="text-sm md:col-span-3">
              <label className="block font-medium mb-1">Número de stocks rankeados por coluna (Top N)</label>
              <input type="number" min="1" value={config.topRankCount} onChange={(e)=>{
                const n = Math.max(1, Number(e.target.value) || 1);
                setConfig({ ...config, topRankCount: n });
              }} className="w-40 p-2 rounded-md border" />
              <p className="text-gray-600 text-xs mt-1">Controla quantos tickers aparecem nas listas "Top_..." ao final do CSV (atual: {config.topRankCount}).</p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={config.strict} onChange={(e)=>setConfig({...config, strict: e.target.checked})} />
              <span>Modo Estrito</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={config.quiet} onChange={(e)=>setConfig({...config, quiet: e.target.checked})} />
              <span>Modo Silencioso</span>
            </label>
            <div className="text-sm">
              <label className="block font-medium mb-1">TTL do Cache (horas)</label>
              <input type="number" value={config.cacheTtlHours} onChange={(e)=>setConfig({...config, cacheTtlHours: e.target.value})} className="w-full p-2 rounded-md border" />
              <p className="text-gray-600 text-xs mt-1">Tempo de validade para reuso dos resultados.</p>
            </div>
          </div>
        </GroupCard>
      )}

      {activeTab === 'rede' && (
        <GroupCard title="Rede, Jitter e Backoff">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <label className="block font-medium mb-1">Jitter Mínimo (ms)</label>
              <input type="number" value={config.jitterMin} onChange={(e)=>setConfig({...config, jitterMin: e.target.value})} className="w-40 p-2 rounded-md border" />
            </div>
            <div>
              <label className="block font-medium mb-1">Jitter Máximo (ms)</label>
              <input type="number" value={config.jitterMax} onChange={(e)=>setConfig({...config, jitterMax: e.target.value})} className="w-40 p-2 rounded-md border" />
            </div>
            <div>
              <label className="block font-medium mb-1">Backoff Máximo (ms)</label>
              <input type="number" value={config.backoffMaxMs} onChange={(e)=>setConfig({...config, backoffMaxMs: e.target.value})} className="w-40 p-2 rounded-md border" />
            </div>
            <div>
              <label className="block font-medium mb-1">Cooldown Threshold</label>
              <input type="number" value={config.cooldownThreshold} onChange={(e)=>setConfig({...config, cooldownThreshold: e.target.value})} className="w-40 p-2 rounded-md border" />
            </div>
            <div>
              <label className="block font-medium mb-1">Cooldown (ms)</label>
              <input type="number" value={config.cooldownMs} onChange={(e)=>setConfig({...config, cooldownMs: e.target.value})} className="w-40 p-2 rounded-md border" />
            </div>
          </div>
        </GroupCard>
      )}

      {activeTab === 'avancado' && (
        <GroupCard title="Saída e Execução">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <label className="block font-medium mb-1">Nome do CSV</label>
              <input type="text" value={config.outCsv} onChange={(e)=>setConfig({...config, outCsv: e.target.value})} className="w-full p-2 rounded-md border" />
              <p className="text-gray-600 text-xs mt-1">Sugestão automática com data/hora, pode editar.</p>
            </div>
            <div className="flex items-end gap-2">
              <button onClick={resetConfig} className="px-3 py-2 rounded-md bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-medium">
                Resetar
              </button>
              <button onClick={startRun} className="px-4 py-2 rounded-md bg-green-600 hover:bg-green-700 text-white text-sm font-medium">
                Disparar Análise
              </button>
            </div>
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={config.suppressSurvey} onChange={(e)=>setConfig({...config, suppressSurvey: e.target.checked})} />
                <span>Suprimir aviso de survey do Yahoo</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={config.skipValidation} onChange={(e)=>setConfig({...config, skipValidation: e.target.checked})} />
                <span>Desativar validação de resultados</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={config.noValidationLogs} onChange={(e)=>setConfig({...config, noValidationLogs: e.target.checked})} />
                <span>Desligar logs de falhas de validação</span>
              </label>
              {/* Missing-data handling controls */}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={config.excludeNa} onChange={(e)=>setConfig({...config, excludeNa: e.target.checked})} />
                <span>Excluir tickers com dados insuficientes</span>
              </label>
              <div>
                <label className="block font-medium mb-1">Mínimo de campos válidos</label>
                <input type="number" min="0" value={config.minFields} onChange={(e)=>{
                  const n = Math.max(0, Number(e.target.value) || 0);
                  setConfig({ ...config, minFields: n });
                }} className="w-40 p-2 rounded-md border" />
                <p className="text-gray-600 text-xs mt-1">Exige pelo menos N métricas válidas para pontuar e ranquear.</p>
              </div>
            </div>
          </div>
        </GroupCard>
      )}

      {activeTab === 'manual' && (
        <GroupCard title="Tickers Manuais (até 50)">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {config.manualTickers.map((val, idx) => (
              <input
                key={idx}
                type="text"
                value={val}
                onChange={(e)=>{
                  const v = e.target.value.toUpperCase().trim();
                  const next = [...config.manualTickers];
                  next[idx] = v;
                  setConfig({ ...config, manualTickers: next });
                }}
                placeholder={`Ticker ${idx+1}`}
                className="w-full p-2 rounded-md border text-xs"
              />
            ))}
          </div>
          <p className="text-gray-600 text-xs mt-2">Se você preencher ao menos 1 ticker, a análise utilizará somente os tickers informados (máximo 50).</p>
        </GroupCard>
      )}

      {/* Progresso e Logs agora em aba própria */}
      {activeTab === 'progresso' && (
        <>
          <GroupCard title="Progresso da Geração">
            <div className="space-y-3">
              <div className="relative w-full h-5 bg-gray-200 rounded-full overflow-hidden">
                <div className="absolute left-0 top-0 h-full bg-blue-600 transition-[width]" style={{ width: `${progressPct}%` }} />
                <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-gray-900">
                  {progressPct}%
                </div>
              </div>
              <div className="flex items-center justify-between text-sm text-gray-700">
                <div>
                  ETA: {etaText}
                  {progress?.type === 'processing' && progress?.total ? (
                    <span>
                      {' '}• Progresso: {Number(progress?.processed || 0)} / {Number(progress?.total || 0)} ({progressPct}%)
                      {' '}• Ritmo: {(() => {
                        const elapsedSec = Math.max(1, Math.round((progress?.elapsedMs || 0) / 1000));
                        const ratePerSec = Number(progress?.processed || 0) / elapsedSec;
                        return `${ratePerSec.toFixed(2)} itens/s`;
                      })()}
                      {' '}• Decorrido: {(() => {
                        const elapsedSec = Math.max(0, Math.round((progress?.elapsedMs || 0) / 1000));
                        const mins = Math.floor(elapsedSec / 60);
                        const secs = elapsedSec % 60;
                        return `${mins}m ${secs}s`;
                      })()}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-blue-200 bg-blue-50 text-blue-700">
                    Chamadas: {Number(progress?.apiCallsTotal || 0)}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-green-200 bg-green-50 text-green-700">
                    Sucesso: {Number(progress?.apiCallsSuccess || 0)}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-red-200 bg-red-50 text-red-700">
                    Falhas: {Math.max(0, Number(progress?.apiCallsTotal || 0) - Number(progress?.apiCallsSuccess || 0))}
                  </span>
                </div>
              </div>
              {status === 'done' && runId && (
                <a href={`/api/download/${runId}`} className="inline-block px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium">
                  Baixar CSV
                </a>
              )}
            </div>
          </GroupCard>

          <GroupCard title="Etapas, Consultas e Resultados">
            <div
              ref={logsRef}
              className="overflow-auto overscroll-contain bg-white rounded-md border p-3 text-sm w-full"
              style={{ height: '40vh' }}
            >
              <div className="sticky top-0 z-10 bg-gray-50 border-b py-1 px-2 text-xs text-gray-600">
                Logs (auto-scroll)
              </div>
              {logs.map((line, idx) => (
                <div key={idx} className="py-0.5">{line}</div>
              ))}
            </div>
          </GroupCard>
        </>
      )}
      {activeTab === 'resultado' && (
        <>
          <GroupCard title="Resultado (CSV)">
            <div className="flex items-center gap-3 mb-3">
              <button
                className="px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50"
                onClick={async ()=>{
                  await loadLatestRunCsv();
                }}
                disabled={!runId}
              >Carregar CSV da última execução</button>

              <label className="inline-flex items-center px-3 py-2 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-medium cursor-pointer">
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={async (e)=>{
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const text = await file.text();
                    parseCsvAndSetGrid(text);
                  } catch (err) {
                    setLogs((l)=>[...l, `Erro ao processar CSV: ${err.message}`]);
                  }
                }} />
                <span>Importar CSV local</span>
              </label>
              <input
                type="text"
                value={gridQuickFilter}
                onChange={(e)=>{
                  const v = e.target.value;
                  setGridQuickFilter(v);
                  // apply across all sub-grids
                  const apis = gridApisByGroup.current || {};
                  Object.keys(apis).forEach((k)=>{
                    try { apis[k]?.setQuickFilter(v); } catch {}
                  });
                }}
                placeholder="Filtro rápido (todas sub-abas)"
                className="px-2 py-1 rounded-md border text-sm"
              />
            </div>
            {/* Sub-abas para grupos */}
            <div className="flex flex-wrap gap-2 mb-2">
              {RESULT_SUBTABS.map((label)=> (
                <button
                  key={label}
                  onClick={()=>setResultSubtab(label)}
                  className={`px-3 py-1.5 rounded-md border text-xs font-medium ${resultSubtab===label ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                >{label}</button>
              ))}
            </div>
            <div className="ag-theme-alpine" style={{ height: '70vh', width: '100%' }}>
              <AgGridReact
                rowData={visibleRows}
                columnDefs={groupColumnDefs[resultSubtab] || []}
                defaultColDef={{ resizable: true, filter: true, floatingFilter: true }}
                animateRows={true}
                suppressBrowserResizeObserver={true}
                pinnedBottomRowData={pinnedBottomRows}
                onFirstDataRendered={(params)=>{
                  try {
                    const sortField = initialSortByGroup[resultSubtab];
                    if (sortField) params.api.setSortModel([{ colId: sortField, sort: 'desc' }]);
                    params.api.sizeColumnsToFit();
                  } catch {}
                }}
                onGridReady={(params)=>{
                  gridApisByGroup.current[resultSubtab] = params.api;
                  gridColumnApiRef.current = params.columnApi;
                  if (gridQuickFilter) params.api.setQuickFilter(gridQuickFilter);
                }}
              />
            </div>
          </GroupCard>
        </>
      )}
    </div>
  );
};

export default forwardRef(ControlPanel);