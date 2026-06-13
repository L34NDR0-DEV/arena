// Detecção de plataforma — importar em qualquer módulo que precise diferenciar mobile/web.
// Fonte única de verdade: evita o padrão de redetectar via UserAgent em cada arquivo.

export const IS_MOBILE =
  /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 0 && window.matchMedia('(pointer:coarse)').matches);

export const IS_DESKTOP = !IS_MOBILE;

// Configurações que variam por plataforma
export const PLATFORM = {
  // Auto-mira: só ativa no mobile
  AUTO_AIM_ENABLED:  IS_MOBILE,
  AUTO_AIM_RADIUS:   320,   // px em coords mundo — raio de busca do alvo mais próximo
  AUTO_AIM_SNAP:     0.18,  // suavização (lerp por frame) — 0=instantâneo, 1=nunca alcança

  // Crosshair: visível só no desktop (no mobile a mira é automática)
  CROSSHAIR_VISIBLE: IS_DESKTOP,

  // Tamanho dos botões touch — ajustado por breakpoint via CSS, mas útil para canvas
  TOUCH_BTN_SIZE:    IS_MOBILE ? 72 : 0,
};
