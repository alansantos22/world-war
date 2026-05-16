<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Flag from "./Flag.vue";
import { GRID, CONTINENT_NAMES } from "../game/map-generator";
import { NATIONS, type Nation, flagSeed } from "../game/nations";
import { ALIGNMENTS, ALIGNMENT_LIST } from "../game/alignments";
import { resourceInfo } from "../game/resources";
import { FACTION_STATS, TERRITORY_STATS, type FactionState } from "../game/economy";
import {
  loadMap,
  loadFactions,
  regenerateMap,
  getSave,
  type Province,
  type GameSave,
} from "../game/world";
import { renameSave } from "../game/saves";
import { loadSettings } from "../settings";

const props = defineProps<{ saveId: number }>();
const emit = defineEmits<{ exit: [] }>();

const DEEP_OCEAN = "#15323f";
const SHALLOW_OCEAN = "#2a6075";
const NEUTRAL_COLOR = "#39414f";

const game = ref<GameSave | null>(null);
const saveName = ref("");
const provinces = ref<Province[]>([]);
const factions = ref<FactionState[]>([]);
const loading = ref(true);
const err = ref("");
const busy = ref(false);

const mode = ref<"political" | "resource">("political");
const selected = ref<Province | null>(null);
const hovered = ref<Province | null>(null);

/** Painel lateral aberto no momento (null = nenhum, mapa livre). */
type PanelId = "nations" | "alignments";
const activePanel = ref<PanelId | null>(null);
function togglePanel(p: PanelId) {
  activePanel.value = activePanel.value === p ? null : p;
}

// ===== Nações da partida =====
// As 13 nações fixas, mais a nação personalizada do jogador (se houver).
const allNations = computed<Nation[]>(() =>
  game.value?.customNation ? [...NATIONS, game.value.customNation] : [...NATIONS],
);
const nationByCode = computed(
  () => new Map(allNations.value.map((n) => [n.code, n])),
);
function nationOf(code: string | null): Nation | null {
  return code ? nationByCode.value.get(code) ?? null : null;
}
const playerNation = computed(() => nationOf(game.value?.playerCode ?? null));

/** A facção do jogador (dinheiro, influência, manpower, pesquisa). */
const playerFaction = computed<FactionState | null>(
  () => factions.value.find((f) => f.code === game.value?.playerCode) ?? null,
);

/** Formata um número grande com separador de milhar (pt-BR). */
function fmt(n: number): string {
  return n.toLocaleString("pt-BR");
}

// ===== Zoom e navegação do mapa =====
const MIN_SCALE = 1;
const MAX_SCALE = 7;
const svgEl = ref<SVGSVGElement | null>(null);

/**
 * Borda de oceano ao redor da grade de continentes. Esse "respiro" de água
 * empurra a terra para longe das bordas da tela, então os painéis da HUD
 * (barra superior, barra lateral) ficam sobre o mar — e dá folga para
 * arrastar o mapa e tirar qualquer província de trás de um painel.
 */
const MAP_PAD = 7;
const WORLD = {
  x: -MAP_PAD,
  y: -MAP_PAD,
  cols: GRID.cols + MAP_PAD * 2,
  rows: GRID.rows + MAP_PAD * 2,
};

const view = ref({ x: WORLD.x, y: WORLD.y, scale: 1 });

const viewBox = computed(() => {
  const w = WORLD.cols / view.value.scale;
  const h = WORLD.rows / view.value.scale;
  return `${view.value.x} ${view.value.y} ${w} ${h}`;
});

function clampView() {
  const w = WORLD.cols / view.value.scale;
  const h = WORLD.rows / view.value.scale;
  const maxX = Math.max(WORLD.x, WORLD.x + WORLD.cols - w);
  const maxY = Math.max(WORLD.y, WORLD.y + WORLD.rows - h);
  view.value.x = Math.min(Math.max(view.value.x, WORLD.x), maxX);
  view.value.y = Math.min(Math.max(view.value.y, WORLD.y), maxY);
}

