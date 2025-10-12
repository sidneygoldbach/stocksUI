import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Percent, 
  Target, 
  AlertTriangle,
  Plus,
  Minus,
  BarChart3,
  PieChart as PieChartIcon,
  Search
} from 'lucide-react';

const PortfolioTracker = ({ globalSearchTerm }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('overview');
  const [filteredHoldings, setFilteredHoldings] = useState([]);
  const [localSearchTerm, setLocalSearchTerm] = useState('');

  // Portfolio data simulation
  const portfolioValue = 125000;
  const totalGain = 15750;
  const totalGainPercent = 14.4;
  const dayChange = 1250;
  const dayChangePercent = 1.02;

  const portfolioHistory = [
    { date: '2024-01', value: 100000, benchmark: 100000 },
    { date: '2024-02', value: 102500, benchmark: 101200 },
    { date: '2024-03', value: 98750, benchmark: 99800 },
    { date: '2024-04', value: 105000, benchmark: 103500 },
    { date: '2024-05', value: 110000, benchmark: 106000 },
    { date: '2024-06', value: 108500, benchmark: 107200 },
    { date: '2024-07', value: 115000, benchmark: 110000 },
    { date: '2024-08', value: 118750, benchmark: 112500 },
    { date: '2024-09', value: 122000, benchmark: 115000 },
    { date: '2024-10', value: 119500, benchmark: 113800 },
    { date: '2024-11', value: 123750, benchmark: 117000 },
    { date: '2024-12', value: 125000, benchmark: 118500 }
  ];

  const holdings = [
    { symbol: 'AAPL', name: 'Apple Inc.', shares: 50, avgPrice: 150, currentPrice: 175, value: 8750, weight: 7.0 },
    { symbol: 'MSFT', name: 'Microsoft Corp.', shares: 40, avgPrice: 280, currentPrice: 320, value: 12800, weight: 10.2 },
    { symbol: 'NVDA', name: 'NVIDIA Corp.', shares: 25, avgPrice: 400, currentPrice: 480, value: 12000, weight: 9.6 },
    { symbol: 'GOOGL', name: 'Alphabet Inc.', shares: 30, avgPrice: 120, currentPrice: 140, value: 4200, weight: 3.4 },
    { symbol: 'TSLA', name: 'Tesla Inc.', shares: 35, avgPrice: 200, currentPrice: 245, value: 8575, weight: 6.9 },
    { symbol: 'AMZN', name: 'Amazon.com Inc.', shares: 45, avgPrice: 130, currentPrice: 155, value: 6975, weight: 5.6 },
    { symbol: 'META', name: 'Meta Platforms', shares: 20, avgPrice: 250, currentPrice: 290, value: 5800, weight: 4.6 },
    { symbol: 'NFLX', name: 'Netflix Inc.', shares: 15, avgPrice: 380, currentPrice: 420, value: 6300, weight: 5.0 }
  ];

  const sectorAllocation = [
    { name: 'Technology', value: 45.2, color: '#0088FE' },
    { name: 'Consumer Discretionary', value: 18.5, color: '#00C49F' },
    { name: 'Communication Services', value: 12.8, color: '#FFBB28' },
    { name: 'Healthcare', value: 10.3, color: '#FF8042' },
    { name: 'Financial Services', value: 8.7, color: '#8884D8' },
    { name: 'Others', value: 4.5, color: '#82CA9D' }
  ];

  const riskMetrics = {
    beta: 1.15,
    sharpeRatio: 1.42,
    volatility: 18.5,
    maxDrawdown: -8.2,
    var95: -2.8,
    correlation: 0.85
  };

  const monthlyReturns = [
    { month: 'Jan', portfolio: 2.5, benchmark: 1.2 },
    { month: 'Feb', portfolio: -3.7, benchmark: -1.4 },
    { month: 'Mar', portfolio: 6.3, benchmark: 3.7 },
    { month: 'Apr', portfolio: 4.8, benchmark: 2.4 },
    { month: 'May', portfolio: -1.4, benchmark: 1.1 },
    { month: 'Jun', portfolio: 6.0, benchmark: 2.7 },
    { month: 'Jul', portfolio: 3.3, benchmark: 2.3 },
    { month: 'Aug', portfolio: 2.9, benchmark: 1.5 },
    { month: 'Sep', portfolio: -2.0, benchmark: -1.0 },
    { month: 'Oct', portfolio: 3.6, benchmark: 2.8 },
    { month: 'Nov', portfolio: 1.0, benchmark: 1.2 }
  ];

  const tabs = [
    { id: 'overview', label: t('portfolio.overview'), icon: BarChart3 },
    { id: 'holdings', label: t('portfolio.holdings'), icon: PieChartIcon },
    { id: 'performance', label: t('portfolio.performance'), icon: TrendingUp },
    { id: 'risk', label: t('portfolio.risk'), icon: AlertTriangle }
  ];

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

  // Filter holdings based on global or local search
  useEffect(() => {
    const searchTerm = globalSearchTerm || localSearchTerm;
    if (searchTerm) {
      const filtered = holdings.filter(holding =>
        holding.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        holding.symbol.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredHoldings(filtered);
    } else {
      setFilteredHoldings(holdings);
    }
  }, [globalSearchTerm, localSearchTerm]);

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div className="flex items-center space-x-4">
          <h2 className="text-2xl font-bold text-gray-800">{t('portfolio.title')}</h2>
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-800">
              ${portfolioValue.toLocaleString()}
            </div>
            <div className={`flex items-center space-x-1 ${
              dayChange >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {dayChange >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              <span className="font-semibold">
                {dayChange >= 0 ? '+' : ''}${Math.abs(dayChange).toLocaleString()} ({dayChangePercent >= 0 ? '+' : ''}{dayChangePercent}%)
              </span>
            </div>
          </div>
        </div>
        
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

      {/* Search Results Info */}
      {(globalSearchTerm || localSearchTerm) && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-700">
            Mostrando {filteredHoldings.length} de {holdings.length} posições
            {(globalSearchTerm || localSearchTerm) && ` para "${globalSearchTerm || localSearchTerm}"`}
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex space-x-1 mb-6 bg-gray-100 p-1 rounded-lg">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="text-sm font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-600 font-medium">{t('portfolio.totalValue')}</p>
                  <p className="text-2xl font-bold text-blue-800">${portfolioValue.toLocaleString()}</p>
                </div>
                <DollarSign className="h-8 w-8 text-blue-600" />
              </div>
            </div>

            <div className="bg-gradient-to-r from-green-50 to-green-100 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-600 font-medium">{t('portfolio.totalGain')}</p>
                  <p className="text-2xl font-bold text-green-800">+${totalGain.toLocaleString()}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-green-600" />
              </div>
            </div>

            <div className="bg-gradient-to-r from-purple-50 to-purple-100 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-purple-600 font-medium">{t('portfolio.totalReturn')}</p>
                  <p className="text-2xl font-bold text-purple-800">+{totalGainPercent}%</p>
                </div>
                <Percent className="h-8 w-8 text-purple-600" />
              </div>
            </div>

            <div className="bg-gradient-to-r from-orange-50 to-orange-100 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-orange-600 font-medium">{t('portfolio.sharpeRatio')}</p>
                  <p className="text-2xl font-bold text-orange-800">{riskMetrics.sharpeRatio}</p>
                </div>
                <Target className="h-8 w-8 text-orange-600" />
              </div>
            </div>
          </div>

          {/* Portfolio Performance Chart */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-4">{t('portfolio.performanceChart')}</h3>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={portfolioHistory}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip 
                  formatter={(value, name) => [
                    `$${value.toLocaleString()}`, 
                    name === 'value' ? t('portfolio.portfolio') : t('portfolio.benchmark')
                  ]}
                />
                <Legend />
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  stackId="1" 
                  stroke="#0088FE" 
                  fill="#0088FE" 
                  fillOpacity={0.3}
                  name={t('portfolio.portfolio')}
                />
                <Area 
                  type="monotone" 
                  dataKey="benchmark" 
                  stackId="2" 
                  stroke="#00C49F" 
                  fill="#00C49F" 
                  fillOpacity={0.3}
                  name={t('portfolio.benchmark')}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Sector Allocation */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-4">{t('portfolio.sectorAllocation')}</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={sectorAllocation}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}%`}
                  >
                    {sectorAllocation.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value}%`, t('portfolio.allocation')]} />
                </PieChart>
              </ResponsiveContainer>

              <div className="space-y-2">
                {sectorAllocation.map((sector, index) => (
                  <div key={sector.name} className="flex items-center justify-between p-2 bg-white rounded">
                    <div className="flex items-center space-x-2">
                      <div 
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="text-sm font-medium">{sector.name}</span>
                    </div>
                    <span className="text-sm font-semibold">{sector.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Holdings Tab */}
      {activeTab === 'holdings' && (
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('portfolio.stock')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('portfolio.shares')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('portfolio.avgPrice')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('portfolio.currentPrice')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('portfolio.value')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('portfolio.gainLoss')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('portfolio.weight')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredHoldings.map((holding) => {
                  const gainLoss = (holding.currentPrice - holding.avgPrice) * holding.shares;
                  const gainLossPercent = ((holding.currentPrice - holding.avgPrice) / holding.avgPrice) * 100;
                  
                  return (
                    <tr key={holding.symbol} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{holding.symbol}</div>
                          <div className="text-sm text-gray-500">{holding.name}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {holding.shares}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${holding.avgPrice.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${holding.currentPrice.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${holding.value.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`flex items-center space-x-1 ${
                          gainLoss >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {gainLoss >= 0 ? <Plus className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                          <span className="text-sm font-medium">
                            ${Math.abs(gainLoss).toLocaleString()} ({gainLossPercent >= 0 ? '+' : ''}{gainLossPercent.toFixed(1)}%)
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {holding.weight}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Performance Tab */}
      {activeTab === 'performance' && (
        <div className="space-y-6">
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-4">{t('portfolio.monthlyReturns')}</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyReturns}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip 
                  formatter={(value, name) => [
                    `${value.toFixed(1)}%`, 
                    name === 'portfolio' ? t('portfolio.portfolio') : t('portfolio.benchmark')
                  ]}
                />
                <Legend />
                <Bar dataKey="portfolio" fill="#0088FE" name={t('portfolio.portfolio')} />
                <Bar dataKey="benchmark" fill="#00C49F" name={t('portfolio.benchmark')} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Risk Tab */}
      {activeTab === 'risk' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-lg border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">{t('portfolio.beta')}</span>
                <AlertTriangle className="h-4 w-4 text-orange-500" />
              </div>
              <div className="text-2xl font-bold text-gray-800">{riskMetrics.beta}</div>
              <div className="text-sm text-gray-500">{t('portfolio.betaDescription')}</div>
            </div>

            <div className="bg-white p-4 rounded-lg border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">{t('portfolio.volatility')}</span>
                <AlertTriangle className="h-4 w-4 text-red-500" />
              </div>
              <div className="text-2xl font-bold text-gray-800">{riskMetrics.volatility}%</div>
              <div className="text-sm text-gray-500">{t('portfolio.volatilityDescription')}</div>
            </div>

            <div className="bg-white p-4 rounded-lg border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">{t('portfolio.maxDrawdown')}</span>
                <AlertTriangle className="h-4 w-4 text-red-600" />
              </div>
              <div className="text-2xl font-bold text-red-600">{riskMetrics.maxDrawdown}%</div>
              <div className="text-sm text-gray-500">{t('portfolio.maxDrawdownDescription')}</div>
            </div>

            <div className="bg-white p-4 rounded-lg border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">{t('portfolio.var95')}</span>
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
              </div>
              <div className="text-2xl font-bold text-gray-800">{riskMetrics.var95}%</div>
              <div className="text-sm text-gray-500">{t('portfolio.var95Description')}</div>
            </div>

            <div className="bg-white p-4 rounded-lg border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">{t('portfolio.correlation')}</span>
                <Target className="h-4 w-4 text-blue-500" />
              </div>
              <div className="text-2xl font-bold text-gray-800">{riskMetrics.correlation}</div>
              <div className="text-sm text-gray-500">{t('portfolio.correlationDescription')}</div>
            </div>

            <div className="bg-white p-4 rounded-lg border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">{t('portfolio.sharpeRatio')}</span>
                <TrendingUp className="h-4 w-4 text-green-500" />
              </div>
              <div className="text-2xl font-bold text-green-600">{riskMetrics.sharpeRatio}</div>
              <div className="text-sm text-gray-500">{t('portfolio.sharpeDescription')}</div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-yellow-50 to-red-50 p-4 rounded-lg border border-yellow-200">
            <div className="flex items-center space-x-2 mb-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <h3 className="text-lg font-semibold text-yellow-800">{t('portfolio.riskWarning')}</h3>
            </div>
            <p className="text-sm text-yellow-700">{t('portfolio.riskWarningText')}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default PortfolioTracker;