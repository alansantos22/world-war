<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import NavBar from './components/NavBar.vue';
import { useAuthStore } from './stores/auth';
import { useCitizenStore } from './stores/citizen';

const route = useRoute();
const auth = useAuthStore();
const citizen = useCitizenStore();

const showNav = computed(() => auth.isLoggedIn && !route.meta.guest);

async function refresh() {
  if (auth.isLoggedIn && !citizen.me) {
    try {
      await citizen.fetch();
    } catch {
      auth.logout();
    }
  }
}

onMounted(refresh);
watch(() => auth.token, refresh);
</script>

<template>
  <NavBar v-if="showNav" />
  <router-view />
</template>
