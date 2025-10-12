// Dados abrangentes de ações com indicadores técnicos e análise IA
export const generateStockData = () => {
  const stocks = [
    {
      symbol: 'AAPL',
      name: 'Apple Inc.',
      sector: 'Technology',
      price: 175.43,
      change: 2.34,
      changePercent: 1.35,
      aiScore: 92,
      aiProbability: 0.87,
      riskLevel: 'Medium',
      volume: 45234567,
      avgVolume: 52000000,
      marketCap: '2.8T',
      peRatio: 28.5,
      pbRatio: 12.3,
      roe: 0.175,
      roa: 0.089,
      debtToEquity: 1.73,
      currentRatio: 1.04,
      quickRatio: 0.87,
      grossMargin: 0.382,
      operatingMargin: 0.297,
      netMargin: 0.253,
      beta: 1.24,
      eps: 6.16,
      dividendYield: 0.0044,
      week52High: 199.62,
      week52Low: 164.08,
      rsi: 58.3,
      macd: 1.23,
      sma20: 172.45,
      sma50: 168.92,
      sma200: 171.33,
      bollingerUpper: 180.25,
      bollingerLower: 165.87,
      support: 170.00,
      resistance: 185.00,
      targetPrice: 195.00,
      analystRating: 'Buy',
      priceHistory: generatePriceHistory(175.43, 30),
      volumeHistory: generateVolumeHistory(45234567, 30),
      technicalIndicators: {
        rsi: generateRSIHistory(58.3, 30),
        macd: generateMACDHistory(1.23, 30),
        bollinger: generateBollingerHistory(175.43, 30)
      }
    },
    {
      symbol: 'MSFT',
      name: 'Microsoft Corporation',
      sector: 'Technology',
      price: 338.11,
      change: 1.87,
      changePercent: 0.56,
      aiScore: 89,
      aiProbability: 0.82,
      riskLevel: 'Low',
      volume: 23456789,
      avgVolume: 28000000,
      marketCap: '2.5T',
      peRatio: 32.1,
      pbRatio: 8.9,
      roe: 0.189,
      roa: 0.098,
      debtToEquity: 0.47,
      currentRatio: 2.48,
      quickRatio: 2.41,
      grossMargin: 0.689,
      operatingMargin: 0.421,
      netMargin: 0.342,
      beta: 0.89,
      eps: 10.54,
      dividendYield: 0.0072,
      week52High: 348.10,
      week52Low: 309.45,
      rsi: 62.1,
      macd: 2.45,
      sma20: 335.67,
      sma50: 332.18,
      sma200: 328.91,
      bollingerUpper: 345.20,
      bollingerLower: 325.80,
      support: 330.00,
      resistance: 350.00,
      targetPrice: 365.00,
      analystRating: 'Strong Buy',
      priceHistory: generatePriceHistory(338.11, 30),
      volumeHistory: generateVolumeHistory(23456789, 30),
      technicalIndicators: {
        rsi: generateRSIHistory(62.1, 30),
        macd: generateMACDHistory(2.45, 30),
        bollinger: generateBollingerHistory(338.11, 30)
      }
    },
    {
      symbol: 'NVDA',
      name: 'NVIDIA Corporation',
      sector: 'Technology',
      price: 875.28,
      change: 4.67,
      changePercent: 0.54,
      aiScore: 95,
      aiProbability: 0.91,
      riskLevel: 'High',
      volume: 67890123,
      avgVolume: 45000000,
      marketCap: '2.1T',
      peRatio: 65.8,
      pbRatio: 28.4,
      roe: 0.234,
      roa: 0.156,
      debtToEquity: 0.24,
      currentRatio: 3.92,
      quickRatio: 3.45,
      grossMargin: 0.732,
      operatingMargin: 0.321,
      netMargin: 0.289,
      beta: 1.68,
      eps: 13.31,
      dividendYield: 0.0003,
      week52High: 974.00,
      week52Low: 394.75,
      rsi: 71.2,
      macd: 15.67,
      sma20: 845.32,
      sma50: 798.45,
      sma200: 612.89,
      bollingerUpper: 920.50,
      bollingerLower: 780.25,
      support: 800.00,
      resistance: 950.00,
      targetPrice: 1050.00,
      analystRating: 'Strong Buy',
      priceHistory: generatePriceHistory(875.28, 30),
      volumeHistory: generateVolumeHistory(67890123, 30),
      technicalIndicators: {
        rsi: generateRSIHistory(71.2, 30),
        macd: generateMACDHistory(15.67, 30),
        bollinger: generateBollingerHistory(875.28, 30)
      }
    },
    {
      symbol: 'GOOGL',
      name: 'Alphabet Inc.',
      sector: 'Technology',
      price: 138.21,
      change: -0.45,
      changePercent: -0.32,
      aiScore: 78,
      aiProbability: 0.73,
      riskLevel: 'Medium',
      volume: 34567890,
      avgVolume: 31000000,
      marketCap: '1.7T',
      peRatio: 25.3,
      pbRatio: 4.8,
      roe: 0.142,
      roa: 0.089,
      debtToEquity: 0.12,
      currentRatio: 2.87,
      quickRatio: 2.76,
      grossMargin: 0.567,
      operatingMargin: 0.287,
      netMargin: 0.234,
      beta: 1.05,
      eps: 5.46,
      dividendYield: 0.0000,
      week52High: 153.78,
      week52Low: 121.46,
      rsi: 45.8,
      macd: -0.87,
      sma20: 140.67,
      sma50: 142.33,
      sma200: 139.45,
      bollingerUpper: 148.90,
      bollingerLower: 132.50,
      support: 135.00,
      resistance: 145.00,
      targetPrice: 155.00,
      analystRating: 'Hold',
      priceHistory: generatePriceHistory(138.21, 30),
      volumeHistory: generateVolumeHistory(34567890, 30),
      technicalIndicators: {
        rsi: generateRSIHistory(45.8, 30),
        macd: generateMACDHistory(-0.87, 30),
        bollinger: generateBollingerHistory(138.21, 30)
      }
    },
    {
      symbol: 'TSLA',
      name: 'Tesla Inc.',
      sector: 'Consumer Discretionary',
      price: 248.50,
      change: 3.21,
      changePercent: 1.31,
      aiScore: 72,
      aiProbability: 0.68,
      riskLevel: 'Very High',
      volume: 89012345,
      avgVolume: 75000000,
      marketCap: '789B',
      peRatio: 65.2,
      pbRatio: 12.7,
      roe: 0.198,
      roa: 0.087,
      debtToEquity: 0.17,
      currentRatio: 1.29,
      quickRatio: 0.92,
      grossMargin: 0.194,
      operatingMargin: 0.096,
      netMargin: 0.078,
      beta: 2.34,
      eps: 3.81,
      dividendYield: 0.0000,
      week52High: 299.29,
      week52Low: 138.80,
      rsi: 68.9,
      macd: 8.45,
      sma20: 235.67,
      sma50: 218.92,
      sma200: 201.33,
      bollingerUpper: 265.25,
      bollingerLower: 220.87,
      support: 230.00,
      resistance: 270.00,
      targetPrice: 285.00,
      analystRating: 'Buy',
      priceHistory: generatePriceHistory(248.50, 30),
      volumeHistory: generateVolumeHistory(89012345, 30),
      technicalIndicators: {
        rsi: generateRSIHistory(68.9, 30),
        macd: generateMACDHistory(8.45, 30),
        bollinger: generateBollingerHistory(248.50, 30)
      }
    }
  ];

  return stocks;
};

