<script setup lang="ts">
import { computed, ref } from "vue";
import Flag from "./Flag.vue";
import { GRID, allLandCells, CONTINENT_NAMES } from "../game/map-generator";
import { NATIONS } from "../game/nations";
import { ALIGNMENTS, ALIGNMENT_LIST, type AlignmentId } from "../game/alignments";
import { createGame, type NewGameChoice } from "../game/world";
import { listSaves, deleteSave, type SaveSummary } from "../game/saves";
import { loadSettings, saveSettings, type AppSettings } from "../settings";

/** Emitido quando uma partida deve começar a ser jogada. */
const emit = defineEmits<{ play: [saveId: number] }>();

type MenuScreen = "main" | "new" | "load" | "settings";
const screen = ref<MenuScreen>("main");
const busy = ref(false);
const err = ref("");

/** Silhueta dos continentes desenhada ao fundo do menu. */
const land = allLandCells();

const continents = Object.entries(CONTINENT_NAMES);

/**
 * Paleta de cores para nações personalizadas. Já é montada sem nenhuma das
 * cores usadas pelas 13 nações fixas — o jogador nunca escolhe uma cor
 * que já existe no jogo.
 */
const COLOR_PALETTE = [
  "#e8503a", "#e07b1a", "#7fae2e", "#2f9e5e", "#15a0a8", "#2f8fd6",
  "#5a52c8", "#9b4dca", "#c64ab0", "#d44d6e", "#a8732e", "#6d7f8c",
];
const usedColors = new Set(NATIONS.map((n) => n.color.toLowerCase()));
const colorPalette = COLOR_PALETTE.filter(
  (c) => !usedColors.has(c.toLowerCase()),
);

// ===== Novo jogo =====
const newName = ref("");

/** Como o jogador vai jogar: com uma nação fixa ou uma criada por ele. */
type PlayMode = "existing" | "custom";
const playMode = ref<PlayMode>("existing");

// Escolha de nação existente.
const pickedNation = ref<string | null>(null);

// Criação de nação personalizada.
const customName = ref("");
const customAlignment = ref<AlignmentId | null>(null);
const customColor = ref<string | null>(null);
const customContinent = ref<string | null>(null);

const customFlagSeed = computed(() => customName.value.trim() || "nova-nacao");
const customPreviewColor = computed(() => customColor.value ?? "#6d7f8c");

function defaultName(): string {
  return `Partida de ${new Date().toLocaleDateString("pt-BR")}`;
}

function openNew() {
  err.value = "";
  newName.value = defaultName();
  playMode.value = "existing";
  pickedNation.value = null;
  customName.value = "";
  customAlignment.value = null;
  customColor.value = null;
  customContinent.value = null;
  screen.value = "new";
}

const canCreate = computed(() => {
  if (!newName.value.trim()) return false;
  if (playMode.value === "existing") return !!pickedNation.value;
  return (
    !!customName.value.trim() &&
    !!customAlignment.value &&
    !!customColor.value &&
    !!customContinent.value
  );
});

