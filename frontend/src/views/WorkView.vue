<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, apiError } from '../api/client';
import { useCitizenStore } from '../stores/citizen';

const citizen = useCitizenStore();
const companies = ref<any[]>([]);
const msg = ref('');
const err = ref('');
const busy = ref(false);

async function load() {
  const { data } = await api.get('/companies');
  companies.value = data;
}
onMounted(load);

async function getJob(id: number) {
  err.value = msg.value = '';
  try {
    const { data } = await api.post(`/companies/${id}/job`);
    citizen.apply(data);
    msg.value = 'Voce conseguiu o emprego!';
  } catch (e) {
    err.value = apiError(e);
  }
}

async function work() {
  err.value = msg.value = '';
  busy.value = true;
  try {
    const { data } = await api.post('/work');
    citizen.apply(data.citizen);
    msg.value = `${data.message}: +$${data.pay}, +${data.xp} XP, +${data.produced.amount}x ${data.produced.itemType} Q${data.produced.quality}`;
  } catch (e) {
    err.value = apiError(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="container">
    <h1>Trabalho</h1>
    <p class="muted" style="margin-bottom:16px">
      Trabalhar custa 10 de energia e rende dinheiro, XP e produtos.
    </p>

    <div v-if="msg" class="toast ok">{{ msg }}</div>
    <div v-if="err" class="toast err">{{ err }}</div>

    <div class="panel" v-if="citizen.me">
      <h2>Seu emprego</h2>
      <div v-if="citizen.me.employer">
        <p>
          <strong>{{ citizen.me.employer.name }}</strong>
          <span class="tag">{{ citizen.me.employer.type }}</span>
          <span class="tag">Q{{ citizen.me.employer.quality }}</span>
        </p>
        <button class="btn-green" style="margin-top:12px"
                :disabled="busy || citizen.me.energy < 10" @click="work">
          {{ busy ? 'Trabalhando...' : 'Trabalhar agora (-10 energia)' }}
        </button>
        <p v-if="citizen.me.energy < 10" class="muted" style="margin-top:6px">
          Energia insuficiente.
        </p>
      </div>
      <p v-else class="muted">
        Voce ainda nao tem emprego. Escolha uma empresa abaixo.
      </p>
    </div>

    <div class="panel">
      <h2>Empresas disponiveis</h2>
      <table>
        <thead>
          <tr><th>Empresa</th><th>Tipo</th><th>Qualidade</th><th>Salario</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="c in companies" :key="c.id">
            <td>{{ c.name }}</td>
            <td><span class="tag">{{ c.type }}</span></td>
            <td>Q{{ c.quality }}</td>
            <td>${{ c.quality * 8 }}</td>
            <td>
              <button class="btn-ghost" @click="getJob(c.id)">Trabalhar aqui</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