/** Converte coordenada de tela para coordenada do mapa (unidades do viewBox). */
function screenToSvg(clientX: number, clientY: number) {
  const svg = svgEl.value;
  const ctm = svg?.getScreenCTM();
  if (!svg || !ctm) return { x: 0, y: 0 };
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

/** Aplica um novo zoom mantendo fixo o ponto-âncora (sob o cursor). */
function applyZoom(newScale: number, anchor: { x: number; y: number }) {
  const s = Math.min(Math.max(newScale, MIN_SCALE), MAX_SCALE);
  if (s === view.value.scale) return;
  const oldW = WORLD.cols / view.value.scale;
  const oldH = WORLD.rows / view.value.scale;
  const fx = (anchor.x - view.value.x) / oldW;
  const fy = (anchor.y - view.value.y) / oldH;
  view.value.scale = s;
  view.value.x = anchor.x - fx * (WORLD.cols / s);
  view.value.y = anchor.y - fy * (WORLD.rows / s);
  clampView();
}

function onWheel(e: WheelEvent) {
  applyZoom(
    view.value.scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2),
    screenToSvg(e.clientX, e.clientY),
  );
}

// Pan — arrastar o mapa com o mouse.
let panStart: { gx: number; gy: number } | null = null;
const panMoved = ref(false);
const panning = ref(false);

function onPanStart(e: MouseEvent) {
  const g = screenToSvg(e.clientX, e.clientY);
  panStart = { gx: g.x, gy: g.y };
  panMoved.value = false;
  panning.value = true;
  window.addEventListener("mousemove", onPanMove);
  window.addEventListener("mouseup", onPanEnd);
}
function onPanMove(e: MouseEvent) {
  if (!panStart) return;
  const cur = screenToSvg(e.clientX, e.clientY);
  const dx = panStart.gx - cur.x;
  const dy = panStart.gy - cur.y;
  if (!panMoved.value && Math.abs(dx) + Math.abs(dy) > 0.15) {
    panMoved.value = true;
  }
  if (!panMoved.value) return;
  view.value.x += dx;
  view.value.y += dy;
  clampView();
}
function onPanEnd() {
  panStart = null;
  panning.value = false;
  window.removeEventListener("mousemove", onPanMove);
  window.removeEventListener("mouseup", onPanEnd);
}

// Clique numa província (ignora se foi um arraste do mapa).
function onProvinceClick(p: Province) {
  if (!panMoved.value) selected.value = p;
}
function onOceanClick() {
  if (!panMoved.value) selected.value = null;
}

