import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Interceptor para agregar token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const login = async (correo, password) => {
  const response = await api.post('/auth/login', { correo, password });
  if (response.data.access_token) {
    localStorage.setItem('access_token', response.data.access_token);
  }
  return response.data;
};

export const logout = async () => {
  await api.post('/auth/logout');
  localStorage.removeItem('access_token');
};

export const getMe = async () => {
  const response = await api.get('/auth/me');
  return response.data;
};

export default api;