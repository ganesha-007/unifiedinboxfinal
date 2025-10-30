import axios, { AxiosInstance } from 'axios';

// Normalize API base URL so that '/api' path is always present, regardless of env value
const RAW_API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001';
const API_BASE_URL = RAW_API_BASE.endsWith('/api') ? RAW_API_BASE : `${RAW_API_BASE.replace(/\/$/, '')}/api`;


export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Only redirect to login if it's a general auth error, not a specific service error
      const errorMessage = error.response?.data?.error || '';
      const isServiceSpecificError = errorMessage.includes('reconnect') || 
                                   errorMessage.includes('expired') ||
                                   errorMessage.includes('Outlook') ||
                                   errorMessage.includes('Gmail');
      
      if (!isServiceSpecificError) {
        localStorage.removeItem('authToken');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

