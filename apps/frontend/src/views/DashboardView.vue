<script setup lang="ts">
import { computed } from 'vue';
import { useCitizenStore } from '../stores/citizen';

const citizen = useCitizenStore();
const me = computed(() => citizen.me);

const energyPct = computed(() =>
  me.value ? (me.value.energy / me.value.maxEnergy) * 100 : 0,
);
const xpPct = computed(() => {
  if (!me.value) return 0;
  const span = me.value.xpNextLevel - me.value.xpCurrentLevel;
  const done = me.value.xp - me.value.xpCurrentLevel;
  return span > 0 ? Math.min(100, (done / span) * 100) : 0;
});
</script>

<template>
  <div class="container" v-if="me">
    <h1>Painel de {{ me.name }}</h1>
    <p class="muted" style="margin-bottom:16px">
      Cidadao de
      <span :style="{ color: me.country?.color }">{{ me.country?.name }}</span>
      &middot; Nivel {{ me.level }}
    </p>

    <div class="panel">
      <h3>Energia &mdash; {{ me.energy }} / {{ me.maxEnergy }}</h3>
      <div class="bar">
        <div :style="{ width: energyPct + '%', background: 'var(--green)' }"></div>
      </div>
      <p class="muted" style="margin-top:6px">
        A energia regenera +1 por minuto. Coma comida no mercado para recuperar.
      </p>

      <h3 style="margin-top:14px">
        Experiencia &mdash; {{ me.xp }} XP (proximo nivel: {{ me.xpNextLevel }})
      </h3>
      <div class="bar">
        <div :style="{ width: xpPct + '%', background: 'var(--blue)' }"></div>
      </div>
    </div>

    <div class="grid grid-3">
      <div class="stat">
        <div class="value">{{ me.strength }}</div>
        <div class="label">Forca</div>
      </div>
      <div class="stat">
        <div class="value">{{ me.level }}</div>
        <div class="label">Nivel</div>
      </div>
      <div class="stat">
        <div class="value">${{ me.money }}</div>
        <div class="label">Dinheiro</div>
      </div>
      <div class="stat">
        <div class="value">{{ me.gold }}</div>
        <div class="label">Ouro</div>
      </div>
      <div class="stat">
        <div class="value">{{ me.energy }}</div>
        <div class="label">Energia</div>
      </div>
      <div class="stat">
        <div class="value">{{ me.employer ? 'Sim' : 'Nao' }}</div>
        <div class="label">Empregado</div>
      </div>
    </div>

    <div class="panel" style="margin-top:16px">
      <h2>Proximos passos</h2>
      <p class="muted">
        1. Consiga um emprego e <router-link to="/work">trabalhe</router-link>
        para ganhar dinheiro e itens.<br />
        2. <router-link to="/train">Treine</router-link> para aumentar sua forca.<br />
        3. Compre armas no <router-link to="/market">mercado</router-link>.<br />
        4. Lute nas <router-link to="/battles">batalhas</router-link> pelo seu pais.
      </p>
    </div>
  </div>
</template>
