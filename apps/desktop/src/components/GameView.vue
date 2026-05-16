<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Flag from "./Flag.vue";
import { GRID, CONTINENT_NAMES, hemisphereOf } from "../game/map-generator";
import { NATIONS, type Nation, flagSeed } from "../game/nations";
import { ALIGNMENTS, ALIGNMENT_LIST } from "../game/alignments";
import { ResourceType } from "../game/enums";
import { resourceInfo, resourceBoost } from "../game/resources";
import { FACTION_STATS, TERRITORY_STATS, type FactionState } from "../game/economy";
import {
  climateInfo,
  seasonForMonth,
  SEASONS,
  ClimateZone,
  Season,
} from "../game/climate";
import { formatTurnDate, turnDate } from "../game/turns";
import {
  loadMap,
  loadFactions,
  advanceTurn,
  regenerateMap,
  getSave,
  takeTerritory,
  type Province,
  type GameSave,
} from "../game/world";
import { renameSave } from "../game/saves";
import {
  SQUAD_COST,
  SQUAD_MANPOWER_COST,
  ATTACKS_PER_TURN,
  TROOP_TYPES,
  squadForce,
  squadUpkeepAt,
  squadName,
  maxTroops,
  levelProgress,
  isSquadReady,
  canSquadMove,
  canSquadAttack,
  attacksLeft,
  loadSquads,
  createSquad,
  deleteSquad,
  moveSquad,
  renameSquad,
  loadRecruitOrders,
  queueRecruit,
  cancelRecruit,
  deleteTroop,
  moveTroop,
  loadCityTroops,
  moveCityTroopsToSquad,
  type Squad,
  type RecruitOrder,
  type CityTroop,
  type TroopKind,
} from "../game/squads";
import {
  battleModifiers,
  moralForceDelta,
  defenderTroopCount,
  executeBattle,
  loadBattleLogs,
  CAPITAL_BONUS_RANGE,
  type BattleEnv,
  type BattleReport,
  type BattleLog,
} from "../game/battle";
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
const turn = ref(1);
const advancing = ref(false);
const loading = ref(true);
const err = ref("");
const busy = ref(false);

// ===== Esquadrões =====
const squads = ref<Squad[]>([]);
/** Esquadrão em modo de movimento (aguardando o clique no tile destino). */
const moveMode = ref<Squad | null>(null);
const busySquad = ref(false);

// ===== Recrutamento =====
/** Ordens de recrutamento (fila de produção das cidades). */
const recruitOrders = ref<RecruitOrder[]>([]);
/** `true` quando o painel da província mostra o recrutamento, não a info. */
const recruitOpen = ref(false);

// ===== Cidade (inventário de tropas) =====
/** Tropas guardadas no inventário das cidades. */
const cityTroops = ref<CityTroop[]>([]);
/** `true` enquanto o painel "Ver cidade" (direita) está aberto. */
const cityPanelOpen = ref(false);
/** Aba ativa do painel da cidade. */
const cityTab = ref<"inventory">("inventory");
/** Ids das tropas do inventário marcadas para mover. */
const pickedCityTroops = ref<number[]>([]);
/** Tropas aguardando a escolha de esquadrão ("Qual esquadrão?"). */
const askSquadFor = ref<number[] | null>(null);

// ===== Combate =====
/** Esquadrão escolhido como atacante no tile selecionado. */
const attackerId = ref<number | null>(null);
/** `true` enquanto o diálogo de tomar território está aberto. */
const showTake = ref(false);
/** Relatório da última batalha — exibido no modal de batalha. */
const battleModal = ref<BattleReport | null>(null);
/** `true` enquanto os dados estão "girando" na animação da batalha. */
const diceRolling = ref(false);
/** Faces aleatórias dos dados durante a animação. */
const rollingFaces = ref([1, 1, 1, 1]);
/** Histórico de batalhas da partida. */
const battleLogs = ref<BattleLog[]>([]);

// ===== Painel do exército =====
/** `true` enquanto o modal do exército (esquadrões / batalhas) está aberto. */
const showArmy = ref(false);
/** Aba ativa do modal do exército. */
const armyTab = ref<"squads" | "battles">("squads");
/** Tropa selecionada para ser movida entre esquadrões. */
const moveTroopId = ref<number | null>(null);

const mode = ref<"political" | "resource" | "climate">("political");
const selected = ref<Province | null>(null);
const hovered = ref<Province | null>(null);

