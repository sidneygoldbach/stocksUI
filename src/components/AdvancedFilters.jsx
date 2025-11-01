import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Filter, 
  Search, 
  SlidersHorizontal, 
  TrendingUp, 
  TrendingDown, 
  DollarSign,
  BarChart3,
  Target,
  X,
  ChevronDown
} from 'lucide-react';

const AdvancedFilters = ({ onFiltersChange, stocks = [] }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    aiScoreRange: [0, 100],
    performanceRange: [-50, 50],
    marketCapRange: [0, 5000],
    volumeRange: [0, 1000],
    peRatioRange: [0, 100],
    sector: 'all',
    recommendation: 'all',
    sortBy: 'aiScore',
    sortOrder: 'desc'
  });

  const sectors = [
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
  ];

  const recommendations = [
    'strongBuy',
    'buy',
    'hold',
    'sell',
    'strongSell'
  ];

  const sortOptions = [
    { value: 'aiScore', label: t('common.aiScore') },
    { value: 'performance', label: t('common.performance') },
    { value: 'marketCap', label: t('common.marketCap') },
    { value: 'volume', label: t('common.volume') },
    { value: 'peRatio', label: 'P/E Ratio' },
    { value: 'name', label: 'Name' }
  ];

  const handleFilterChange = (key, value) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    
    // Apply filters and search
    const filteredStocks = applyFilters(stocks, newFilters, searchTerm);
    onFiltersChange(filteredStocks);
  };

  const handleSearchChange = (value) => {
    setSearchTerm(value);
    const filteredStocks = applyFilters(stocks, filters, value);
    onFiltersChange(filteredStocks);
  };

  const applyFilters = (stockList, currentFilters, search) => {
    let filtered = [...stockList];

    // Search filter
    if (search) {
      filtered = filtered.filter(stock => 
        stock.name.toLowerCase().includes(search.toLowerCase()) ||
        stock.symbol.toLowerCase().includes(search.toLowerCase())
      );
    }

    // AI Score range
    filtered = filtered.filter(stock => 
      stock.aiScore >= currentFilters.aiScoreRange[0] && 
      stock.aiScore <= currentFilters.aiScoreRange[1]
    );

    // Performance range
    filtered = filtered.filter(stock => 
      stock.performance >= currentFilters.performanceRange[0] && 
      stock.performance <= currentFilters.performanceRange[1]
    );

    // Market Cap range (in billions)
    filtered = filtered.filter(stock => {
      const marketCapB = stock.marketCap / 1000000000;
      return marketCapB >= currentFilters.marketCapRange[0] && 
             marketCapB <= currentFilters.marketCapRange[1];
    });

    // Volume range (in millions)
    filtered = filtered.filter(stock => {
      const volumeM = stock.volume / 1000000;
      return volumeM >= currentFilters.volumeRange[0] && 
             volumeM <= currentFilters.volumeRange[1];
    });

    // P/E Ratio range
    if (currentFilters.peRatioRange) {
      filtered = filtered.filter(stock => 
        stock.peRatio >= currentFilters.peRatioRange[0] && 
        stock.peRatio <= currentFilters.peRatioRange[1]
      );
    }

    // Sector filter
    if (currentFilters.sector !== 'all') {
      filtered = filtered.filter(stock => stock.sector === currentFilters.sector);
    }

    // Recommendation filter
    if (currentFilters.recommendation !== 'all') {
      filtered = filtered.filter(stock => stock.recommendation === currentFilters.recommendation);
    }

    // Sort
    filtered.sort((a, b) => {
      let aValue = a[currentFilters.sortBy];
      let bValue = b[currentFilters.sortBy];

      if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (currentFilters.sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return filtered;
  };

  const resetFilters = () => {
    const defaultFilters = {
      aiScoreRange: [0, 100],
      performanceRange: [-50, 50],
      marketCapRange: [0, 5000],
      volumeRange: [0, 1000],
      peRatioRange: [0, 100],
      sector: 'all',
      recommendation: 'all',
      sortBy: 'aiScore',
      sortOrder: 'desc'
    };
    setFilters(defaultFilters);
    setSearchTerm('');
    const filteredStocks = applyFilters(stocks, defaultFilters, '');
    onFiltersChange(filteredStocks);
  };

  const RangeSlider = ({ label, value, onChange, min, max, step = 1, unit = '' }) => (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <div className="px-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value[1]}
          onChange={(e) => onChange([value[0], parseFloat(e.target.value)])}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>{min}{unit}</span>
          <span className="font-medium text-blue-600">
            {value[0]}{unit} - {value[1]}{unit}
          </span>
          <span>{max}{unit}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-lg shadow-lg p-4 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Filter className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-800">{t('filters.title')}</h3>
        </div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center space-x-2 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span className="text-sm font-medium">{isOpen ? t('filters.hide') : t('filters.show')}</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder={t('filters.searchPlaceholder')}
          value={searchTerm}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Quick Sort */}
      <div className="flex items-center space-x-4 mb-4">
        <div className="flex items-center space-x-2">
          <BarChart3 className="h-4 w-4 text-gray-600" />
          <span className="text-sm font-medium text-gray-700">{t('filters.sortBy')}</span>
        </div>
        <select
          value={filters.sortBy}
          onChange={(e) => handleFilterChange('sortBy', e.target.value)}
          className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500"
        >
          {sortOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => handleFilterChange('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc')}
          className={`flex items-center space-x-1 px-2 py-1 rounded-md text-sm ${
            filters.sortOrder === 'desc' 
              ? 'bg-blue-100 text-blue-700' 
              : 'bg-gray-100 text-gray-700'
          }`}
        >
          {filters.sortOrder === 'desc' ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
          <span>{filters.sortOrder === 'desc' ? t('filters.descending') : t('filters.ascending')}</span>
        </button>
      </div>

      {/* Advanced Filters */}
      {isOpen && (
        <div className="border-t pt-4 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* AI Score Range */}
            <RangeSlider
              label={t('filters.aiScoreRange')}
              value={filters.aiScoreRange}
              onChange={(value) => handleFilterChange('aiScoreRange', value)}
              min={0}
              max={100}
            />

            {/* Performance Range */}
            <RangeSlider
              label={t('filters.performanceRange')}
              value={filters.performanceRange}
              onChange={(value) => handleFilterChange('performanceRange', value)}
              min={-50}
              max={50}
              unit="%"
            />

            {/* Market Cap Range */}
            <RangeSlider
              label={t('filters.marketCapRange')}
              value={filters.marketCapRange}
              onChange={(value) => handleFilterChange('marketCapRange', value)}
              min={0}
              max={5000}
              step={10}
              unit="B"
            />

            {/* Volume Range */}
            <RangeSlider
              label={t('filters.volumeRange')}
              value={filters.volumeRange}
              onChange={(value) => handleFilterChange('volumeRange', value)}
              min={0}
              max={1000}
              step={5}
              unit="M"
            />

            {/* P/E Ratio Range */}
            <RangeSlider
              label={t('filters.peRatioRange')}
              value={filters.peRatioRange}
              onChange={(value) => handleFilterChange('peRatioRange', value)}
              min={0}
              max={100}
              step={0.5}
            />

            {/* Sector Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">{t('filters.sector')}</label>
              <select
                value={filters.sector}
                onChange={(e) => handleFilterChange('sector', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">{t('filters.allSectors')}</option>
                {sectors.map(sector => (
                  <option key={sector} value={sector}>{sector}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Recommendation Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">{t('filters.recommendation')}</label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleFilterChange('recommendation', 'all')}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  filters.recommendation === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {t('filters.allRecommendations')}
              </button>
              {recommendations.map(rec => (
                <button
                  key={rec}
                  onClick={() => handleFilterChange('recommendation', rec)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    filters.recommendation === rec
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {t(`stockCard.aiRecommendation.${rec}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Reset Button */}
          <div className="flex justify-end pt-4 border-t">
            <button
              onClick={resetFilters}
              className="chrome-pill-btn flex items-center space-x-2 text-sm"
            >
              <X className="h-4 w-4" />
              <span className="font-medium">{t('filters.reset')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Active Filters Summary */}
      <div className="mt-4 pt-4 border-t">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>{t('filters.activeFilters')}</span>
          <div className="flex items-center space-x-4">
            {searchTerm && (
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                {t('filters.search')}: "{searchTerm}"
              </span>
            )}
            {filters.sector !== 'all' && (
              <span className="bg-green-100 text-green-800 px-2 py-1 rounded">
                {t('filters.sector')}: {filters.sector}
              </span>
            )}
            {filters.recommendation !== 'all' && (
              <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded">
                {t('filters.recommendation')}: {t(`stockCard.aiRecommendation.${filters.recommendation}`)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdvancedFilters;