import React from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingUp, TrendingDown } from 'lucide-react';

const StockCard = ({ stock }) => {
  const { t } = useTranslation();
  
  const getAIScoreColor = (score) => {
    if (score >= 80) return 'text-green-600 bg-green-100';
    if (score >= 60) return 'text-blue-600 bg-blue-100';
    if (score >= 40) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getRecommendation = (score) => {
    if (score >= 80) return t('stockCard.aiRecommendation.strongBuy');
    if (score >= 60) return t('stockCard.aiRecommendation.buy');
    if (score >= 40) return t('stockCard.aiRecommendation.hold');
    if (score >= 20) return t('stockCard.aiRecommendation.sell');
    return t('stockCard.aiRecommendation.strongSell');
  };

  const formatNumber = (num) => {
    if (num >= 1e12) return `$${(num / 1e12).toFixed(1)}T`;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
    return `$${num.toLocaleString()}`;
  };

  const formatVolume = (volume) => {
    if (volume >= 1e9) return `${(volume / 1e9).toFixed(1)}B`;
    if (volume >= 1e6) return `${(volume / 1e6).toFixed(1)}M`;
    if (volume >= 1e3) return `${(volume / 1e3).toFixed(1)}K`;
    return volume.toLocaleString();
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{stock.symbol}</h3>
          <p className="text-sm text-gray-600">{stock.name}</p>
        </div>
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${getAIScoreColor(stock.aiScore)}`}>
          AI: {stock.aiScore}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-2xl font-bold text-gray-900">${stock.price}</span>
          <div className={`flex items-center space-x-1 ${stock.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {stock.change >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            <span className="font-medium">{stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}%</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">{t('stockCard.volume')}</span>
            <p className="font-medium text-gray-900">{formatVolume(stock.volume)}</p>
          </div>
          <div>
            <span className="text-gray-500">{t('stockCard.marketCap')}</span>
            <p className="font-medium text-gray-900">{formatNumber(stock.marketCap)}</p>
          </div>
          <div>
            <span className="text-gray-500">{t('stockCard.peRatio')}</span>
            <p className="font-medium text-gray-900">{stock.peRatio}</p>
          </div>
          <div>
            <span className="text-gray-500">AI Rec.</span>
            <p className="font-medium text-gray-900">{getRecommendation(stock.aiScore)}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StockCard;