/** Painel lateral aberto no momento (null = nenhum, mapa livre). */
type PanelId = "nations" | "alignments";
const activePanel = ref<PanelId | null>(null);
function togglePanel(p: PanelId) {
  activePanel.value = activePanel.value === p ? null : p;
  if (activePanel.value) cityPanelOpen.value = false;
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

/** Data do turno atual (turno 1 = 01/01/1980; +1 semana por turno). */
const currentDate = computed(() => formatTurnDate(turn.value));

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

/** Dois tiles são vizinhos se distam 1 célula (8 direções). */
function isAdjacent(
  a: { x: number; y: number },
  b: { x: number; y: number },
): boolean {
  return (
    Math.abs(a.x - b.x) <= 1 &&
    Math.abs(a.y - b.y) <= 1 &&
    !(a.x === b.x && a.y === b.y)
  );
}

// Clique numa província (ignora se foi um arraste do mapa).
function onProvinceClick(p: Province) {
  if (panMoved.value) return;
  // Em modo de movimento: clicar num tile vizinho move o esquadrão para lá.
  if (moveMode.value) {
    const sq = moveMode.value;
    if (moveTargets.value.some((t) => t.id === p.id)) {
      void doMove(sq, p);
      return;
    }
    moveMode.value = null;
  }
  recruitOpen.value = false;
  showTake.value = false;
  cityPanelOpen.value = false;
  selected.value = p;
}
function onOceanClick() {
  if (panMoved.value) return;
  moveMode.value = null;
  recruitOpen.value = false;
  showTake.value = false;
  cityPanelOpen.value = false;
  selected.value = null;
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
    turn.value = save.turn;
    provinces.value = await loadMap(props.saveId);
    factions.value = await loadFactions(props.saveId);
    squads.value = await loadSquads(props.saveId);
    recruitOrders.value = await loadRecruitOrders(props.saveId);
    cityTroops.value = await loadCityTroops(props.saveId);
    battleLogs.value = await loadBattleLogs(props.saveId);
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
  moveMode.value = null;
  recruitOpen.value = false;
  showTake.value = false;
  showArmy.value = false;
  cityPanelOpen.value = false;
  battleModal.value = null;
  moveTroopId.value = null;
  try {
    provinces.value = await regenerateMap(props.saveId);
    squads.value = await loadSquads(props.saveId);
    recruitOrders.value = await loadRecruitOrders(props.saveId);
    cityTroops.value = await loadCityTroops(props.saveId);
    battleLogs.value = await loadBattleLogs(props.saveId);
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

/** Avança um turno: cada facção ganha a produção das suas províncias. */
async function nextTurn() {
  advancing.value = true;
  err.value = "";
  try {
    const res = await advanceTurn(props.saveId);
    turn.value = res.turn;
    factions.value = res.factions;
    squads.value = await loadSquads(props.saveId);
    recruitOrders.value = await loadRecruitOrders(props.saveId);
    cityTroops.value = await loadCityTroops(props.saveId);
    flashToast(`Turno ${res.turn} — ${formatTurnDate(res.turn)}`);
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  } finally {
    advancing.value = false;
  }
}

// ===== Ações dos esquadrões =====

/** Esquadrões posicionados na província selecionada. */
const squadsOnSelected = computed<Squad[]>(() =>
  selected.value
    ? squads.value.filter(
        (s) => s.x === selected.value!.x && s.y === selected.value!.y,
      )
    : [],
);

/** Esquadrões agrupados por tile — um marcador por célula no mapa. */
const squadTiles = computed(() => {
  const m = new Map<string, { x: number; y: number; squads: Squad[] }>();
  for (const s of squads.value) {
    const k = `${s.x},${s.y}`;
    let t = m.get(k);
    if (!t) {
      t = { x: s.x, y: s.y, squads: [] };
      m.set(k, t);
    }
    t.squads.push(s);
  }
  return [...m.values()];
});

/** Cor do marcador de um tile: a da nação dona, ou cinza se houver mistura. */
function squadTileColor(t: { squads: Squad[] }): string {
  const owners = new Set(t.squads.map((s) => s.ownerCode));
  return owners.size === 1
    ? nationOf(t.squads[0].ownerCode)?.color ?? "#dfe3ea"
    : "#dfe3ea";
}

/** Tiles ocupados por esquadrões de outras facções — bloqueiam o movimento. */
const blockedTiles = computed(() => {
  const set = new Set<string>();
  for (const s of squads.value) {
    if (s.ownerCode !== game.value?.playerCode) set.add(`${s.x},${s.y}`);
  }
  return set;
});

/**
 * Tiles vizinhos válidos para onde o esquadrão em movimento pode ir: não se
 * entra em território de outra facção nem em tiles ocupados por esquadrões de
 * outras facções (regra de movimento — ver `GAME_DESIGN.md`).
 */
const moveTargets = computed<Province[]>(() => {
  const m = moveMode.value;
  if (!m) return [];
  const code = game.value?.playerCode;
  return provinces.value.filter(
    (p) =>
      isAdjacent(p, m) &&
      (p.ownerCode == null || p.ownerCode === code) &&
      !blockedTiles.value.has(`${p.x},${p.y}`),
  );
});

/** Monta um esquadrão na província selecionada (custa `SQUAD_COST`). */
async function createSquadHere() {
  const p = selected.value;
  if (!p || !p.ownerCode || p.ownerCode !== game.value?.playerCode) return;
  busySquad.value = true;
  err.value = "";
  try {
    await createSquad(props.saveId, p.ownerCode, p.x, p.y, turn.value);
    squads.value = await loadSquads(props.saveId);
    factions.value = await loadFactions(props.saveId);
    flashToast("Esquadrão montado — fica pronto no próximo turno.");
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  } finally {
    busySquad.value = false;
  }
}

/** Exclui um esquadrão do jogador (reembolsa a fila de recrutamento dele). */
async function removeSquad(s: Squad) {
  busySquad.value = true;
  err.value = "";
  try {
    await deleteSquad(s.id);
    if (moveMode.value?.id === s.id) moveMode.value = null;
    squads.value = await loadSquads(props.saveId);
    recruitOrders.value = await loadRecruitOrders(props.saveId);
    factions.value = await loadFactions(props.saveId);
    flashToast("Esquadrão excluído.");
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  } finally {
    busySquad.value = false;
  }
}

/** Entra no modo de movimento: o próximo clique escolhe o tile destino. */
function startMove(s: Squad) {
  moveMode.value = moveMode.value?.id === s.id ? null : s;
}

/** Move um esquadrão para um tile vizinho, gastando o turno dele. */
async function doMove(s: Squad, dest: Province) {
  busySquad.value = true;
  err.value = "";
  try {
    await moveSquad(s.id, dest.x, dest.y, turn.value);
    squads.value = await loadSquads(props.saveId);
    selected.value = dest;
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  } finally {
    busySquad.value = false;
    moveMode.value = null;
  }
}

// ===== Recrutamento de tropas =====

/** Mapa de células → província, para consultar o terreno de um esquadrão. */
const provinceByTile = computed(
  () => new Map(provinces.value.map((p) => [`${p.x},${p.y}`, p])),
);

/** `true` se o esquadrão está sobre um tile gelado (move-se a cada 2 turnos). */
function isSquadOnGlacial(s: Squad): boolean {
  return (
    provinceByTile.value.get(`${s.x},${s.y}`)?.climate === ClimateZone.GELADO
  );
}

/** `true` se o esquadrão está num tile da própria facção (manutenção pela metade). */
function isSquadOnOwnTile(s: Squad): boolean {
  return (
    provinceByTile.value.get(`${s.x},${s.y}`)?.ownerCode === s.ownerCode
  );
}

/** Esquadrões do jogador na província selecionada. */
const playerSquadsHere = computed<Squad[]>(() =>
  squadsOnSelected.value.filter((s) => s.ownerCode === game.value?.playerCode),
);

/** `true` se dá para recrutar na província selecionada (uma cidade sua). */
const canRecruitHere = computed(
  () =>
    !!selected.value &&
    selected.value.ownerCode === game.value?.playerCode,
);

/** Ordens de recrutamento na fila da província selecionada. */
const recruitOrdersHere = computed<RecruitOrder[]>(() =>
  selected.value
    ? recruitOrders.value.filter(
        (o) => o.x === selected.value!.x && o.y === selected.value!.y,
      )
    : [],
);

/** Turnos restantes para concluir uma ordem na cidade selecionada. */
function recruitEta(o: RecruitOrder): number {
  const prod = selected.value?.production ?? 0;
  if (prod <= 0) return Infinity;
  return Math.ceil((o.prodCost - o.prodDone) / prod);
}

/** Turnos para produzir uma tropa nova, do zero, nesta cidade. */
function troopBuildTurns(kind: TroopKind): number {
  const prod = selected.value?.production ?? 0;
  if (prod <= 0) return Infinity;
  return Math.ceil(TROOP_TYPES[kind].productionCost / prod);
}

/** Abre o painel de recrutamento da cidade selecionada. */
function openRecruit() {
  if (!canRecruitHere.value) return;
  recruitOpen.value = true;
}

/** Enfileira o recrutamento de uma tropa para o inventário da cidade. */
async function doRecruit(kind: TroopKind) {
  const p = selected.value;
  if (!p || !p.ownerCode) return;
  busySquad.value = true;
  err.value = "";
  try {
    await queueRecruit(props.saveId, p.ownerCode, p.x, p.y, kind);
    recruitOrders.value = await loadRecruitOrders(props.saveId);
    factions.value = await loadFactions(props.saveId);
    flashToast(`${TROOP_TYPES[kind].label} adicionada à fila.`);
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  } finally {
    busySquad.value = false;
  }
}

/** Cancela uma ordem de recrutamento e devolve os recursos pagos. */
async function doCancelRecruit(orderId: number) {
  busySquad.value = true;
  err.value = "";
  try {
    await cancelRecruit(orderId);
    recruitOrders.value = await loadRecruitOrders(props.saveId);
    factions.value = await loadFactions(props.saveId);
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  } finally {
    busySquad.value = false;
  }
}

// ===== Cidade / inventário de tropas =====

/** Tropas no inventário da cidade selecionada. */
const cityTroopsHere = computed<CityTroop[]>(() =>
  selected.value
    ? cityTroops.value.filter(
        (t) => t.x === selected.value!.x && t.y === selected.value!.y,
      )
    : [],
);

/** Abre o painel "Ver cidade" da província selecionada. */
function openCity() {
  if (!selected.value || selected.value.ownerCode !== game.value?.playerCode) {
    return;
  }
  pickedCityTroops.value = [];
  askSquadFor.value = null;
  cityTab.value = "inventory";
  activePanel.value = null;
  cityPanelOpen.value = true;
}

/**
 * Move tropas do inventário para um esquadrão: com 1 esquadrão na cidade vai
 * direto; com vários, pergunta qual; sem nenhum, não faz nada.
 */
function sendTroopsToSquad(troopIds: number[]) {
  if (troopIds.length === 0) return;
  const here = playerSquadsHere.value;
  if (here.length === 0) return;
  if (here.length === 1) void doSendTroops(troopIds, here[0].id);
  else askSquadFor.value = [...troopIds];
}

/** Conclui o envio de tropas para o esquadrão escolhido. */
async function doSendTroops(troopIds: number[], squadId: number) {
  busySquad.value = true;
  err.value = "";
  try {
    await moveCityTroopsToSquad(troopIds, squadId);
    cityTroops.value = await loadCityTroops(props.saveId);
    squads.value = await loadSquads(props.saveId);
    pickedCityTroops.value = pickedCityTroops.value.filter(
      (id) => !troopIds.includes(id),
    );
    askSquadFor.value = null;
    flashToast("Tropas movidas para o esquadrão.");
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  } finally {
    busySquad.value = false;
  }
}

// ===== Combate =====

/** Esquadrões inimigos (não do jogador) na província selecionada. */
const enemySquadsHere = computed<Squad[]>(() =>
  squadsOnSelected.value.filter((s) => s.ownerCode !== game.value?.playerCode),
);

/** `true` se o tile não é da sua facção e você tem um esquadrão nele. */
const isContestedTile = computed(
  () =>
    !!selected.value &&
    selected.value.ownerCode !== game.value?.playerCode &&
    playerSquadsHere.value.length > 0,
);

/** Esquadrão atacante (o escolhido, ou o 1º do jogador no tile). */
const attackerSquad = computed<Squad | null>(() => {
  const list = playerSquadsHere.value;
  return list.find((s) => s.id === attackerId.value) ?? list[0] ?? null;
});

/** Distância de Chebyshev (8 direções) entre duas células. */
function chebyshev(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** Capital de uma facção (para o bônus de proximidade na batalha). */
function capitalOf(code: string | null): Province | undefined {
  if (!code) return undefined;
  return provinces.value.find((p) => p.isCapital && p.ownerCode === code);
}

/** Monta o ambiente de batalha do tile selecionado para uma facção. */
function battleEnvFor(code: string | null): BattleEnv {
  const p = selected.value;
  const cap = capitalOf(code);
  return {
    climate: p?.climate ?? ClimateZone.AMENO,
    season: p
      ? seasonForMonth(currentMonth.value, hemisphereOf(p.y))
      : Season.PRIMAVERA,
    nearCapital: !!p && !!cap && chebyshev(p, cap) <= CAPITAL_BONUS_RANGE,
  };
}

/** Ambiente de batalha para o atacante (a facção do jogador). */
const attackerEnv = computed(() =>
  battleEnvFor(game.value?.playerCode ?? null),
);

/** Modificadores de ambiente do atacante (mostrados no painel de Combate). */
const battleMods = computed(() => battleModifiers(attackerEnv.value));

/** Variação de força pela moral do esquadrão atacante (em %). */
const attackerMoralPct = computed(() =>
  attackerSquad.value
    ? Math.round(moralForceDelta(attackerSquad.value.moral) * 100)
    : 0,
);

/** `true` se o território neutro selecionado já pode ser tomado. */
const canTakeTerritory = computed(
  () =>
    !!selected.value &&
    !selected.value.ownerCode &&
    selected.value.defenderHp === 0 &&
    playerSquadsHere.value.length > 0,
);

/** Recarrega províncias, esquadrões e logs após uma ação de combate. */
async function reloadBattleState() {
  provinces.value = await loadMap(props.saveId);
  squads.value = await loadSquads(props.saveId);
  battleLogs.value = await loadBattleLogs(props.saveId);
  if (selected.value) {
    selected.value =
      provinces.value.find((p) => p.id === selected.value!.id) ?? null;
  }
}

let diceTimer: ReturnType<typeof setInterval> | undefined;

/** Anima os dados por ~1,1s antes de revelar o resultado da batalha. */
function rollDiceAnimation() {
  diceRolling.value = true;
  clearInterval(diceTimer);
  diceTimer = setInterval(() => {
    rollingFaces.value = rollingFaces.value.map(
      () => 1 + Math.floor(Math.random() * 6),
    );
  }, 70);
  setTimeout(() => {
    clearInterval(diceTimer);
    diceRolling.value = false;
  }, 1100);
}

/** Resolve uma batalha do esquadrão atacante contra um defensor. */
async function runBattle(
  defender: { kind: "squad"; squad: Squad } | { kind: "territory" },
) {
  const p = selected.value;
  const atk = attackerSquad.value;
  if (!p || !atk || !canSquadAttack(atk, turn.value)) return;
  busySquad.value = true;
  err.value = "";
  try {
    const defCode =
      defender.kind === "squad" ? defender.squad.ownerCode : null;
    const report = await executeBattle({
      saveId: props.saveId,
      turn: turn.value,
      province: p,
      attacker: atk,
      attackerEnv: attackerEnv.value,
      defenderEnv: battleEnvFor(defCode),
      defender,
    });
    await reloadBattleState();
    battleModal.value = report;
    rollDiceAnimation();
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  } finally {
    busySquad.value = false;
  }
}

/** Ataca as tropas de defesa do território neutro selecionado. */
function doAttackTerritory() {
  void runBattle({ kind: "territory" });
}

/** Ataca um esquadrão inimigo no tile selecionado. */
function doAttackSquad(enemy: Squad) {
  void runBattle({ kind: "squad", squad: enemy });
}

/** Fecha o modal de batalha. */
function closeBattleModal() {
  clearInterval(diceTimer);
  diceRolling.value = false;
  battleModal.value = null;
}

/** Toma o território neutro selecionado — ocupando ou devastando. */
async function doTakeTerritory(devastate: boolean) {
  const p = selected.value;
  if (!p || !game.value?.playerCode) return;
  busySquad.value = true;
  err.value = "";
  try {
    await takeTerritory(p.id, game.value.playerCode, devastate);
    provinces.value = await loadMap(props.saveId);
    selected.value = provinces.value.find((q) => q.id === p.id) ?? null;
    showTake.value = false;
    flashToast(
      devastate ? "Território devastado e tomado." : "Território ocupado.",
    );
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  } finally {
    busySquad.value = false;
  }
}

// ===== Painel do exército =====

/** Todos os esquadrões do jogador. */
const playerSquads = computed<Squad[]>(() =>
  squads.value.filter((s) => s.ownerCode === game.value?.playerCode),
);

/** Abre o modal do exército. */
function openArmy() {
  moveTroopId.value = null;
  armyTab.value = "squads";
  showArmy.value = true;
}

/** Esquadrão de origem da tropa que está sendo movida. */
const moveTroopSource = computed<Squad | null>(() => {
  if (moveTroopId.value == null) return null;
  return (
    playerSquads.value.find((s) =>
      s.troops.some((t) => t.id === moveTroopId.value),
    ) ?? null
  );
});

/** `true` se um esquadrão pode receber a tropa em movimento (mesmo tile). */
function canReceiveTroop(s: Squad): boolean {
  const src = moveTroopSource.value;
  return (
    !!src &&
    s.id !== src.id &&
    s.x === src.x &&
    s.y === src.y &&
    s.troops.length < maxTroops(s.commander.stars)
  );
}

/** Exclui uma tropa de um esquadrão. */
async function doDeleteTroop(troopId: number) {
  busySquad.value = true;
  err.value = "";
  try {
    await deleteTroop(troopId);
    if (moveTroopId.value === troopId) moveTroopId.value = null;
    squads.value = await loadSquads(props.saveId);
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  } finally {
    busySquad.value = false;
  }
}

/** Move a tropa selecionada para um esquadrão de destino. */
async function doMoveTroop(targetSquadId: number) {
  if (moveTroopId.value == null) return;
  busySquad.value = true;
  err.value = "";
  try {
    await moveTroop(moveTroopId.value, targetSquadId);
    moveTroopId.value = null;
    squads.value = await loadSquads(props.saveId);
    flashToast("Tropa transferida.");
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  } finally {
    busySquad.value = false;
  }
}

/** Texto de level e progresso de XP de uma unidade. */
function levelLabel(xp: number): string {
  const p = levelProgress(xp);
  return p.needed > 0
    ? `Nv. ${p.level} · ${p.current}/${p.needed} XP`
    : `Nv. ${p.level} (máx.)`;
}

/** Renomeia um esquadrão a partir do input do modal do exército. */
async function doRenameSquad(squadId: number, ev: Event) {
  const name = (ev.target as HTMLInputElement).value;
  busySquad.value = true;
  err.value = "";
  try {
    await renameSquad(squadId, name);
    squads.value = await loadSquads(props.saveId);
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  } finally {
    busySquad.value = false;
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

// Províncias que exibem o ícone do recurso: só no modo Recursos. No modo
// Político o mapa fica limpo. Capitais nunca mostram (já têm a estrela ★).
const iconProvinces = computed(() =>
  mode.value === "resource"
    ? provinces.value.filter((p) => !p.isCapital)
    : [],
);

// Zonas sísmicas e vulcões aparecem no mapa só no modo Clima.
const seismicProvinces = computed(() =>
  mode.value === "climate" ? provinces.value.filter((p) => p.seismic) : [],
);
const volcanoProvinces = computed(() =>
  mode.value === "climate" ? provinces.value.filter((p) => p.volcano) : [],
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

// ===== Clima e estações =====
/** Mês (0–11) do turno atual — base para calcular as estações. */
const currentMonth = computed(() => turnDate(turn.value).getUTCMonth());
const seasonNorth = computed(() => SEASONS[seasonForMonth(currentMonth.value, "N")]);
const seasonSouth = computed(() => SEASONS[seasonForMonth(currentMonth.value, "S")]);

const selectedClimate = computed(() =>
  selected.value ? climateInfo(selected.value.climate) : null,
);
const selectedHemisphere = computed(() =>
  selected.value ? hemisphereOf(selected.value.y) : null,
);
const selectedSeason = computed(() =>
  selectedHemisphere.value
    ? SEASONS[seasonForMonth(currentMonth.value, selectedHemisphere.value)]
    : null,
);

// Multiplicador de produção do recurso local (clima / continente).
const selectedBoost = computed(() =>
  selected.value
    ? resourceBoost(
        selected.value.resource,
        selected.value.climate,
        selected.value.continent,
      )
    : 1,
);
const boostReason = computed(() => {
  const p = selected.value;
  if (!p) return "";
  return p.resource === ResourceType.NIOBIO
    ? "América do Sul"
    : "clima " + climateInfo(p.climate).label.toLowerCase();
});

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
  if (mode.value === "climate") return climateInfo(p.climate).color;
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
      <!-- Zonas sísmicas (anel de fogo) — só no modo Clima -->
      <rect
        v-for="p in seismicProvinces"
        :key="'sz' + p.id"
        :x="p.x"
        :y="p.y"
        width="1.02"
        height="1.02"
        fill="none"
        stroke="#ff7a33"
        stroke-width="0.1"
        stroke-dasharray="0.2 0.14"
        style="pointer-events: none"
      />
      <!-- Vulcões — só no modo Clima -->
      <text
        v-for="p in volcanoProvinces"
        :key="'vc' + p.id"
        :x="p.x + 0.5"
        :y="p.y + 0.5"
        text-anchor="middle"
        dominant-baseline="central"
        font-size="0.8"
        style="pointer-events: none"
      >
        🌋
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
      <!-- Destinos válidos do esquadrão em movimento -->
      <rect
        v-for="p in moveTargets"
        :key="'mt' + p.id"
        :x="p.x"
        :y="p.y"
        width="1.02"
        height="1.02"
        fill="rgba(95,200,120,0.26)"
        stroke="#5fd07a"
        stroke-width="0.12"
        style="pointer-events: none"
      />
      <!-- Marcadores dos esquadrões -->
      <g
        v-for="t in squadTiles"
        :key="'sq' + t.x + '-' + t.y"
        style="pointer-events: none"
      >
        <circle
          :cx="t.x + 0.5"
          :cy="t.y + 0.33"
          r="0.33"
          :fill="squadTileColor(t)"
          stroke="#0c0f16"
          stroke-width="0.07"
        />
        <text
          :x="t.x + 0.5"
          :y="t.y + 0.35"
          text-anchor="middle"
          dominant-baseline="central"
          font-size="0.4"
        >
          ⚔️
        </text>
        <text
          v-if="t.squads.length > 1"
          :x="t.x + 0.84"
          :y="t.y + 0.11"
          text-anchor="middle"
          dominant-baseline="central"
          font-size="0.36"
          fill="#fff"
          stroke="#000"
          stroke-width="0.08"
          paint-order="stroke"
        >
          {{ t.squads.length }}
        </text>
      </g>
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
          <button
            :class="{ on: mode === 'climate' }"
            @click="mode = 'climate'"
          >
            🌦️ Clima
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

      <!-- Aviso do modo de movimento de esquadrão -->
      <Transition name="rise">
        <div v-if="moveMode" class="move-banner">
          <span>
            ➤ Movendo o Esquadrão #{{ moveMode.id }} — clique num tile vizinho
            destacado
          </span>
          <button @click="moveMode = null">Cancelar</button>
        </div>
      </Transition>

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
        <button
          class="side-btn"
          :class="{ on: showArmy }"
          title="Exército"
          @click="openArmy"
        >
          🪖
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

      <!-- Caixa de turno (canto inferior direito) -->
      <div class="turn-box">
        <div class="turn-info">
          <span class="turn-num">Turno {{ turn }}</span>
          <span class="turn-date">{{ currentDate }}</span>
          <span class="turn-seasons">
            <span class="hemi">N {{ seasonNorth.icon }} {{ seasonNorth.label }}</span>
            <span class="dimsep">·</span>
            <span class="hemi">S {{ seasonSouth.icon }} {{ seasonSouth.label }}</span>
          </span>
        </div>
        <button class="turn-btn" :disabled="advancing" @click="nextTurn">
          {{ advancing ? "Processando..." : "Próximo turno ▶" }}
        </button>
      </div>

      <!-- Painel da província (contextual, ao clicar) -->
      <Transition name="rise">
        <section v-if="selected" class="card province">
          <!-- ===== Vista: informações do território ===== -->
          <template v-if="!recruitOpen">
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
              <div class="rtags">
                <span
                  class="tier"
                  :class="selectedResource.tier === 'RARO' ? 'rare' : 'common'"
                >
                  {{ selectedResource.tier }}
                </span>
                <span
                  v-if="selectedBoost !== 1"
                  class="boost"
                  :class="selectedBoost > 1 ? 'up' : 'down'"
                  title="Multiplicador da produção do recurso local"
                >
                  ×{{ selectedBoost.toLocaleString("pt-BR") }} ·
                  {{ boostReason }}
                </span>
              </div>
            </div>
          </div>
          <p v-if="selectedResource" class="effect">
            {{ selectedResource.effect }}
          </p>

          <div
            v-if="selectedClimate"
            class="climate"
            :style="{ '--cl': selectedClimate.color }"
          >
            <span class="cicon">{{ selectedClimate.icon }}</span>
            <div class="cinfo">
              <div class="cname">{{ selectedClimate.label }}</div>
              <span class="csub">
                {{
                  selectedHemisphere === "N"
                    ? "Hemisfério Norte"
                    : "Hemisfério Sul"
                }}
                <span class="dimsep">·</span>
                {{ selectedSeason?.icon }} {{ selectedSeason?.label }}
              </span>
            </div>
          </div>
          <p v-if="selectedClimate" class="effect">
            {{ selectedClimate.description }}
          </p>
          <div v-if="selected.volcano || selected.seismic" class="hazards">
            <span v-if="selected.volcano" class="hazard volc">
              🌋 Vulcão
            </span>
            <span v-if="selected.seismic" class="hazard quake">
              ⚠️ Zona sísmica
            </span>
          </div>

          <!-- Defensores do território neutro -->
          <div v-if="!selected.ownerCode" class="battle-line">
            <span class="bf-icon">{{
              selected.defenderHp > 0 ? "🛡️" : "🏳️"
            }}</span>
            <div class="bf-info">
              <span class="bf-label">
                {{
                  selected.defenderHp > 0
                    ? "Defensores do território"
                    : "Território sem defensores"
                }}
              </span>
              <span v-if="selected.defenderHp > 0" class="bf-val">
                {{ defenderTroopCount(selected.defenderHp) }} tropas ·
                {{ selected.defenderHp }} HP
              </span>
              <span v-else class="bf-val bf-open">
                Livre para ser tomado
              </span>
            </div>
          </div>

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

          <!-- Esquadrões neste território -->
          <div class="squad-head">
            <span>Esquadrões aqui</span>
            <span class="squad-count">{{ squadsOnSelected.length }}</span>
          </div>
          <div class="squad-list">
            <div
              v-for="s in squadsOnSelected"
              :key="s.id"
              class="squad-row"
              :style="{ '--sc': nationOf(s.ownerCode)?.color ?? NEUTRAL_COLOR }"
            >
              <span class="squad-bar"></span>
              <div class="squad-body">
                <div class="squad-title">
                  <span>⚔️ {{ squadName(s) }}</span>
                  <span
                    class="squad-stars"
                    title="Talento do comandante (estrelas)"
                  >
                    {{ "★".repeat(s.commander.stars) }}
                  </span>
                  <span
                    class="squad-state"
                    :class="isSquadReady(s, turn) ? 'ready' : 'prep'"
                  >
                    {{ isSquadReady(s, turn) ? "Pronto" : "Em preparação" }}
                  </span>
                </div>
                <div class="squad-stats">
                  <span title="Força de batalha do esquadrão">
                    ⚔️ {{ squadForce(s) }}
                  </span>
                  <span title="Tropas (limite definido pelas estrelas)">
                    🪖 {{ s.troops.length }}/{{
                      maxTroops(s.commander.stars)
                    }}
                  </span>
                  <span title="Vida do comandante">
                    ❤️ {{ s.commander.hp }}/{{ s.commander.maxHp }}
                  </span>
                  <span title="Defesa do comandante">
                    🛡️ {{ s.commander.defense }}
                  </span>
                  <span title="Moral do esquadrão">💪 {{ s.moral }}%</span>
                  <span title="Ataques restantes neste turno">
                    🎯 {{ attacksLeft(s) }}/{{ ATTACKS_PER_TURN }}
                  </span>
                  <span
                    :title="
                      isSquadOnOwnTile(s)
                        ? 'Manutenção por turno (metade — em território seu)'
                        : 'Manutenção por turno'
                    "
                  >
                    💰 {{ squadUpkeepAt(s, isSquadOnOwnTile(s)) }}/turno
                  </span>
                </div>
                <div class="squad-acts">
                  <template v-if="s.ownerCode === game?.playerCode">
                    <button
                      class="sbtn"
                      :class="{ on: moveMode?.id === s.id }"
                      :disabled="
                        busySquad || !canSquadMove(s, turn, isSquadOnGlacial(s))
                      "
                      :title="
                        !isSquadReady(s, turn)
                          ? 'Em preparação — pronto no próximo turno'
                          : !canSquadMove(s, turn, isSquadOnGlacial(s))
                            ? isSquadOnGlacial(s)
                              ? 'Tile gelado — leva 2 turnos para avançar'
                              : 'Já se moveu neste turno'
                            : 'Mover esquadrão'
                      "
                      @click="startMove(s)"
                    >
                      ➤ Mover
                    </button>
                    <button
                      class="sbtn danger"
                      :disabled="busySquad"
                      @click="removeSquad(s)"
                    >
                      ✕ Excluir
                    </button>
                  </template>
                  <button
                    v-else
                    class="sbtn attack"
                    :disabled="
                      busySquad ||
                      !attackerSquad ||
                      !canSquadAttack(attackerSquad, turn)
                    "
                    :title="
                      !attackerSquad
                        ? 'É preciso um esquadrão seu neste tile'
                        : !canSquadAttack(attackerSquad, turn)
                          ? 'Atacante sem ataques ou em preparação'
                          : 'Atacar este esquadrão'
                    "
                    @click="doAttackSquad(s)"
                  >
                    ⚔️ Atacar
                  </button>
                </div>
              </div>
            </div>
            <p v-if="squadsOnSelected.length === 0" class="squad-empty">
              Nenhum esquadrão neste território.
            </p>
          </div>

          <!-- Ações da cidade do jogador: montar esquadrão e recrutar -->
          <template v-if="selected.ownerCode === game?.playerCode">
            <button
              class="squad-create"
              :disabled="
                busySquad ||
                (playerFaction?.money ?? 0) < SQUAD_COST ||
                (playerFaction?.manpower ?? 0) < SQUAD_MANPOWER_COST
              "
              @click="createSquadHere"
            >
              ⚔️ Montar esquadrão · 💰 {{ SQUAD_COST }} ·
              🪖 {{ SQUAD_MANPOWER_COST }}
            </button>
            <p
              v-if="
                (playerFaction?.money ?? 0) < SQUAD_COST ||
                (playerFaction?.manpower ?? 0) < SQUAD_MANPOWER_COST
              "
              class="squad-warn"
            >
              Recursos insuficientes para montar um esquadrão.
            </p>
            <button
              class="squad-recruit"
              :disabled="busySquad"
              title="Recrutar tropas para o inventário da cidade"
              @click="openRecruit"
            >
              🪖 Recrutamento
            </button>
            <button
              class="squad-city"
              :disabled="busySquad"
              title="Abrir o painel da cidade (inventário de tropas)"
              @click="openCity"
            >
              🏛️ Ver cidade
            </button>
          </template>

          <!-- Combate: o tile não é da sua facção e você tem esquadrão nele -->
          <template v-if="isContestedTile">
            <div class="squad-head"><span>Combate</span></div>

            <!-- Escolha do esquadrão atacante (quando há mais de um) -->
            <div v-if="playerSquadsHere.length > 1" class="rc-block">
              <div class="rc-label">Esquadrão atacante</div>
              <div class="rc-squads">
                <button
                  v-for="s in playerSquadsHere"
                  :key="s.id"
                  class="rc-squad"
                  :class="{ on: attackerSquad?.id === s.id }"
                  @click="attackerId = s.id"
                >
                  ⚔️ {{ squadName(s) }}
                  <span class="rc-squad-sub">
                    {{ attacksLeft(s) }}/{{ ATTACKS_PER_TURN }} ataques
                  </span>
                </button>
              </div>
            </div>

            <!-- Modificadores de força do atacante -->
            <div class="rc-block">
              <div class="rc-label">Modificadores do atacante</div>
              <div class="env-mods">
                <div
                  v-for="m in battleMods"
                  :key="m.label"
                  class="env-mod"
                  :class="m.delta > 0 ? 'up' : 'down'"
                >
                  <span>{{ m.label }}</span>
                  <span>
                    {{ m.delta > 0 ? "+" : ""
                    }}{{ Math.round(m.delta * 100) }}%
                  </span>
                </div>
                <div
                  class="env-mod"
                  :class="attackerMoralPct >= 0 ? 'up' : 'down'"
                >
                  <span>
                    Moral{{
                      attackerSquad ? " (" + attackerSquad.moral + "%)" : ""
                    }}
                  </span>
                  <span>
                    {{ attackerMoralPct >= 0 ? "+" : "" }}{{ attackerMoralPct }}%
                  </span>
                </div>
                <p class="env-none">
                  🎲 Os 2 dados de cada lado são lançados na batalha.
                </p>
              </div>
            </div>

            <!-- Atacar a região (tile neutro com defensores) -->
            <button
              v-if="!selected.ownerCode && selected.defenderHp > 0"
              class="squad-create attack-region"
              :disabled="
                busySquad ||
                !attackerSquad ||
                !canSquadAttack(attackerSquad, turn)
              "
              @click="doAttackTerritory"
            >
              ⚔️ Atacar a região
            </button>
            <p
              v-if="
                !selected.ownerCode &&
                selected.defenderHp > 0 &&
                attackerSquad &&
                !canSquadAttack(attackerSquad, turn)
              "
              class="squad-warn"
            >
              O esquadrão atacante não tem ataques neste turno.
            </p>
            <p
              v-else-if="
                selected.ownerCode && enemySquadsHere.length === 0
              "
              class="squad-empty rc-pad"
            >
              Nenhum alvo para atacar neste território.
            </p>
          </template>

          <!-- Tomar território neutro já sem defensores -->
          <button
            v-if="canTakeTerritory"
            class="squad-create take-territory"
            :disabled="busySquad"
            @click="showTake = true"
          >
            🚩 Tomar território
          </button>
          </template>

          <!-- ===== Vista: recrutamento de tropas ===== -->
          <template v-else>
            <div class="card-head">
              <button
                class="x back"
                title="Voltar às informações do território"
                @click="recruitOpen = false"
              >
                ‹
              </button>
              <div class="head-title">🪖 Recrutamento</div>
              <button class="x" @click="selected = null">✕</button>
            </div>
            <p class="sub">
              {{ selected.name }}
              <span class="dimsep">·</span>
              produção {{ selected.production }}/turno
            </p>

            <p class="rc-pad rc-note">
              As tropas recrutadas vão para o <strong>inventário</strong> desta
              cidade. Use <strong>Ver cidade</strong> para enviá-las a um
              esquadrão.
            </p>

            <!-- Tropas disponíveis para recrutamento -->
            <div class="rc-block">
              <div class="rc-label">Tropas disponíveis</div>
              <div class="rc-troop">
                <span class="rc-troop-icon">
                  {{ TROOP_TYPES.INFANTARIA.icon }}
                </span>
                <div class="rc-troop-info">
                  <div class="rc-troop-name">
                    {{ TROOP_TYPES.INFANTARIA.label }}
                  </div>
                  <div class="rc-troop-stats">
                    <span>⚔️ +{{ TROOP_TYPES.INFANTARIA.force }} força</span>
                    <span>❤️ {{ TROOP_TYPES.INFANTARIA.hp }} vida</span>
                  </div>
                  <div class="rc-troop-costs">
                    <span title="Custo em dinheiro">
                      💰 {{ TROOP_TYPES.INFANTARIA.moneyCost }}
                    </span>
                    <span title="Custo em manpower">
                      🪖 {{ TROOP_TYPES.INFANTARIA.manpowerCost }}
                    </span>
                    <span title="Produção (tempo de construção da cidade)">
                      🏭 {{ TROOP_TYPES.INFANTARIA.productionCost }} · ~{{
                        troopBuildTurns("INFANTARIA")
                      }}
                      turno(s)
                    </span>
                    <span title="Manutenção por turno">
                      💸 {{ TROOP_TYPES.INFANTARIA.upkeep }}/turno
                    </span>
                  </div>
                </div>
              </div>
              <button
                class="squad-create rc-recruit-btn"
                :disabled="
                  busySquad ||
                  (playerFaction?.money ?? 0) <
                    TROOP_TYPES.INFANTARIA.moneyCost ||
                  (playerFaction?.manpower ?? 0) <
                    TROOP_TYPES.INFANTARIA.manpowerCost
                "
                @click="doRecruit('INFANTARIA')"
              >
                Recrutar infantaria
              </button>
              <p
                v-if="
                  (playerFaction?.money ?? 0) <
                    TROOP_TYPES.INFANTARIA.moneyCost ||
                  (playerFaction?.manpower ?? 0) <
                    TROOP_TYPES.INFANTARIA.manpowerCost
                "
                class="squad-warn"
              >
                Recursos insuficientes para recrutar.
              </p>
            </div>

            <!-- Fila de produção da cidade -->
            <div class="rc-block">
              <div class="rc-label">
                <span>Fila de produção</span>
                <span class="squad-count">{{ recruitOrdersHere.length }}</span>
              </div>
              <div
                v-for="(o, i) in recruitOrdersHere"
                :key="o.id"
                class="rc-order"
              >
                <span class="rc-order-pos">{{ i + 1 }}</span>
                <div class="rc-order-info">
                  <div class="rc-order-name">
                    {{ TROOP_TYPES[o.kind].label }}
                    <span class="dim">→ inventário da cidade</span>
                  </div>
                  <div class="rc-progress">
                    <div
                      class="rc-progress-fill"
                      :style="{
                        width:
                          Math.min(100, (o.prodDone / o.prodCost) * 100) + '%',
                      }"
                    ></div>
                  </div>
                  <div class="rc-order-meta">
                    {{ o.prodDone }}/{{ o.prodCost }} produção
                    <span class="dimsep">·</span>
                    <span v-if="i === 0">~{{ recruitEta(o) }} turno(s)</span>
                    <span v-else class="dim">aguardando na fila</span>
                  </div>
                </div>
                <button
                  class="sbtn danger rc-cancel"
                  :disabled="busySquad"
                  title="Cancelar — devolve o dinheiro e o manpower"
                  @click="doCancelRecruit(o.id)"
                >
                  ✕
                </button>
              </div>
              <p v-if="recruitOrdersHere.length === 0" class="squad-empty">
                Nenhuma tropa em produção nesta cidade.
              </p>
            </div>
          </template>
        </section>
      </Transition>

      <!-- Painel da cidade (direita) — abas; hoje, o inventário de tropas -->
      <Transition name="slide">
        <section
          v-if="cityPanelOpen && selected"
          class="card city-panel"
        >
          <div class="card-head">
            <div class="head-title">🏛️ {{ selected.name }}</div>
            <button class="x" @click="cityPanelOpen = false">✕</button>
          </div>
          <div class="city-tabs">
            <button
              :class="{ on: cityTab === 'inventory' }"
              @click="cityTab = 'inventory'"
            >
              Inventário
            </button>
          </div>
          <div class="city-body">
            <!-- Recursos da cidade (placeholder — sistema de produção em breve) -->
            <div class="ci-label">Recursos da cidade</div>
            <div class="ci-resources">
              <span
                v-for="s in TERRITORY_STATS"
                :key="s.key"
                class="ci-res"
                :title="s.label"
              >
                {{ s.icon }} 0
              </span>
            </div>
            <p class="ci-note">
              O estoque de recursos da cidade chega com o sistema de produção.
            </p>

            <!-- Inventário de tropas -->
            <div class="ci-label">
              <span>Tropas no inventário</span>
              <span class="squad-count">{{ cityTroopsHere.length }}</span>
            </div>
            <p v-if="cityTroopsHere.length === 0" class="squad-empty">
              Nenhuma tropa no inventário — recrute tropas para enchê-lo.
            </p>
            <div
              v-for="t in cityTroopsHere"
              :key="t.id"
              class="ci-troop"
              :class="{ picked: pickedCityTroops.includes(t.id) }"
            >
              <input
                type="checkbox"
                :value="t.id"
                v-model="pickedCityTroops"
              />
              <span class="ci-troop-icon">{{ TROOP_TYPES[t.kind].icon }}</span>
              <span class="ci-troop-info">
                <span class="ci-troop-name">
                  {{ TROOP_TYPES[t.kind].label }}
                </span>
                <span class="ci-troop-sub">
                  ❤️ {{ t.hp }}/{{ t.maxHp }}
                  <span class="dimsep">·</span>
                  {{ levelLabel(t.xp) }}
                </span>
              </span>
              <button
                class="mini-btn"
                :disabled="busySquad || playerSquadsHere.length === 0"
                :title="
                  playerSquadsHere.length === 0
                    ? 'Nenhum esquadrão estacionado na cidade'
                    : 'Enviar esta tropa a um esquadrão'
                "
                @click="sendTroopsToSquad([t.id])"
              >
                Add ao esquadrão
              </button>
            </div>

            <button
              v-if="cityTroopsHere.length > 0"
              class="squad-create ci-move-btn"
              :disabled="
                busySquad ||
                pickedCityTroops.length === 0 ||
                playerSquadsHere.length === 0
              "
              @click="sendTroopsToSquad(pickedCityTroops)"
            >
              Mover {{ pickedCityTroops.length }} selecionada(s) para esquadrão
            </button>
            <p
              v-if="cityTroopsHere.length > 0 && playerSquadsHere.length === 0"
              class="squad-warn"
            >
              É preciso um esquadrão estacionado na cidade para receber tropas.
            </p>
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

      <!-- Diálogo: tomar território -->
      <Transition name="fade">
        <div
          v-if="showTake"
          class="modal-scrim"
          @click.self="showTake = false"
        >
          <div class="modal">
            <h3>Tomar território</h3>
            <p class="modal-text">
              <strong>{{ selected?.name }}</strong> está sem defensores —
              escolha como tomá-lo:
            </p>
            <div class="take-options">
              <button
                class="take-opt occupy"
                :disabled="busySquad"
                @click="doTakeTerritory(false)"
              >
                <span class="take-opt-title">🏳️ Ocupar</span>
                <span class="take-opt-desc">
                  O território passa a ser seu, com a produção intacta.
                </span>
              </button>
              <button
                class="take-opt devastate"
                :disabled="busySquad"
                @click="doTakeTerritory(true)"
              >
                <span class="take-opt-title">🔥 Devastar</span>
                <span class="take-opt-desc">
                  O território é seu, mas toda a produção por turno
                  (manpower, recurso, produção, pesquisa e cultura) é zerada.
                </span>
              </button>
            </div>
            <div class="modal-actions">
              <button @click="showTake = false">Cancelar</button>
            </div>
          </div>
        </div>
      </Transition>

      <!-- Modal de batalha (com animação dos dados) -->
      <Transition name="fade">
        <div
          v-if="battleModal"
          class="modal-scrim"
          @click.self="!diceRolling && closeBattleModal()"
        >
          <div class="modal battle-modal">
            <h3>⚔️ Batalha em {{ battleModal.tileName }}</h3>

            <div class="dice-row">
              <div class="dice-side">
                <span class="dice-tag atk">Atacante</span>
                <div class="dice-pair">
                  <span class="die" :class="{ rolling: diceRolling }">
                    {{
                      diceRolling
                        ? rollingFaces[0]
                        : battleModal.attackerDice[0]
                    }}
                  </span>
                  <span class="die" :class="{ rolling: diceRolling }">
                    {{
                      diceRolling
                        ? rollingFaces[1]
                        : battleModal.attackerDice[1]
                    }}
                  </span>
                </div>
                <span v-if="!diceRolling" class="dice-sum">
                  soma {{ battleModal.attacker.diceSum }}
                  <span v-if="battleModal.attacker.tradition > 0" class="dice-trad">
                    (+{{ battleModal.attacker.tradition }} tradição)
                  </span>
                </span>
              </div>
              <span class="dice-vs">⚔️</span>
              <div class="dice-side">
                <span class="dice-tag def">Defensor</span>
                <div class="dice-pair">
                  <span class="die" :class="{ rolling: diceRolling }">
                    {{
                      diceRolling
                        ? rollingFaces[2]
                        : battleModal.defenderDice[0]
                    }}
                  </span>
                  <span class="die" :class="{ rolling: diceRolling }">
                    {{
                      diceRolling
                        ? rollingFaces[3]
                        : battleModal.defenderDice[1]
                    }}
                  </span>
                </div>
                <span v-if="!diceRolling" class="dice-sum">
                  soma {{ battleModal.defender.diceSum }}
                  <span v-if="battleModal.defender.tradition > 0" class="dice-trad">
                    (+{{ battleModal.defender.tradition }} tradição)
                  </span>
                </span>
              </div>
            </div>

            <p v-if="diceRolling" class="bt-rolling">Lançando os dados…</p>
            <div v-else class="battle-result">
              <div class="bt-sides">
                <div
                  v-for="side in [battleModal.attacker, battleModal.defender]"
                  :key="side.label"
                  class="bt-side"
                  :class="{ destroyed: side.destroyed }"
                >
                  <div class="bt-side-name">{{ side.label }}</div>
                  <div class="bt-force">
                    força {{ side.baseForce }} →
                    <strong>{{ side.effectiveForce }}</strong>
                  </div>
                  <div class="bt-mods">
                    <span
                      v-for="(m, i) in side.modifiers"
                      :key="i"
                      class="bt-mod"
                      :class="m.pct >= 0 ? 'up' : 'down'"
                    >
                      {{ m.label }} {{ m.pct >= 0 ? "+" : ""
                      }}{{ Math.round(m.pct) }}%
                    </span>
                  </div>
                  <div class="bt-dmg">
                    <span title="Dano sofrido">💥 −{{ side.damageTaken }}</span>
                    <span title="Vida antes → depois">
                      ❤️ {{ side.hpBefore }} → {{ side.hpAfter }}
                    </span>
                    <span v-if="side.troopsLost > 0" title="Tropas perdidas">
                      🪖 −{{ side.troopsLost }}
                    </span>
                  </div>
                  <div v-if="side.destroyed" class="bt-destroyed">
                    DESTRUÍDO
                  </div>
                </div>
              </div>
              <p v-if="battleModal.xpGained > 0" class="bt-xp">
                ⭐ +{{ battleModal.xpGained }} XP para o comandante e as
                tropas do atacante.
              </p>
              <p v-if="battleModal.finalBattle" class="bt-final">
                ⚑ Batalha final — um dos lados foi destruído.
              </p>
            </div>

            <div class="modal-actions">
              <button class="on" :disabled="diceRolling" @click="closeBattleModal">
                Fechar
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <!-- Modal do exército: esquadrões/tropas e histórico de batalhas -->
      <Transition name="fade">
        <div
          v-if="showArmy"
          class="modal-scrim"
          @click.self="showArmy = false"
        >
          <div class="modal army-modal">
            <div class="army-head">
              <h3>🪖 Exército</h3>
              <button class="x" @click="showArmy = false">✕</button>
            </div>
            <div class="army-tabs">
              <button
                :class="{ on: armyTab === 'squads' }"
                @click="armyTab = 'squads'"
              >
                Esquadrões ({{ playerSquads.length }})
              </button>
              <button
                :class="{ on: armyTab === 'battles' }"
                @click="armyTab = 'battles'"
              >
                Batalhas ({{ battleLogs.length }})
              </button>
            </div>

            <div class="army-body">
              <!-- Aba: esquadrões e tropas -->
              <template v-if="armyTab === 'squads'">
                <p v-if="moveTroopId !== null" class="move-troop-banner">
                  <span>
                    Movendo uma tropa — clique em <strong>Receber tropa</strong>
                    num esquadrão do mesmo tile.
                  </span>
                  <button @click="moveTroopId = null">Cancelar</button>
                </p>
                <p v-if="playerSquads.length === 0" class="army-empty">
                  Você ainda não tem esquadrões.
                </p>
                <div v-for="s in playerSquads" :key="s.id" class="army-squad">
                  <div class="army-squad-head">
                    <input
                      class="as-name-input"
                      :value="s.name ?? ''"
                      :placeholder="'Esquadrão #' + s.id"
                      maxlength="40"
                      :disabled="busySquad"
                      @change="doRenameSquad(s.id, $event)"
                    />
                    <span class="as-meta">
                      célula {{ s.x }},{{ s.y }}
                      <span class="dimsep">·</span>
                      💪 {{ s.moral }}%
                      <span class="dimsep">·</span>
                      ⚔️ {{ squadForce(s) }}
                    </span>
                    <button
                      v-if="canReceiveTroop(s)"
                      class="mini-btn receive"
                      :disabled="busySquad"
                      @click="doMoveTroop(s.id)"
                    >
                      Receber tropa
                    </button>
                  </div>
                  <div class="army-cmd">
                    <span class="ac-line">
                      🎖️ Comandante
                      <span class="dimsep">·</span>
                      <span
                        class="squad-stars"
                        title="Talento (estrelas)"
                      >{{ "★".repeat(s.commander.stars) }}</span>
                      <span class="dimsep">·</span>
                      {{ levelLabel(s.commander.xp) }}
                    </span>
                    <span class="ac-line dim">
                      ❤️ {{ s.commander.hp }}/{{ s.commander.maxHp }}
                      <span class="dimsep">·</span>
                      ⚔️ {{ s.commander.force }}
                      <span class="dimsep">·</span>
                      🛡️ {{ s.commander.defense }}
                      <span class="dimsep">·</span>
                      🎌 tradição {{ s.commander.tradition }}
                    </span>
                  </div>
                  <div
                    v-for="t in s.troops"
                    :key="t.id"
                    class="army-troop"
                  >
                    <span class="at-name">
                      {{ TROOP_TYPES[t.kind].icon }}
                      {{ TROOP_TYPES[t.kind].label }}
                    </span>
                    <span class="at-stat">{{ levelLabel(t.xp) }}</span>
                    <span class="at-stat">❤️ {{ t.hp }}/{{ t.maxHp }}</span>
                    <span class="at-stat">⚔️ {{ t.force }}</span>
                    <span class="at-acts">
                      <button
                        class="mini-btn"
                        :class="{ on: moveTroopId === t.id }"
                        :disabled="busySquad"
                        @click="
                          moveTroopId = moveTroopId === t.id ? null : t.id
                        "
                      >
                        Mover
                      </button>
                      <button
                        class="mini-btn danger"
                        :disabled="busySquad"
                        @click="doDeleteTroop(t.id)"
                      >
                        Excluir
                      </button>
                    </span>
                  </div>
                  <p v-if="s.troops.length === 0" class="army-empty sub">
                    Sem tropas — só o comandante.
                  </p>
                </div>
              </template>

              <!-- Aba: histórico de batalhas -->
              <template v-else>
                <p v-if="battleLogs.length === 0" class="army-empty">
                  Nenhuma batalha registrada ainda.
                </p>
                <div
                  v-for="b in battleLogs"
                  :key="b.logId"
                  class="army-battle"
                >
                  <div class="ab-head">
                    <span>Turno {{ b.turn }} · {{ b.tileName }}</span>
                    <span v-if="b.finalBattle" class="ab-final">
                      Batalha final
                    </span>
                  </div>
                  <div class="ab-dice">
                    🎲 {{ b.attackerDice.join("+")
                    }}{{
                      b.attacker.tradition > 0
                        ? "+" + b.attacker.tradition
                        : ""
                    }}
                    = {{ b.attacker.diceSum }}
                    <span class="dimsep">×</span>
                    {{ b.defenderDice.join("+")
                    }}{{
                      b.defender.tradition > 0
                        ? "+" + b.defender.tradition
                        : ""
                    }}
                    = {{ b.defender.diceSum }}
                    <span v-if="b.xpGained > 0">
                      <span class="dimsep">·</span>
                      ⭐ +{{ b.xpGained }} XP
                    </span>
                  </div>
                  <div class="ab-sides">
                    <div
                      v-for="side in [b.attacker, b.defender]"
                      :key="side.label"
                      class="ab-side"
                      :class="{ destroyed: side.destroyed }"
                    >
                      <div class="ab-side-name">{{ side.label }}</div>
                      <div class="ab-side-stat">
                        força {{ side.baseForce }} → {{ side.effectiveForce }}
                      </div>
                      <div class="ab-side-stat">
                        💥 −{{ side.damageTaken }}
                        <span class="dimsep">·</span>
                        ❤️ {{ side.hpBefore }}→{{ side.hpAfter }}
                        <span class="dimsep">·</span>
                        🪖 −{{ side.troopsLost }}
                      </div>
                      <div class="ab-mods">
                        <span
                          v-for="(m, i) in side.modifiers"
                          :key="i"
                          :class="m.pct >= 0 ? 'up' : 'down'"
                        >
                          {{ m.label }} {{ m.pct >= 0 ? "+" : ""
                          }}{{ Math.round(m.pct) }}%
                        </span>
                      </div>
                      <div v-if="side.destroyed" class="ab-destroyed">
                        DESTRUÍDO
                      </div>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </Transition>

      <!-- Diálogo: escolher o esquadrão que recebe as tropas do inventário -->
      <Transition name="fade">
        <div
          v-if="askSquadFor"
          class="modal-scrim"
          @click.self="askSquadFor = null"
        >
          <div class="modal">
            <h3>Qual esquadrão?</h3>
            <p class="modal-text">
              Escolha o esquadrão que vai receber
              {{ askSquadFor.length }} tropa(s):
            </p>
            <div class="pick-squads">
              <button
                v-for="s in playerSquadsHere"
                :key="s.id"
                class="pick-squad"
                :disabled="busySquad"
                @click="doSendTroops(askSquadFor ?? [], s.id)"
              >
                <span>⚔️ {{ squadName(s) }}</span>
                <span class="dim">
                  {{ s.troops.length }}/{{ maxTroops(s.commander.stars) }}
                  tropas
                </span>
              </button>
            </div>
            <div class="modal-actions">
              <button @click="askSquadFor = null">Cancelar</button>
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

/* ===== Caixa de turno ===== */
.turn-box {
  position: absolute;
  right: 14px;
  bottom: 14px;
  width: 244px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 13px;
  background: linear-gradient(180deg, var(--panel-a) 0%, var(--panel-b) 100%);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 14px 38px rgba(0, 0, 0, 0.6);
}
.turn-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-left: 2px;
}
.turn-num {
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.9px;
  text-transform: uppercase;
  color: var(--gold);
}
.turn-date {
  font-size: 1.08rem;
  font-weight: 700;
  color: #fff;
}
.turn-seasons {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
  font-size: 0.72rem;
  color: #aab2bf;
}
.turn-seasons .hemi {
  font-weight: 600;
}
.turn-btn {
  width: 100%;
  padding: 13px;
  font-size: 1rem;
  font-weight: 800;
  background: linear-gradient(180deg, #f0c558 0%, #d8a233 100%);
  border-color: #f0c558;
  color: #20160a;
}
.turn-btn:hover:not(:disabled) {
  color: #20160a;
  filter: brightness(1.07);
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
  max-height: calc(100vh - 30px);
  overflow-y: auto;
}
.province .sub,
.province .owner,
.province .resource,
.province .climate,
.province .hazards,
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
.rtags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  margin-top: 3px;
}
.rtags .tier {
  margin-top: 0;
}
.boost {
  font-size: 0.6rem;
  font-weight: 800;
  letter-spacing: 0.3px;
  padding: 2px 6px;
  border-radius: 4px;
}
.boost.up {
  background: rgba(70, 170, 90, 0.2);
  color: #71c98a;
}
.boost.down {
  background: rgba(205, 95, 75, 0.2);
  color: #e6917a;
}
.effect {
  color: #8a92a0;
  font-size: 0.8rem;
  margin: 9px 13px 14px;
}

/* Clima do território */
.climate {
  display: flex;
  align-items: center;
  gap: 11px;
  margin-top: 11px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--line);
  border-left: 3px solid var(--cl);
  border-radius: 8px;
  padding: 9px 11px;
}
.cicon {
  font-size: 1.7rem;
}
.cname {
  font-weight: 700;
  color: var(--cl);
}
.csub {
  font-size: 0.76rem;
  color: #9aa0ac;
}
.hazards {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 10px;
}
.hazard {
  font-size: 0.72rem;
  font-weight: 700;
  border-radius: 6px;
  padding: 4px 9px;
}
.hazard.volc {
  background: rgba(214, 87, 49, 0.18);
  color: #ef8a5f;
  border: 1px solid rgba(214, 87, 49, 0.4);
}
.hazard.quake {
  background: rgba(232, 168, 74, 0.16);
  color: #e8b84a;
  border: 1px solid rgba(232, 168, 74, 0.38);
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

/* ===== Força de batalha do território ===== */
.battle-line {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 4px 13px 0;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--line);
  border-left: 3px solid #cf6b4a;
  border-radius: 8px;
  padding: 8px 11px;
}
.bf-icon {
  font-size: 1.4rem;
}
.bf-info {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  flex: 1;
}
.bf-label {
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #8a92a0;
}
.bf-val {
  font-size: 1.05rem;
  font-weight: 800;
  color: #e6917a;
}
.bf-tag {
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.3px;
  color: #e8b84a;
  background: rgba(232, 168, 74, 0.16);
  border: 1px solid rgba(232, 168, 74, 0.38);
  border-radius: 4px;
  padding: 3px 6px;
  text-align: center;
}

/* ===== Esquadrões no painel da província ===== */
.squad-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 14px 13px 0;
  font-size: 0.66rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.7px;
  color: #8a92a0;
}
.squad-count {
  font-weight: 800;
  color: #cdd2da;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 9px;
  padding: 1px 8px;
}
.squad-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 8px 13px 0;
}
.squad-row {
  display: flex;
  gap: 9px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 9px 10px;
}
.squad-bar {
  width: 4px;
  border-radius: 3px;
  background: var(--sc);
  flex: none;
}
.squad-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-width: 0;
}
.squad-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-weight: 700;
  font-size: 0.86rem;
  color: #fff;
}
.squad-stars {
  color: var(--gold);
  letter-spacing: 1px;
}
.squad-state {
  font-size: 0.56rem;
  font-weight: 800;
  letter-spacing: 0.4px;
  border-radius: 4px;
  padding: 2px 6px;
  text-transform: uppercase;
}
.squad-state.ready {
  color: #71c98a;
  background: rgba(70, 170, 90, 0.18);
}
.squad-state.prep {
  color: #e8b84a;
  background: rgba(232, 168, 74, 0.16);
}
.squad-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 0.78rem;
  color: #cdd2da;
}
.squad-acts {
  display: flex;
  gap: 6px;
}
.sbtn {
  flex: 1;
  padding: 6px 8px;
  font-size: 0.76rem;
  font-weight: 700;
  border-radius: 7px;
}
.sbtn.on {
  background: linear-gradient(180deg, #f0c558 0%, #d8a233 100%);
  border-color: #f0c558;
  color: #20160a;
}
.sbtn.danger:hover:not(:disabled) {
  border-color: #cf6b4a;
  color: #e6917a;
}
.squad-empty {
  color: #7d8694;
  font-size: 0.8rem;
  font-style: italic;
  margin: 2px 0;
}
.squad-create {
  display: block;
  width: auto;
  margin: 10px 13px 0;
  padding: 11px;
  font-size: 0.9rem;
  font-weight: 800;
  background: linear-gradient(180deg, #3a4555 0%, #222a38 100%);
  border-color: var(--gold);
  color: var(--gold);
}
.squad-create:hover:not(:disabled) {
  filter: brightness(1.12);
  color: var(--gold);
}
.squad-warn {
  margin: 6px 13px 0;
  color: #e6917a;
  font-size: 0.76rem;
}
.squad-take {
  display: block;
  width: auto;
  margin: 10px 13px 14px;
  padding: 10px;
  font-size: 0.86rem;
  font-weight: 700;
}
.squad-create + .squad-warn {
  margin-bottom: 14px;
}
.squad-create:last-child,
.squad-warn:last-child {
  margin-bottom: 14px;
}

/* Botão de abrir o recrutamento */
.squad-recruit {
  display: block;
  width: auto;
  margin: 8px 13px 0;
  padding: 10px;
  font-size: 0.88rem;
  font-weight: 800;
  background: linear-gradient(180deg, #3a4555 0%, #222a38 100%);
  border-color: #7fb86b;
  color: #9ad187;
}
.squad-recruit:hover:not(:disabled) {
  filter: brightness(1.12);
  color: #9ad187;
}
.squad-city {
  display: block;
  width: auto;
  margin: 8px 13px 14px;
  padding: 10px;
  font-size: 0.88rem;
  font-weight: 800;
  background: linear-gradient(180deg, #3a4555 0%, #222a38 100%);
  border-color: #5b9fd1;
  color: #88bde0;
}
.squad-city:hover:not(:disabled) {
  filter: brightness(1.12);
  color: #88bde0;
}
.rc-note {
  font-size: 0.78rem;
  color: #9aa0ac;
  line-height: 1.45;
}
.rc-note strong {
  color: #cdd2da;
}

/* Botão de voltar do recrutamento */
.x.back {
  font-size: 1.45rem;
  line-height: 1;
  color: var(--gold);
}
.x.back:hover {
  color: #fff;
}

/* ===== Recrutamento ===== */
.rc-block {
  margin: 12px 13px 0;
}
.rc-block:last-child {
  margin-bottom: 14px;
}
.rc-pad {
  margin: 12px 13px 0;
}
.rc-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 0.66rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.7px;
  color: #8a92a0;
}
.rc-squads {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.rc-squad {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 7px 10px;
  font-size: 0.82rem;
  font-weight: 700;
}
.rc-squad.on {
  background: linear-gradient(180deg, #f0c558 0%, #d8a233 100%);
  border-color: #f0c558;
  color: #20160a;
}
.rc-squad-sub {
  font-size: 0.62rem;
  font-weight: 600;
  opacity: 0.85;
}
.rc-troop {
  display: flex;
  gap: 11px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px 11px;
}
.rc-troop-icon {
  font-size: 1.9rem;
}
.rc-troop-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}
.rc-troop-name {
  font-size: 0.95rem;
  font-weight: 700;
  color: #fff;
}
.rc-troop-stats,
.rc-troop-costs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 0.74rem;
  color: #cdd2da;
}
.rc-troop-costs {
  color: #9aa0ac;
}
.rc-recruit-btn {
  margin: 9px 0 0;
}
.rc-order {
  display: flex;
  align-items: center;
  gap: 9px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 8px 10px;
}
.rc-order + .rc-order {
  margin-top: 7px;
}
.rc-order-pos {
  width: 20px;
  height: 20px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  font-size: 0.7rem;
  font-weight: 800;
  color: #cdd2da;
}
.rc-order-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.rc-order-name {
  font-size: 0.82rem;
  font-weight: 700;
  color: #fff;
}
.rc-progress {
  height: 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.4);
  overflow: hidden;
}
.rc-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #7fb86b, #9ad187);
}
.rc-order-meta {
  font-size: 0.68rem;
  color: #9aa0ac;
}
.rc-cancel {
  flex: none;
  width: 30px;
  padding: 6px 0;
}

/* ===== Combate ===== */
/* Texto "livre para ser tomado" no bloco de defensores */
.bf-open {
  color: #9ad187;
}
/* Botão de atacar na linha de um esquadrão inimigo */
.sbtn.attack {
  border-color: #cf6b4a;
  color: #e6917a;
}
.sbtn.attack:hover:not(:disabled) {
  border-color: #cf6b4a;
  background: rgba(207, 107, 74, 0.2);
  color: #f0a98f;
}
/* Modificadores de ambiente da batalha */
.env-mods {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.env-mod {
  display: flex;
  justify-content: space-between;
  padding: 5px 9px;
  font-size: 0.78rem;
  border: 1px solid var(--line);
  border-radius: 6px;
}
.env-mod.up {
  background: rgba(70, 170, 90, 0.14);
  color: #9ad187;
}
.env-mod.down {
  background: rgba(207, 107, 74, 0.14);
  color: #e6917a;
}
.env-mod span:last-child {
  font-weight: 800;
}
.env-none {
  margin: 0;
  font-size: 0.78rem;
  font-style: italic;
  color: #7d8694;
}
.env-total {
  margin-top: 3px;
  text-align: right;
  font-size: 0.82rem;
  font-weight: 800;
  color: var(--gold);
}
/* Botão de atacar a região */
.attack-region {
  border-color: #cf6b4a;
  color: #e6917a;
}
.attack-region:hover:not(:disabled) {
  filter: brightness(1.12);
  color: #e6917a;
}
/* Botão de tomar território */
.take-territory {
  margin-top: 8px;
  border-color: var(--gold);
  color: var(--gold);
}
.take-territory:hover:not(:disabled) {
  filter: brightness(1.12);
  color: var(--gold);
}
/* Diálogo de tomar território */
.take-options {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin-bottom: 14px;
}
.take-opt {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 11px 13px;
  text-align: left;
  white-space: normal;
}
.take-opt.occupy:hover:not(:disabled) {
  border-color: #7fb86b;
}
.take-opt.devastate:hover:not(:disabled) {
  border-color: #cf6b4a;
}
.take-opt-title {
  font-size: 0.95rem;
  font-weight: 800;
  color: #fff;
}
.take-opt-desc {
  font-size: 0.76rem;
  line-height: 1.4;
  color: #9aa0ac;
}

/* ===== Modal de batalha ===== */
.battle-modal {
  width: 460px;
}
.dice-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
  margin: 6px 0 14px;
}
.dice-side {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.dice-tag {
  font-size: 0.64rem;
  font-weight: 800;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 4px;
}
.dice-tag.atk {
  background: rgba(207, 107, 74, 0.2);
  color: #e6917a;
}
.dice-tag.def {
  background: rgba(91, 159, 209, 0.2);
  color: #88bde0;
}
.dice-pair {
  display: flex;
  gap: 8px;
}
.die {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  font-size: 1.5rem;
  font-weight: 800;
  color: #20160a;
  background: linear-gradient(180deg, #f0e3c0 0%, #d8c79a 100%);
  border: 1px solid #b8a878;
  border-radius: 9px;
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.4);
}
.die.rolling {
  animation: die-shake 0.18s infinite;
  color: #7a6a44;
}
@keyframes die-shake {
  0% { transform: translateY(0) rotate(-8deg); }
  50% { transform: translateY(-4px) rotate(8deg); }
  100% { transform: translateY(0) rotate(-8deg); }
}
.dice-trad {
  color: var(--gold);
  font-weight: 700;
}
.dice-sum {
  font-size: 0.72rem;
  font-weight: 700;
  color: #9aa0ac;
}
.dice-vs {
  font-size: 1.2rem;
}
.bt-rolling {
  text-align: center;
  color: var(--gold);
  font-weight: 700;
  margin: 14px 0;
}
.bt-sides {
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.bt-side {
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid var(--line);
  border-radius: 9px;
  padding: 10px 12px;
}
.bt-side.destroyed {
  border-color: #cf6b4a;
}
.bt-side-name {
  font-weight: 800;
  color: #fff;
}
.bt-force {
  font-size: 0.84rem;
  color: #cdd2da;
  margin-top: 2px;
}
.bt-force strong {
  color: var(--gold);
  font-size: 1rem;
}
.bt-mods {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin: 7px 0;
}
.bt-mod {
  font-size: 0.66rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
}
.bt-mod.up {
  background: rgba(70, 170, 90, 0.18);
  color: #9ad187;
}
.bt-mod.down {
  background: rgba(207, 107, 74, 0.18);
  color: #e6917a;
}
.bt-dmg {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 0.82rem;
  font-weight: 700;
  color: #cdd2da;
}
.bt-destroyed {
  margin-top: 6px;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.8px;
  color: #e6917a;
}
.bt-xp {
  margin: 12px 0 0;
  text-align: center;
  font-weight: 700;
  font-size: 0.84rem;
  color: #9ad187;
}
.bt-xp + .bt-final {
  margin-top: 6px;
}
.bt-final {
  margin: 12px 0 0;
  text-align: center;
  font-weight: 800;
  color: var(--gold);
}

/* ===== Modal do exército ===== */
.army-modal {
  width: 560px;
  max-width: 94vw;
  display: flex;
  flex-direction: column;
  max-height: 84vh;
  padding: 0;
}
.army-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 0;
}
.army-head h3 {
  margin: 0;
}
.army-tabs {
  display: flex;
  gap: 7px;
  padding: 12px 16px 0;
}
.army-tabs button {
  flex: 1;
}
.army-body {
  padding: 13px 16px 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.army-empty {
  color: #7d8694;
  font-style: italic;
  font-size: 0.84rem;
  margin: 2px 0;
}
.army-empty.sub {
  font-size: 0.76rem;
  margin: 2px 0 0;
}
.army-squad {
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--line);
  border-radius: 9px;
  padding: 10px 12px;
}
.army-squad-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.as-name {
  font-weight: 800;
  color: #fff;
}
.as-name-input {
  font-family: inherit;
  font-size: 0.86rem;
  font-weight: 800;
  color: #fff;
  background: #0e131d;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 5px 8px;
  width: 170px;
}
.as-name-input:focus {
  outline: none;
  border-color: var(--gold);
}
.as-meta {
  flex: 1;
  font-size: 0.76rem;
  color: #9aa0ac;
}
.army-cmd {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 7px;
  padding: 6px 9px;
  font-size: 0.78rem;
  color: #cdd2da;
  background: rgba(232, 184, 74, 0.1);
  border-radius: 6px;
}
.ac-line.dim {
  color: #9aa0ac;
}
.army-troop {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
  padding: 6px 9px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 6px;
  font-size: 0.8rem;
}
.at-name {
  font-weight: 700;
  color: #fff;
}
.at-stat {
  color: #cdd2da;
}
.at-acts {
  margin-left: auto;
  display: flex;
  gap: 5px;
}
.mini-btn {
  padding: 4px 9px;
  font-size: 0.72rem;
  font-weight: 700;
  border-radius: 6px;
}
.mini-btn.danger:hover:not(:disabled) {
  border-color: #cf6b4a;
  color: #e6917a;
}
.mini-btn.receive {
  border-color: #7fb86b;
  color: #9ad187;
}
.move-troop-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  padding: 9px 11px;
  font-size: 0.8rem;
  background: rgba(232, 184, 74, 0.12);
  border: 1px solid var(--gold);
  border-radius: 8px;
}
.move-troop-banner span {
  flex: 1;
}
.army-battle {
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--line);
  border-radius: 9px;
  padding: 10px 12px;
}
.ab-head {
  display: flex;
  justify-content: space-between;
  font-weight: 800;
  color: #fff;
  font-size: 0.86rem;
}
.ab-final {
  font-size: 0.64rem;
  font-weight: 800;
  letter-spacing: 0.4px;
  color: var(--gold);
  background: rgba(232, 184, 74, 0.16);
  border-radius: 4px;
  padding: 2px 7px;
}
.ab-dice {
  font-size: 0.78rem;
  color: #cdd2da;
  margin: 4px 0 8px;
}
.ab-sides {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.ab-side {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--line);
  border-radius: 7px;
  padding: 8px 10px;
}
.ab-side.destroyed {
  border-color: #cf6b4a;
}
.ab-side-name {
  font-weight: 800;
  color: #fff;
  font-size: 0.82rem;
}
.ab-side-stat {
  font-size: 0.74rem;
  color: #aab2bf;
  margin-top: 2px;
}
.ab-mods {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 5px;
}
.ab-mods span {
  font-size: 0.62rem;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
}
.ab-mods .up {
  background: rgba(70, 170, 90, 0.16);
  color: #9ad187;
}
.ab-mods .down {
  background: rgba(207, 107, 74, 0.16);
  color: #e6917a;
}
.ab-destroyed {
  margin-top: 5px;
  font-size: 0.66rem;
  font-weight: 800;
  color: #e6917a;
}

