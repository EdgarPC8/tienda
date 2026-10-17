/**
 * Aplica doc de etiqueta unitaria EdDeli a plantilla #6 (o --id N).
 * Recorta imágenes compuestas si hace falta y actualiza BD.
 *
 * Uso:
 *   node scripts/apply-etiqueta-unitaria-template.js [--id 6]
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
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
const BACKEND_ROOT = path.join(__dirname, "..");
const CAPAS_DIR = path.join(BACKEND_ROOT, "src/img/sistema/diseno-promocional/capas");
const DOC_JSON = path.join(
  BACKEND_ROOT,
  "../../raptor/frontend/src/pages/eddeli/photoshop/templates/etiqueta-unitaria-eddeli.json"
);

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

function findCompositeSource() {
  const logoPath = path.join(CAPAS_DIR, "etiqueta_logo_eddeli.png");
  const footerPath = path.join(CAPAS_DIR, "etiqueta_footer_eddeli.png");
  if (fs.existsSync(logoPath) && fs.existsSync(footerPath)) {
    return { logoPath, footerPath, alreadySplit: true };
  }

  const pngs = fs
    .readdirSync(CAPAS_DIR)
    .filter((f) => f.endsWith(".png") && !f.startsWith("etiqueta_"))
    .map((f) => ({ f, p: path.join(CAPAS_DIR, f), m: fs.statSync(path.join(CAPAS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);

  if (!pngs.length) throw new Error("No hay PNG en capas/ para recortar");

  const src = pngs[0].p;
  const py = `
from PIL import Image
im=Image.open(${JSON.stringify(src)})
w,h=im.size
logo=im.crop((0,0,w,int(h*0.55)))
footer=im.crop((0,int(h*0.68),w,h))
logo.save(${JSON.stringify(logoPath)})
footer.save(${JSON.stringify(footerPath)})
print(w,h)
`;
  execSync(`python3 -c ${JSON.stringify(py)}`, { stdio: "inherit" });
  return { logoPath, footerPath, source: src, alreadySplit: false };
}

async function replaceTemplateDoc(templateId, doc) {
  const tpl = await EditorTemplate.findByPk(templateId);
  if (!tpl) throw new Error(`Plantilla #${templateId} no encontrada`);

  const groupsIn = Array.isArray(doc.groups) ? doc.groups : [];
  const layersIn = Array.isArray(doc.layers) ? doc.layers : [];

  const t = await sequelize.transaction();
  try {
    await tpl.update(
      {
        name: doc?.meta?.name ?? tpl.name,
        canvasWidth: toInt(doc?.canvas?.width, tpl.canvasWidth),
        canvasHeight: toInt(doc?.canvas?.height, tpl.canvasHeight),
        settingsJson: extractTemplateSettings({ doc, layers: layersIn }),
        updatedBy: 1,
      },
      { transaction: t }
    );

    const oldLayers = await EditorTemplateLayer.findAll({
      where: { templateId: tpl.id },
      attributes: ["id"],
      transaction: t,
    });
    const oldLayerIds = oldLayers.map((x) => x.id);
    if (oldLayerIds.length) {
      await EditorLayerProp.destroy({ where: { layerId: oldLayerIds }, transaction: t });
      await EditorLayerBind.destroy({ where: { layerId: oldLayerIds }, transaction: t });
    }
    await EditorTemplateLayer.destroy({ where: { templateId: tpl.id }, transaction: t });
    await EditorTemplateGroup.destroy({ where: { templateId: tpl.id }, transaction: t });

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
    return tpl.id;
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

async function main() {
  const templateId = toInt(process.argv.find((a, i) => process.argv[i - 1] === "--id") || "6", 6);

  console.log("=== Etiqueta unitaria EdDeli ===");
  const split = findCompositeSource();
  console.log(split.alreadySplit ? "Imágenes ya recortadas" : `Recortado desde ${split.source}`);

  const doc = JSON.parse(fs.readFileSync(DOC_JSON, "utf8"));
  const id = await replaceTemplateDoc(templateId, doc);

  console.log(`✅ Plantilla #${id} actualizada`);
  console.log(`   Logo:  diseno-promocional/capas/etiqueta_logo_eddeli.png`);
  console.log(`   Pie:   diseno-promocional/capas/etiqueta_footer_eddeli.png`);
  console.log(`   Texto: product.id`);
  console.log(`   Editor: /diseno-promocional/editor/${id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => sequelize.close());
