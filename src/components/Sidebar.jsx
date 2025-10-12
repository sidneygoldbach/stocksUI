import React from 'react';
import { useTranslation } from 'react-i18next';
import { 
  BarChart3, 
  TrendingUp, 
  PieChart, 
  Briefcase, 
  Eye, 
  Lightbulb, 
  Activity, 
  Settings, 
  Sliders
} from 'lucide-react';

const Sidebar = ({ activeTab, setActiveTab }) => {
  const { t } = useTranslation();

  const menuItems = [
    { id: 'dashboard', label: t('sidebar.dashboard'), icon: BarChart3 },
    { id: 'control-panel', label: 'Painel de Controle', icon: Sliders },
    { id: 'topStocks', label: t('sidebar.topStocks'), icon: TrendingUp },
    { id: 'etfs', label: t('sidebar.etfs'), icon: PieChart },
    { id: 'portfolio', label: t('sidebar.portfolio'), icon: Briefcase },
    { id: 'watchlist', label: t('sidebar.watchlist'), icon: Eye },
    { id: 'tradeIdeas', label: t('sidebar.tradeIdeas'), icon: Lightbulb },
    { id: 'analytics', label: t('sidebar.analytics'), icon: Activity },
    { id: 'settings', label: t('sidebar.settings'), icon: Settings },
  ];

  return (
    <aside className="w-64 bg-white border-r border-gray-200 h-full">
      <nav className="p-4 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left transition-colors ${
                isActive
                  ? 'bg-primary-50 text-primary-600 border border-primary-200'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-primary-600' : 'text-gray-400'}`} />
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
};

export default Sidebar;