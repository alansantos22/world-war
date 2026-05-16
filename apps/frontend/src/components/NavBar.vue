<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useCitizenStore } from '../stores/citizen';

const router = useRouter();
const auth = useAuthStore();
const citizen = useCitizenStore();

const menuOpen = ref(false);

function close() {
  menuOpen.value = false;
}

function logout() {
  close();
  auth.logout();
  citizen.me = null;
  router.push('/login');
}
</script>

<template>
  <nav class="nav">
    <div class="nav-inner">
      <span class="brand">WORLD WAR</span>
      <button
        class="nav-toggle btn-ghost"
        :aria-expanded="menuOpen"
        aria-label="Abrir menu"
        @click="menuOpen = !menuOpen"
      >☰</button>
      <div class="nav-links" :class="{ open: menuOpen }">
        <router-link to="/" @click="close">Painel</router-link>
        <router-link to="/map" @click="close">Mapa</router-link>
        <router-link to="/work" @click="close">Trabalho</router-link>
        <router-link to="/train" @click="close">Treino</router-link>
        <router-link to="/battles" @click="close">Batalhas</router-link>
        <router-link to="/market" @click="close">Mercado</router-link>
        <router-link to="/rankings" @click="close">Ranking</router-link>
        <span class="spacer"></span>
        <span v-if="citizen.me" class="muted nav-user">
          {{ citizen.me.name }} &middot;
          <span style="color:var(--accent)">${{ citizen.me.money }}</span> &middot;
          <span style="color:var(--accent)">{{ citizen.me.gold }} ouro</span>
        </span>
        <button class="btn-ghost" @click="logout">Sair</button>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.nav-links {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  flex-wrap: wrap;
}
.nav-user { margin-right: 10px; }
.nav-toggle {
  display: none;
  font-size: 1.15rem;
  line-height: 1;
  padding: 7px 13px;
  margin-left: auto;
}

@media (max-width: 720px) {
  .nav-inner { flex-wrap: wrap; }
  .nav-toggle { display: block; }
  .nav-links {
    display: none;
    flex-direction: column;
    align-items: stretch;
    width: 100%;
    gap: 2px;
    padding-bottom: 10px;
  }
  .nav-links.open { display: flex; }
  .nav-links .spacer { display: none; }
  .nav-user {
    margin: 8px 0 4px;
    padding: 0 12px;
  }
}
</style>