async function load() {
  loading.value = true;
  err.value = "";
  try {
    // Sequencial de propósito: getSave roda a migração do esquema antes de
    // loadMap (evita duas migrações concorrentes na mesma conexão).
    const save = await getSave(props.saveId);
    game.value = save;
    saveName.value = save.name;
    provinces.value = await loadMap(props.saveId);
    factions.value = await loadFactions(props.saveId);
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

async function newMap() {
  busy.value = true;
  err.value = "";
  selected.value = null;
  try {
    provinces.value = await regenerateMap(props.saveId);
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

async function toggleFullscreen() {
  try {
    const win = getCurrentWindow();
    await win.setFullscreen(!(await win.isFullscreen()));
  } catch {
    /* fora do Tauri: ignora */
  }
}

// ===== Salvar partida / voltar ao menu =====
const showSave = ref(false);
const showExit = ref(false);
const saveNameDraft = ref("");
const toast = ref("");
let toastTimer: ReturnType<typeof setTimeout> | undefined;

function flashToast(msg: string) {
  toast.value = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ""), 2400);
}

function openSaveDialog() {
  saveNameDraft.value = saveName.value;
  showSave.value = true;
}

async function confirmSave() {
  err.value = "";
  const name = saveNameDraft.value.trim() || saveName.value;
  try {
    await renameSave(props.saveId, name);
    saveName.value = name;
    showSave.value = false;
    flashToast("Partida salva.");
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  }
}

function requestExit() {
  if (loadSettings().confirmExit) showExit.value = true;
  else emit("exit");
}

onMounted(load);

// Conjunto de células de terra, para classificar o oceano.
const landSet = computed(
  () => new Set(provinces.value.map((p) => `${p.x},${p.y}`)),
);

// Mar raso = célula de oceano encostada na terra. O resto é mar profundo.
const shallowCells = computed(() => {
  const land = landSet.value;
  const cells: { x: number; y: number }[] = [];
  for (let y = 0; y < GRID.rows; y++) {
    for (let x = 0; x < GRID.cols; x++) {
      if (land.has(`${x},${y}`)) continue;
      let touchesLand = false;
      for (let dy = -1; dy <= 1 && !touchesLand; dy++) {
        for (let dx = -1; dx <= 1 && !touchesLand; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (land.has(`${x + dx},${y + dy}`)) touchesLand = true;
        }
      }
      if (touchesLand) cells.push({ x, y });
    }
  }
  return cells;
});

const capitals = computed(() => provinces.value.filter((p) => p.isCapital));

/** Província-capital da nação do jogador (recebe um destaque no mapa). */
const playerCapital = computed(() =>
  provinces.value.find(
    (p) => p.isCapital && p.ownerCode === game.value?.playerCode,
  ),
);

// Províncias que exibem o ícone do recurso: raros sempre; no modo Recursos,
// todos. Capitais não mostram (já têm a estrela ★).
const iconProvinces = computed(() =>
  provinces.value.filter(
    (p) =>
      !p.isCapital &&
      (mode.value === "resource" ||
        resourceInfo(p.resource).tier === "RARO"),
  ),
);

const selectedOwner = computed(() =>
  nationOf(selected.value?.ownerCode ?? null),
);
const selectedOwnerAlignment = computed(() =>
  selectedOwner.value ? ALIGNMENTS[selectedOwner.value.alignment] : null,
);
const selectedResource = computed(() =>
  selected.value ? resourceInfo(selected.value.resource) : null,
);

const ownership = computed(() => {
  const counts = new Map<string, number>();
  let neutral = 0;
  for (const p of provinces.value) {
    if (p.ownerCode) counts.set(p.ownerCode, (counts.get(p.ownerCode) ?? 0) + 1);
    else neutral++;
  }
  return { counts, neutral };
});

const ranking = computed(() =>
  [...allNations.value]
    .map((n) => ({ nation: n, count: ownership.value.counts.get(n.code) ?? 0 }))
    .sort(
      (a, b) => b.count - a.count || a.nation.name.localeCompare(b.nation.name),
    ),
);

const alignmentCounts = computed(() => {
  const c = new Map<string, number>();
  for (const n of allNations.value) {
    c.set(n.alignment, (c.get(n.alignment) ?? 0) + 1);
  }
  return c;
});

const panelTitle = computed(() =>
  activePanel.value === "nations"
    ? "Nações do Mundo"
    : "Direcionamentos Políticos",
);

function provinceFill(p: Province): string {
  if (mode.value === "resource") return resourceInfo(p.resource).color;
  return nationOf(p.ownerCode)?.color ?? NEUTRAL_COLOR;
}
</script>

<template>
  <div class="game">
    <!-- MAPA — fundo de tela inteira -->
    <svg
      v-if="!loading"
      ref="svgEl"
      class="map-bg"
      :class="{ panning }"
      :viewBox="viewBox"
      preserveAspectRatio="xMidYMid meet"
      @wheel.prevent="onWheel"
      @mousedown="onPanStart"
    >
      <rect
        :x="WORLD.x"
        :y="WORLD.y"
        :width="WORLD.cols"
        :height="WORLD.rows"
        :fill="DEEP_OCEAN"
        @click="onOceanClick"
      />
      <rect
        v-for="(c, i) in shallowCells"
        :key="'sea' + i"
        :x="c.x"
        :y="c.y"
        width="1.02"
        height="1.02"
        :fill="SHALLOW_OCEAN"
        @click="onOceanClick"
      />
      <rect
        v-for="p in provinces"
        :key="p.id"
        :x="p.x"
        :y="p.y"
        width="1.02"
        height="1.02"
        :fill="provinceFill(p)"
        :fill-opacity="hovered?.id === p.id ? 1 : 0.92"
        stroke="rgba(0,0,0,0.4)"
        stroke-width="0.04"
        class="prov"
        @click="onProvinceClick(p)"
        @mouseenter="hovered = p"
        @mouseleave="hovered = null"
      />
      <!-- Ícones dos recursos -->
      <text
        v-for="p in iconProvinces"
        :key="'ic' + p.id"
        :x="p.x + 0.5"
        :y="p.y + 0.5"
        text-anchor="middle"
        dominant-baseline="central"
        font-size="0.72"
        style="pointer-events: none"
      >
        {{ resourceInfo(p.resource).icon }}
      </text>
      <!-- Contorno da província selecionada -->
      <rect
        v-if="selected"
        :x="selected.x"
        :y="selected.y"
        width="1.02"
        height="1.02"
        fill="none"
        stroke="#ffffff"
        stroke-width="0.18"
        style="pointer-events: none"
      />
      <!-- Destaque da capital do jogador -->
      <circle
        v-if="playerCapital"
        :cx="playerCapital.x + 0.5"
        :cy="playerCapital.y + 0.5"
        r="0.82"
        fill="none"
        stroke="#ffffff"
        stroke-width="0.13"
        stroke-dasharray="0.32 0.22"
        style="pointer-events: none"
      />
      <!-- Capitais -->
      <text
        v-for="p in capitals"
        :key="'cap' + p.id"
        :x="p.x + 0.5"
        :y="p.y + 0.95"
        text-anchor="middle"
        font-size="1.5"
        fill="#ffd24a"
        stroke="#000"
        stroke-width="0.09"
        paint-order="stroke"
        style="pointer-events: none"
      >
        ★
      </text>
    </svg>

    <p v-if="loading" class="center-msg">Carregando o mundo...</p>

    <!-- HUD -->
    <div v-if="!loading" class="hud">
      <!-- Barra superior: facção do jogador, valores e modo do mapa -->
      <header class="topbar">
        <div
          v-if="playerNation && playerFaction"
          class="faction"
          :style="{ '--pc': playerNation.color }"
        >
          <Flag
            :seed="flagSeed(playerNation)"
            :color="playerNation.color"
            :size="34"
          />
          <div class="fb-id">
            <span class="fb-label">Sua nação</span>
            <span class="fb-name">{{ playerNation.name }}</span>
          </div>
          <div class="fb-sep"></div>
          <div
            v-for="s in FACTION_STATS"
            :key="s.key"
            class="fb-stat"
            :title="s.label"
          >
            <span class="fb-icon">{{ s.icon }}</span>
            <span class="fb-text">
              <span class="fb-val" :style="{ color: s.color }">
                {{ fmt(playerFaction[s.key]) }}
              </span>
              <span class="fb-stat-label">{{ s.label }}</span>
            </span>
          </div>
        </div>

        <div class="fb-sep"></div>

        <div class="seg">
          <button
            :class="{ on: mode === 'political' }"
            @click="mode = 'political'"
          >
            🗺️ Político
          </button>
          <button
            :class="{ on: mode === 'resource' }"
            @click="mode = 'resource'"
          >
            ⛏️ Recursos
          </button>
        </div>

        <div class="spacer"></div>

        <div class="status">
          <span v-if="hovered" class="status-name">{{ hovered.name }}</span>
          <span v-else class="status-dim">{{ provinces.length }} províncias</span>
        </div>

        <span class="save-tag" :title="'Partida: ' + saveName">
          📌 {{ saveName }}
        </span>
      </header>

      <p v-if="err" class="hud-error">ERRO: {{ err }}</p>

      <!-- Barra lateral: ações do jogo, só ícones -->
      <nav class="sidebar">
        <button
          class="side-btn"
          :class="{ on: activePanel === 'nations' }"
          title="Nações"
          @click="togglePanel('nations')"
        >
          🏴
        </button>
        <button
          class="side-btn"
          :class="{ on: activePanel === 'alignments' }"
          title="Direcionamentos"
          @click="togglePanel('alignments')"
        >
          🎖️
        </button>
        <div class="side-div"></div>
        <button
          class="side-btn"
          :disabled="busy"
          :title="busy ? 'Gerando...' : 'Novo mapa'"
          @click="newMap"
        >
          ↻
        </button>
        <button class="side-btn" title="Salvar jogo" @click="openSaveDialog">
          💾
        </button>
        <button class="side-btn" title="Menu" @click="requestExit">⏏</button>
        <button class="side-btn" title="Tela cheia" @click="toggleFullscreen">
          ⛶
        </button>
      </nav>

      <!-- Painel da província (contextual, ao clicar) -->
      <Transition name="rise">
        <section v-if="selected" class="card province">
          <div class="card-head">
            <div class="head-title">
              <span class="prov-name">{{ selected.name }}</span>
              <span v-if="selected.isCapital" class="badge">★ CAPITAL</span>
            </div>
            <button class="x" @click="selected = null">✕</button>
          </div>
          <p class="sub">
            {{ CONTINENT_NAMES[selected.continent] }}
            <span class="dimsep">·</span>
            célula {{ selected.x }},{{ selected.y }}
          </p>

          <div
            class="owner"
            :style="{ '--c': selectedOwner?.color ?? NEUTRAL_COLOR }"
          >
            <span class="owner-bar"></span>
            <Flag
              v-if="selectedOwner"
              :seed="flagSeed(selectedOwner)"
              :color="selectedOwner.color"
              :size="34"
            />
            <div class="owner-info">
              <strong v-if="selectedOwner">
                {{ selectedOwner.name }}
                <span
                  v-if="selectedOwner.code === game?.playerCode"
                  class="you-tag"
                  >VOCÊ</span
                >
              </strong>
              <span v-else class="dim">Província neutra</span>
              <span v-if="selectedOwnerAlignment" class="owner-align">
                <span
                  class="dot"
                  :style="{ background: selectedOwnerAlignment.color }"
                ></span>
                {{ selectedOwnerAlignment.label }}
              </span>
            </div>
          </div>

          <div
            v-if="selectedResource"
            class="resource"
            :style="{ '--rc': selectedResource.color }"
          >
            <span class="ricon">{{ selectedResource.icon }}</span>
            <div class="rinfo">
              <div class="rname">{{ selectedResource.label }}</div>
              <span
                class="tier"
                :class="selectedResource.tier === 'RARO' ? 'rare' : 'common'"
              >
                {{ selectedResource.tier }}
              </span>
            </div>
          </div>
          <p v-if="selectedResource" class="effect">
            {{ selectedResource.effect }}
          </p>

          <div class="prod-head">Produção por turno</div>
          <div class="prod-grid">
            <div
              v-for="s in TERRITORY_STATS"
              :key="s.key"
              class="prod-cell"
            >
              <span class="prod-icon">
                {{
                  s.key === "resourceProduction" && selectedResource
                    ? selectedResource.icon
                    : s.icon
                }}
              </span>
              <span class="prod-info">
                <span class="prod-val" :style="{ color: s.color }">
                  +{{ selected[s.key] }}
                </span>
                <span class="prod-label">{{ s.label }}</span>
              </span>
            </div>
          </div>
        </section>
      </Transition>

      <!-- Painel lateral (abre por botão) -->
      <Transition name="slide">
        <section v-if="activePanel" class="card panel">
          <div class="card-head">
            <div class="head-title">{{ panelTitle }}</div>
            <button class="x" @click="activePanel = null">✕</button>
          </div>

          <div class="panel-body">
            <table v-if="activePanel === 'nations'">
              <tbody>
                <tr
                  v-for="row in ranking"
                  :key="row.nation.code"
                  :class="{ me: row.nation.code === game?.playerCode }"
                >
                  <td>
                    <Flag
                      :seed="flagSeed(row.nation)"
                      :color="row.nation.color"
                      :size="22"
                    />
                  </td>
                  <td class="nname">
                    {{ row.nation.name }}
                    <span
                      class="dot"
                      :style="{
                        background: ALIGNMENTS[row.nation.alignment].color,
                      }"
                      :title="ALIGNMENTS[row.nation.alignment].label"
                    ></span>
                    <span
                      v-if="row.nation.code === game?.playerCode"
                      class="you-tag"
                      >VOCÊ</span
                    >
                  </td>
                  <td class="num">{{ row.count }}</td>
                </tr>
                <tr class="neutral-row">
                  <td>
                    <span
                      class="swatch"
                      :style="{ background: NEUTRAL_COLOR }"
                    ></span>
                  </td>
                  <td class="nname dim">Províncias neutras</td>
                  <td class="num">{{ ownership.neutral }}</td>
                </tr>
              </tbody>
            </table>

            <div v-else class="aligns">
              <div
                v-for="a in ALIGNMENT_LIST"
                :key="a.id"
                class="align"
                :style="{ '--ac': a.color }"
              >
                <div class="align-top">
                  <span class="dot" :style="{ background: a.color }"></span>
                  <strong>{{ a.label }}</strong>
                  <span class="pill"
                    >{{ alignmentCounts.get(a.id) ?? 0 }} nações</span
                  >
                </div>
                <p class="align-desc">{{ a.description }}</p>
              </div>
              <p class="note">
                O direcionamento do jogador definirá as chances de aliança com
                outras facções — mecânica a ser implementada.
              </p>
            </div>
          </div>
        </section>
      </Transition>

      <!-- Aviso de partida salva -->
      <Transition name="rise">
        <div v-if="toast" class="toast">{{ toast }}</div>
      </Transition>

      <!-- Diálogo: salvar jogo -->
      <Transition name="fade">
        <div
          v-if="showSave"
          class="modal-scrim"
          @click.self="showSave = false"
        >
          <div class="modal">
            <h3>Salvar jogo</h3>
            <label class="field">
              <span>Nome da partida</span>
              <input
                v-model="saveNameDraft"
                type="text"
                maxlength="40"
                @keyup.enter="confirmSave"
              />
            </label>
            <div class="modal-actions">
              <button @click="showSave = false">Cancelar</button>
              <button class="on" @click="confirmSave">Salvar</button>
            </div>
          </div>
        </div>
      </Transition>

      <!-- Diálogo: voltar ao menu -->
      <Transition name="fade">
        <div
          v-if="showExit"
          class="modal-scrim"
          @click.self="showExit = false"
        >
          <div class="modal">
            <h3>Voltar ao menu?</h3>
            <p class="modal-text">
              O progresso fica gravado no banco de dados local. Use
              <strong>Salvar jogo</strong> antes de sair se quiser renomear a
              partida.
            </p>
            <div class="modal-actions">
              <button @click="showExit = false">Continuar jogando</button>
              <button class="on" @click="emit('exit')">Sair para o menu</button>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.game {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #122a35;
}
.map-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  cursor: grab;
}
.map-bg.panning {
  cursor: grabbing;
}
.prov {
  cursor: pointer;
  transition: fill-opacity 0.1s;
}

