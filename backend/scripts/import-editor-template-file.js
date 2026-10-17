/**
 * Importa un JSON de plantilla del editor directo a la BD (sin HTTP/login).
 *
 * Uso:
 *   node scripts/import-editor-template-file.js <ruta.json> [--name "…"] [--format A4] [--app EdDeli]
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EditorTemplate,
  EditorTemplateGroup,
  EditorTemplateLayer,
  EditorLayerProp,
  EditorLayerBind,
} from "../src/models/Editor.js";
import { sequelize } from "../src/database/connection.js";
import { extractTemplateSettings } from "../src/libs/templateSettings.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const toInt = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : d;
};

const toBool = (v, d = false) => {
  if (v === true || v === "true" || v === 1 || v === "1") return true;
  if (v === false || v === "false" || v === 0 || v === "0") return false;
  return d;
};

const isPlainObject = (x) => x && typeof x === "object" && !Array.isArray(x);

const inferValueType = (value) => {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (isPlainObject(value) || Array.isArray(value)) return "json";
  return "string";
};

const splitPropValue = (value) => {
  const valueType = inferValueType(value);
  if (valueType === "json") return { valueType, valueJson: value, valueText: null };
  if (valueType === "boolean") return { valueType, valueJson: null, valueText: value ? "true" : "false" };
  if (valueType === "number") return { valueType, valueJson: null, valueText: String(value) };
  return { valueType, valueJson: null, valueText: value == null ? "" : String(value) };
};

const pickBindFields = (bind = {}) => {
  if (!isPlainObject(bind)) return null;
  return {
    textFrom: bind.textFrom ?? null,
    srcFrom: bind.srcFrom ?? null,
    srcPrefix: bind.srcPrefix ?? null,
    fallbackSrc: bind.fallbackSrc ?? null,
    maxLen: bind.maxLen != null ? toInt(bind.maxLen, null) : null,
  };
};

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      flags[key] = argv[i + 1] ?? true;
      i += 1;
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

async function importTemplateFile(filePath, extra = {}) {
  const abs = path.resolve(filePath);
  const raw = fs.readFileSync(abs, "utf8");
  const templateJson = JSON.parse(raw);

  const groupsIn = Array.isArray(templateJson.groups) ? templateJson.groups : [];
  const layersIn = Array.isArray(templateJson.layers) ? templateJson.layers : [];

  const importSettings = extractTemplateSettings({
    body: extra,
    templateJson,
    layers: layersIn,
    backgroundSrc: templateJson.backgroundSrc ?? null,
  });

  const createdBy = toInt(extra.createdBy, 1);

  const t = await sequelize.transaction();
  try {
    const tpl = await EditorTemplate.create(
      {
        name:
          extra.name ||
          templateJson.name ||
          templateJson.meta?.name ||
          "Template importado",
        app: extra.app ?? templateJson.app ?? "EdDeli",
        format: extra.format ?? templateJson.format ?? null,
        canvasWidth: toInt(templateJson.canvas?.width, 1920),
        canvasHeight: toInt(templateJson.canvas?.height, 1080),
        backgroundSrc: templateJson.backgroundSrc ?? null,
        settingsJson: importSettings,
        isDefault: toBool(extra.isDefault, false),
        isActive: toBool(extra.isActive, true),
        createdBy,
        updatedBy: null,
      },
      { transaction: t }
    );

    const groupKeyToId = new Map();
    for (const g of groupsIn) {
      const key = g?.id || g?.key;
      if (!key) continue;

      const row = await EditorTemplateGroup.create(
        {
          templateId: tpl.id,
          key: String(key),
          x: toInt(g.x, 0),
          y: toInt(g.y, 0),
          locked: toBool(g.locked, false),
          visible: toBool(g.visible, true),
        },
        { transaction: t }
      );
      groupKeyToId.set(String(key), row.id);
    }

    for (const l of layersIn) {
      const layerKey = l?.id || l?.key;
      if (!layerKey) continue;

      const groupKey = l?.groupId || l?.groupKey || null;
      const groupId = groupKey ? groupKeyToId.get(String(groupKey)) || null : null;

      const layerRow = await EditorTemplateLayer.create(
        {
          templateId: tpl.id,
          groupId,
          key: String(layerKey),
          type: String(l.type),
          x: toInt(l.x, 0),
          y: toInt(l.y, 0),
          w: toInt(l.w, 100),
          h: toInt(l.h, 100),
          zIndex: toInt(l.zIndex, 1),
          name: l.name ?? null,
          visible: toBool(l.visible, true),
          locked: toBool(l.locked, false),
        },
        { transaction: t }
      );

      if (isPlainObject(l.props)) {
        for (const [propKey, rawValue] of Object.entries(l.props)) {
          const { valueType, valueText, valueJson } = splitPropValue(rawValue);
          await EditorLayerProp.create(
            {
              layerId: layerRow.id,
              propKey: String(propKey),
              valueType,
              valueText,
              valueJson,
            },
            { transaction: t }
          );
        }
      }

      const bindPayload = pickBindFields(l.bind);
      if (bindPayload) {
        await EditorLayerBind.create({ layerId: layerRow.id, ...bindPayload }, { transaction: t });
      }
    }

    await t.commit();
    return { templateId: tpl.id, groups: groupKeyToId.size, layers: layersIn.length, name: tpl.name };
  } catch (error) {
    await t.rollback();
    throw error;
  }
}

const { positional, flags } = parseArgs(process.argv.slice(2));
const defaultJson = path.resolve(
  __dirname,
  "../../../raptor/frontend/src/pages/eddeli/photoshop/templates/etiqueta-a4-producto-barcode.json"
);
const jsonPath = positional[0] || defaultJson;

function readTemplateJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function parsedMetaName(filePath) {
  try {
    const j = readTemplateJson(filePath);
    return j.meta?.name || j.name || "Template importado";
  } catch {
    return "Template importado";
  }
}

function parsedFormat(filePath) {
  try {
    const j = readTemplateJson(filePath);
    return j.format || j.meta?.format || null;
  } catch {
    return null;
  }
}

try {
  await sequelize.authenticate();

  const replaceId = flags["replace-id"] ? toInt(flags["replace-id"], 0) : 0;
  if (replaceId) {
    const deleted = await EditorTemplate.destroy({ where: { id: replaceId } });
    if (deleted) console.log(`🗑️  Plantilla id=${replaceId} reemplazada (eliminada).`);
    else console.log(`ℹ️  No existía plantilla id=${replaceId}; se creará nueva.`);
  } else {
    const existing = await EditorTemplate.findOne({
      where: { name: flags.name || "Etiquetas A4 EdDeli — 5×5 (1:1 + barras)" },
    });
    if (existing) {
      console.log(`ℹ️  Ya existe plantilla id=${existing.id} con ese nombre. Se creará otra copia.`);
    }
  }

  const result = await importTemplateFile(jsonPath, {
    name: flags.name || parsedMetaName(jsonPath),
    format: flags.format || parsedFormat(jsonPath) || "custom",
    app: flags.app || "EdDeli",
    isActive: true,
    isDefault: false,
    createdBy: 1,
  });

  console.log("✅ Plantilla importada:");
  console.log(JSON.stringify(result, null, 2));
  console.log(`\n→ Diseñar: /diseno-promocional/editor/${result.templateId}`);
  console.log(`→ Vista:   /diseno-promocional/vista?templateId=${result.templateId}`);

  await sequelize.close();
  process.exit(0);
} catch (error) {
  console.error("❌ Error importando:", error?.message || error);
  try {
    await sequelize.close();
  } catch {
    /* ignore */
  }
  process.exit(1);
}
