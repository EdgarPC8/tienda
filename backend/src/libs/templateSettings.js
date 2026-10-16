export const TEMPLATE_KINDS = ["producto", "manual", "mixto"];
export const BACKGROUND_MODES = ["image", "color", "none"];

export const DEFAULT_TEMPLATE_SETTINGS = {
  templateKind: "manual",
  requiresProduct: false,
  backgroundMode: "none",
};

const layerHasBind = (layer) => !!(layer?.bind?.textFrom || layer?.bind?.srcFrom);

function normalizeFolders(rawFolders) {
  if (!Array.isArray(rawFolders)) return undefined;
  return rawFolders
    .filter((f) => f && f.id)
    .map((f) => {
      const slot = Number(f.productSlot);
      return {
        id: String(f.id),
        name: String(f.name || f.id),
        parentId: f.parentId ? String(f.parentId) : null,
        ...(f.collapsed ? { collapsed: true } : {}),
        ...(Number.isFinite(slot) && slot >= 0 ? { productSlot: Math.floor(slot) } : {}),
      };
    });
}

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

  const folders = normalizeFolders(raw.folders);
  const previewData =
    raw.previewData && typeof raw.previewData === "object" && !Array.isArray(raw.previewData)
      ? raw.previewData
      : undefined;

  return {
    templateKind,
    requiresProduct,
    backgroundMode,
    ...(folders ? { folders } : {}),
    ...(previewData ? { previewData } : {}),
  };
}

export function extractTemplateSettings({
  body = {},
  templateJson = {},
  doc = {},
  layers,
  backgroundSrc,
} = {}) {
  const fromMeta = templateJson?.meta || doc?.meta || {};
  let rawSettings = body?.settingsJson ?? null;
  if (typeof rawSettings === "string") {
    try {
      rawSettings = JSON.parse(rawSettings);
    } catch {
      rawSettings = null;
    }
  }
  const fromBodySettings =
    rawSettings && typeof rawSettings === "object" ? rawSettings : {};
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
    folders:
      body.folders ??
      fromBodySettings.folders ??
      fromMeta.folders ??
      doc.folders,
    previewData:
      body.previewData ??
      fromBodySettings.previewData ??
      fromMeta.previewData ??
      (doc?.data && typeof doc.data === "object" && Object.keys(doc.data).length
        ? doc.data
        : undefined),
  };

  const layerSource = layers || templateJson?.layers || doc?.layers || [];
  const bg = backgroundSrc ?? templateJson?.backgroundSrc ?? doc?.backgroundSrc ?? null;

  return normalizeTemplateSettings(merged, { layers: layerSource, backgroundSrc: bg });
}

export function settingsToMeta(settings = {}) {
  const normalized = normalizeTemplateSettings(settings);
  const out = {
    templateKind: normalized.templateKind,
    requiresProduct: normalized.requiresProduct,
    backgroundMode: normalized.backgroundMode,
  };
  if (Array.isArray(normalized.folders)) out.folders = normalized.folders;
  if (normalized.previewData) out.previewData = normalized.previewData;
  return out;
}
