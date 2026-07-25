import axios, { AxiosError } from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

// Types
type Detection = {
  _id: string;
  imageUrl: string;
  cropType: string;
  disease: string;
  confidence: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
  isFavorite: boolean;
  location?: {
    lat: number;
    lng: number;
    name: string;
  };
  treatments: {
    organic: string[];
    chemical: string[];
    cultural: string[];
  };
  preventionTips: string[];
  similarCases: Array<{
    imageUrl: string;
    disease: string;
    similarity: number;
  }>;
};

type Stats = {
  totalScans: number;
  diseasesDetected: number;
  accuracy: number;
  mostCommonCrop: string;
  mostCommonDisease: string;
  weeklyTrend: Array<{
    date: string;
    count: number;
  }>;
};

type DiseaseInfo = {
  id: string;
  name: string;
  scientificName: string;
  crop: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  symptoms: string[];
  prevention: string[];
  images: string[];
};

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30 seconds
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response) {
      // Server responded with an error status code
      // AxiosError types `data` as unknown, so narrow before reading `message`.
      const message =
        (error.response.data as { message?: string } | undefined)?.message || 'An error occurred';
      return Promise.reject(new Error(message));
    } else if (error.request) {
      // Request was made but no response received
      return Promise.reject(new Error('No response from server. Please check your connection.'));
    } else {
      // Something happened in setting up the request
      return Promise.reject(new Error('Request failed. Please try again.'));
    }
  }
);

export const diseaseApi = {
  /**
   * Analyze crop image for disease detection
   */
  analyzeImage: async (imageFile: File, cropType?: string, location?: any): Promise<{ success: boolean; data: Detection; message?: string }> => {
    const formData = new FormData();
    formData.append('image', imageFile);
    if (cropType) formData.append('cropType', cropType);
    if (location) {
      formData.append('location', JSON.stringify(location));
    }

    const response = await api.post('/disease/analyze', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  /**
   * Get user's detection history
   */
  getHistory: async (params?: {
    page?: number;
    limit?: number;
    severity?: string;
    crop?: string;
  }): Promise<{ success: boolean; data: Detection[]; total: number }> => {
    const response = await api.get('/disease/history', { params });
    return response.data;
  },

  /**
   * Get detection statistics
   */
  getStats: async (): Promise<{ success: boolean; data: Stats }> => {
    const response = await api.get('/disease/stats');
    return response.data;
  },

  /**
   * Get trending diseases
   */
  getTrending: async (): Promise<{ success: boolean; data: DiseaseInfo[] }> => {
    const response = await api.get('/disease/trending');
    return response.data;
  },

  /**
   * Search disease database
   */
  searchDatabase: async (params?: {
    search?: string;
    crop?: string;
    severity?: string;
  }): Promise<{ success: boolean; data: DiseaseInfo[] }> => {
    const response = await api.get('/disease/search', { params });
    return response.data;
  },

  /**
   * Toggle favorite status of a detection
   */
  toggleFavorite: async (detectionId: string): Promise<{ success: boolean; isFavorite: boolean }> => {
    const response = await api.patch(`/disease/${detectionId}/favorite`);
    return response.data;
  },

  /**
   * Get disease details by ID
   */
  getDiseaseDetails: async (diseaseId: string): Promise<{ success: boolean; data: DiseaseInfo }> => {
    const response = await api.get(`/disease/${diseaseId}`);
    return response.data;
  },

  /**
   * Delete a detection
   */
  deleteDetection: async (detectionId: string): Promise<{ success: boolean }> => {
    const response = await api.delete(`/disease/${detectionId}`);
    return response.data;
  },

  /**
   * Get similar cases for a detection
   */
  getSimilarCases: async (detectionId: string): Promise<{ success: boolean; data: Detection[] }> => {
    const response = await api.get(`/disease/${detectionId}/similar`);
    return response.data;
  },

  /**
   * Report incorrect diagnosis
   */
  reportIncorrectDiagnosis: async (
    detectionId: string, 
    reason: string
  ): Promise<{ success: boolean }> => {
    const response = await api.post(`/disease/${detectionId}/report`, { reason });
    return response.data;
  }
};