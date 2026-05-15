import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const routes = [
  { path: '/login', component: () => import('../views/LoginView.vue'), meta: { guest: true } },
  { path: '/register', component: () => import('../views/RegisterView.vue'), meta: { guest: true } },
  { path: '/', component: () => import('../views/DashboardView.vue') },
  { path: '/map', component: () => import('../views/MapView.vue') },
  { path: '/work', component: () => import('../views/WorkView.vue') },
  { path: '/train', component: () => import('../views/TrainView.vue') },
  { path: '/battles', component: () => import('../views/BattlesView.vue') },
  { path: '/battles/:id', component: () => import('../views/BattleDetailView.vue') },
  { path: '/market', component: () => import('../views/MarketView.vue') },
  { path: '/rankings', component: () => import('../views/RankingsView.vue') },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Protege as rotas que exigem autenticacao.
router.beforeEach((to) => {
  const auth = useAuthStore();
  if (!to.meta.guest && !auth.isLoggedIn) return '/login';
  if (to.meta.guest && auth.isLoggedIn) return '/';
  return true;
});
