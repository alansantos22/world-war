<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { api, apiError } from '../api/client';

const router = useRouter();
const auth = useAuthStore();

const email = ref('');
const password = ref('');
const citizenName = ref('');
const countryId = ref<number | null>(null);
const countries = ref<any[]>([]);
const error = ref('');
const busy = ref(false);

onMounted(async () => {
  try {
    const { data } = await api.get('/countries');
    countries.value = data;
    if (data.length) countryId.value = data[0].id;
  } catch (e) {
    error.value = apiError(e);
  }
});

async function submit() {
  error.value = '';
  busy.value = true;
  try {
    await auth.register({
      email: email.value,
      password: password.value,
      citizenName: citizenName.value,
      countryId: countryId.value as number,
    });
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
      <h1 style="text-align:center;color:var(--accent)">Novo Cidadao</h1>
      <p class="muted" style="text-align:center;margin-bottom:18px">
        Escolha sua nacao e entre na guerra
      </p>
      <div class="panel">
        <div v-if="error" class="toast err">{{ error }}</div>
        <form @submit.prevent="submit">
          <label>Nome do cidadao</label>
          <input v-model="citizenName" required minlength="3" maxlength="20" />
          <label>Pais</label>
          <select v-model="countryId">
            <option v-for="c in countries" :key="c.id" :value="c.id">
              {{ c.name }}
            </option>
          </select>
          <label>E-mail</label>
          <input v-model="email" type="email" required />
          <label>Senha (min. 6 caracteres)</label>
          <input v-model="password" type="password" required minlength="6" />
          <button style="width:100%;margin-top:16px" :disabled="busy">
            {{ busy ? 'Criando...' : 'Criar cidadao' }}
          </button>
        </form>
        <p class="muted" style="text-align:center;margin-top:14px">
          Ja tem conta? <router-link to="/login">Entrar</router-link>
        </p>
      </div>
    </div>
  </div>
</template>
