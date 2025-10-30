import axios, { AxiosInstance } from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export class UniPileService {
  private apiKey: string;
  private baseURL: string;
  private client: AxiosInstance;

  constructor(apiKey?: string, baseURL?: string) {
    // Use provided credentials or fall back to environment variables
    this.apiKey = apiKey || process.env.UNIPILE_API_KEY || '';
    this.baseURL = baseURL || process.env.UNIPILE_API_URL || 'https://api14.unipile.com:14429/api/v1';
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'X-API-KEY': this.apiKey,
        'accept': 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  /**
   * Create a new UniPile service instance with user-specific credentials
   */
  static createForUser(apiKey: string, baseURL: string): UniPileService {
    return new UniPileService(apiKey, baseURL);
  }

  /**
   * Get all connected accounts
   */
  async getAccounts() {
    try {
      const response = await this.client.get('/accounts');
      // UniPile returns accounts in response.data.items array
      return response.data.items || [];
    } catch (error: any) {
      console.error('UniPile getAccounts error:', error.response?.data || error.message);
      throw new Error(`Failed to fetch accounts: ${error.message}`);
    }
  }

  /**
   * Get a specific account by ID
   */
  async getAccount(accountId: string) {
    try {
      const response = await this.client.get(`/accounts/${accountId}`);
      return response.data;
    } catch (error: any) {
      console.error('UniPile getAccount error:', error.response?.data || error.message);
      throw new Error(`Failed to fetch account: ${error.message}`);
    }
  }

  /**
   * Get chats for an account
   */
  async getChats(accountId?: string, params?: { limit?: number; offset?: number }) {
    try {
      // UniPile uses /chats endpoint, not /accounts/{accountId}/chats
      const response = await this.client.get('/chats', { params });
      // UniPile returns chats in response.data.items array
      const allChats = response.data.items || [];
      
      // Filter by account ID if provided
      if (accountId) {
        return allChats.filter((chat: any) => chat.account_id === accountId);
      }
      
      return allChats;
    } catch (error: any) {
      console.error('UniPile getChats error:', error.response?.data || error.message);
      throw new Error(`Failed to fetch chats: ${error.message}`);
    }
  }

  /**
   * Get messages for a specific chat
   */
  async getMessages(accountId: string, chatId: string, params?: { limit?: number; offset?: number }) {
    try {
      // UniPile uses /chats/{chatId}/messages endpoint
      const response = await this.client.get(
        `/chats/${chatId}/messages`,
        { params }
      );
      // UniPile returns messages in response.data.items array
      return response.data.items || [];
    } catch (error: any) {
      console.error('UniPile getMessages error:', error.response?.data || error.message);
      throw new Error(`Failed to fetch messages: ${error.message}`);
    }
  }

  /**
   * Send a message
   */
  async sendMessage(accountId: string, chatId: string, message: {
    body: string;
    attachments?: Array<{ url: string; filename: string }>;
  }) {
    try {
      console.log(`📤 Sending message via UniPile:`, {
        accountId,
        chatId,
        message,
        endpoint: `/chats/${chatId}/messages`
      });
      
      // Use the correct UniPile API endpoint: POST /api/v1/chats/{chat_id}/messages
      // With multipart/form-data format for existing chats
      const FormData = require('form-data');
      const formData = new FormData();
      
      formData.append('text', message.body);
      
      // Add attachments if any
      if (message.attachments && message.attachments.length > 0) {
        message.attachments.forEach((attachment, index) => {
          formData.append('attachments', attachment.url);
        });
      }
      
      const response = await this.client.post(`/chats/${chatId}/messages`, formData, {
        headers: {
          ...formData.getHeaders(),
          'X-API-KEY': this.apiKey,
        },
      });
      
      console.log(`✅ Message sent successfully:`, response.data);
      return response.data;
    } catch (error: any) {
      console.error('UniPile sendMessage error:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
        endpoint: `/chats/${chatId}/messages`
      });
      throw new Error(`Failed to send message: ${error.message}`);
    }
  }

  /**
   * Mark messages as read
   */
  async markAsRead(accountId: string, chatId: string) {
    try {
      const response = await this.client.post(
        `/accounts/${accountId}/chats/${chatId}/mark-read`
      );
      return response.data;
    } catch (error: any) {
      console.error('UniPile markAsRead error:', error.response?.data || error.message);
      throw new Error(`Failed to mark as read: ${error.message}`);
    }
  }

  /**
   * Get account status
   */
  async getAccountStatus(accountId: string) {
    try {
      const response = await this.client.get(`/accounts/${accountId}/status`);
      return response.data;
    } catch (error: any) {
      console.error('UniPile getAccountStatus error:', error.response?.data || error.message);
      throw new Error(`Failed to get account status: ${error.message}`);
    }
  }
}

export const unipileService = new UniPileService();

