<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, apiError } from '../api/client';
import { useCitizenStore } from '../stores/citizen';

const router = useRouter();
const citizen = useCitizenStore();

const grid = ref({ cols: 50, rows: 24 });
const regions = ref<any[]>([]);
const countries = ref<any[]>([]);
const scarcity = ref<any[]>([]);
const neutralCount = ref(0);
const totalRegions = ref(0);

const mode = ref<'political' | 'resource'>('political');
const selected = ref<any>(null);
const hovered = ref<any>(null);
const err = ref('');

// Conquista: previa de ataque da regiao selecionada.
const preview = ref<any>(null);
const warErr = ref('');
const warBusy = ref(false);

const myCountryId = computed(() => citizen.me?.country?.id ?? null);

const NEUTRAL_COLOR = '#3a4150';
const OCEAN_COLOR = '#1c4a63';

async function load() {
  try {
    const [m, s] = await Promise.all([
      api.get('/map'),
      api.get('/resources/scarcity'),
    ]);
    grid.value = m.data.grid;
    regions.value = m.data.regions;
    countries.value = m.data.countries;
    neutralCount.value = m.data.neutralCount;
    totalRegions.value = m.data.totalRegions;
    scarcity.value = s.data;
  } catch (e) {
    err.value = apiError(e);
  }
}
onMounted(load);

function regionFill(r: any): string {
  if (mode.value === 'resource') return r.resource.color;
  return r.owner ? r.owner.color : NEUTRAL_COLOR;
}
// Seleciona uma regiao e, se nao for do jogador, busca a previa de ataque.
async function select(r: any) {
  selected.value = r;
  preview.value = null;
  warErr.value = '';
  if (!r || r.owner?.id === myCountryId.value) return;
  try {
    const { data } = await api.get(`/battles/preview/${r.id}`);
    preview.value = data;
  } catch (e) {
    warErr.value = apiError(e);
  }
}

// Declara guerra: cria (ou entra na) batalha pela regiao e abre a tela dela.
async function declareWar() {
  if (!selected.value) return;
  warErr.value = '';
  warBusy.value = true;
  try {
    const { data } = await api.post('/battles', { regionId: selected.value.id });
    router.push(`/battles/${data.id}`);
  } catch (e) {
    warErr.value = apiError(e);
  } finally {
    warBusy.value = false;
  }
}

function isSelected(r: any) {
  return selected.value && selected.value.id === r.id;
}
function isHovered(r: any) {
  return hovered.value && hovered.value.id === r.id;
}

// Centro de uma regiao, para posicionar o rotulo.
function centroid(r: any) {
  const n = r.cells.length;
  const sx = r.cells.reduce((s: number, c: any) => s + c.x, 0);
  const sy = r.cells.reduce((s: number, c: any) => s + c.y, 0);
  return { x: sx / n + 0.5, y: sy / n + 0.5 };
}

const viewBox = computed(() => `0 0 ${grid.value.cols} ${grid.value.rows}`);
</script>

