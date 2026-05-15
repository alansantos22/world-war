import axios from 'axios';

export const api = axios.create({ baseURL: '/api' });

// Anexa o token JWT em todas as requisicoes.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ww_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Extrai a mensagem de erro da API.
export function apiError(err: any): string {
  const msg = err?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(', ');
  return msg || err?.message || 'Erro inesperado';
}