/* ===== Aviso do modo de movimento ===== */
.move-banner {
  position: absolute;
  top: 70px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  background: linear-gradient(180deg, #2a3242 0%, #161b27 100%);
  border: 1px solid var(--gold);
  color: #fff;
  font-size: 0.84rem;
  font-weight: 600;
  padding: 9px 14px;
  border-radius: 9px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
}
.move-banner button {
  padding: 5px 12px;
  font-size: 0.78rem;
  font-weight: 700;
}

.panel {
  position: absolute;
  right: 14px;
  top: 70px;
  bottom: 156px;
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

/* ===== Painel da cidade (Ver cidade) ===== */
.city-panel {
  position: absolute;
  right: 14px;
  top: 70px;
  bottom: 156px;
  width: 340px;
  display: flex;
  flex-direction: column;
}
.city-tabs {
  display: flex;
  gap: 6px;
  padding: 10px 13px 0;
}
.city-tabs button {
  flex: 1;
}
.city-body {
  padding: 12px 13px 14px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.ci-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0 7px;
  font-size: 0.66rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.7px;
  color: #8a92a0;
}
.ci-label:first-child {
  margin-top: 0;
}
.ci-resources {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ci-res {
  font-size: 0.78rem;
  font-weight: 700;
  color: #cdd2da;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 5px 9px;
}
.ci-note {
  margin: 7px 0 0;
  font-size: 0.74rem;
  font-style: italic;
  color: #7d8694;
}
.ci-troop {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 6px;
  padding: 7px 9px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--line);
  border-radius: 7px;
}
.ci-troop.picked {
  border-color: var(--gold);
  background: rgba(232, 184, 74, 0.1);
}
.ci-troop input {
  width: 16px;
  height: 16px;
  accent-color: var(--gold);
  flex: none;
}
.ci-troop-icon {
  font-size: 1.5rem;
}
.ci-troop-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.ci-troop-name {
  font-weight: 700;
  font-size: 0.84rem;
  color: #fff;
}
.ci-troop-sub {
  font-size: 0.72rem;
  color: #9aa0ac;
}
.ci-move-btn {
  margin: 12px 0 0;
}

/* Diálogo "Qual esquadrão?" */
.pick-squads {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-bottom: 14px;
}
.pick-squad {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  font-weight: 700;
}
</style>
