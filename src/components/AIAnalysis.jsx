import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip,
  RadialBarChart,
  RadialBar,
  Legend
} from 'recharts';
import { 
  Brain, 
  TrendingUp, 
  Shield, 
  AlertTriangle, 
  Target, 
  Activity,
  Zap,
  Award,
  Search
} from 'lucide-react';
import { generateStockData } from '../data/stockData';

const AIAnalysis = ({ globalSearchTerm }) => {
  const { t } = useTranslation();
  
  // State for stock selection and search
  const [availableStocks] = useState(() => generateStockData(50));
  const [selectedStock, setSelectedStock] = useState(null);
  const [filteredStocks, setFilteredStocks] = useState([]);
  const [localSearchTerm, setLocalSearchTerm] = useState('');

  // Initialize and filter stocks based on global or local search
  useEffect(() => {
    const searchTerm = globalSearchTerm || localSearchTerm;
    if (searchTerm) {
      const filtered = availableStocks.filter(stock =>
        stock.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        stock.symbol.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredStocks(filtered);
      if (filtered.length > 0 && (!selectedStock || !filtered.find(s => s.symbol === selectedStock.symbol))) {
        setSelectedStock(filtered[0]);
      }
    } else {
      setFilteredStocks(availableStocks);
      if (!selectedStock) {
        setSelectedStock(availableStocks[0]);
      }
    }
  }, [globalSearchTerm, localSearchTerm, availableStocks, selectedStock]);

  // If no stock is selected, show selection interface
  if (!selectedStock) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Brain className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Selecione uma ação para ver a análise IA</p>
        </div>
      </div>
    );
  }

  const stockData = selectedStock;

  if (!stockData) return null;

  // Dados para análise de probabilidade IA
  const probabilityData = [
    { name: 'Probabilidade de Alta', value: stockData.aiProbability * 100, color: '#10b981' },
    { name: 'Incerteza', value: (1 - stockData.aiProbability) * 100, color: '#e5e7eb' }
  ];

  // Dados de fatores de risco
  const riskFactors = [
    { 
      factor: 'Volatilidade', 
      score: stockData.beta > 1.5 ? 85 : stockData.beta > 1 ? 65 : 35,
      impact: stockData.beta > 1.5 ? 'Alto' : stockData.beta > 1 ? 'Médio' : 'Baixo'
    },
    { 
      factor: 'Liquidez', 
      score: stockData.volume > stockData.avgVolume * 1.2 ? 25 : stockData.volume < stockData.avgVolume * 0.8 ? 75 : 45,
      impact: stockData.volume > stockData.avgVolume * 1.2 ? 'Baixo' : stockData.volume < stockData.avgVolume * 0.8 ? 'Alto' : 'Médio'
    },
    { 
      factor: 'Valuation', 
      score: stockData.peRatio > 30 ? 80 : stockData.peRatio > 20 ? 50 : 25,
      impact: stockData.peRatio > 30 ? 'Alto' : stockData.peRatio > 20 ? 'Médio' : 'Baixo'
    },
    { 
      factor: 'Técnico', 
      score: stockData.rsi > 70 ? 75 : stockData.rsi < 30 ? 70 : 30,
      impact: stockData.rsi > 70 ? 'Alto' : stockData.rsi < 30 ? 'Alto' : 'Baixo'
    }
  ];

  // Dados de análise fundamental
  const fundamentalMetrics = [
    { metric: 'ROE', value: stockData.roe * 100, benchmark: 15, unit: '%' },
    { metric: 'ROA', value: stockData.roa * 100, benchmark: 8, unit: '%' },
    { metric: 'Margem Líquida', value: stockData.netMargin * 100, benchmark: 10, unit: '%' },
    { metric: 'Margem Operacional', value: stockData.operatingMargin * 100, benchmark: 15, unit: '%' }
  ];

  // Dados de score IA detalhado
  const aiScoreBreakdown = [
    { category: 'Fundamentals', score: 85, weight: 40 },
    { category: 'Técnico', score: stockData.rsi > 50 ? 75 : 45, weight: 25 },
    { category: 'Sentimento', score: 78, weight: 20 },
    { category: 'Momentum', score: stockData.change > 0 ? 82 : 38, weight: 15 }
  ];

  // Componente de tooltip customizado
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="text-sm font-medium text-gray-900">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {`${entry.name}: ${entry.value.toFixed(1)}${entry.payload.unit || ''}`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Função para determinar cor baseada no score
  const getScoreColor = (score) => {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#f59e0b';
    if (score >= 40) return '#f97316';
    return '#ef4444';
  };

  // Função para determinar nível de risco
  const getRiskLevel = () => {
    const avgRisk = riskFactors.reduce((sum, factor) => sum + factor.score, 0) / riskFactors.length;
    if (avgRisk >= 70) return { level: 'Alto', color: '#ef4444', icon: AlertTriangle };
    if (avgRisk >= 50) return { level: 'Médio', color: '#f59e0b', icon: Shield };
    return { level: 'Baixo', color: '#10b981', icon: Shield };
  };

  const riskLevel = getRiskLevel();
  const RiskIcon = riskLevel.icon;

  return (
    <div className="space-y-6">
      {/* Stock Selection Interface */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Análise IA - Seleção de Ação</h3>
          
          {/* Local Search Bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder={t('search.placeholder')}
              value={localSearchTerm}
              onChange={(e) => setLocalSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Stock Selection Buttons */}
        <div className="flex flex-wrap gap-2 mb-4">
          {filteredStocks.slice(0, 10).map((stock) => (
            <button
              key={stock.symbol}
              onClick={() => setSelectedStock(stock)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedStock?.symbol === stock.symbol
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {stock.symbol}
            </button>
          ))}
        </div>

        {/* Selected Stock Info */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div>
            <h4 className="font-semibold text-gray-900">{selectedStock.name}</h4>
            <p className="text-sm text-gray-600">{selectedStock.symbol} • {selectedStock.sector}</p>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-gray-900">${selectedStock.price}</div>
            <div className={`text-sm ${selectedStock.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {selectedStock.change >= 0 ? '+' : ''}{selectedStock.changePercent}%
            </div>
          </div>
        </div>
      </div>

      {/* Cabeçalho da Análise IA */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Análise IA Completa</h2>
              <p className="text-gray-600">Análise baseada em 200+ métricas financeiras</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold text-blue-600">{stockData.aiScore}/100</div>
            <div className="text-sm text-gray-600">Score IA</div>
          </div>
        </div>
      </div>

      {/* Grid de métricas principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Probabilidade de Alta */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-5 h-5 text-green-600" />
              <span className="text-sm font-medium text-gray-600">Prob. de Alta</span>
            </div>
            <Award className="w-5 h-5 text-gray-400" />
          </div>
          <div className="text-3xl font-bold text-green-600 mb-2">
            {(stockData.aiProbability * 100).toFixed(1)}%
          </div>
          <div className="text-sm text-gray-500">Próximos 3 meses</div>
        </div>

        {/* Nível de Risco */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <RiskIcon className="w-5 h-5" style={{ color: riskLevel.color }} />
              <span className="text-sm font-medium text-gray-600">Nível de Risco</span>
            </div>
            <Shield className="w-5 h-5 text-gray-400" />
          </div>
          <div className="text-3xl font-bold mb-2" style={{ color: riskLevel.color }}>
            {riskLevel.level}
          </div>
          <div className="text-sm text-gray-500">Baseado em volatilidade</div>
        </div>

        {/* Preço Alvo */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Target className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-gray-600">Preço Alvo</span>
            </div>
            <Activity className="w-5 h-5 text-gray-400" />
          </div>
          <div className="text-3xl font-bold text-blue-600 mb-2">
            ${stockData.targetPrice}
          </div>
          <div className="text-sm text-gray-500">
            {((stockData.targetPrice - stockData.price) / stockData.price * 100).toFixed(1)}% upside
          </div>
        </div>

        {/* Momentum */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Zap className="w-5 h-5 text-yellow-600" />
              <span className="text-sm font-medium text-gray-600">Momentum</span>
            </div>
            <Activity className="w-5 h-5 text-gray-400" />
          </div>
          <div className={`text-3xl font-bold mb-2 ${stockData.change > 0 ? 'text-green-600' : 'text-red-600'}`}>
            {stockData.change > 0 ? 'Positivo' : 'Negativo'}
          </div>
          <div className="text-sm text-gray-500">Tendência atual</div>
        </div>
      </div>

      {/* Gráficos de análise */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Probabilidade IA */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Probabilidade de Sucesso IA</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={probabilityData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {probabilityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `${value.toFixed(1)}%`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="text-center mt-4">
            <div className="text-2xl font-bold text-green-600">
              {(stockData.aiProbability * 100).toFixed(1)}%
            </div>
            <div className="text-sm text-gray-600">Probabilidade de superar o mercado</div>
          </div>
        </div>

        {/* Breakdown do Score IA */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Composição do Score IA</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={aiScoreBreakdown} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="category" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                  {aiScoreBreakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getScoreColor(entry.score)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Análise de Fatores de Risco */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">Análise de Fatores de Risco</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {riskFactors.map((factor, index) => (
            <div key={index} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="font-medium text-gray-900">{factor.factor}</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  factor.impact === 'Alto' ? 'bg-red-100 text-red-800' :
                  factor.impact === 'Médio' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-green-100 text-green-800'
                }`}>
                  {factor.impact}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full ${
                    factor.score >= 70 ? 'bg-red-500' :
                    factor.score >= 50 ? 'bg-yellow-500' :
                    'bg-green-500'
                  }`}
                  style={{ width: `${factor.score}%` }}
                ></div>
              </div>
              <div className="text-sm text-gray-600 mt-2">
                Score de risco: {factor.score}/100
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Métricas Fundamentais */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">Análise Fundamental</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {fundamentalMetrics.map((metric, index) => (
            <div key={index} className="text-center">
              <div className="text-sm text-gray-600 mb-2">{metric.metric}</div>
              <div className={`text-2xl font-bold mb-2 ${
                metric.value >= metric.benchmark ? 'text-green-600' : 'text-red-600'
              }`}>
                {metric.value.toFixed(1)}{metric.unit}
              </div>
              <div className="text-xs text-gray-500">
                Benchmark: {metric.benchmark}{metric.unit}
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1 mt-2">
                <div 
                  className={`h-1 rounded-full ${
                    metric.value >= metric.benchmark ? 'bg-green-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${Math.min(100, (metric.value / metric.benchmark) * 50)}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recomendação Final */}
      <div className={`rounded-lg border p-6 ${
        stockData.aiScore >= 80 ? 'bg-green-50 border-green-200' :
        stockData.aiScore >= 60 ? 'bg-yellow-50 border-yellow-200' :
        'bg-red-50 border-red-200'
      }`}>
        <div className="flex items-center space-x-3 mb-4">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            stockData.aiScore >= 80 ? 'bg-green-500' :
            stockData.aiScore >= 60 ? 'bg-yellow-500' :
            'bg-red-500'
          }`}>
            <Award className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Recomendação IA</h3>
            <p className="text-gray-600">Baseada em análise completa de dados</p>
          </div>
        </div>
        
        <div className={`text-2xl font-bold mb-2 ${
          stockData.aiScore >= 80 ? 'text-green-700' :
          stockData.aiScore >= 60 ? 'text-yellow-700' :
          'text-red-700'
        }`}>
          {stockData.analystRating}
        </div>
        
        <p className="text-gray-700">
          {stockData.aiScore >= 80 ? 
            'Ação com excelente potencial de valorização. Fundamentals sólidos e momentum positivo.' :
            stockData.aiScore >= 60 ?
            'Ação com potencial moderado. Considere o perfil de risco antes de investir.' :
            'Ação com riscos elevados. Recomenda-se cautela e análise adicional.'
          }
        </p>
      </div>
    </div>
  );
};

export default AIAnalysis;