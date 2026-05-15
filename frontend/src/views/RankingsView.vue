<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api/client';

const ranking = ref<any[]>([]);

onMounted(async () => {
  const { data } = await api.get('/citizen/rankings');
  ranking.value = data;
});
</script>

<template>
  <div class="container">
    <h1>Ranking de Forca</h1>
    <p class="muted" style="margin-bottom:16px">
      Os 50 cidadaos mais fortes do mundo.
    </p>
    <div class="panel">
      <table>
        <thead>
          <tr><th>#</th><th>Cidadao</th><th>Pais</th><th>Nivel</th><th>Forca</th></tr>
        </thead>
        <tbody>
          <tr v-for="c in ranking" :key="c.id">
            <td>{{ c.rank }}</td>
            <td>{{ c.name }}</td>
            <td :style="{ color: c.country?.color }">{{ c.country?.name }}</td>
            <td>{{ c.level }}</td>
            <td>{{ c.strength }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="!ranking.length" class="muted">Nenhum cidadao ainda.</p>
    </div>
  </div>
</template>