/* Camada da HUD: só os painéis capturam o mouse. */
.hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.hud > * {
  pointer-events: auto;
}

/* ===== Barra superior ===== */
.topbar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 56px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 14px;
  background: linear-gradient(180deg, #2a3242 0%, #161b27 100%);
  border-bottom: 1px solid #0c0f16;
  box-shadow: 0 2px 0 rgba(232, 184, 74, 0.25), 0 4px 14px rgba(0, 0, 0, 0.5);
}
/* Facção do jogador (bandeira + valores) na barra superior */
.faction {
  display: flex;
  align-items: center;
  gap: 12px;
}
.fb-id {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  max-width: 170px;
}
.fb-label {
  font-size: 0.58rem;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: #8a92a0;
}
.fb-name {
  font-size: 0.86rem;
  font-weight: 700;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fb-sep {
  width: 1px;
  align-self: stretch;
  background: var(--line);
}
.fb-stat {
  display: flex;
  align-items: center;
  gap: 6px;
}
.fb-icon {
  font-size: 1.15rem;
}
.fb-text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}
.fb-val {
  font-size: 0.95rem;
  font-weight: 800;
}
.fb-stat-label {
  font-size: 0.58rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #8a92a0;
}

.seg {
  display: flex;
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
}
.seg button {
  border: none;
  border-radius: 0;
}
.seg button + button {
  border-left: 1px solid var(--line);
}
.status {
  min-width: 110px;
  padding: 0 6px;
  text-align: right;
}
.status-name {
  font-weight: 700;
  color: #fff;
}
.status-dim {
  color: #8a92a0;
}
.spacer {
  flex: 1;
}
.save-tag {
  font-size: 0.78rem;
  color: #9aa0ac;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Etiqueta "VOCÊ" */
.you-tag {
  font-size: 0.56rem;
  font-weight: 800;
  letter-spacing: 0.5px;
  color: #20160a;
  background: var(--gold);
  border-radius: 3px;
  padding: 1px 5px;
  vertical-align: middle;
  margin-left: 4px;
}

/* ===== Barra lateral (ações do jogo — só ícones) ===== */
.sidebar {
  position: absolute;
  top: 68px;
  left: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 7px;
  background: linear-gradient(180deg, var(--panel-a) 0%, var(--panel-b) 100%);
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.55);
}
.side-btn {
  width: 42px;
  height: 42px;
  padding: 0;
  display: grid;
  place-items: center;
  border-radius: 10px;
  font-size: 1.15rem;
}
.side-div {
  height: 1px;
  background: var(--line);
  margin: 2px 5px;
}

