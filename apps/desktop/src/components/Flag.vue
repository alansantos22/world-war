<script setup lang="ts">
import { computed } from "vue";
import { flagCells } from "../game/flags";

/**
 * Bandeira de uma facção: identicon 5×5 desenhado na cor da nação.
 * `seed` define o desenho; `color` é a cor da facção.
 */
const props = defineProps<{ seed: string; color: string; size?: number }>();

const cells = computed(() => flagCells(props.seed));
const px = computed(() => props.size ?? 28);
</script>

<template>
  <svg
    class="flag"
    :width="px"
    :height="px"
    viewBox="0 0 5 5"
    :style="{ width: px + 'px', height: px + 'px' }"
    aria-hidden="true"
  >
    <rect width="5" height="5" fill="#202736" />
    <rect
      v-for="(c, i) in cells"
      :key="i"
      :x="c.x"
      :y="c.y"
      width="1.02"
      height="1.02"
      :fill="color"
    />
  </svg>
</template>

<style scoped>
.flag {
  flex: none;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  background: #202736;
}
</style>
