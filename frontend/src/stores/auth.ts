import { defineStore } from 'pinia';
import { api } from '../api/client';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('ww_token') || '',
    email: localStorage.getItem('ww_email') || '',
  }),
  getters: {
    isLoggedIn: (s) => !!s.token,
  },
  actions: {
    setSession(token: string, email: string) {
      this.token = token;
      this.email = email;
      localStorage.setItem('ww_token', token);
      localStorage.setItem('ww_email', email);
    },
    async register(payload: {
      email: string;
      password: string;
      citizenName: string;
      countryId: number;
    }) {
      const { data } = await api.post('/auth/register', payload);
      this.setSession(data.token, data.user.email);
    },
    async login(email: string, password: string) {
      const { data } = await api.post('/auth/login', { email, password });
      this.setSession(data.token, data.user.email);
    },
    logout() {
      this.token = '';
      this.email = '';
      localStorage.removeItem('ww_token');
      localStorage.removeItem('ww_email');
    },
  },
});
