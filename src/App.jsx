import { useState } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import TopStocks from './components/TopStocks';
import ControlPanel from './components/ControlPanel';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'top-stocks':
        return <TopStocks />;
      case 'control-panel':
        return <ControlPanel />;
      case 'etfs':
        return (
          <div className="p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">ETFs</h2>
            <p className="text-gray-600">Seção de ETFs em desenvolvimento...</p>
          </div>
        );
      case 'portfolio':
        return (
          <div className="p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Portfólio</h2>
            <p className="text-gray-600">Seção de Portfólio em desenvolvimento...</p>
          </div>
        );
      case 'watchlist':
        return (
          <div className="p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Watchlist</h2>
            <p className="text-gray-600">Seção de Watchlist em desenvolvimento...</p>
          </div>
        );
      case 'trade-ideas':
        return (
          <div className="p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Trade Ideas</h2>
            <p className="text-gray-600">Seção de Trade Ideas em desenvolvimento...</p>
          </div>
        );
      case 'analytics':
        return (
          <div className="p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Analytics</h2>
            <p className="text-gray-600">Seção de Analytics em desenvolvimento...</p>
          </div>
        );
      case 'settings':
        return (
          <div className="p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Configurações</h2>
            <p className="text-gray-600">Seção de Configurações em desenvolvimento...</p>
          </div>
        );
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="flex h-[calc(100vh-80px)]">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        <main className="flex-1 overflow-auto">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}

export default App;
