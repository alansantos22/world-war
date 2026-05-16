<script setup lang="ts">
import { onMounted, ref } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import MainMenu from "./components/MainMenu.vue";
import GameView from "./components/GameView.vue";
import { loadSettings } from "./settings";

/**
 * Casca do aplicativo: alterna entre o menu inicial e a tela de jogo.
 * Cada partida é identificada pelo seu `saveId` no banco SQLite.
 */
type Screen = "menu" | "game";

const screen = ref<Screen>("menu");
const activeSaveId = ref<number | null>(null);

function startGame(saveId: number) {
  activeSaveId.value = saveId;
  screen.value = "game";
}

function exitToMenu() {
  screen.value = "menu";
  activeSaveId.value = null;
}

onMounted(async () => {
  if (loadSettings().fullscreenOnStart) {
    try {
      await getCurrentWindow().setFullscreen(true);
    } catch {
      /* fora do Tauri: ignora */
    }
  }
});
</script>

<template>
  <MainMenu v-if="screen === 'menu'" @play="startGame" />
  <GameView
    v-else-if="activeSaveId !== null"
    :save-id="activeSaveId"
    @exit="exitToMenu"
  />
</template>
