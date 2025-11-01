import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell
} from 'recharts';
import { TrendingUp, TrendingDown, BarChart3, Activity, Search } from 'lucide-react';
import { generateStockData } from '../data/stockData';

const AdvancedCharts = ({ globalSearchTerm }) => {
  const { t } = useTranslation();
  const [activeChart, setActiveChart] = useState('price');
  const [selectedStock, setSelectedStock] = useState(null);
  const [availableStocks, setAvailableStocks] = useState([]);
  const [filteredStocks, setFilteredStocks] = useState([]);
  const [localSearchTerm, setLocalSearchTerm] = useState('');

  // Initialize stocks data
  useEffect(() => {
    const stocks = generateStockData();
    setAvailableStocks(stocks);
    setFilteredStocks(stocks);
    if (stocks.length > 0) {
      setSelectedStock(stocks[0]); // Default to first stock
    }
  }, []);

  // Filter stocks based on global search term or local search
  useEffect(() => {
    const searchTerm = globalSearchTerm || localSearchTerm;
    if (searchTerm) {
      const filtered = availableStocks.filter(stock =>
        stock.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        stock.symbol.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredStocks(filtered);
      if (filtered.length > 0 && !filtered.includes(selectedStock)) {
        setSelectedStock(filtered[0]);
      }
    } else {
      setFilteredStocks(availableStocks);
    }
  }, [globalSearchTerm, localSearchTerm, availableStocks, selectedStock]);

  const stockData = selectedStock;

  if (!stockData) return null;

  const chartTabs = [
    { id: 'price', label: 'Preço & Volume', icon: BarChart3 },
    { id: 'technical', label: 'Indicadores Técnicos', icon: Activity },
    { id: 'candlestick', label: 'Candlestick', icon: TrendingUp }
  ];

  // Preparar dados para gráfico de preço e volume
  const priceVolumeData = stockData.priceHistory?.map((item, index) => ({
    ...item,
    volumeData: stockData.volumeHistory?.[index]?.volume || 0,
    sma20: stockData.sma20,
    sma50: stockData.sma50,
    bollingerUpper: stockData.technicalIndicators?.bollinger?.[index]?.upper,
    bollingerLower: stockData.technicalIndicators?.bollinger?.[index]?.lower
  })) || [];

  // Preparar dados para indicadores técnicos
  const technicalData = stockData.technicalIndicators?.rsi?.map((rsiItem, index) => ({
    date: rsiItem.date,
    rsi: rsiItem.rsi,
    macd: stockData.technicalIndicators?.macd?.[index]?.macd || 0,
    macdSignal: stockData.technicalIndicators?.macd?.[index]?.signal || 0,
    macdHistogram: stockData.technicalIndicators?.macd?.[index]?.histogram || 0
  })) || [];

  // Componente de tooltip customizado
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="text-sm font-medium text-gray-900">{`Data: ${label}`}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {`${entry.name}: ${typeof entry.value === 'number' ? entry.value.toFixed(2) : entry.value}`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Componente Candlestick customizado
  const CandlestickChart = ({ data }) => (
    <ResponsiveContainer width="100%" height={400}>
      <ComposedChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis 
          dataKey="date" 
          tick={{ fontSize: 12 }}
          tickFormatter={(value) => new Date(value).toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' })}
        />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip content={<CustomTooltip />} />
        
        {/* Bollinger Bands */}
        <Line 
          type="monotone" 
          dataKey="bollingerUpper" 
          stroke="#e5e7eb" 
          strokeWidth={1}
          dot={false}
          strokeDasharray="5 5"
        />
        <Line 
          type="monotone" 
          dataKey="bollingerLower" 
          stroke="#e5e7eb" 
          strokeWidth={1}
          dot={false}
          strokeDasharray="5 5"
        />
        
        {/* Preço de fechamento */}
        <Line 
          type="monotone" 
          dataKey="close" 
          stroke="#3b82f6" 
          strokeWidth={2}
          dot={false}
        />
        
        {/* Médias móveis */}
        <Line 
          type="monotone" 
          dataKey="sma20" 
          stroke="#f59e0b" 
          strokeWidth={1}
          dot={false}
          strokeDasharray="3 3"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );

  // Componente de gráfico de preço e volume
  const PriceVolumeChart = ({ data }) => (
    <div className="space-y-4">
      {/* Gráfico de Preço */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">Evolução do Preço</h4>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis 
              dataKey="date" 
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => new Date(value).toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' })}
            />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip content={<CustomTooltip />} />
            
            {/* Área de preço */}
            <Line 
              type="monotone" 
              dataKey="close" 
              stroke="#3b82f6" 
              strokeWidth={3}
              dot={false}
            />
            
            {/* Suporte e Resistência */}
            <ReferenceLine y={stockData.support} stroke="#ef4444" strokeDasharray="5 5" label="Suporte" />
            <ReferenceLine y={stockData.resistance} stroke="#10b981" strokeDasharray="5 5" label="Resistência" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Gráfico de Volume */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">Volume de Negociação</h4>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis 
              dataKey="date" 
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => new Date(value).toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' })}
            />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip content={<CustomTooltip />} />
            
            <Bar dataKey="volumeData" fill="#8b5cf6" opacity={0.7}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.volumeData > stockData.avgVolume ? "#10b981" : "#8b5cf6"} />
              ))}
            </Bar>
            
            <ReferenceLine y={stockData.avgVolume} stroke="#6b7280" strokeDasharray="3 3" label="Volume Médio" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  // Componente de indicadores técnicos
  const TechnicalIndicatorsChart = ({ data }) => (
    <div className="space-y-4">
      {/* RSI */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">RSI (Índice de Força Relativa)</h4>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis 
              dataKey="date" 
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => new Date(value).toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' })}
            />
            <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
            <Tooltip content={<CustomTooltip />} />
            
            <Line 
              type="monotone" 
              dataKey="rsi" 
              stroke="#8b5cf6" 
              strokeWidth={2}
              dot={false}
            />
            
            {/* Linhas de sobrecompra e sobrevenda */}
            <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" label="Sobrecompra" />
            <ReferenceLine y={30} stroke="#10b981" strokeDasharray="3 3" label="Sobrevenda" />
            <ReferenceLine y={50} stroke="#6b7280" strokeDasharray="1 1" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* MACD */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">MACD</h4>
        <ResponsiveContainer width="100%" height={250}>
          <ComposedChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis 
              dataKey="date" 
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => new Date(value).toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' })}
            />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip content={<CustomTooltip />} />
            
            {/* Histograma MACD */}
            <Bar dataKey="macdHistogram" fill="#94a3b8" opacity={0.6}>
              {data.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.macdHistogram > 0 ? "#10b981" : "#ef4444"} 
                />
              ))}
            </Bar>
            
            {/* Linhas MACD */}
            <Line 
              type="monotone" 
              dataKey="macd" 
              stroke="#3b82f6" 
              strokeWidth={2}
              dot={false}
            />
            <Line 
              type="monotone" 
              dataKey="macdSignal" 
              stroke="#f59e0b" 
              strokeWidth={2}
              dot={false}
            />
            
            <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="1 1" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Stock Selection and Search */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Advanced Charts</h2>
          
          {/* Local Search */}
          <div className="flex items-center space-x-4">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder={t('search.placeholder', 'Search stocks...')}
                value={localSearchTerm}
                onChange={(e) => setLocalSearchTerm(e.target.value)}
                className="block w-64 pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Stock Selector */}
        <div className="flex flex-wrap gap-2">
          {filteredStocks.slice(0, 10).map((stock) => (
            <button
              key={stock.symbol}
              onClick={() => setSelectedStock(stock)}
              className={`chrome-pill-btn text-sm ${selectedStock?.symbol === stock.symbol ? 'ring-2 ring-blue-500' : ''}`}
            >
              {stock.symbol}
            </button>
          ))}
          {filteredStocks.length > 10 && (
            <span className="px-3 py-2 text-sm text-gray-500">
              +{filteredStocks.length - 10} more
            </span>
          )}
        </div>
      </div>
      {/* Cabeçalho com informações da ação */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {stockData.symbol} - {stockData.name}
            </h2>
            <p className="text-gray-600">{stockData.sector}</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-gray-900">
              ${stockData.price}
            </div>
            <div className={`flex items-center ${stockData.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {stockData.change >= 0 ? <TrendingUp className="w-4 h-4 mr-1" /> : <TrendingDown className="w-4 h-4 mr-1" />}
              <span className="font-medium">
                {stockData.change >= 0 ? '+' : ''}{stockData.change} ({stockData.changePercent >= 0 ? '+' : ''}{stockData.changePercent}%)
              </span>
            </div>
          </div>
        </div>

        {/* Métricas principais */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600">Score IA</div>
            <div className="text-xl font-bold text-blue-600">{stockData.aiScore}/100</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600">P/E Ratio</div>
            <div className="text-xl font-bold text-gray-900">{stockData.peRatio}</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600">RSI</div>
            <div className={`text-xl font-bold ${stockData.rsi > 70 ? 'text-red-600' : stockData.rsi < 30 ? 'text-green-600' : 'text-gray-900'}`}>
              {stockData.rsi}
            </div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600">Beta</div>
            <div className="text-xl font-bold text-gray-900">{stockData.beta}</div>
          </div>
        </div>
      </div>

      {/* Tabs de gráficos */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {chartTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveChart(tab.id)}
                  className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm ${
                    activeChart === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-6">
          {activeChart === 'price' && (
            <PriceVolumeChart data={priceVolumeData} />
          )}
          {activeChart === 'technical' && (
            <TechnicalIndicatorsChart data={technicalData} />
          )}
          {activeChart === 'candlestick' && (
            <CandlestickChart data={priceVolumeData} />
          )}
        </div>
      </div>
    </div>
  );
};

export default AdvancedCharts;