// Função para gerar histórico de preços
function generatePriceHistory(currentPrice, days) {
  const history = [];
  let price = currentPrice * 0.95; // Começar 5% abaixo do preço atual
  
  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    
    // Simular variação de preço realista
    const variation = (Math.random() - 0.5) * 0.04; // ±2% variação diária
    price = price * (1 + variation);
    
    const open = price * (1 + (Math.random() - 0.5) * 0.01);
    const high = Math.max(open, price) * (1 + Math.random() * 0.02);
    const low = Math.min(open, price) * (1 - Math.random() * 0.02);
    
    history.push({
      date: date.toISOString().split('T')[0],
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(price.toFixed(2)),
      volume: Math.floor(Math.random() * 50000000 + 10000000)
    });
  }
  
  return history;
}

// Função para gerar histórico de volume
function generateVolumeHistory(avgVolume, days) {
  const history = [];
  
  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    
    const variation = (Math.random() - 0.5) * 0.6; // ±30% variação
    const volume = Math.floor(avgVolume * (1 + variation));
    
    history.push({
      date: date.toISOString().split('T')[0],
      volume: volume
    });
  }
  
  return history;
}

// Função para gerar histórico RSI
function generateRSIHistory(currentRSI, days) {
  const history = [];
  let rsi = currentRSI;
  
  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    
    const variation = (Math.random() - 0.5) * 10; // ±5 pontos
    rsi = Math.max(0, Math.min(100, rsi + variation));
    
    history.push({
      date: date.toISOString().split('T')[0],
      rsi: parseFloat(rsi.toFixed(1))
    });
  }
  
  return history;
}