/* ===== Cartões / painéis ===== */
.card {
  background: linear-gradient(180deg, var(--panel-a) 0%, var(--panel-b) 100%);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 14px 38px rgba(0, 0, 0, 0.6);
  overflow: hidden;
}
.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 13px;
  background: rgba(0, 0, 0, 0.28);
  border-bottom: 1px solid var(--line);
}
.head-title {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 800;
  color: var(--gold);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  font-size: 0.84rem;
}
.prov-name {
  text-transform: none;
  letter-spacing: 0;
  font-size: 1rem;
  color: #fff;
}
.badge {
  font-size: 0.6rem;
  font-weight: 800;
  color: #1c1407;
  background: var(--gold);
  border-radius: 4px;
  padding: 2px 6px;
  letter-spacing: 0.5px;
}
.province {
  position: absolute;
  left: 70px;
  bottom: 14px;
  width: 320px;
}
.province .sub,
.province .owner,
.province .resource,
.province .effect {
  margin-left: 13px;
  margin-right: 13px;
}
.sub {
  color: #8a92a0;
  font-size: 0.8rem;
  margin-top: 10px;
}
.dimsep {
  opacity: 0.5;
  margin: 0 3px;
}
.owner {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 8px;
  padding: 9px 11px;
}
.owner-bar {
  width: 4px;
  align-self: stretch;
  border-radius: 3px;
  background: var(--c);
  flex: none;
}
.owner-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.owner-info strong {
  font-size: 0.95rem;
}
.owner-align {
  font-size: 0.76rem;
  color: #9aa0ac;
  display: flex;
  align-items: center;
  gap: 5px;
}
.resource {
  display: flex;
  align-items: center;
  gap: 11px;
  margin-top: 11px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--line);
  border-left: 3px solid var(--rc);
  border-radius: 8px;
  padding: 9px 11px;
}
.ricon {
  font-size: 1.7rem;
}
.rname {
  font-weight: 700;
  color: var(--rc);
}
.tier {
  display: inline-block;
  margin-top: 2px;
  font-size: 0.6rem;
  font-weight: 800;
  letter-spacing: 0.5px;
  padding: 2px 6px;
  border-radius: 4px;
}
.tier.rare {
  background: rgba(241, 196, 15, 0.18);
  color: #f1c40f;
}
.tier.common {
  background: rgba(127, 140, 141, 0.22);
  color: #aab4b8;
}
.effect {
  color: #8a92a0;
  font-size: 0.8rem;
  margin: 9px 13px 14px;
}

