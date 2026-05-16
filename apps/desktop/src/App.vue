<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { GRID, CONTINENT_NAMES } from "./game/map-generator";
import { NATIONS, nationByCode } from "./game/nations";
import { ALIGNMENTS, ALIGNMENT_LIST } from "./game/alignments";
import { resourceInfo } from "./game/resources";
import { loadOrCreateMap, regenerateMap, type Province } from "./game/world";

const DEEP_OCEAN = "#15323f";
const SHALLOW_OCEAN = "#2a6075";
const NEUTRAL_COLOR = "#39414f";

const provinces = ref<Province[]>([]);
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

// ===== Zoom e navegação do mapa =====
const MIN_SCALE = 1;
const MAX_SCALE = 7;
const svgEl = ref<SVGSVGElement | null>(null);
const view = ref({ x: 0, y: 0, scale: 1 });

const viewBox = computed(() => {
  const w = GRID.cols / view.value.scale;
  const h = GRID.rows / view.value.scale;
  return `${view.value.x} ${view.value.y} ${w} ${h}`;
});

function clampView() {
  const w = GRID.cols / view.value.scale;
  const h = GRID.rows / view.value.scale;
  view.value.x = Math.min(Math.max(view.value.x, 0), Math.max(0, GRID.cols - w));
  view.value.y = Math.min(Math.max(view.value.y, 0), Math.max(0, GRID.rows - h));
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
  const oldW = GRID.cols / view.value.scale;
  const oldH = GRID.rows / view.value.scale;
  const fx = (anchor.x - view.value.x) / oldW;
  const fy = (anchor.y - view.value.y) / oldH;
  view.value.scale = s;
  view.value.x = anchor.x - fx * (GRID.cols / s);
  view.value.y = anchor.y - fy * (GRID.rows / s);
  clampView();
}

function onWheel(e: WheelEvent) {
  applyZoom(
    view.value.scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2),
    screenToSvg(e.clientX, e.clientY),
  );
}

function zoomButton(factor: number) {
  applyZoom(view.value.scale * factor, {
    x: view.value.x + GRID.cols / view.value.scale / 2,
    y: view.value.y + GRID.rows / view.value.scale / 2,
  });
}

function resetView() {
  view.value = { x: 0, y: 0, scale: 1 };
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
    provinces.value = await loadOrCreateMap();
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
    provinces.value = await regenerateMap();
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
  nationByCode(selected.value?.ownerCode ?? null),
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
  [...NATIONS]
    .map((n) => ({ nation: n, count: ownership.value.counts.get(n.code) ?? 0 }))
    .sort(
      (a, b) => b.count - a.count || a.nation.name.localeCompare(b.nation.name),
    ),
);

const alignmentCounts = computed(() => {
  const c = new Map<string, number>();
  for (const n of NATIONS) c.set(n.alignment, (c.get(n.alignment) ?? 0) + 1);
  return c;
});

const panelTitle = computed(() =>
  activePanel.value === "nations"
    ? "Nações do Mundo"
    : "Direcionamentos Políticos",
);

function provinceFill(p: Province): string {
  if (mode.value === "resource") return resourceInfo(p.resource).color;
  return nationByCode(p.ownerCode)?.color ?? NEUTRAL_COLOR;
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
        :width="GRID.cols"
        :height="GRID.rows"
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
      <!-- Barra superior -->
      <header class="topbar">
        <div class="crest">
          <span class="crest-icon">⚔</span>
          <span class="crest-text">
            <span class="crest-title">WORLD WAR</span>
            <span class="crest-sub">Grande Estratégia</span>
          </span>
        </div>

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

        <div class="tools">
          <button
            class="tool"
            :class="{ on: activePanel === 'nations' }"
            @click="togglePanel('nations')"
          >
            🏴 Nações
          </button>
          <button
            class="tool"
            :class="{ on: activePanel === 'alignments' }"
            @click="togglePanel('alignments')"
          >
            🎖️ Direcionamentos
          </button>
        </div>

        <div class="status">
          <span v-if="hovered" class="status-name">{{ hovered.name }}</span>
          <span v-else class="status-dim">{{ provinces.length }} províncias</span>
        </div>

        <div class="spacer"></div>

        <button class="tool" :disabled="busy" @click="newMap">
          {{ busy ? "Gerando..." : "↻ Novo mapa" }}
        </button>
        <button class="tool icon" title="Tela cheia" @click="toggleFullscreen">
          ⛶
        </button>
      </header>

      <p v-if="err" class="hud-error">ERRO: {{ err }}</p>

      <!-- Controle de zoom -->
      <div class="zoom-ctl">
        <button title="Aproximar" @click="zoomButton(1.4)">＋</button>
        <button title="Afastar" @click="zoomButton(1 / 1.4)">−</button>
        <button title="Visão geral" @click="resetView">⤢</button>
      </div>

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
            <div class="owner-info">
              <strong v-if="selectedOwner">{{ selectedOwner.name }}</strong>
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
                <tr v-for="row in ranking" :key="row.nation.code">
                  <td>
                    <span
                      class="swatch"
                      :style="{ background: row.nation.color }"
                    ></span>
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
    </div>
  </div>
</template>

<style>
:root {
  font-family: "Segoe UI", Inter, Avenir, Helvetica, Arial, sans-serif;
  font-size: 14px;
  color: #e6e9ef;
  --gold: #e8b84a;
  --line: #3c4757;
  --panel-a: #212838;
  --panel-b: #141925;
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
}

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
.crest {
  display: flex;
  align-items: center;
  gap: 9px;
  padding-right: 14px;
  border-right: 1px solid var(--line);
}
.crest-icon {
  font-size: 20px;
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  background: linear-gradient(180deg, #3a4658 0%, #20283a 100%);
  border: 1px solid var(--gold);
  border-radius: 8px;
}
.crest-text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}
.crest-title {
  font-weight: 800;
  letter-spacing: 1.5px;
  color: var(--gold);
  font-size: 0.95rem;
}
.crest-sub {
  font-size: 0.68rem;
  color: #8a92a0;
  letter-spacing: 0.5px;
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
.tools {
  display: flex;
  gap: 7px;
}
.status {
  min-width: 130px;
  padding: 0 6px;
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

/* ===== Botões ===== */
button {
  font-family: inherit;
  border: 1px solid var(--line);
  background: linear-gradient(180deg, #313a4b 0%, #232b3a 100%);
  color: #d6dae2;
  border-radius: 8px;
  padding: 8px 13px;
  font-size: 0.86rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.13s;
  white-space: nowrap;
}
button:hover:not(:disabled) {
  border-color: var(--gold);
  color: #fff;
}
button:active:not(:disabled) {
  transform: translateY(1px);
}
button.on {
  background: linear-gradient(180deg, #f0c558 0%, #d8a233 100%);
  border-color: #f0c558;
  color: #20160a;
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
button.icon {
  padding: 8px 11px;
  font-size: 1rem;
}
button.x {
  border: none;
  background: none;
  padding: 2px 6px;
  color: #8a92a0;
  font-size: 0.95rem;
}
button.x:hover {
  color: #fff;
}

/* ===== Controle de zoom ===== */
.zoom-ctl {
  position: absolute;
  bottom: 14px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
}
.zoom-ctl button {
  width: 38px;
  height: 38px;
  padding: 0;
  font-size: 1.1rem;
  display: grid;
  place-items: center;
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
  left: 14px;
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
  gap: 10px;
  margin-top: 12px;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 8px;
  padding: 9px 11px;
}
.owner-bar {
  width: 4px;
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
  width: 14px;
  height: 14px;
  border-radius: 3px;
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
</style>
