import api from './api';

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
  metadata?: {
    intent?: string;
    confidence?: number;
    entities?: any[];
    language?: string;
    feedback?: {
      rating: number;
      comment: string;
      timestamp: Date;
    };
  };
}

export interface Conversation {
  sessionId: string;
  lastActivity: Date;
  messageCount: number;
  lastMessage: string;
  topic: string;
}

export interface ConversationResponse {
  sessionId: string;
  conversationId: string;
  welcomeMessage: string;
  suggestedQuestions: string[];
}

export interface MessageResponse {
  response: string;
  intent: string;
  confidence: number;
  suggestedQuestions: string[];
}

export const assistantApi = {
  // Start new conversation
  startConversation: async (language: string = 'en'): Promise<ConversationResponse> => {
    const response = await api.post('/assistant/conversation/start', { language });
    return response.data.data;
  },

  // Send message
  sendMessage: async (sessionId: string, message: string, language: string = 'en'): Promise<MessageResponse> => {
    const response = await api.post(`/assistant/conversation/${sessionId}/message`, {
      message,
      language
    });
    return response.data.data;
  },

  // Get conversation history
  getHistory: async (sessionId: string, limit: number = 50): Promise<{ messages: Message[]; context: any }> => {
    const response = await api.get(`/assistant/conversation/${sessionId}/history`, {
      params: { limit }
    });
    return response.data.data;
  },

  // Get user conversations
  getConversations: async (page: number = 1, limit: number = 10): Promise<{ conversations: Conversation[]; pagination: any }> => {
    const response = await api.get('/assistant/conversations', {
      params: { page, limit }
    });
    return response.data.data;
  },

  // Delete conversation
  deleteConversation: async (sessionId: string): Promise<void> => {
    await api.delete(`/assistant/conversation/${sessionId}`);
  },

  // Send feedback
  sendFeedback: async (sessionId: string, messageId: string, rating: number, feedback?: string): Promise<void> => {
    await api.post('/assistant/feedback', {
      sessionId,
      messageId,
      rating,
      feedback
    });
  }
};