/* Produção do território */
.prod-head {
  margin: 4px 13px 0;
  font-size: 0.66rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.7px;
  color: #8a92a0;
}
.prod-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
  margin: 8px 13px 14px;
}
.prod-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 7px 9px;
}
.prod-icon {
  font-size: 1.2rem;
}
.prod-info {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}
.prod-val {
  font-size: 0.95rem;
  font-weight: 800;
}
.prod-label {
  font-size: 0.6rem;
  color: #8a92a0;
}
.panel {
  position: absolute;
  right: 14px;
  top: 70px;
  bottom: 66px;
  width: 330px;
  display: flex;
  flex-direction: column;
}
.panel-body {
  padding: 10px 13px 14px;
  overflow-y: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
}
td {
  padding: 6px 4px;
  vertical-align: middle;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
tr.me {
  background: rgba(232, 184, 74, 0.1);
}
.nname {
  font-size: 0.85rem;
}
.num {
  text-align: right;
  font-weight: 800;
  color: var(--gold);
}
.neutral-row td {
  border-bottom: none;
}
.neutral-row .num {
  color: #8a92a0;
}
.swatch {
  display: inline-block;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  vertical-align: middle;
  flex: none;
}
.dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  vertical-align: middle;
  flex: none;
}
.nname .dot {
  margin-left: 5px;
}
.dim {
  color: #8a92a0;
}
.aligns {
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.align {
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--line);
  border-left: 3px solid var(--ac);
  border-radius: 8px;
  padding: 9px 11px;
}
.align-top {
  display: flex;
  align-items: center;
  gap: 7px;
}
.align-top strong {
  flex: 1;
}
.pill {
  font-size: 0.68rem;
  font-weight: 700;
  color: #cdd2da;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 2px 8px;
}
.align-desc {
  color: #8a92a0;
  font-size: 0.78rem;
  margin: 6px 0 0;
}
.note {
  color: #7d8694;
  font-size: 0.76rem;
  font-style: italic;
  margin-top: 12px;
}

