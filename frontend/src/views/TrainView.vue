<script setup lang="ts">
import { ref } from 'vue';
import { api, apiError } from '../api/client';
import { useCitizenStore } from '../stores/citizen';

const citizen = useCitizenStore();
const msg = ref('');
const err = ref('');
const busy = ref(false);

async function train() {
  err.value = msg.value = '';
  busy.value = true;
  try {
    const { data } = await api.post('/train');
    citizen.apply(data.citizen);
    msg.value = `${data.message}: +${data.strengthGain} de forca, +${data.xp} XP`;
  } catch (e) {
    err.value = apiError(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="container">
    <h1>Centro de Treinamento</h1>
    <p class="muted" style="margin-bottom:16px">
      Treinar custa 10 de energia e aumenta sua forca em +0,5.
      Quanto maior a forca, mais dano voce causa em batalha.
    </p>

    <div v-if="msg" class="toast ok">{{ msg }}</div>
    <div v-if="err" class="toast err">{{ err }}</div>

    <div class="panel" v-if="citizen.me">
      <div class="grid grid-3">
        <div class="stat">
          <div class="value">{{ citizen.me.strength }}</div>
          <div class="label">Forca atual</div>
        </div>
        <div class="stat">
          <div class="value">{{ citizen.me.energy }}</div>
          <div class="label">Energia</div>
        </div>
        <div class="stat">
          <div class="value">{{ citizen.me.level }}</div>
          <div class="label">Nivel</div>
        </div>
      </div>
      <button class="btn-blue" style="margin-top:16px"
              :disabled="busy || citizen.me.energy < 10" @click="train">
        {{ busy ? 'Treinando...' : 'Treinar (-10 energia)' }}
      </button>
      <p v-if="citizen.me.energy < 10" class="muted" style="margin-top:6px">
        Energia insuficiente.
      </p>
    </div>
  </div>
</template>
