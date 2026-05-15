<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, apiError } from '../api/client';

const battles = ref<any[]>([]);
const countries = ref<any[]>([]);
const err = ref('');
const showForm = ref(false);
const form = ref({ name: '', attackerCountryId: 0, defenderCountryId: 0 });

async function load() {
  const [b, c] = await Promise.all([
    api.get('/battles'),
    api.get('/countries'),
  ]);
  battles.value = b.data;
  countries.value = c.data;
  if (c.data.length >= 2) {
    form.value.attackerCountryId = c.data[0].id;
    form.value.defenderCountryId = c.data[1].id;
  }
}
onMounted(load);

async function create() {
  err.value = '';
  try {
    await api.post('/battles', form.value);
    showForm.value = false;
    form.value.name = '';
    await load();
  } catch (e) {
    err.value = apiError(e);
  }
}
</script>

<template>
  <div class="container">
    <h1>Campos de Batalha</h1>
    <p class="muted" style="margin-bottom:16px">
      Escolha uma guerra e lute pelo seu lado.
    </p>

    <div v-if="err" class="toast err">{{ err }}</div>

    <div style="margin-bottom:14px">
      <button @click="showForm = !showForm">
        {{ showForm ? 'Cancelar' : 'Declarar nova guerra' }}
      </button>
    </div>

    <div class="panel" v-if="showForm">
      <h2>Nova guerra</h2>
      <label>Nome da batalha</label>
      <input v-model="form.name" placeholder="Ex.: Batalha de Berlim" />
      <div class="row">
        <div>
          <label>Pais atacante</label>
          <select v-model="form.attackerCountryId">
            <option v-for="c in countries" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
        <div>
          <label>Pais defensor</label>
          <select v-model="form.defenderCountryId">
            <option v-for="c in countries" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
      </div>
      <button class="btn-red" style="margin-top:14px" @click="create">Declarar guerra</button>
    </div>

    <div class="panel" v-for="b in battles" :key="b.id">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <div>
          <h3>{{ b.name }}</h3>
          <span :style="{ color: b.attackerCountry?.color }">{{ b.attackerCountry?.name }}</span>
          <span class="muted"> vs </span>
          <span :style="{ color: b.defenderCountry?.color }">{{ b.defenderCountry?.name }}</span>
          <span class="tag" style="margin-left:8px">{{ b.status }}</span>
        </div>
        <router-link :to="`/battles/${b.id}`" class="btn">Entrar na batalha</router-link>
      </div>
      <div class="row" style="margin-top:10px">
        <div>
          <div class="muted">Atacante &mdash; {{ b.attackerDamage }} dano</div>
          <div class="bar"><div :style="{
            width: (b.attackerDamage + b.defenderDamage > 0
              ? b.attackerDamage / (b.attackerDamage + b.defenderDamage) * 100 : 50) + '%',
            background: 'var(--red)' }"></div></div>
        </div>
        <div>
          <div class="muted">Defensor &mdash; {{ b.defenderDamage }} dano</div>
          <div class="bar"><div :style="{
            width: (b.attackerDamage + b.defenderDamage > 0
              ? b.defenderDamage / (b.attackerDamage + b.defenderDamage) * 100 : 50) + '%',
            background: 'var(--blue)' }"></div></div>
        </div>
      </div>
    </div>
    <p v-if="!battles.length" class="muted">Nenhuma batalha no momento.</p>
  </div>
</template>
