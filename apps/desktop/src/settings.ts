/**
 * Configurações do aplicativo (não do jogo em si). Ficam guardadas no
 * `localStorage` do computador — valem para qualquer partida.
 */
export interface AppSettings {
  /** Abrir o jogo já em tela cheia. */
  fullscreenOnStart: boolean;
  /** Pedir confirmação antes de voltar do jogo para o menu. */
  confirmExit: boolean;
}

const STORAGE_KEY = 'world-war:settings';

const DEFAULTS: AppSettings = {
  fullscreenOnStart: false,
  confirmExit: true,
};

/** Lê as configurações salvas (com os padrões para campos ausentes). */
export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Grava as configurações no computador. */
export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* armazenamento indisponível: ignora */
  }
}
