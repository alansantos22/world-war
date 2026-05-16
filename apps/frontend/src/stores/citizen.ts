import { defineStore } from 'pinia';
import { api } from '../api/client';

export const useCitizenStore = defineStore('citizen', {
  state: () => ({
    me: null as any,
    loading: false,
  }),
  actions: {
    // Atualiza os dados do cidadao a partir de uma resposta da API.
    apply(citizen: any) {
      if (citizen) this.me = citizen;
    },
    async fetch() {
      this.loading = true;
      try {
        const { data } = await api.get('/citizen/me');
        this.me = data;
      } finally {
        this.loading = false;
      }
    },
  },
});
