import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import StockCard from './StockCard';
import { TrendingUp, BarChart3, Activity, Search } from 'lucide-react';

const TopStocks = () => {
  const { t } = useTranslation();
  const [sortBy, setSortBy] = useState('aiScore');
  const [visibleStocks, setVisibleStocks] = useState(12);
  const [searchTerm, setSearchTerm] = useState('');
  const savedCfg = (()=>{ try { return JSON.parse(localStorage.getItem('analysis_config')||'{}'); } catch { return {}; } })();
  const targetCount = Number(savedCfg?.targetCount) || 200;

  const stocks = [
    {
      symbol: 'NVDA',
      name: 'NVIDIA Corporation',
      price: 875.28,
      change: 4.67,
      aiScore: 10,
      volume: 45234567,
      marketCap: '2.1T',
      peRatio: 65.8
    },
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
      aiScore: 9,
      volume: 23456789,
      marketCap: '2.5T',
      peRatio: 32.1
    },
    {
      symbol: 'AMZN',
      name: 'Amazon.com Inc.',
      price: 145.86,
      change: 3.12,
      aiScore: 8,
      volume: 34567890,
      marketCap: '1.5T',
      peRatio: 45.2
    },
    {
      symbol: 'GOOGL',
      name: 'Alphabet Inc.',
      price: 138.21,
      change: -0.45,
      aiScore: 8,
      volume: 34567890,
      marketCap: '1.7T',
      peRatio: 25.3
    },
    {
      symbol: 'META',
      name: 'Meta Platforms Inc.',
      price: 298.58,
      change: 2.89,
      aiScore: 7,
      volume: 28901234,
      marketCap: '756B',
      peRatio: 22.8
    },
    {
      symbol: 'TSLA',
      name: 'Tesla Inc.',
      price: 248.50,
      change: 3.21,
      aiScore: 7,
      volume: 67890123,
      marketCap: '789B',
      peRatio: 65.2
    },
    {
      symbol: 'AMD',
      name: 'Advanced Micro Devices',
      price: 112.34,
      change: 1.56,
      aiScore: 6,
      volume: 45678901,
      marketCap: '181B',
      peRatio: 42.1
    }
  ];

  // Filter stocks based on search term
  const filteredStocks = stocks.filter(stock => 
    stock.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    stock.symbol.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const sortedStocks = [...filteredStocks].sort((a, b) => {
    switch (sortBy) {
      case 'aiScore':
        return b.aiScore - a.aiScore;
      case 'performance':
        return b.change - a.change;
      case 'marketCap':
        return parseFloat(b.marketCap) - parseFloat(a.marketCap);
      case 'volume':
        return b.volume - a.volume;
      default:
        return 0;
    }
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('topStocks.title')}</h1>
        <div className="flex items-center space-x-4">
          {/* Search Box */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder={t('filters.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent w-64"
            />
          </div>
          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="aiScore">{t('topStocks.aiScore')}</option>
            <option value="performance">{t('topStocks.performance')}</option>
            <option value="marketCap">{t('topStocks.marketCap')}</option>
            <option value="volume">{t('topStocks.volume')}</option>
          </select>
        </div>
      </div>

      {/* Performance Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-white" />
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Best Performers</p>
              <p className="text-2xl font-semibold text-green-600">+24.7%</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-white" />
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Avg AI Score</p>
              <p className="text-2xl font-semibold text-blue-600">87.3</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center">
                <Activity className="w-4 h-4 text-white" />
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Volume</p>
              <p className="text-2xl font-semibold text-purple-600">2.4B</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stocks Grid */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-gray-600">
            {searchTerm ? 
              t('topStocks.showingFilteredStocks', { count: sortedStocks.length, total: stocks.length }) :
              t('topStocks.showingStocks', { count: Math.min(visibleStocks, targetCount) })
            }
          </p>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">{t('topStocks.sortBy')}:</span>
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              className="text-sm border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="aiScore">{t('topStocks.aiScore')}</option>
              <option value="performance">{t('topStocks.performance')}</option>
              <option value="marketCap">{t('topStocks.marketCap')}</option>
              <option value="volume">{t('topStocks.volume')}</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedStocks.slice(0, Math.min(visibleStocks, targetCount)).map((stock) => (
            <StockCard key={stock.symbol} stock={stock} />
          ))}
        </div>

        {visibleStocks < sortedStocks.length && (
          <div className="mt-8 text-center">
            <button
              onClick={() => setVisibleStocks(prev => prev + 12)}
              className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              {t('topStocks.loadMore')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TopStocks;