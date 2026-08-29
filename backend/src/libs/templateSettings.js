export const TEMPLATE_KINDS = ["producto", "manual", "mixto"];
export const BACKGROUND_MODES = ["image", "color", "none"];

export const DEFAULT_TEMPLATE_SETTINGS = {
  templateKind: "manual",
  requiresProduct: false,
  backgroundMode: "none",
};

const layerHasBind = (layer) => !!(layer?.bind?.textFrom || layer?.bind?.srcFrom);

export function normalizeTemplateSettings(raw = {}, ctx = {}) {
  const layers = Array.isArray(ctx.layers) ? ctx.layers : [];
  const backgroundSrc = ctx.backgroundSrc;

  let templateKind = TEMPLATE_KINDS.includes(raw.templateKind) ? raw.templateKind : null;
  if (!templateKind) {
    const boundCount = layers.filter(layerHasBind).length;
    if (boundCount === 0) templateKind = "manual";
    else if (boundCount >= layers.length && layers.length > 0) templateKind = "producto";
    else templateKind = "mixto";
  }

  let backgroundMode = BACKGROUND_MODES.includes(raw.backgroundMode) ? raw.backgroundMode : null;
  if (!backgroundMode) {
    if (backgroundSrc) backgroundMode = "image";
    else if (layers.some((l) => l.type === "shape" && l.props?.fill)) backgroundMode = "color";
    else backgroundMode = "none";
  }

  let requiresProduct;
  if (typeof raw.requiresProduct === "boolean") {
    requiresProduct = raw.requiresProduct;
  } else if (templateKind === "manual") {
    requiresProduct = false;
  } else if (templateKind === "producto") {
    requiresProduct = true;
  } else {
    requiresProduct = layers.some(layerHasBind);
  }

  return { templateKind, requiresProduct, backgroundMode };
}

export function extractTemplateSettings({
  body = {},
  templateJson = {},
  doc = {},
  layers,
  backgroundSrc,
} = {}) {
  const fromMeta = templateJson?.meta || doc?.meta || {};
  const fromBodySettings = body?.settingsJson && typeof body.settingsJson === "object" ? body.settingsJson : {};
  const merged = {
    ...fromBodySettings,
    templateKind:
      body.templateKind ??
      fromBodySettings.templateKind ??
      fromMeta.templateKind,
    requiresProduct:
      body.requiresProduct ??
      fromBodySettings.requiresProduct ??
      fromMeta.requiresProduct,
    backgroundMode:
      body.backgroundMode ??
      fromBodySettings.backgroundMode ??
      fromMeta.backgroundMode,
  };

  const layerSource = layers || templateJson?.layers || doc?.layers || [];
  const bg = backgroundSrc ?? templateJson?.backgroundSrc ?? doc?.backgroundSrc ?? null;

  return normalizeTemplateSettings(merged, { layers: layerSource, backgroundSrc: bg });
}

export function settingsToMeta(settings = {}) {
  const normalized = normalizeTemplateSettings(settings);
  return {
    templateKind: normalized.templateKind,
    requiresProduct: normalized.requiresProduct,
    backgroundMode: normalized.backgroundMode,
  };
}
