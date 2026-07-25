import api from './api';

export interface MarketPrice {
  _id: string;
  cropName: string;
  variety: string;
  market: {
    name: string;
    district: string;
    state: string;
  };
  prices: {
    minimum: number;
    maximum: number;
    modal: number;
    average: number;
  };
  date: Date;
  arrivals: number;
  trend: {
    direction: 'up' | 'down' | 'stable';
    percentage: string;
  };
  quality: string;
  priceAnalysis?: {
    level: string;
    position: number;
    volatility: number;
    recommendation: string;
  };
}

export interface MarketTrend {
  date: Date;
  price: number;
  arrivals: number;
}

export interface MarketAnalysis {
  summary: {
    totalCrops: number;
    totalMarkets: number;
    lastUpdated: Date;
    averagePriceChange: string;
  };
  topGainers: any[];
  topLosers: any[];
  cropAnalytics: any[];
  marketInsights: string[];
  recommendations: any[];
  seasonalAnalysis: any;
}

export interface NearbyMarket {
  name: string;
  district: string;
  state: string;
  distance: number;
  crops: string[];
  avgPrice: number;
  totalArrivals: number;
  lastUpdate: Date;
}

export interface PriceAlert {
  type: string;
  crop?: string;
  currentPrice?: number;
  previousPrice?: number;
  change?: string;
  severity: string;
  message: string;
  recommendation?: string;
  urgency: string;
  timestamp: Date;
}

export interface MarketForecast {
  crop: string;
  district: string;
  forecast: Array<{
    date: Date;
    predictedPrice: number;
    confidence: number;
  }>;
  trend: string;
  confidence: string;
}

export const marketApi = {
  // Get current market prices
  getPrices: async (params?: {
    crop?: string;
    district?: string;
    state?: string;
    limit?: number;
    sortBy?: string;
  }) => {
    const response = await api.get('/market/prices', { params });
    return response.data;
  },

  // Get price trends
  getTrends: async (params?: {
    crop?: string;
    days?: number;
    district?: string;
  }) => {
    const response = await api.get('/market/trends', { params });
    return response.data;
  },

  // Get market analysis
  getAnalysis: async () => {
    const response = await api.get('/market/analysis');
    return response.data;
  },

  // Get nearby markets
  getNearbyMarkets: async (radius?: number) => {
    const response = await api.get('/market/nearby', {
      params: { radius }
    });
    return response.data;
  },

  // Get price alerts
  getAlerts: async () => {
    const response = await api.get('/market/alerts');
    return response.data;
  },

  // Get market forecast
  getForecast: async (crop: string, days?: number) => {
    const response = await api.get('/market/forecast', {
      params: { crop, days }
    });
    return response.data;
  },

  // Update market prices
  updatePrices: async () => {
    const response = await api.post('/market/update');
    return response.data;
  },

  // Get market statistics
  getStats: async () => {
    const response = await api.get('/market/stats');
    return response.data;
  }
};