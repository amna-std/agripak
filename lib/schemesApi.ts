import axios from 'axios'

const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? '/api' 
  : 'http://localhost:3000/api'

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add request interceptor for auth
api.interceptors.request.use(
  (config) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

export interface Scheme {
  id: string
  title: string
  titleHi?: string
  titleTe?: string
  description: string
  descriptionHi?: string
  descriptionTe?: string
  amount: string
  deadline: string
  status: "active" | "new" | "featured" | "expired"
  category: string
  level: "central" | "state"
  eligibility: string
  documents: string[]
  applicationLink: string
  benefits?: string
  howToApply?: string
}

export interface SchemeCategory {
  id: string
  name: string
  nameHi?: string
  nameTe?: string
}

export interface SchemesResponse {
  schemes: Scheme[]
  categories: SchemeCategory[]
  pagination: {
    current: number
    total: number
    limit: number
    totalSchemes: number
  }
  filters: {
    category?: string
    level?: string
    search?: string
  }
}

export interface SchemeFilters {
  category?: string
  level?: string
  search?: string
  language?: string
  limit?: number
  page?: number
}

export interface ApplicationData {
  schemeId: string
  userId: string
  personalInfo: {
    name: string
    phone: string
    email?: string
    /** CNIC — Pakistan's national identity number, issued by NADRA. */
    cnic: string
  }
  farmingInfo: {
    landSize: number
    landUnit: string
    farmingType: string
    primaryCrop: string
    state: string
    district: string
    village: string
  }
  documents: {
    [key: string]: File | string
  }
}

export interface ApplicationResponse {
  applicationId: string
  status: "submitted" | "under_review" | "approved" | "rejected"
  message: string
  estimatedProcessingTime: string
  nextSteps: string[]
}

export const schemesApi = {
  // Get all schemes with filters
  getSchemes: async (filters: SchemeFilters = {}): Promise<SchemesResponse> => {
    try {
      const params = new URLSearchParams()
      
      if (filters.category) params.append('category', filters.category)
      if (filters.level) params.append('level', filters.level)
      if (filters.search) params.append('search', filters.search)
      if (filters.language) params.append('language', filters.language)
      if (filters.limit) params.append('limit', filters.limit.toString())
      if (filters.page) params.append('page', filters.page.toString())

      const response = await api.get(`/schemes?${params.toString()}`)
      
      if (response.data.success) {
        return response.data.data
      } else {
        throw new Error(response.data.message || 'Failed to fetch schemes')
      }
    } catch (error) {
      console.error('Error fetching schemes:', error)
      throw error
    }
  },

  // Get scheme by ID
  getSchemeById: async (id: string, language: string = 'en'): Promise<Scheme> => {
    try {
      const response = await api.get(`/schemes/${id}?language=${language}`)
      
      if (response.data.success) {
        return response.data.data
      } else {
        throw new Error(response.data.message || 'Scheme not found')
      }
    } catch (error) {
      console.error('Error fetching scheme details:', error)
      throw error
    }
  },

  // Get featured schemes
  getFeaturedSchemes: async (limit: number = 6, language: string = 'en'): Promise<Scheme[]> => {
    try {
      const response = await api.get(`/schemes/featured?limit=${limit}&language=${language}`)
      
      if (response.data.success) {
        return response.data.data
      } else {
        throw new Error(response.data.message || 'Failed to fetch featured schemes')
      }
    } catch (error) {
      console.error('Error fetching featured schemes:', error)
      throw error
    }
  },

  // Get schemes by category
  getSchemesByCategory: async (category: string, language: string = 'en'): Promise<Scheme[]> => {
    try {
      const response = await api.get(`/schemes?category=${category}&language=${language}`)
      
      if (response.data.success) {
        return response.data.data.schemes
      } else {
        throw new Error(response.data.message || 'Failed to fetch schemes by category')
      }
    } catch (error) {
      console.error('Error fetching schemes by category:', error)
      throw error
    }
  },

  // Search schemes
  searchSchemes: async (query: string, language: string = 'en'): Promise<Scheme[]> => {
    try {
      const response = await api.get(`/schemes?search=${encodeURIComponent(query)}&language=${language}`)
      
      if (response.data.success) {
        return response.data.data.schemes
      } else {
        throw new Error(response.data.message || 'Failed to search schemes')
      }
    } catch (error) {
      console.error('Error searching schemes:', error)
      throw error
    }
  },

  // Submit scheme application
  submitApplication: async (applicationData: ApplicationData): Promise<ApplicationResponse> => {
    try {
      const response = await api.post('/schemes/apply', applicationData)
      
      if (response.data.success) {
        return response.data.data
      } else {
        throw new Error(response.data.message || 'Failed to submit application')
      }
    } catch (error) {
      console.error('Error submitting application:', error)
      throw error
    }
  },

  // Get application status
  getApplicationStatus: async (applicationId: string): Promise<any> => {
    try {
      const response = await api.get(`/schemes/applications/${applicationId}`)
      
      if (response.data.success) {
        return response.data.data
      } else {
        throw new Error(response.data.message || 'Failed to get application status')
      }
    } catch (error) {
      console.error('Error getting application status:', error)
      throw error
    }
  },

  // Get user applications
  getUserApplications: async (userId: string): Promise<any[]> => {
    try {
      const response = await api.get(`/schemes/applications?userId=${userId}`)
      
      if (response.data.success) {
        return response.data.data
      } else {
        throw new Error(response.data.message || 'Failed to get user applications')
      }
    } catch (error) {
      console.error('Error getting user applications:', error)
      throw error
    }
  },

  // Get scheme categories
  getCategories: async (language: string = 'en'): Promise<SchemeCategory[]> => {
    try {
      const response = await api.get(`/schemes/categories?language=${language}`)
      
      if (response.data.success) {
        return response.data.data
      } else {
        throw new Error(response.data.message || 'Failed to get categories')
      }
    } catch (error) {
      console.error('Error getting categories:', error)
      throw error
    }
  },

  // Check scheme eligibility
  checkEligibility: async (schemeId: string, userProfile: any): Promise<any> => {
    try {
      const response = await api.post(`/schemes/${schemeId}/eligibility`, userProfile)
      
      if (response.data.success) {
        return response.data.data
      } else {
        throw new Error(response.data.message || 'Failed to check eligibility')
      }
    } catch (error) {
      console.error('Error checking eligibility:', error)
      throw error
    }
  },

  // Get personalized scheme recommendations
  getPersonalizedSchemes: async (userProfile: any, language: string = 'en'): Promise<Scheme[]> => {
    try {
      const response = await api.post(`/schemes/personalized?language=${language}`, userProfile)
      
      if (response.data.success) {
        return response.data.data
      } else {
        throw new Error(response.data.message || 'Failed to get personalized schemes')
      }
    } catch (error) {
      console.error('Error getting personalized schemes:', error)
      throw error
    }
  },

  // Bookmark scheme
  bookmarkScheme: async (schemeId: string, userId: string): Promise<void> => {
    try {
      const response = await api.post(`/schemes/${schemeId}/bookmark`, { userId })
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to bookmark scheme')
      }
    } catch (error) {
      console.error('Error bookmarking scheme:', error)
      throw error
    }
  },

  // Remove bookmark
  removeBookmark: async (schemeId: string, userId: string): Promise<void> => {
    try {
      const response = await api.delete(`/schemes/${schemeId}/bookmark?userId=${userId}`)
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to remove bookmark')
      }
    } catch (error) {
      console.error('Error removing bookmark:', error)
      throw error
    }
  },

  // Get bookmarked schemes
  getBookmarkedSchemes: async (userId: string, language: string = 'en'): Promise<Scheme[]> => {
    try {
      const response = await api.get(`/schemes/bookmarks?userId=${userId}&language=${language}`)
      
      if (response.data.success) {
        return response.data.data
      } else {
        throw new Error(response.data.message || 'Failed to get bookmarked schemes')
      }
    } catch (error) {
      console.error('Error getting bookmarked schemes:', error)
      throw error
    }
  },

  // Rate scheme
  rateScheme: async (schemeId: string, userId: string, rating: number, comment?: string): Promise<void> => {
    try {
      const response = await api.post(`/schemes/${schemeId}/rate`, {
        userId,
        rating,
        comment
      })
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to rate scheme')
      }
    } catch (error) {
      console.error('Error rating scheme:', error)
      throw error
    }
  },

  // Get scheme statistics
  getSchemeStats: async (schemeId: string): Promise<any> => {
    try {
      const response = await api.get(`/schemes/${schemeId}/stats`)
      
      if (response.data.success) {
        return response.data.data
      } else {
        throw new Error(response.data.message || 'Failed to get scheme statistics')
      }
    } catch (error) {
      console.error('Error getting scheme statistics:', error)
      throw error
    }
  }
}

export default schemesApi