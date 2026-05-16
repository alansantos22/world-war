<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
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

const viewBox = `0 0 ${GRID.cols} ${GRID.rows}`;

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

onMounted(load);

// Conjunto de células de terra, para classificar o oceano.
const landSet = computed(
  () => new Set(provinces.value.map((p) => `${p.x},${p.y}`)),
);

// Mar raso = célula de oceano encostada na terra. O resto é mar profundo
// (desenhado como fundo). Isso evita o oceano "chapado" e feio.
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

// Nação dona da província selecionada e o seu direcionamento político.
const selectedOwner = computed(() =>
  nationByCode(selected.value?.ownerCode ?? null),
);
const selectedOwnerAlignment = computed(() =>
  selectedOwner.value ? ALIGNMENTS[selectedOwner.value.alignment] : null,
);

// Contagem de províncias por nação e de províncias neutras.
const ownership = computed(() => {
  const counts = new Map<string, number>();
  let neutral = 0;
  for (const p of provinces.value) {
    if (p.ownerCode) counts.set(p.ownerCode, (counts.get(p.ownerCode) ?? 0) + 1);
    else neutral++;
  }
  return { counts, neutral };
});

// Ranking de nações por território controlado.
const ranking = computed(() =>
  [...NATIONS]
    .map((n) => ({ nation: n, count: ownership.value.counts.get(n.code) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.nation.name.localeCompare(b.nation.name)),
);

// Quantas nações há em cada direcionamento político.
const alignmentCounts = computed(() => {
  const c = new Map<string, number>();
  for (const n of NATIONS) c.set(n.alignment, (c.get(n.alignment) ?? 0) + 1);
  return c;
});

/** Cor de uma província conforme o modo de visualização. */
function provinceFill(p: Province): string {
  if (mode.value === "resource") return resourceInfo(p.resource).color;
  return nationByCode(p.ownerCode)?.color ?? NEUTRAL_COLOR;
}
</script>

<template>
  <main class="app">
    <header class="topbar">
      <div>
        <h1>World War</h1>
        <span class="tag">Grande Estratégia — Mapa-Múndi</span>
      </div>
      <button class="ghost" :disabled="busy || loading" @click="newMap">
        {{ busy ? "Gerando..." : "↻ Novo mapa" }}
      </button>
    </header>

    <p v-if="err" class="error">ERRO: {{ err }}</p>
    <p v-if="loading" class="loading">Carregando o mundo...</p>

    <div v-else class="layout">
      <!-- Mapa -->
      <div class="map-panel">
        <div class="modebar">
          <button
            :class="{ active: mode === 'political' }"
            @click="mode = 'political'"
          >
            🗺️ Político
          </button>
          <button
            :class="{ active: mode === 'resource' }"
            @click="mode = 'resource'"
          >
            ⛏️ Recursos
          </button>
          <span class="hovered">
            {{ hovered ? hovered.name : `${provinces.length} províncias` }}
          </span>
        </div>

        <svg :viewBox="viewBox" class="world">
          <!-- Mar profundo (fundo) -->
          <rect :width="GRID.cols" :height="GRID.rows" :fill="DEEP_OCEAN" />
          <!-- Mar raso (encostado na terra) -->
          <rect
            v-for="(c, i) in shallowCells"
            :key="'sea' + i"
            :x="c.x"
            :y="c.y"
            width="1.02"
            height="1.02"
            :fill="SHALLOW_OCEAN"
          />
          <!-- Províncias (1 célula cada) -->
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
            @click="selected = p"
            @mouseenter="hovered = p"
            @mouseleave="hovered = null"
          />
          <!-- Contorno da província selecionada -->
          <rect
            v-if="selected"
            :x="selected.x"
            :y="selected.y"
            width="1.02"
            height="1.02"
            fill="none"
            stroke="#ffffff"
            stroke-width="0.16"
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
      </div>

      <!-- Painel lateral -->
      <aside class="side">
        <!-- Província selecionada -->
        <section class="card" v-if="selected">
          <h2>
            {{ selected.name }}
            <span v-if="selected.isCapital" class="capital">★ Capital</span>
          </h2>
          <p class="muted small">
            {{ CONTINENT_NAMES[selected.continent] }} ·
            célula {{ selected.x }},{{ selected.y }}
          </p>

          <div class="row">
            <span
              class="swatch"
              :style="{ background: selectedOwner?.color ?? NEUTRAL_COLOR }"
            ></span>
            <strong v-if="selectedOwner">{{ selectedOwner.name }}</strong>
            <span v-else class="muted">Província neutra</span>
          </div>
          <p v-if="selectedOwnerAlignment" class="muted small align-line">
            Direcionamento:
            <span
              class="align-chip"
              :style="{ color: selectedOwnerAlignment.color }"
            >
              {{ selectedOwnerAlignment.label }}
            </span>
          </p>

          <div
            class="resource"
            :style="{ borderColor: resourceInfo(selected.resource).color }"
          >
            <span class="ricon">{{ resourceInfo(selected.resource).icon }}</span>
            <div>
              <div
                class="rname"
                :style="{ color: resourceInfo(selected.resource).color }"
              >
                {{ resourceInfo(selected.resource).label }}
              </div>
              <span
                class="tier"
                :class="
                  resourceInfo(selected.resource).tier === 'RARO'
                    ? 'rare'
                    : 'common'
                "
              >
                {{ resourceInfo(selected.resource).tier }}
              </span>
            </div>
          </div>
          <p class="muted small">{{ resourceInfo(selected.resource).effect }}</p>
        </section>
        <section class="card" v-else>
          <h2>Província</h2>
          <p class="muted">Clique numa província do mapa para ver os detalhes.</p>
        </section>

        <!-- Ranking de nações -->
        <section class="card">
          <h3>Nações ({{ NATIONS.length }})</h3>
          <table>
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
              <tr>
                <td>
                  <span
                    class="swatch"
                    :style="{ background: NEUTRAL_COLOR }"
                  ></span>
                </td>
                <td class="nname muted">Províncias neutras</td>
                <td class="num">{{ ownership.neutral }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <!-- Direcionamentos políticos -->
        <section class="card">
          <h3>Direcionamentos políticos</h3>
          <div
            v-for="a in ALIGNMENT_LIST"
            :key="a.id"
            class="align-item"
          >
            <span class="dot" :style="{ background: a.color }"></span>
            <strong>{{ a.label }}</strong>
            <span class="num">{{ alignmentCounts.get(a.id) ?? 0 }}</span>
          </div>
          <p class="muted small">
            O direcionamento do jogador definirá as chances de aliança com
            outras facções — mecânica a ser implementada.
          </p>
        </section>
      </aside>
    </div>
  </main>
</template>

<style>
:root {
  font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
  font-size: 14px;
  color: #e8e8e8;
  background-color: #15171d;
}
body {
  margin: 0;
}
.app {
  padding: 1rem 1.5rem 2rem;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}
.topbar h1 {
  margin: 0;
  font-size: 1.5rem;
}
.tag {
  color: #9aa0ac;
  font-size: 0.85rem;
}
.layout {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 1rem;
  align-items: start;
}
.map-panel,
.card {
  background: #1f2530;
  border: 1px solid #2f3744;
  border-radius: 10px;
}
.map-panel {
  padding: 0.6rem;
  /* permite a coluna 1fr encolher abaixo do tamanho intrínseco do SVG */
  min-width: 0;
}
.modebar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}
.modebar .hovered {
  margin-left: auto;
  color: #9aa0ac;
  font-weight: 600;
}
.world {
  width: 100%;
  height: auto;
  display: block;
  border-radius: 6px;
  max-height: calc(100vh - 190px);
}
.prov {
  cursor: pointer;
}
.side {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.card {
  padding: 1rem;
}
.card h2,
.card h3 {
  margin-top: 0;
}
h2 {
  font-size: 1.1rem;
}
.muted {
  color: #9aa0ac;
}
.small {
  font-size: 0.82rem;
}
button {
  border: 1px solid #2f3744;
  background: #2a323f;
  color: #e8e8e8;
  border-radius: 8px;
  padding: 0.45em 0.9em;
  font-size: 0.9em;
  font-weight: 600;
  cursor: pointer;
}
button:hover:not(:disabled) {
  border-color: #396cd8;
}
button.active {
  background: #396cd8;
  border-color: #396cd8;
  color: #fff;
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
.row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.7rem 0 0.3rem;
}
.swatch {
  display: inline-block;
  width: 13px;
  height: 13px;
  border-radius: 3px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  vertical-align: middle;
  flex: none;
}
.dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  vertical-align: middle;
}
.capital {
  font-size: 0.7rem;
  font-weight: 700;
  color: #ffd24a;
  border: 1px solid #ffd24a;
  border-radius: 4px;
  padding: 1px 6px;
}
.align-line {
  margin: 0.2rem 0 0;
}
.align-chip {
  font-weight: 700;
}
.resource {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  background: #15171d;
  border: 2px solid #2f3744;
  border-radius: 8px;
  padding: 0.7rem;
  margin-top: 0.7rem;
}
.ricon {
  font-size: 1.8rem;
}
.rname {
  font-weight: 700;
}
.tier {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
}
.tier.rare {
  background: rgba(241, 196, 15, 0.18);
  color: #f1c40f;
}
.tier.common {
  background: rgba(127, 140, 141, 0.2);
  color: #aab4b8;
}
table {
  width: 100%;
  border-collapse: collapse;
}
td {
  padding: 3px 4px;
  vertical-align: middle;
}
.nname {
  font-size: 0.82rem;
}
.nname .dot {
  margin-left: 4px;
}
.num {
  text-align: right;
  font-weight: 700;
}
.align-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 3px 0;
}
.align-item .num {
  margin-left: auto;
}
.error {
  background: #3a1d1d;
  border-left: 3px solid #f85149;
  color: #ffb4ae;
  padding: 0.6rem 0.8rem;
  border-radius: 6px;
}
.loading {
  color: #9aa0ac;
}
</style>
