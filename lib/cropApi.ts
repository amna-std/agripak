import api from './api';

export interface CropRecommendation {
  _id: string;
  cropName: string;
  localNames: {
    en: string;
    hi: string;
    te: string;
  };
  category: string;
  season: string;
  duration: number;
  suitableSoils: string[];
  climateRequirements: {
    temperature: { min: number; max: number; optimal: number };
    rainfall: { min: number; max: number; optimal: number };
    humidity: { min: number; max: number };
  };
  sowingTime: { start: string; end: string; optimal: string };
  harvestTime: { start: string; end: string };
  expectedYield: { min: number; max: number; average: number };
  marketPrice: { min: number; max: number; average: number };
  profitability: string;
  investmentRequired: {
    seeds: number;
    fertilizers: number;
    pesticides: number;
    labor: number;
    irrigation: number;
    total: number;
  };
  waterRequirement: string;
  marketDemand: string;
  riskFactor: string;
  recommendationScore?: number;
  suitabilityReason?: string;
  riskAssessment?: {
    level: string;
    score: number;
    factors: string[];
  };
}

export interface SeasonalCalendar {
  currentSeason: string;
  currentMonth: string;
  activities: string[];
  recommendedCrops: CropRecommendation[];
  upcomingTasks: Array<{
    task: string;
    priority: string;
    dueDate: Date;
  }>;
  seasonalTips: string[];
}

export interface CropCategory {
  value: string;
  name: string;
  icon: string;
  color: string;
}

export const cropApi = {
  // Get personalized crop recommendations
  getRecommendations: async (params?: { season?: string; limit?: number }) => {
    const response = await api.get('/crops/recommendations', { params });
    return response.data;
  },

  // Get crop details by ID
  getCropDetails: async (cropId: string) => {
    const response = await api.get(`/crops/${cropId}`);
    return response.data;
  },

  // Get seasonal farming calendar
  getSeasonalCalendar: async () => {
    const response = await api.get('/crops/calendar/seasonal');
    return response.data;
  },

  // Get crop categories
  getCategories: async () => {
    const response = await api.get('/crops/meta/categories');
    return response.data;
  },

  // Disease detection (if needed in crop advisor)
  detectDisease: async (data: {
    imageBase64: string;
    cropType: string;
    symptoms?: string[];
  }) => {
    const response = await api.post('/crops/disease-detection', data);
    return response.data;
  },
};