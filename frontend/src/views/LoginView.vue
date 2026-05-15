<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { apiError } from '../api/client';

const router = useRouter();
const auth = useAuthStore();
const email = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);

async function submit() {
  error.value = '';
  busy.value = true;
  try {
    await auth.login(email.value, password.value);
    router.push('/');
  } catch (e) {
    error.value = apiError(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="auth-wrap">
    <div class="auth-card">
      <h1 style="text-align:center;color:var(--accent)">WORLD WAR</h1>
      <p class="muted" style="text-align:center;margin-bottom:18px">
        Entre para comandar seu cidadao
      </p>
      <div class="panel">
        <div v-if="error" class="toast err">{{ error }}</div>
        <form @submit.prevent="submit">
          <label>E-mail</label>
          <input v-model="email" type="email" required />
          <label>Senha</label>
          <input v-model="password" type="password" required />
          <button style="width:100%;margin-top:16px" :disabled="busy">
            {{ busy ? 'Entrando...' : 'Entrar' }}
          </button>
        </form>
        <p class="muted" style="text-align:center;margin-top:14px">
          Nao tem conta? <router-link to="/register">Criar cidadao</router-link>
        </p>
      </div>
    </div>
  </div>
</template>
