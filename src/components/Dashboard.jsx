import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { BarChart3, TrendingUp, DollarSign, Activity, PieChart, Target, Briefcase, Search } from 'lucide-react';
import StockCard from './StockCard';
import AdvancedCharts from './AdvancedCharts';
import AIAnalysis from './AIAnalysis';
import SectorAnalysis from './SectorAnalysis';
import PortfolioTracker from './PortfolioTracker';
import AdvancedFilters from './AdvancedFilters';

const Dashboard = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('overview');
  const [filteredStocks, setFilteredStocks] = useState([]);
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');
  const savedCfg = (()=>{ try { return JSON.parse(localStorage.getItem('analysis_config')||'{}'); } catch { return {}; } })();
  const targetCount = Number(savedCfg?.targetCount) || 200;

  // Dados simulados baseados no Danelfin
  const topStocks = [
    {
      symbol: 'AAPL',
      name: 'Apple Inc.',
      price: 175.43,
      change: 2.34,
      aiScore: 9,
      volume: 45234567,
      marketCap: '2.8T',
      peRatio: 28.5
    },
    {
      symbol: 'MSFT',
      name: 'Microsoft Corp.',
      price: 338.11,
      change: 1.87,
      aiScore: 8,
      volume: 23456789,
      marketCap: '2.5T',
      peRatio: 32.1
    },
    {
      symbol: 'GOOGL',
      name: 'Alphabet Inc.',
      price: 138.21,
      change: -0.45,
      aiScore: 7,
      volume: 34567890,
      marketCap: '1.7T',
      peRatio: 25.3
    },
    {
      symbol: 'TSLA',
      name: 'Tesla Inc.',
      price: 248.50,
      change: 3.21,
      aiScore: 6,
      volume: 67890123,
      marketCap: '789B',
      peRatio: 65.2
    }
  ];

  const performanceData = [
    { month: 'Jan', danelfin: 12.5, sp500: 8.2 },
    { month: 'Fev', danelfin: 15.3, sp500: 9.1 },
    { month: 'Mar', danelfin: 18.7, sp500: 11.4 },
    { month: 'Abr', danelfin: 22.1, sp500: 13.8 },
    { month: 'Mai', danelfin: 25.8, sp500: 15.2 },
    { month: 'Jun', danelfin: 28.3, sp500: 16.9 }
  ];

  const aiScoreData = [
    { range: '90-100', count: 45 },
    { range: '80-89', count: 78 },
    { range: '70-79', count: 123 },
    { range: '60-69', count: 156 },
    { range: '50-59', count: 189 },
    { range: '40-49', count: 234 },
    { range: '30-39', count: 198 },
    { range: '20-29', count: 145 },
    { range: '10-19', count: 89 },
    { range: '0-9', count: 34 }
  ];

  const tabs = [
    { id: 'overview', label: t('dashboard.title'), icon: BarChart3 },
    { id: 'charts', label: 'Advanced Charts', icon: Activity },
    { id: 'ai', label: 'AI Analysis', icon: Target },
    { id: 'sectors', label: 'Sector Analysis', icon: PieChart },
    { id: 'portfolio', label: 'Portfolio', icon: Briefcase }
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header with Tabs */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('dashboard.title')}</h1>
        
        {/* Global Search */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder={t('search.placeholder', 'Search stocks...')}
            value={globalSearchTerm}
            onChange={(e) => setGlobalSearchTerm(e.target.value)}
            className="block w-80 pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
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

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="chrome-tab-panel space-y-6">
          {/* Advanced Filters */}
          <AdvancedFilters 
            onFiltersChange={setFilteredStocks}
            stocks={topStocks}
          />

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-white" />
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">{t('dashboard.totalStocks')}</p>
              <p className="text-2xl font-semibold text-gray-900">2,847</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-white" />
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">{t('dashboard.avgAiScore')}</p>
              <p className="text-2xl font-semibold text-gray-900">73.2</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-white" />
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">{t('dashboard.marketCap')}</p>
              <p className="text-2xl font-semibold text-gray-900">$45.2T</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
                <Activity className="w-4 h-4 text-white" />
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">{t('dashboard.performance')}</p>
              <p className="text-2xl font-semibold text-green-600">+12.4%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Performance Chart */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">{t('dashboard.performance')}</h3>
            <button className="chrome-pill-btn text-sm">{t('dashboard.viewAll')}</button>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={performanceData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="danelfin" stroke="#3B82F6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* AI Score Distribution */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">{t('dashboard.aiScoreDistribution')}</h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={aiScoreData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="range" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#10B981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top Stocks Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">{t('dashboard.topStocks')} ({targetCount})</h3>
          <button className="chrome-pill-btn text-sm">{t('dashboard.viewAll')}</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {topStocks.slice(0, Math.min(6, targetCount)).map((stock) => (
            <StockCard key={stock.symbol} stock={stock} />
          ))}
        </div>
      </div>

          {/* AI Explanation */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">{t('dashboard.howAiWorks')}</h3>
            <p className="text-gray-700">{t('dashboard.aiDescription')}</p>
          </div>
        </div>
      )}

      {/* Advanced Charts Tab */}
      {activeTab === 'charts' && (
        <div className="chrome-tab-panel">
          <AdvancedCharts globalSearchTerm={globalSearchTerm} />
        </div>
      )}

      {/* AI Analysis Tab */}
      {activeTab === 'ai' && (
        <div className="chrome-tab-panel">
          <AIAnalysis globalSearchTerm={globalSearchTerm} />
        </div>
      )}

      {/* Sector Analysis Tab */}
      {activeTab === 'sectors' && (
        <div className="chrome-tab-panel">
          <SectorAnalysis globalSearchTerm={globalSearchTerm} />
        </div>
      )}

      {/* Portfolio Tab */}
      {activeTab === 'portfolio' && (
        <div className="chrome-tab-panel">
          <PortfolioTracker globalSearchTerm={globalSearchTerm} />
        </div>
      )}
    </div>
  );
};

export default Dashboard;