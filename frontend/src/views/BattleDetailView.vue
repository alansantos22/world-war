<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api, apiError } from '../api/client';
import { useCitizenStore } from '../stores/citizen';

const route = useRoute();
const citizen = useCitizenStore();
const id = Number(route.params.id);

const battle = ref<any>(null);
const useWeapon = ref(false);
const msg = ref('');
const err = ref('');
const busy = ref(false);

const total = computed(() =>
  battle.value
    ? battle.value.attackerDamage + battle.value.defenderDamage
    : 0,
);
function pct(side: 'a' | 'd') {
  if (!battle.value || total.value === 0) return 50;
  const v =
    side === 'a' ? battle.value.attackerDamage : battle.value.defenderDamage;
  return (v / total.value) * 100;
}

async function load() {
  const { data } = await api.get(`/battles/${id}`);
  battle.value = data;
}
onMounted(load);

async function hit(side: 'ATTACKER' | 'DEFENDER') {
  err.value = msg.value = '';
  busy.value = true;
  try {
    const { data } = await api.post(`/battles/${id}/hit`, {
      side,
      useWeapon: useWeapon.value,
    });
    citizen.apply(data.citizen);
    msg.value = data.message + (data.weaponUsed ? ' (arma usada)' : '');
    await load();
  } catch (e) {
    err.value = apiError(e);
  } finally {
    busy.value = false;
  }
}

async function finish() {
  err.value = msg.value = '';
  try {
    await api.post(`/battles/${id}/finish`);
    await load();
  } catch (e) {
    err.value = apiError(e);
  }
}
</script>

<template>
  <div class="container" v-if="battle">
    <router-link to="/battles" class="muted">&larr; Voltar</router-link>
    <h1 style="margin-top:6px">{{ battle.name }}</h1>
    <p class="muted" style="margin-bottom:16px">
      <span :style="{ color: battle.attackerCountry?.color }">
        {{ battle.attackerCountry?.name }}</span>
      ataca
      <span v-if="battle.region" class="tag">{{ battle.region.name }}</span>
      de
      <span v-if="battle.defenderCountry" :style="{ color: battle.defenderCountry.color }">
        {{ battle.defenderCountry.name }}</span>
      <span v-else>Território Neutro</span>
      &middot; <span class="tag">{{ battle.status }}</span>
      <span v-if="battle.winnerSide"> &middot; Vencedor: {{ battle.winnerSide }}</span>
    </p>

    <div v-if="msg" class="toast ok">{{ msg }}</div>
    <div v-if="err" class="toast err">{{ err }}</div>

    <div
      v-if="battle.region && battle.status === 'OPEN'"
      class="panel"
      style="border-color:var(--accent)"
    >
      <h3>⚔️ Conquista de {{ battle.region.name }}</h3>
      <p class="muted">
        Se o <strong>atacante</strong> vencer, a região passa para o controle de
        {{ battle.attackerCountry?.name }}.
      </p>
      <p class="muted" v-if="battle.attackerPenaltyPercent > 0" style="margin-top:6px">
        Projeção de poder: a região está longe da fronteira, então os golpes do
        atacante causam <strong style="color:var(--red)">−{{ battle.attackerPenaltyPercent }}%</strong>
        de dano.
      </p>
      <p class="muted" v-else style="margin-top:6px">
        Região na fronteira — atacante luta em força total.
      </p>
    </div>

    <div
      v-if="battle.status === 'FINISHED' && battle.region"
      class="toast"
      :class="battle.regionCaptured ? 'ok' : 'err'"
    >
      {{ battle.regionCaptured
        ? `${battle.attackerCountry?.name} conquistou ${battle.region.name}!`
        : `${battle.region.name} resistiu ao ataque.` }}
    </div>

    <div class="panel">
      <h2>Placar de dano</h2>
      <div class="muted">Atacante &mdash; {{ battle.attackerDamage }}</div>
      <div class="bar" style="margin-bottom:8px">
        <div :style="{ width: pct('a') + '%', background: 'var(--red)' }"></div>
      </div>
      <div class="muted">Defensor &mdash; {{ battle.defenderDamage }}</div>
      <div class="bar">
        <div :style="{ width: pct('d') + '%', background: 'var(--blue)' }"></div>
      </div>
    </div>

    <div class="panel" v-if="battle.status === 'OPEN'">
      <h2>Lutar (-10 energia por golpe)</h2>
      <label style="display:flex;align-items:center;gap:8px;width:auto">
        <input type="checkbox" v-model="useWeapon" style="width:auto" />
        Usar arma (consome 1 arma, +20% de dano por qualidade)
      </label>
      <div class="row" style="margin-top:12px">
        <button class="btn-red" :disabled="busy" @click="hit('ATTACKER')">
          Golpear pelo Atacante
        </button>
        <button class="btn-blue" :disabled="busy" @click="hit('DEFENDER')">
          Golpear pelo Defensor
        </button>
      </div>
      <button class="btn-ghost" style="margin-top:12px" @click="finish">
        Encerrar batalha
      </button>
    </div>

    <div class="panel">
      <h2>Herois da batalha</h2>
      <table v-if="battle.heroes?.length">
        <thead><tr><th>Cidadao</th><th>Lado</th><th>Dano</th></tr></thead>
        <tbody>
          <tr v-for="(h, i) in battle.heroes" :key="i">
            <td>{{ h.name }}</td>
            <td><span class="tag">{{ h.side }}</span></td>
            <td>{{ h.damage }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">Ninguem lutou ainda. Seja o primeiro!</p>
    </div>
  </div>
</template>
