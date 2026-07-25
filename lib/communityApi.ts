import api from './api';

export interface CommunityPost {
  _id: string;
  title: string;
  content: string;
  author: {
    _id: string;
    name: string;
    profilePicture?: string;
    location?: any;
    role?: string;
    expertise?: string[];
  };
  group?: {
    _id: string;
    name: string;
    category: string;
  };
  type: 'question' | 'discussion' | 'tip' | 'experience' | 'problem' | 'success_story';
  category: 'crops' | 'livestock' | 'equipment' | 'weather' | 'market' | 'government' | 'general';
  tags: string[];
  location?: {
    state: string;
    district: string;
    village?: string;
  };
  attachments: Array<{
    url: string;
    type: 'image' | 'video' | 'document';
    filename: string;
  }>;
  reactions: Array<{
    user: string;
    type: 'like' | 'love' | 'helpful' | 'thanks';
    createdAt: Date;
  }>;
  comments: Array<{
    _id: string;
    author: {
      _id: string;
      name: string;
      profilePicture?: string;
      role?: string;
    };
    content: string;
    reactions: any[];
    isAnswer: boolean;
    attachments: any[];
    createdAt: Date;
  }>;
  views: number;
  shares: number;
  isPinned: boolean;
  isFeatured: boolean;
  isResolved: boolean;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  language: 'en' | 'hi' | 'te';
  createdAt: Date;
  updatedAt: Date;
  reactionCount: number;
  commentCount: number;
  score: number;
}

export interface CommunityGroup {
  _id: string;
  name: string;
  description: string;
  avatar?: string;
  category: string;
  subcategory?: string;
  location?: {
    state: string;
    district: string;
    village?: string;
  };
  privacy: 'public' | 'private' | 'invite_only';
  language: 'en' | 'hi' | 'te' | 'mixed';
  members: Array<{
    user: {
      _id: string;
      name: string;
      profilePicture?: string;
    };
    role: 'member' | 'moderator' | 'admin' | 'expert';
    joinedAt: Date;
    isActive: boolean;
  }>;
  createdBy: {
    _id: string;
    name: string;
    profilePicture?: string;
  };
  tags: string[];
  isActive: boolean;
  isVerified: boolean;
  createdAt: Date;
  memberCount: number;
}

export interface CreatePostData {
  title: string;
  content: string;
  type: string;
  category: string;
  tags?: string[];
  groupId?: string;
  location?: any;
  metadata?: any;
  language?: string;
}

export interface CreateGroupData {
  name: string;
  description: string;
  category: string;
  subcategory?: string;
  privacy?: string;
  location?: any;
  language?: string;
  tags?: string[];
}

export const communityApi = {
  // Get community feed
  getFeed: async (params?: {
    page?: number;
    limit?: number;
    type?: 'trending' | 'expert';
    category?: string;
  }) => {
    const response = await api.get('/community/feed', { params });
    return response.data;
  },

  // Create new post
  createPost: async (postData: CreatePostData, attachments?: File[]) => {
    const formData = new FormData();
    
    Object.entries(postData).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (typeof value === 'object') {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, value.toString());
        }
      }
    });

    if (attachments) {
      attachments.forEach(file => {
        formData.append('attachments', file);
      });
    }

    const response = await api.post('/community/posts', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Get single post
  getPost: async (postId: string) => {
    const response = await api.get(`/community/posts/${postId}`);
    return response.data;
  },

  // React to post
  reactToPost: async (postId: string, type: string = 'like') => {
    const response = await api.post(`/community/posts/${postId}/react`, { type });
    return response.data;
  },

  // Add comment to post
  addComment: async (postId: string, content: string, attachments?: File[]) => {
    const formData = new FormData();
    formData.append('content', content);

    if (attachments) {
      attachments.forEach(file => {
        formData.append('attachments', file);
      });
    }

    const response = await api.post(`/community/posts/${postId}/comments`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Mark comment as answer
  markAnswer: async (postId: string, commentId: string) => {
    const response = await api.post(`/community/posts/${postId}/comments/${commentId}/mark-answer`);
    return response.data;
  },

  // Search posts
  searchPosts: async (params: {
    q: string;
    category?: string;
    type?: string;
    location?: string;
    page?: number;
    limit?: number;
  }) => {
    const response = await api.get('/community/search', { params });
    return response.data;
  },

  // Get community groups
  getGroups: async (params?: {
    category?: string;
    location?: string;
    search?: string;
    type?: 'all' | 'recommended' | 'trending' | 'my';
    page?: number;
    limit?: number;
  }) => {
    const response = await api.get('/community/groups', { params });
    return response.data;
  },

  // Create new group
  createGroup: async (groupData: CreateGroupData, avatar?: File) => {
    const formData = new FormData();
    
    Object.entries(groupData).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (typeof value === 'object') {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, value.toString());
        }
      }
    });

    if (avatar) {
      formData.append('avatar', avatar);
    }

    const response = await api.post('/community/groups', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Join group
  joinGroup: async (groupId: string) => {
    const response = await api.post(`/community/groups/${groupId}/join`);
    return response.data;
  },

  // Leave group
  leaveGroup: async (groupId: string) => {
    const response = await api.post(`/community/groups/${groupId}/leave`);
    return response.data;
  },

  // Get group activity
  getGroupActivity: async (groupId: string, days?: number) => {
    const response = await api.get(`/community/groups/${groupId}/activity`, {
      params: { days }
    });
    return response.data;
  },

  // Get user stats
  getUserStats: async (userId: string) => {
    const response = await api.get(`/community/users/${userId}/stats`);
    return response.data;
  },

  // Get trending content
  getTrending: async (limit?: number) => {
    const response = await api.get('/community/trending', {
      params: { limit }
    });
    return response.data;
  }
};