<template>
  <div class="map-page">
    <h1>Mapa-Múndi</h1>
    <p class="muted" style="margin-bottom:12px">
      {{ totalRegions }} regiões em 6 continentes. Cada país começa com apenas
      1 região — a sua <strong>capital</strong> (marcada com ★). Todo o resto
      do mundo é neutro: conquistar territórios é o que move as guerras.
    </p>

    <div v-if="err" class="toast err">{{ err }}</div>

    <div class="panel mode-bar">
      <button
        :class="mode === 'political' ? '' : 'btn-ghost'"
        @click="mode = 'political'"
      >🗺️ Político</button>
      <button
        :class="mode === 'resource' ? '' : 'btn-ghost'"
        @click="mode = 'resource'"
      >⛏️ Recursos</button>
      <span class="muted" style="margin-left:auto">
        Passe o mouse: <strong>{{ hovered ? hovered.name : '—' }}</strong>
      </span>
    </div>

    <div class="map-layout">
      <!-- Mapa SVG -->
      <div class="panel" style="padding:8px">
        <svg :viewBox="viewBox" class="world-svg">
          <rect
            :width="grid.cols"
            :height="grid.rows"
            :fill="OCEAN_COLOR"
          />
          <g v-for="r in regions" :key="r.id" @click="select(r)"
             @mouseenter="hovered = r" @mouseleave="hovered = null">
            <rect
              v-for="(c, ci) in r.cells"
              :key="ci"
              :x="c.x"
              :y="c.y"
              width="1.02"
              height="1.02"
              :fill="regionFill(r)"
              :fill-opacity="isHovered(r) ? 1 : 0.92"
              stroke="rgba(0,0,0,0.35)"
              :stroke-width="0.05"
            />
          </g>
          <!-- Contorno da regiao selecionada -->
          <g v-if="selected">
            <rect
              v-for="(c, ci) in selected.cells"
              :key="'sel' + ci"
              :x="c.x"
              :y="c.y"
              width="1.02"
              height="1.02"
              fill="none"
              stroke="#ffffff"
              stroke-width="0.14"
            />
          </g>
          <!-- Marcador de capital -->
          <text
            v-for="r in regions.filter((x) => x.isCapital)"
            :key="'cap' + r.id"
            :x="centroid(r).x"
            :y="centroid(r).y + 0.45"
            text-anchor="middle"
            font-size="1.7"
            fill="#ffd24a"
            stroke="#000"
            stroke-width="0.08"
            paint-order="stroke"
            style="pointer-events:none"
          >★</text>

          <!-- Rotulo da regiao em foco -->
          <text
            v-if="hovered"
            :x="centroid(hovered).x"
            :y="centroid(hovered).y"
            text-anchor="middle"
            font-size="0.9"
            fill="#fff"
            stroke="#000"
            stroke-width="0.06"
            paint-order="stroke"
          >{{ hovered.name }}</text>
        </svg>
      </div>

      <!-- Painel lateral -->
      <div>
        <div class="panel" v-if="selected">
          <h2>
            {{ selected.name }}
            <span v-if="selected.isCapital" class="capital-badge">★ Capital</span>
          </h2>
          <p class="muted">{{ selected.continentName }}</p>

          <div class="owner-line">
            <span
              class="swatch"
              :style="{ background: selected.owner ? selected.owner.color : NEUTRAL_COLOR }"
            ></span>
            <span v-if="selected.owner">
              Controlado por <strong>{{ selected.owner.name }}</strong>
            </span>
            <span v-else>Território Neutro</span>
          </div>

          <div
            class="resource-box"
            :style="{ borderColor: selected.resource.color }"
          >
            <div style="font-size:2rem">{{ selected.resource.icon }}</div>
            <div>
              <div
                style="font-weight:700"
                :style="{ color: selected.resource.color }"
              >{{ selected.resource.label }}</div>
              <span
                class="region-tier"
                :class="selected.resource.tier === 'RARO' ? 'tier-rare' : 'tier-common'"
              >{{ selected.resource.tier }}</span>
            </div>
          </div>
          <p class="muted" style="margin-top:10px">
            {{ selected.resource.effect }}
          </p>
          <p class="muted" style="margin-top:6px">
            Tamanho do território: {{ selected.cells.length }} células.
          </p>

          <!-- Conquista -->
          <div v-if="warErr" class="toast err" style="margin-top:12px">{{ warErr }}</div>

          <div
            v-if="selected.isCapital && selected.owner?.id !== myCountryId"
            class="war-box"
          >
            <strong>★ Capital</strong> &mdash; capitais não podem ser conquistadas.
          </div>

          <div
            v-else-if="selected.owner && selected.owner.id === myCountryId"
            class="war-box"
          >
            Este território já é do seu país.
          </div>

          <div v-else-if="preview" class="war-box">
            <h3 style="margin-bottom:8px">⚔️ Expandir para esta região</h3>
            <p class="muted" v-if="preview.gap === 0">
              Faz fronteira com seu território — ataque em <strong>força total</strong>.
            </p>
            <p class="muted" v-else>
              A {{ preview.gap }} célula(s) da sua fronteira. Projeção de poder
              reduz o dano do atacante em
              <strong style="color:var(--red)">−{{ preview.penaltyPercent }}%</strong>.
            </p>
            <div class="bar" style="margin:8px 0">
              <div :style="{ width: (100 - preview.penaltyPercent) + '%', background: 'var(--green)' }"></div>
            </div>
            <p class="muted" style="margin-bottom:10px">
              Defensor:
              <strong v-if="preview.defenderCountry" :style="{ color: preview.defenderCountry.color }">
                {{ preview.defenderCountry.name }}
              </strong>
              <strong v-else>Território Neutro</strong>
            </p>
            <button
              v-if="preview.canAttack"
              class="btn-red"
              :disabled="warBusy"
              style="width:100%"
              @click="declareWar"
            >
              {{ preview.existingBattleId ? 'Entrar na batalha em andamento' : 'Declarar guerra' }}
            </button>
            <p v-else class="muted">{{ preview.blocker }}</p>
          </div>
        </div>
        <div class="panel" v-else>
          <h2>Região</h2>
          <p class="muted">Clique numa região do mapa para ver os detalhes.</p>
        </div>

        <!-- Legenda politica -->
        <div class="panel" v-if="mode === 'political'">
          <h3>Controle territorial</h3>
          <table>
            <tbody>
              <tr v-for="c in countries" :key="c.id">
                <td><span class="swatch" :style="{ background: c.color }"></span></td>
                <td>{{ c.name }}</td>
                <td style="text-align:right;font-weight:700">{{ c.regionCount }}</td>
              </tr>
              <tr>
                <td><span class="swatch" :style="{ background: NEUTRAL_COLOR }"></span></td>
                <td class="muted">Neutro</td>
                <td style="text-align:right;font-weight:700">{{ neutralCount }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Legenda de recursos -->
        <div class="panel" v-else>
          <h3>Escassez de recursos</h3>
          <table>
            <tbody>
              <tr v-for="s in scarcity" :key="s.resource">
                <td>{{ s.icon }}</td>
                <td>
                  <span class="swatch" :style="{ background: s.color }"></span>
                  {{ s.label }}
                </td>
                <td>
                  <span
                    class="region-tier"
                    :class="s.tier === 'RARO' ? 'tier-rare' : 'tier-common'"
                  >{{ s.tier }}</span>
                </td>
                <td style="text-align:right;font-weight:700">{{ s.regionCount }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.map-page {
  max-width: 1700px;
  margin: 0 auto;
  padding: 20px;
}
.mode-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.map-layout {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 16px;
  align-items: start;
}
.world-svg {
  width: 100%;
  display: block;
  border-radius: 6px;
  min-height: 60vh;
}
.world-svg g { cursor: pointer; }
.region-tier {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
}
.tier-rare { background: rgba(241, 196, 15, 0.18); color: #f1c40f; }
.tier-common { background: rgba(127, 140, 141, 0.2); color: #aab4b8; }
.swatch {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 3px;
  vertical-align: middle;
  border: 1px solid rgba(255, 255, 255, 0.2);
}
.owner-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px 0;
}
.capital-badge {
  font-size: 0.7rem;
  font-weight: 700;
  color: #ffd24a;
  background: rgba(255, 210, 74, 0.15);
  border: 1px solid #ffd24a;
  border-radius: 4px;
  padding: 2px 8px;
  vertical-align: middle;
}
.resource-box {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--panel-2);
  border: 2px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  margin-top: 10px;
}
.war-box {
  margin-top: 12px;
  padding: 12px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 8px;
}
@media (max-width: 760px) {
  .map-layout { grid-template-columns: 1fr; }
}
</style>
