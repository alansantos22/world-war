<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api/client';

const battles = ref<any[]>([]);

async function load() {
  const { data } = await api.get('/battles');
  battles.value = data;
}
onMounted(load);
</script>

<template>
  <div class="container">
    <h1>Campos de Batalha</h1>
    <p class="muted" style="margin-bottom:16px">
      Escolha uma guerra e lute pelo seu lado. Para iniciar uma nova ofensiva,
      vá ao <router-link to="/map">Mapa</router-link>, clique numa região
      vizinha e declare guerra — o vencedor toma o controle do território.
    </p>

    <div style="margin-bottom:14px">
      <router-link to="/map" class="btn">⚔️ Declarar guerra pelo Mapa</router-link>
    </div>

    <div class="panel" v-for="b in battles" :key="b.id">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <div>
          <h3>{{ b.name }}</h3>
          <span :style="{ color: b.attackerCountry?.color }">{{ b.attackerCountry?.name }}</span>
          <span class="muted"> ataca </span>
          <span v-if="b.region" class="tag">{{ b.region.name }}</span>
          <span class="muted"> de </span>
          <span v-if="b.defenderCountry" :style="{ color: b.defenderCountry.color }">
            {{ b.defenderCountry.name }}
          </span>
          <span v-else class="muted">Território Neutro</span>
          <span class="tag" style="margin-left:8px">{{ b.status }}</span>
          <span v-if="b.attackerPenaltyPercent > 0" class="tag" style="margin-left:6px;color:var(--red)">
            atacante −{{ b.attackerPenaltyPercent }}%
          </span>
          <span v-if="b.regionCaptured" class="tag" style="margin-left:6px;color:var(--green)">
            região conquistada
          </span>
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
