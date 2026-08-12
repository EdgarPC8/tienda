/** Paleta de colores del sistema (claro / oscuro / neón) — backend. */
export const THEME_PALETTE_VERSION = 1;

export const DEFAULT_THEME_PALETTE = {
  v: THEME_PALETTE_VERSION,
  name: "Raptor",
  light: {
    primary: "#1A7A9A",
    primaryLight: "#3D9BB8",
    primaryDark: "#0F5A74",
    secondary: "#14B8A6",
    secondaryLight: "#5EEAD4",
    secondaryDark: "#0F766E",
    backgroundDefault: "#F0F9FB",
    backgroundPaper: "rgba(255,255,255,0.9)",
    textPrimary: "#0F2A36",
    textSecondary: "#3D6574",
  },
  dark: {
    primary: "#2A8FB0",
    primaryLight: "#3D9BB8",
    primaryDark: "#156B88",
    secondary: "#2DD4BF",
    secondaryLight: "#5EEAD4",
    secondaryDark: "#14B8A6",
    backgroundDefault: "#0B1C24",
    backgroundPaper: "#102A36",
    textPrimary: "#E8F4F8",
    textSecondary: "rgba(232,244,248,0.72)",
  },
  neon: {
    primary: "#22D3EE",
    primaryLight: "#67E8F9",
    primaryDark: "#0891B2",
    secondary: "#2DD4BF",
    secondaryLight: "#5EEAD4",
    secondaryDark: "#0D9488",
    backgroundDefault: "#030B12",
    backgroundPaper: "#071820",
    textPrimary: "#ECFEFF",
    textSecondary: "rgba(236,254,255,0.78)",
  },
};

const COLOR_KEYS = [
  "primary",
  "primaryLight",
  "primaryDark",
  "secondary",
  "secondaryLight",
  "secondaryDark",
  "backgroundDefault",
  "backgroundPaper",
  "textPrimary",
  "textSecondary",
];

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const RGBA_RE =
  /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(0|0?\.\d+|1(?:\.0)?)\s*)?\)$/i;

function isValidCssColor(value) {
  const s = String(value || "").trim();
  if (!s) return false;
  return HEX_RE.test(s) || RGBA_RE.test(s);
}

function cloneMode(modeObj, fallback) {
  const src = modeObj && typeof modeObj === "object" ? modeObj : {};
  const out = {};
  for (const key of COLOR_KEYS) {
    const raw = src[key] != null ? String(src[key]).trim() : "";
    out[key] = isValidCssColor(raw) ? raw : fallback[key];
  }
  return out;
}

export function normalizeThemePalette(raw) {
  let src = raw;
  if (typeof raw === "string") {
    try {
      src = JSON.parse(raw);
    } catch {
      src = null;
    }
  }
  if (!src || typeof src !== "object") {
    return JSON.parse(JSON.stringify(DEFAULT_THEME_PALETTE));
  }
  const name =
    String(src.name || DEFAULT_THEME_PALETTE.name).trim().slice(0, 80) || "Raptor";
  return {
    v: THEME_PALETTE_VERSION,
    name,
    light: cloneMode(src.light, DEFAULT_THEME_PALETTE.light),
    dark: cloneMode(src.dark, DEFAULT_THEME_PALETTE.dark),
    neon: cloneMode(src.neon, DEFAULT_THEME_PALETTE.neon),
  };
}

export function serializeThemePalette(raw) {
  return JSON.stringify(normalizeThemePalette(raw));
}