async function confirmNew() {
  if (!canCreate.value) return;
  busy.value = true;
  err.value = "";
  try {
    const choice: NewGameChoice =
      playMode.value === "existing"
        ? { kind: "existing", code: pickedNation.value! }
        : {
            kind: "custom",
            name: customName.value.trim(),
            color: customColor.value!,
            alignment: customAlignment.value!,
            continent: customContinent.value!,
          };
    const id = await createGame(newName.value.trim() || defaultName(), choice);
    emit("play", id);
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

// ===== Carregar jogo salvo =====
const saves = ref<SaveSummary[]>([]);
const confirmDelete = ref<number | null>(null);

async function openLoad() {
  screen.value = "load";
  confirmDelete.value = null;
  await refreshSaves();
}

async function refreshSaves() {
  busy.value = true;
  err.value = "";
  try {
    saves.value = await listSaves();
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

async function removeSave(id: number) {
  err.value = "";
  try {
    await deleteSave(id);
    confirmDelete.value = null;
    await refreshSaves();
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  }
}

// ===== Configurações =====
const settings = ref<AppSettings>(loadSettings());

function updateSettings() {
  saveSettings(settings.value);
}

function back() {
  err.value = "";
  screen.value = "main";
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
</script>

<template>
  <div class="menu">
    <!-- Silhueta do mundo ao fundo -->
    <svg
      class="world-bg"
      :viewBox="`0 0 ${GRID.cols} ${GRID.rows}`"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <rect
        v-for="(c, i) in land"
        :key="i"
        :x="c.x"
        :y="c.y"
        width="1.05"
        height="1.05"
      />
    </svg>
    <div class="veil"></div>

    <div class="menu-inner">
      <!-- Brasão / título -->
      <div class="brand">
        <div class="brand-crest">⚔</div>
        <h1>WORLD WAR</h1>
        <p class="brand-sub">Grande Estratégia</p>
      </div>

      <!-- MENU PRINCIPAL -->
      <div v-if="screen === 'main'" class="stack">
        <button class="menu-btn primary" @click="openNew">
          ▶ Iniciar novo jogo
        </button>
        <button class="menu-btn" @click="openLoad">
          📂 Carregar jogo salvo
        </button>
        <button class="menu-btn" @click="screen = 'settings'">
          ⚙ Configurações
        </button>
      </div>

      <!-- NOVO JOGO -->
      <div v-else-if="screen === 'new'" class="box wide">
        <h2>Iniciar novo jogo</h2>

        <div class="scroll">
          <label class="field">
            <span>Nome da partida</span>
            <input
              v-model="newName"
              type="text"
              maxlength="40"
              :disabled="busy"
            />
          </label>

          <p class="section-label">Quem você vai comandar?</p>
          <div class="seg">
            <button
              :class="{ on: playMode === 'existing' }"
              @click="playMode = 'existing'"
            >
              🏴 Escolher uma nação
            </button>
            <button
              :class="{ on: playMode === 'custom' }"
              @click="playMode = 'custom'"
            >
              ✚ Criar minha nação
            </button>
          </div>

          <!-- Escolher nação existente -->
          <div v-if="playMode === 'existing'" class="nation-grid">
            <button
              v-for="n in NATIONS"
              :key="n.code"
              class="nation-card"
              :class="{ sel: pickedNation === n.code }"
              @click="pickedNation = n.code"
            >
              <Flag :seed="n.code" :color="n.color" :size="40" />
              <span class="nation-info">
                <strong>{{ n.name }}</strong>
                <span class="nation-meta">
                  <span
                    class="dot"
                    :style="{ background: ALIGNMENTS[n.alignment].color }"
                  ></span>
                  {{ ALIGNMENTS[n.alignment].label }}
                </span>
              </span>
            </button>
          </div>

          <!-- Criar nação personalizada -->
          <div v-else class="custom-form">
            <label class="field">
              <span>Nome da nação</span>
              <input
                v-model="customName"
                type="text"
                maxlength="32"
                placeholder="Ex.: República de Avalon"
              />
            </label>

            <p class="section-label">Direcionamento</p>
            <div class="choice-grid">
              <button
                v-for="a in ALIGNMENT_LIST"
                :key="a.id"
                class="choice align-choice"
                :class="{ sel: customAlignment === a.id }"
                :style="{ '--ac': a.color }"
                @click="customAlignment = a.id"
              >
                <span class="dot" :style="{ background: a.color }"></span>
                <span class="choice-label">{{ a.label }}</span>
              </button>
            </div>

            <p class="section-label">Cor da nação</p>
            <div class="color-grid">
              <button
                v-for="c in colorPalette"
                :key="c"
                class="color-swatch"
                :class="{ sel: customColor === c }"
                :style="{ background: c }"
                :title="c"
                @click="customColor = c"
              ></button>
            </div>

            <p class="section-label">Continente inicial</p>
            <p class="hint">
              Sua capital será sorteada numa província aleatória do continente
              escolhido.
            </p>
            <div class="choice-grid">
              <button
                v-for="[code, label] in continents"
                :key="code"
                class="choice"
                :class="{ sel: customContinent === code }"
                @click="customContinent = code"
              >
                {{ label }}
              </button>
            </div>

            <!-- Prévia da nação -->
            <div class="preview">
              <Flag
                :seed="customFlagSeed"
                :color="customPreviewColor"
                :size="46"
              />
              <div class="preview-info">
                <strong>{{ customName.trim() || "Sua nação" }}</strong>
                <span class="nation-meta">
                  <span
                    v-if="customAlignment"
                    class="dot"
                    :style="{ background: ALIGNMENTS[customAlignment].color }"
                  ></span>
                  {{
                    customAlignment
                      ? ALIGNMENTS[customAlignment].label
                      : "direcionamento não escolhido"
                  }}
                  <span class="dimsep">·</span>
                  {{
                    customContinent
                      ? CONTINENT_NAMES[customContinent]
                      : "continente não escolhido"
                  }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <p v-if="err" class="err">{{ err }}</p>
        <div class="row">
          <button class="menu-btn" :disabled="busy" @click="back">
            Voltar
          </button>
          <button
            class="menu-btn primary"
            :disabled="busy || !canCreate"
            @click="confirmNew"
          >
            {{ busy ? "Gerando mundo..." : "Criar e jogar" }}
          </button>
        </div>
      </div>

      <!-- CARREGAR JOGO -->
      <div v-else-if="screen === 'load'" class="box">
        <h2>Carregar jogo salvo</h2>
        <p v-if="err" class="err">{{ err }}</p>
        <p v-if="busy" class="hint">Carregando partidas...</p>
        <p v-else-if="saves.length === 0" class="hint">
          Nenhuma partida salva ainda. Volte e inicie um novo jogo.
        </p>
        <ul v-else class="save-list">
          <li v-for="s in saves" :key="s.id" class="save-item">
            <button class="save-main" @click="emit('play', s.id)">
              <Flag
                v-if="s.flagSeed && s.playerColor"
                :seed="s.flagSeed"
                :color="s.playerColor"
                :size="34"
              />
              <span class="save-text">
                <strong>{{ s.name }}</strong>
                <span class="save-meta">
                  {{ s.playerNationName ?? "Nação não definida" }}
                  <span class="dimsep">·</span>
                  {{ s.provinceCount }} províncias
                  <span class="dimsep">·</span>
                  {{ fmtDate(s.updatedAt) }}
                </span>
              </span>
            </button>
            <template v-if="confirmDelete === s.id">
              <button class="del-yes" @click="removeSave(s.id)">Apagar</button>
              <button class="x" title="Cancelar" @click="confirmDelete = null">
                ✕
              </button>
            </template>
            <button
              v-else
              class="del"
              title="Apagar partida"
              @click="confirmDelete = s.id"
            >
              🗑
            </button>
          </li>
        </ul>
        <div class="row">
          <button class="menu-btn" @click="back">Voltar</button>
        </div>
      </div>

      <!-- CONFIGURAÇÕES -->
      <div v-else class="box">
        <h2>Configurações</h2>
        <label class="check">
          <input
            type="checkbox"
            v-model="settings.fullscreenOnStart"
            @change="updateSettings"
          />
          <span>Iniciar o jogo em tela cheia</span>
        </label>
        <label class="check">
          <input
            type="checkbox"
            v-model="settings.confirmExit"
            @change="updateSettings"
          />
          <span>Confirmar antes de voltar ao menu</span>
        </label>
        <p class="hint">As configurações ficam salvas neste computador.</p>
        <div class="row">
          <button class="menu-btn" @click="back">Voltar</button>
        </div>
      </div>

      <p class="footer">Tauri · Vue 3 · SQLite — jogo offline contra a IA</p>
    </div>
  </div>
</template>

<style scoped>
.menu {
  position: fixed;
  inset: 0;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: radial-gradient(
    ellipse at 50% 30%,
    #1c3340 0%,
    #0e1a22 60%,
    #0a1118 100%
  );
}

/* Silhueta dos continentes */
.world-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0.16;
}
.world-bg rect {
  fill: #6f8fa3;
}
.veil {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(10, 17, 24, 0.2) 0%,
    rgba(10, 17, 24, 0.78) 100%
  );
}

.menu-inner {
  position: relative;
  max-width: 94vw;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* Brasão / título */
.brand {
  text-align: center;
  margin-bottom: 22px;
}
.brand-crest {
  width: 60px;
  height: 60px;
  margin: 0 auto 10px;
  display: grid;
  place-items: center;
  font-size: 30px;
  background: linear-gradient(180deg, #3a4658 0%, #20283a 100%);
  border: 2px solid var(--gold);
  border-radius: 14px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.6);
}
.brand h1 {
  margin: 0;
  font-size: 2.4rem;
  font-weight: 800;
  letter-spacing: 6px;
  color: var(--gold);
  text-shadow: 0 3px 14px rgba(0, 0, 0, 0.7);
}
.brand-sub {
  margin: 4px 0 0;
  font-size: 0.84rem;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: #8a92a0;
}

/* Pilha de botões do menu principal */
.stack {
  width: 360px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.menu-btn {
  padding: 13px 16px;
  font-size: 1rem;
  text-align: center;
}
.menu-btn.primary {
  background: linear-gradient(180deg, #f0c558 0%, #d8a233 100%);
  border-color: #f0c558;
  color: #20160a;
}
.menu-btn.primary:hover:not(:disabled) {
  color: #20160a;
  filter: brightness(1.07);
}

/* Painéis */
.box {
  width: 440px;
  background: linear-gradient(180deg, var(--panel-a) 0%, var(--panel-b) 100%);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 16px 44px rgba(0, 0, 0, 0.6);
  padding: 20px;
}
.box.wide {
  width: min(680px, 94vw);
}
.box h2 {
  margin: 0 0 16px;
  font-size: 1.05rem;
  color: var(--gold);
  text-transform: uppercase;
  letter-spacing: 1px;
}
.scroll {
  max-height: 58vh;
  overflow-y: auto;
  padding-right: 6px;
  margin-right: -6px;
}
.row {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}
.row .menu-btn {
  flex: 1;
  padding: 11px 14px;
  font-size: 0.9rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}
.field span {
  font-size: 0.74rem;
  color: #9aa0ac;
  text-transform: uppercase;
  letter-spacing: 0.7px;
}
.field input {
  font-family: inherit;
  font-size: 0.95rem;
  background: #0e131d;
  color: #fff;
  border: 1px solid var(--line);
  border-radius: 7px;
  padding: 9px 11px;
}
.field input:focus {
  outline: none;
  border-color: var(--gold);
}

.section-label {
  font-size: 0.74rem;
  color: #9aa0ac;
  text-transform: uppercase;
  letter-spacing: 0.7px;
  margin: 4px 0 8px;
}
.hint {
  color: #8a92a0;
  font-size: 0.82rem;
  margin: 4px 0 8px;
}
.err {
  color: #ffb4ae;
  background: rgba(58, 29, 29, 0.7);
  border: 1px solid #f85149;
  border-radius: 7px;
  padding: 7px 10px;
  font-size: 0.82rem;
  margin: 12px 0 0;
}
.dimsep {
  opacity: 0.5;
  margin: 0 3px;
}

/* Alternância modo de jogo */
.seg {
  display: flex;
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 14px;
}
.seg button {
  flex: 1;
  border: none;
  border-radius: 0;
  padding: 10px;
}
.seg button + button {
  border-left: 1px solid var(--line);
}

/* Grade de nações */
.nation-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.nation-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  text-align: left;
}
.nation-card.sel {
  border-color: var(--gold);
  box-shadow: 0 0 0 1px var(--gold) inset;
}
.nation-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.nation-info strong {
  font-size: 0.84rem;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.nation-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.74rem;
  color: #9aa0ac;
}
.dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex: none;
}

/* Formulário da nação personalizada */
.choice-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 6px;
}
.choice {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 10px;
  font-size: 0.85rem;
}
.choice.sel {
  border-color: var(--gold);
  box-shadow: 0 0 0 1px var(--gold) inset;
}
.align-choice {
  border-left: 3px solid var(--ac);
}

.color-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
  margin-bottom: 6px;
}
.color-swatch {
  height: 34px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.2);
}
.color-swatch:hover:not(:disabled) {
  border-color: #fff;
}
.color-swatch.sel {
  border-color: #fff;
  box-shadow: 0 0 0 2px var(--gold);
}

.preview {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  padding: 11px 13px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--line);
  border-radius: 9px;
}
.preview-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.preview-info strong {
  color: #fff;
  font-size: 0.98rem;
}

/* Lista de partidas salvas */
.save-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 46vh;
  overflow-y: auto;
}
.save-item {
  display: flex;
  align-items: stretch;
  gap: 6px;
}
.save-main {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 11px;
  text-align: left;
  padding: 9px 11px;
  min-width: 0;
}
.save-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.save-text strong {
  font-size: 0.95rem;
  color: #fff;
}
.save-meta {
  font-size: 0.74rem;
  color: #8a92a0;
}
.del,
.del-yes {
  padding: 0 12px;
}
.del-yes {
  border-color: #f85149;
  color: #ffb4ae;
}
.del-yes:hover:not(:disabled) {
  background: #5a2422;
  border-color: #f85149;
}

.check {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 2px;
  font-size: 0.92rem;
  cursor: pointer;
}
.check input {
  width: 17px;
  height: 17px;
  accent-color: var(--gold);
  cursor: pointer;
}

.footer {
  margin-top: 22px;
  font-size: 0.74rem;
  color: #5e6776;
  letter-spacing: 0.5px;
}
</style>