// Função para gerar histórico MACD
function generateMACDHistory(currentMACD, days) {
  const history = [];
  let macd = currentMACD;
  
  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    
    const variation = (Math.random() - 0.5) * 2; // ±1 ponto
    macd = macd + variation;
    
    history.push({
      date: date.toISOString().split('T')[0],
      macd: parseFloat(macd.toFixed(2)),
      signal: parseFloat((macd * 0.9).toFixed(2)),
      histogram: parseFloat((macd * 0.1).toFixed(2))
    });
  }
  
  return history;
}

// Função para gerar histórico Bollinger Bands
function generateBollingerHistory(currentPrice, days) {
  const history = [];
  let price = currentPrice;
  
  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    
    const variation = (Math.random() - 0.5) * 0.04;
    price = price * (1 + variation);
    
    const sma = price;
    const upper = sma * 1.05;
    const lower = sma * 0.95;
    
    history.push({
      date: date.toISOString().split('T')[0],
      upper: parseFloat(upper.toFixed(2)),
      middle: parseFloat(sma.toFixed(2)),
      lower: parseFloat(lower.toFixed(2))
    });
  }
  
  return history;
}

// Dados de análise setorial
export const sectorAnalysis = [
  {
    sector: 'Technology',
    performance: 15.8,
    aiScoreAvg: 82.4,
    stocks: 245,
    marketCap: '12.8T',
    topStocks: ['AAPL', 'MSFT', 'NVDA', 'GOOGL']
  },
  {
    sector: 'Healthcare',
    performance: 8.3,
    aiScoreAvg: 74.2,
    stocks: 189,
    marketCap: '4.2T',
    topStocks: ['JNJ', 'PFE', 'UNH', 'ABBV']
  },
  {
    sector: 'Financial Services',
    performance: 12.1,
    aiScoreAvg: 71.8,
    stocks: 156,
    marketCap: '3.9T',
    topStocks: ['JPM', 'BAC', 'WFC', 'GS']
  },
  {
    sector: 'Consumer Discretionary',
    performance: 18.7,
    aiScoreAvg: 69.5,
    stocks: 134,
    marketCap: '2.8T',
    topStocks: ['AMZN', 'TSLA', 'HD', 'MCD']
  },
  {
    sector: 'Communication Services',
    performance: 6.9,
    aiScoreAvg: 67.3,
    stocks: 98,
    marketCap: '2.1T',
    topStocks: ['META', 'NFLX', 'DIS', 'CMCSA']
  }
];

// Dados de comparação de mercados globais
export const marketComparison = [
  {
    market: 'S&P 500',
    current: 4567.89,
    change: 23.45,
    changePercent: 0.52,
    ytdReturn: 12.8
  },
  {
    market: 'NASDAQ',
    current: 14234.56,
    change: 89.12,
    changePercent: 0.63,
    ytdReturn: 18.9
  },
  {
    market: 'Dow Jones',
    current: 34567.12,
    change: 156.78,
    changePercent: 0.46,
    ytdReturn: 8.4
  },
  {
    market: 'FTSE 100',
    current: 7456.23,
    change: -12.34,
    changePercent: -0.16,
    ytdReturn: 5.2
  },
  {
    market: 'Nikkei 225',
    current: 28934.56,
    change: 234.12,
    changePercent: 0.82,
    ytdReturn: 15.6
  },
  {
    market: 'DAX',
    current: 15678.90,
    change: 45.67,
    changePercent: 0.29,
    ytdReturn: 9.8
  }
];

// Dados de performance do mercado
export const marketPerformance = {
  sp500: {
    current: 4567.89,
    change: 23.45,
    changePercent: 0.52,
    ytdReturn: 12.8,
    peRatio: 21.4,
    dividendYield: 1.6
  },
  nasdaq: {
    current: 14234.56,
    change: 89.12,
    changePercent: 0.63,
    ytdReturn: 18.9,
    peRatio: 28.7,
    dividendYield: 0.9
  },
  dowJones: {
    current: 34567.12,
    change: 156.78,
    changePercent: 0.46,
    ytdReturn: 8.4,
    peRatio: 19.8,
    dividendYield: 2.1
  }
};