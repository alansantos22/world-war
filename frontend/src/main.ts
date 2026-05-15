import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import './style.css';

createApp(App).use(createPinia()).use(router).mount('#app');

// PWA: registra o service worker para tornar o jogo instalável como app.
// Só em build de produção, para não atrapalhar o HMR do Vite em dev.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
