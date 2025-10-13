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
  const [activeTab, setActiveTab] = useState('geral');
  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem('analysis_config');
    const base = saved ? JSON.parse(saved) : defaultConfig;
    return { ...base, outCsv: base.outCsv || suggestCsv(), manualTickers: base.manualTickers || Array(50).fill('') };
  });
  const [runId, setRunId] = useState(null);
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState({});
  const [logs, setLogs] = useState([]);
  const logsRef = useRef(null);
  // estado para resultado (AG Grid)
  const [gridColumns, setGridColumns] = useState([]);
  const [gridRows, setGridRows] = useState([]);
  const [gridQuickFilter, setGridQuickFilter] = useState('');
  const gridApiRef = useRef(null);
  const gridColumnApiRef = useRef(null);

  // Helpers para construir colunas com auto-size baseado em dados
  const isNumeric = (val) => {
    if (val === null || val === undefined) return false;
    if (typeof val === 'number') return true;
    const s = String(val).trim().replace(/%$/,'');
    if (s === '') return false;
    return !isNaN(Number(s));
  };
  const buildColumnDefs = (header2, dataRows) => {
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
    return cols;
  };

  useEffect(() => {
    localStorage.setItem('analysis_config', JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs]);

  const resetConfig = () => {
    const next = { ...defaultConfig, outCsv: suggestCsv(), manualTickers: Array(50).fill('') };
    setConfig(next);
    localStorage.setItem('analysis_config', JSON.stringify(next));
  };

  const startRun = async () => {
    setStatus('starting');
    setLogs((l) => [...l, 'Iniciando análise...']);
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
        outCsv: config.outCsv,
        targetCount: Number(config.targetCount),
        minPriceCutoff: Number(String(config.minPriceCutoff).replace(',', '.')),
        // pass advanced toggles
        suppressSurvey: !!config.suppressSurvey,
        skipValidation: !!config.skipValidation,
        noValidationLogs: !!config.noValidationLogs,
        manualTickers: (config.manualTickers || []).filter(Boolean).slice(0,50),
        // new param: top rank count
        topRankCount: Number(config.topRankCount),
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
    if (progress.type === 'processing' && progress.total && progress.processed) {
      const rate = progress.processed / Math.max(1, (progress.elapsedMs || 1000));
      const remaining = progress.total - progress.processed;
      const estMs = remaining / Math.max(0.0001, rate) * 1000;
      const mins = Math.floor(estMs / 60000);
      const secs = Math.round((estMs % 60000) / 1000);
      return `${mins}m ${secs}s`;
    }
    return 'Calculando...';
  }, [progress]);

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
              <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600" style={{ width: `${progressPct}%` }} />
              </div>
              <div className="text-sm text-gray-700">ETA: {etaText}</div>
              {status === 'done' && runId && (
                <a href={`/api/download/${runId}`} className="inline-block px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium">
                  Baixar CSV
                </a>
              )}
            </div>
          </GroupCard>

          <GroupCard title="Etapas, Consultas e Resultados">
            <div ref={logsRef} className="h-64 overflow-y-auto bg-white rounded-md border p-3 text-sm">
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
                  if (!runId) return;
                  try {
                    const resp = await fetch(`/api/download/${runId}`);
                    if (!resp.ok) {
                      setLogs((l)=>[...l, `Falha ao baixar CSV: ${resp.status}`]);
                      return;
                    }
                    const text = await resp.text();
                    const parsed = Papa.parse(text, { delimiter: ',', skipEmptyLines: true });
                    const rows = parsed.data || [];
                    if (rows.length < 4) {
                      setLogs((l)=>[...l, 'CSV não possui cabeçalho esperado (3 linhas)']);
                      return;
                    }
                    const header2 = rows[1];
                    const dataRows = rows.slice(3);
                    const cols = buildColumnDefs(header2, dataRows);
                    const rowObjs = dataRows.map((arr) => {
                      const o = {};
                      for (let i=0;i<cols.length;i++) o[`c${i}`] = arr[i] ?? '';
                      return o;
                    });
                    setGridColumns(cols);
                    setGridRows(rowObjs);
                  } catch (err) {
                    setLogs((l)=>[...l, `Erro ao processar CSV: ${err.message}`]);
                  }
                }}
                disabled={!runId}
              >Carregar CSV da última execução</button>

              <label className="inline-flex items-center px-3 py-2 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-medium cursor-pointer">
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={async (e)=>{
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const text = await file.text();
                    const parsed = Papa.parse(text, { delimiter: ',', skipEmptyLines: true });
                    const rows = parsed.data || [];
                    if (rows.length < 4) {
                      setLogs((l)=>[...l, 'CSV não possui cabeçalho esperado (3 linhas)']);
                      return;
                    }
                    const header2 = rows[1];
                    const dataRows = rows.slice(3);
                    const cols = buildColumnDefs(header2, dataRows);
                    const rowObjs = dataRows.map((arr) => {
                      const o = {};
                      for (let i=0;i<cols.length;i++) o[`c${i}`] = arr[i] ?? '';
                      return o;
                    });
                    setGridColumns(cols);
                    setGridRows(rowObjs);
                  } catch (err) {
                    setLogs((l)=>[...l, `Erro ao processar CSV: ${err.message}`]);
                  }
                }} />
                <span>Importar CSV local</span>
              </label>
            </div>
            <div className="ag-theme-alpine" style={{ height: '70vh', width: '100%' }}>
              <AgGridReact
                rowData={gridRows}
                columnDefs={gridColumns}
                defaultColDef={{ resizable: true, filter: true, floatingFilter: true }}
                animateRows={true}
                onGridReady={(params)=>{
                  gridApiRef.current = params.api;
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