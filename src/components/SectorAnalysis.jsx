import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts';
import { TrendingUp, TrendingDown, Activity, Target, BarChart3, PieChart as PieChartIcon, Search } from 'lucide-react';
import { sectorAnalysis as sectorData, marketComparison } from '../data/stockData';

const SectorAnalysis = ({ globalSearchTerm }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('performance');
  const [filteredSectors, setFilteredSectors] = useState(sectorData);
  const [localSearchTerm, setLocalSearchTerm] = useState('');

  // Filter sectors based on global or local search
  useEffect(() => {
    const searchTerm = globalSearchTerm || localSearchTerm;
    if (searchTerm) {
      const filtered = sectorData.filter(sector =>
        sector.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredSectors(filtered);
    } else {
      setFilteredSectors(sectorData);
    }
  }, [globalSearchTerm, localSearchTerm]);

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658', '#FF7C7C', '#8DD1E1', '#D084D0'];

  const sectorPerformanceData = filteredSectors.map(sector => ({
    name: sector.name,
    performance: sector.performance,
    aiScore: sector.aiScore,
    marketCap: sector.marketCap / 1000, // Em trilhões
    volume: sector.volume / 1000000 // Em milhões
  }));

  const marketComparisonData = marketComparison.map(market => ({
    name: market.name,
    value: market.performance,
    aiScore: market.aiScore,
    volatility: market.volatility
  }));

  const radarData = filteredSectors.slice(0, 6).map(sector => ({
    sector: sector.name.substring(0, 8),
    performance: sector.performance + 50, // Normalizar para radar
    aiScore: sector.aiScore,
    volume: Math.min(sector.volume / 10000000, 100), // Normalizar
    marketCap: Math.min(sector.marketCap / 100000, 100) // Normalizar
  }));

  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text 
        x={x} 
        y={y} 
        fill="white" 
        textAnchor={x > cx ? 'start' : 'end'} 
        dominantBaseline="central"
        fontSize="12"
        fontWeight="bold"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  const tabs = [
    { id: 'performance', label: t('sectorAnalysis.performance'), icon: TrendingUp },
    { id: 'distribution', label: t('sectorAnalysis.distribution'), icon: PieChartIcon },
    { id: 'comparison', label: t('sectorAnalysis.comparison'), icon: BarChart3 },
    { id: 'radar', label: t('sectorAnalysis.radar'), icon: Activity }
  ];

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div className="flex items-center space-x-2">
          <h2 className="text-2xl font-bold text-gray-800">{t('sectorAnalysis.title')}</h2>
          <Target className="h-5 w-5 text-blue-600" />
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
            Mostrando {filteredSectors.length} de {sectorData.length} setores
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

      {/* Performance Tab */}
      {activeTab === 'performance' && (
      <div className="chrome-tab-panel space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sector Performance Chart */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-lg font-semibold mb-4">{t('sectorAnalysis.sectorPerformance')}</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={sectorPerformanceData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="name" 
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    fontSize={10}
                  />
                  <YAxis />
                  <Tooltip 
                    formatter={(value, name) => [
                      `${value.toFixed(2)}%`, 
                      name === 'performance' ? t('common.performance') : t('common.aiScore')
                    ]}
                  />
                  <Legend />
                  <Bar dataKey="performance" fill="#0088FE" name={t('common.performance')} />
                  <Bar dataKey="aiScore" fill="#00C49F" name={t('common.aiScore')} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Market Cap vs Volume */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-lg font-semibold mb-4">{t('sectorAnalysis.marketCapVolume')}</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={sectorPerformanceData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="name" 
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    fontSize={10}
                  />
                  <YAxis />
                  <Tooltip 
                    formatter={(value, name) => [
                      name === 'marketCap' ? `$${value.toFixed(1)}T` : `${value.toFixed(0)}M`,
                      name === 'marketCap' ? t('common.marketCap') : t('common.volume')
                    ]}
                  />
                  <Legend />
                  <Bar dataKey="marketCap" fill="#FFBB28" name={t('common.marketCap')} />
                  <Bar dataKey="volume" fill="#FF8042" name={t('common.volume')} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top Performers */}
          <div className="bg-gradient-to-r from-green-50 to-blue-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-4">{t('sectorAnalysis.topPerformers')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {filteredSectors
                .sort((a, b) => b.performance - a.performance)
                .slice(0, 3)
                .map((sector, index) => (
                  <div key={sector.name} className="bg-white p-4 rounded-lg shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-800">{sector.name}</span>
                      <span className={`text-sm px-2 py-1 rounded ${
                        index === 0 ? 'bg-yellow-100 text-yellow-800' :
                        index === 1 ? 'bg-gray-100 text-gray-800' :
                        'bg-orange-100 text-orange-800'
                      }`}>
                        #{index + 1}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <TrendingUp className="h-4 w-4 text-green-600" />
                      <span className="text-green-600 font-semibold">
                        +{sector.performance.toFixed(2)}%
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {t('common.aiScore')}: {sector.aiScore}/100
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Distribution Tab */}
      {activeTab === 'distribution' && (
      <div className="chrome-tab-panel grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-4">{t('sectorAnalysis.marketCapDistribution')}</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={sectorPerformanceData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderCustomizedLabel}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="marketCap"
                >
                  {sectorPerformanceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`$${value.toFixed(1)}T`, t('common.marketCap')]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-4">{t('sectorAnalysis.aiScoreDistribution')}</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={sectorPerformanceData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderCustomizedLabel}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="aiScore"
                >
                  {sectorPerformanceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [value, t('common.aiScore')]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Market Comparison Tab */}
      {activeTab === 'comparison' && (
      <div className="chrome-tab-panel space-y-6">
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-4">{t('sectorAnalysis.globalMarkets')}</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={marketComparisonData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip 
                  formatter={(value, name) => [
                    `${value.toFixed(2)}%`, 
                    name === 'value' ? t('common.performance') : 
                    name === 'aiScore' ? t('common.aiScore') : 
                    t('sectorAnalysis.volatility')
                  ]}
                />
                <Legend />
                <Line type="monotone" dataKey="value" stroke="#0088FE" name={t('common.performance')} />
                <Line type="monotone" dataKey="aiScore" stroke="#00C49F" name={t('common.aiScore')} />
                <Line type="monotone" dataKey="volatility" stroke="#FF8042" name={t('sectorAnalysis.volatility')} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {marketComparisonData.map((market, index) => (
              <div key={market.name} className="bg-white p-4 rounded-lg shadow-sm border">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-gray-800">{market.name}</h4>
                  {market.value >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-600" />
                  )}
                </div>
                <div className={`text-lg font-bold ${
                  market.value >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {market.value >= 0 ? '+' : ''}{market.value.toFixed(2)}%
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  {t('common.aiScore')}: {market.aiScore}/100
                </div>
                <div className="text-sm text-gray-600">
                  {t('sectorAnalysis.volatility')}: {market.volatility.toFixed(1)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Radar Tab */}
      {activeTab === 'radar' && (
      <div className="chrome-tab-panel space-y-6">
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-4">{t('sectorAnalysis.multidimensionalAnalysis')}</h3>
            <ResponsiveContainer width="100%" height={400}>
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="sector" />
                <PolarRadiusAxis angle={90} domain={[0, 100]} />
                <Radar
                  name={t('common.performance')}
                  dataKey="performance"
                  stroke="#0088FE"
                  fill="#0088FE"
                  fillOpacity={0.1}
                />
                <Radar
                  name={t('common.aiScore')}
                  dataKey="aiScore"
                  stroke="#00C49F"
                  fill="#00C49F"
                  fillOpacity={0.1}
                />
                <Radar
                  name={t('common.volume')}
                  dataKey="volume"
                  stroke="#FFBB28"
                  fill="#FFBB28"
                  fillOpacity={0.1}
                />
                <Radar
                  name={t('common.marketCap')}
                  dataKey="marketCap"
                  stroke="#FF8042"
                  fill="#FF8042"
                  fillOpacity={0.1}
                />
                <Legend />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
            
            <div className="mt-4 text-sm text-gray-600">
              <p>{t('sectorAnalysis.radarDescription')}</p>
            </div>
          </div>
        </div>
      )}
    );
};

export default SectorAnalysis;