/* Mensagens */
.center-msg {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8a92a0;
}
.hud-error {
  position: absolute;
  top: 70px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(58, 29, 29, 0.97);
  border: 1px solid #f85149;
  color: #ffb4ae;
  padding: 8px 14px;
  border-radius: 8px;
  margin: 0;
}

/* ===== Aviso flutuante (toast) ===== */
.toast {
  position: absolute;
  bottom: 64px;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(180deg, #2a3242 0%, #161b27 100%);
  border: 1px solid var(--gold);
  color: #fff;
  font-weight: 600;
  padding: 9px 16px;
  border-radius: 9px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
}

/* ===== Modais ===== */
.modal-scrim {
  position: absolute;
  inset: 0;
  background: rgba(8, 12, 18, 0.72);
  display: grid;
  place-items: center;
}
.modal {
  width: 350px;
  max-width: 90vw;
  background: linear-gradient(180deg, var(--panel-a) 0%, var(--panel-b) 100%);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.7);
  padding: 18px;
}
.modal h3 {
  margin: 0 0 12px;
  color: var(--gold);
  font-size: 1rem;
  text-transform: uppercase;
  letter-spacing: 0.8px;
}
.modal-text {
  color: #9aa0ac;
  font-size: 0.84rem;
  line-height: 1.5;
  margin: 0 0 14px;
}
.modal-text strong {
  color: #cdd2da;
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
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* Transições */
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.18s ease, opacity 0.18s ease;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(24px);
  opacity: 0;
}
.rise-enter-active,
.rise-leave-active {
  transition: transform 0.18s ease, opacity 0.18s ease;
}
.rise-enter-from,
.rise-leave-to {
  transform: translateY(20px);
  opacity: 0;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.16s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
