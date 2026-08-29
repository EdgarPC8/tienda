// controllers/EditorController.js
import { Op } from "sequelize";
import {
    EditorTemplate,
    EditorTemplateGroup,
    EditorTemplateLayer,
    EditorLayerProp,
    EditorLayerBind,
    EditorDesign,
    EditorDesignLayerOverride,
  } from "../../models/Editor.js";
import { sequelize } from "../../database/connection.js";
import { verifyJWT,getHeaderToken } from "../../libs/jwt.js";
import { notifyOk, notifyFail } from "../../services/notifyRaptorSolutions.js";
import { extractTemplateSettings, settingsToMeta } from "../../libs/templateSettings.js";



/**
 * Helpers mínimos (reutilizables)
 */
const toInt = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : d;
};

const toBool = (v, d = false) => {
  if (v === true || v === "true" || v === 1 || v === "1") return true;
  if (v === false || v === "false" || v === 0 || v === "0") return false;
  return d;
};

const propsRowsToObject = (rows = []) => {
  const out = {};
  for (const p of rows) {
    if (!p?.propKey) continue;
    if (p.valueType === "json") out[p.propKey] = p.valueJson;
    else if (p.valueType === "number") out[p.propKey] = Number(p.valueText);
    else if (p.valueType === "boolean") out[p.propKey] = String(p.valueText) === "true";
    else out[p.propKey] = p.valueText;
  }
  return out;
};

/**
 * =========================
 * TEMPLATES
 * =========================
 */
export const deleteTemplateLayer = async (req, res) => {
  const templateId = toInt(req.params.templateId, 0);
  const layerKey = String(req.params.layerKey || "").trim();

  if (!templateId || !layerKey) {
    notifyFail("editor.template_layer_delete_failed", "templateId y layerKey son requeridos", {
      req,
      httpStatus: 400,
    });
    return res.status(400).json({ message: "templateId y layerKey son requeridos" });
  }

  const token = getHeaderToken(req);
  try {
    await verifyJWT(token);
  } catch {
    notifyFail("editor.template_layer_delete_failed", "No autorizado", { req, httpStatus: 401 });
    return res.status(401).json({ message: "No autorizado" });
  }

  const t = await sequelize.transaction();
  try {
    // 1️⃣ buscar capa
    const layer = await EditorTemplateLayer.findOne({
      where: { templateId, key: layerKey },
      transaction: t,
    });

    if (!layer) {
      await t.rollback();
      notifyFail("editor.template_layer_delete_failed", "Capa no encontrada", {
        req,
        httpStatus: 404,
        extra: { templateId, layerKey },
      });
      return res.status(404).json({ message: "Capa no encontrada" });
    }

    const layerId = layer.id;

    // 2️⃣ borrar dependencias
    await EditorLayerProp.destroy({
      where: { layerId },
      transaction: t,
    });

    await EditorLayerBind.destroy({
      where: { layerId },
      transaction: t,
    });

    // overrides en diseños
    await EditorDesignLayerOverride.destroy({
      where: { layerKey },
      transaction: t,
    });

    // 3️⃣ borrar capa
    await layer.destroy({ transaction: t });

    await t.commit();
    notifyOk("editor.template_layer_deleted", `Capa ${layerKey} eliminada`, {
      templateId,
      layerKey,
    });
    return res.json({ message: "Capa eliminada correctamente", layerKey });
  } catch (error) {
    await t.rollback();
    console.error("deleteTemplateLayer error:", error);
    notifyFail("editor.template_layer_delete_failed", "Error eliminando capa", {
      error,
      req,
      httpStatus: 500,
      extra: { templateId, layerKey },
    });
    return res.status(500).json({ message: "Error eliminando capa" });
  }
};

export const updateTemplateDoc = async (req, res) => {
  const id = toInt(req.params.id, 0);

  const token = getHeaderToken(req);
  let user = null;
  try {
    user = await verifyJWT(token);
  } catch {
    notifyFail("editor.template_doc_update_failed", "No autorizado", { req, httpStatus: 401 });
    return res.status(401).json({ message: "No autorizado" });
  }
  const updatedBy = user?.accountId ? toInt(user.accountId, 0) : null;

  const doc = req.body?.doc;
  if (!doc || typeof doc !== "object") {
    notifyFail("editor.template_doc_update_failed", "doc requerido", { req, httpStatus: 400 });
    return res.status(400).json({ message: "doc requerido" });
  }

  const isPlainObject = (x) => x && typeof x === "object" && !Array.isArray(x);

  const groupsIn = Array.isArray(doc.groups) ? doc.groups : [];
  const layersIn = Array.isArray(doc.layers) ? doc.layers : [];

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

  const t = await sequelize.transaction();
  try {
    const tpl = await EditorTemplate.findByPk(id, { transaction: t });
    if (!tpl) {
      await t.rollback();
      notifyFail("editor.template_doc_update_failed", `Plantilla #${id} no encontrada`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "Template no encontrado" });
    }

    // 1) Update template base fields (canvas/background/name opcional)
    const patch = {};
    if (doc?.meta?.name != null) patch.name = String(doc.meta.name);
    if (doc?.canvas?.width != null) patch.canvasWidth = toInt(doc.canvas.width, tpl.canvasWidth);
    if (doc?.canvas?.height != null) patch.canvasHeight = toInt(doc.canvas.height, tpl.canvasHeight);
    if (doc?.backgroundSrc !== undefined) patch.backgroundSrc = doc.backgroundSrc ? String(doc.backgroundSrc) : null;
    if (updatedBy) patch.updatedBy = updatedBy;

    const settings = extractTemplateSettings({
      doc,
      layers: layersIn,
      backgroundSrc: doc?.backgroundSrc ?? tpl.backgroundSrc,
    });
    patch.settingsJson = settings;

    await tpl.update(patch, { transaction: t });

    // 2) BORRAR HIJOS (reemplazo completo)
    // OJO: Si no tienes ON DELETE CASCADE, primero props/bind de layers.
    const oldLayers = await EditorTemplateLayer.findAll({
      where: { templateId: tpl.id },
      transaction: t,
    });

    const oldLayerIds = oldLayers.map((x) => x.id);

    if (oldLayerIds.length) {
      await EditorLayerProp.destroy({ where: { layerId: oldLayerIds }, transaction: t });
      await EditorLayerBind.destroy({ where: { layerId: oldLayerIds }, transaction: t });
    }

    await EditorTemplateLayer.destroy({ where: { templateId: tpl.id }, transaction: t });
    await EditorTemplateGroup.destroy({ where: { templateId: tpl.id }, transaction: t });

    // 3) INSERT groups (map key -> id)
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

    // 4) INSERT layers + props + bind
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

      // props
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

      // bind
      const bindPayload = pickBindFields(l.bind);
      if (bindPayload) {
        await EditorLayerBind.create(
          { layerId: layerRow.id, ...bindPayload },
          { transaction: t }
        );
      }
    }

    await t.commit();
    notifyOk("editor.template_doc_updated", `Doc plantilla #${tpl.id}`, { templateId: tpl.id });
    return res.json({ message: "Template doc guardado", templateId: tpl.id });
  } catch (error) {
    await t.rollback();
    console.error("updateTemplateDoc error:", error);
    notifyFail("editor.template_doc_update_failed", `Error guardando doc plantilla #${id}`, {
      error,
      req,
      httpStatus: 500,
    });
    return res.status(500).json({ message: "Error guardando doc", error: String(error?.message || error) });
  }
};

/**
 * POST /editor/templates/import
 * body: templateJson (o el json directo)
 */
export const importTemplate = async (req, res) => {

  const token = getHeaderToken(req);
  let user = null;
  try {
    user = await verifyJWT(token);
  } catch (e) {
    notifyFail("editor.template_import_failed", "No autorizado", { req, httpStatus: 401 });
    return res.status(401).json({ message: "No autorizado" });
  }
  const templateJson = req.body?.templateJson ?? req.body;
  const createdBy= user.accountId;

  const isPlainObject = (x) => x && typeof x === "object" && !Array.isArray(x);

  if (!templateJson || !isPlainObject(templateJson)) {
    notifyFail("editor.template_import_failed", "templateJson inválido", { req, httpStatus: 400 });
    return res.status(400).json({ message: "templateJson inválido" });
  }
  if (!createdBy) {
    notifyFail("editor.template_import_failed", "createdBy requerido", { req, httpStatus: 400 });
    return res.status(400).json({ message: "createdBy requerido (o req.user.id)" });
  }

  const groupsIn = Array.isArray(templateJson.groups) ? templateJson.groups : [];
  const layersIn = Array.isArray(templateJson.layers) ? templateJson.layers : [];

  // infer props value type
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

  const importSettings = extractTemplateSettings({
    body: req.body,
    templateJson,
    layers: layersIn,
    backgroundSrc: templateJson.backgroundSrc ?? null,
  });

  const t = await sequelize.transaction();
  try {
    // 1) Template
    const tpl = await EditorTemplate.create(
      {
        name: templateJson.name || req.body?.name || "Template sin nombre",
        app: templateJson.app ?? req.body?.app ?? null,
        format: templateJson.format ?? req.body?.format ?? null,
        canvasWidth: toInt(templateJson.canvas?.width, 1920),
        canvasHeight: toInt(templateJson.canvas?.height, 1080),
        backgroundSrc: templateJson.backgroundSrc ?? null,
        settingsJson: importSettings,
        isDefault: toBool(templateJson.isDefault, false),
        isActive: toBool(templateJson.isActive, true),
        createdBy,
        updatedBy: null,
      },
      { transaction: t }
    );

    // Si llega isDefault=true, apagar otros defaults del mismo app+format
    if (tpl.isDefault && tpl.app && tpl.format) {
      await EditorTemplate.update(
        { isDefault: false },
        {
          where: {
            id: { [Op.ne]: tpl.id },
            app: tpl.app,
            format: tpl.format,
          },
          transaction: t,
        }
      );
    }

    // 2) Groups (map key -> id)
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

    // 3) Layers + props + bind
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

      // props
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

      // bind
      const bindPayload = pickBindFields(l.bind);
      if (bindPayload) {
        await EditorLayerBind.create(
          { layerId: layerRow.id, ...bindPayload },
          { transaction: t }
        );
      }
    }

    await t.commit();
    notifyOk("editor.template_imported", "Plantilla importada", {
      templateId: tpl.id,
      groups: groupKeyToId.size,
      layers: layersIn.length,
    });
    return res.json({
      message: "Template importado con éxito",
      templateId: tpl.id,
      groups: groupKeyToId.size,
      layers: layersIn.length,
    });
  } catch (error) {
    await t.rollback();
    console.error("importTemplate error:", error);
    notifyFail("editor.template_import_failed", "Error importando template", {
      error,
      req,
      httpStatus: 500,
    });
    return res.status(500).json({
      message: "Error importando template",
      error: String(error?.message || error),
    });
  }
};

export const listTemplates = async (req, res) => {
  try {
    const { app, format, isActive, isDefault, q } = req.query;

    const where = {};
    if (app) where.app = String(app);
    if (format) where.format = String(format);
    if (isActive != null) where.isActive = toBool(isActive, true);

    // ✅ filtro default
    if (isDefault != null) where.isDefault = toBool(isDefault, false);

    // ✅ búsqueda por nombre/id opcional
    if (q) {
      const s = String(q).trim();
      if (s) {
        where[Op.or] = [
          { name: { [Op.like]: `%${s}%` } },
          // id en LIKE funciona si tu dialecto lo permite; si no, quítalo
          { id: { [Op.like]: `%${s}%` } },
        ];
      }
    }

    const rows = await EditorTemplate.findAll({
      where,
      // ✅ default primero, luego más recientes
      order: [
        ["isDefault", "DESC"],
        ["updatedAt", "DESC"],
        ["id", "DESC"],
      ],
    });

    res.json(rows);
  } catch (error) {
    console.error("listTemplates error:", error);
    res.status(500).json({ message: "Error listando templates" });
  }
};


export const getTemplateById = async (req, res) => {
  try {
    const id = toInt(req.params.id, 0);

    const row = await EditorTemplate.findByPk(id, {
      include: [
        { model: EditorTemplateGroup, as: "groups" },
        {
          model: EditorTemplateLayer, as: "layers",
          include: [
            { model: EditorLayerProp, as: "props" },
            { model: EditorLayerBind, as: "bind" },
            // para que l.group?.key funcione
            { model: EditorTemplateGroup, as: "group" },
          ],
        },
      ],
    });

    if (!row) return res.status(404).json({ message: "Template no encontrado" });
    res.json(row);
  } catch (error) {
    console.error("getTemplateById error:", error);
    res.status(500).json({ message: "Error leyendo template" });
  }
};

export const updateTemplate = async (req, res) => {
  const id = toInt(req.params.id, 0);

  const token = getHeaderToken(req);
  let user = null;
  try {
    user = await verifyJWT(token);
  } catch (e) {
    notifyFail("editor.template_update_failed", "No autorizado", { req, httpStatus: 401 });
    return res.status(401).json({ message: "No autorizado" });
  }

  const updatedBy = user?.accountId ? toInt(user.accountId, 0) : 0;

  const doc = req.body?.doc; // 👈 doc completo

  const isPlainObject = (x) => x && typeof x === "object" && !Array.isArray(x);

  // helper: absolute -> relative (corta /img/)
  const toRelativeImgPath = (v = "") => {
    if (!v) return v;
    const s = String(v);
    if (!/^https?:\/\//i.test(s)) return s;
    const idx = s.indexOf("/img/");
    if (idx === -1) return s;
    return s.slice(idx + 5);
  };

  // infer props
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

  try {
    const tpl = await EditorTemplate.findByPk(id);
    if (!tpl) {
      notifyFail("editor.template_update_failed", `Plantilla #${id} no encontrada`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "Template no encontrado" });
    }

    const t = await sequelize.transaction();
    try {
      // =========================
      // A) Si llega doc -> reescribir TODO
      // =========================
      if (doc && isPlainObject(doc)) {
        const groupsIn = Array.isArray(doc.groups) ? doc.groups : [];
        const layersIn = Array.isArray(doc.layers) ? doc.layers : [];

        const patchTpl = {
          name: doc?.meta?.name ?? tpl.name,
          app: doc.app ?? tpl.app ?? null,
          format: doc.format ?? tpl.format ?? null,
          canvasWidth: toInt(doc?.canvas?.width, tpl.canvasWidth || 1920),
          canvasHeight: toInt(doc?.canvas?.height, tpl.canvasHeight || 1080),
          backgroundSrc: doc.backgroundSrc ? toRelativeImgPath(doc.backgroundSrc) : null,
          settingsJson: extractTemplateSettings({
            doc,
            layers: layersIn,
            backgroundSrc: doc.backgroundSrc ?? tpl.backgroundSrc,
          }),
          updatedBy: updatedBy || null,
        };

        await tpl.update(patchTpl, { transaction: t });

        // borrar dependencias (layers -> props/bind)
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

        // insertar groups
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

        // insertar layers + props + bind
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

          // props (si es image y viene src absoluto -> relativo)
          if (isPlainObject(l.props)) {
            const entries = Object.entries(l.props).map(([k, v]) => {
              if (k === "src") return [k, toRelativeImgPath(v)];
              return [k, v];
            });

            for (const [propKey, rawValue] of entries) {
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
            await EditorLayerBind.create(
              { layerId: layerRow.id, ...bindPayload },
              { transaction: t }
            );
          }
        }

        await t.commit();
        notifyOk("editor.template_updated", `Plantilla #${tpl.id}`, { templateId: tpl.id });
        return res.json({ message: "Template guardado (doc completo)", templateId: tpl.id });
      }

      // =========================
      // B) Si NO llega doc -> patch normal (tu lógica anterior)
      // =========================
      const patch = {};
      if (req.body.name != null) patch.name = String(req.body.name);
      if (req.body.app != null) patch.app = req.body.app ? String(req.body.app) : null;
      if (req.body.format != null) patch.format = req.body.format ? String(req.body.format) : null;

      if (req.body.canvasWidth != null) patch.canvasWidth = toInt(req.body.canvasWidth, tpl.canvasWidth);
      if (req.body.canvasHeight != null) patch.canvasHeight = toInt(req.body.canvasHeight, tpl.canvasHeight);

      if (req.body.backgroundSrc != null)
        patch.backgroundSrc = req.body.backgroundSrc ? toRelativeImgPath(req.body.backgroundSrc) : null;

      if (req.body.isActive != null) patch.isActive = toBool(req.body.isActive, tpl.isActive);
      if (req.body.isDefault != null) patch.isDefault = toBool(req.body.isDefault, tpl.isDefault);

      if (
        req.body.templateKind != null ||
        req.body.requiresProduct != null ||
        req.body.backgroundMode != null ||
        req.body.settingsJson != null
      ) {
        patch.settingsJson = extractTemplateSettings({
          body: {
            settingsJson: {
              ...(tpl.settingsJson || {}),
              ...(req.body.settingsJson || {}),
            },
            templateKind: req.body.templateKind ?? tpl.settingsJson?.templateKind,
            requiresProduct: req.body.requiresProduct ?? tpl.settingsJson?.requiresProduct,
            backgroundMode: req.body.backgroundMode ?? tpl.settingsJson?.backgroundMode,
          },
          layers: tpl.layers || [],
          backgroundSrc: patch.backgroundSrc ?? tpl.backgroundSrc,
        });
      }

      if (updatedBy) patch.updatedBy = updatedBy;

      await tpl.update(patch, { transaction: t });

      await t.commit();
      notifyOk("editor.template_updated", `Plantilla #${tpl.id}`, { templateId: tpl.id });
      return res.json({ message: "Template actualizado", template: tpl });
    } catch (e) {
      await t.rollback();
      throw e;
    }
  } catch (error) {
    console.error("updateTemplate error:", error);
    notifyFail("editor.template_update_failed", `Error actualizando plantilla #${id}`, {
      error,
      req,
      httpStatus: 500,
    });
    return res.status(500).json({ message: "Error actualizando template" });
  }
};


// ✅ helper: arma doc en formato editor desde el template Sequelize con includes
const buildResolvedDocFromTemplateRow = (templateRow) => {
  const groups = (templateRow.groups || []).map((g) => ({
    id: g.key,
    x: g.x,
    y: g.y,
    locked: g.locked,
    visible: g.visible,
  }));

  const layers = (templateRow.layers || [])
    .map((l) => ({
      id: l.key,
      groupId: l.group?.key || null,
      type: l.type,
      x: l.x,
      y: l.y,
      w: l.w,
      h: l.h,
      zIndex: l.zIndex,
      name: l.name,
      visible: l.visible,
      locked: l.locked,
      props: propsRowsToObject(l.props || []),
      bind: l.bind
        ? {
            textFrom: l.bind.textFrom,
            srcFrom: l.bind.srcFrom,
            srcPrefix: l.bind.srcPrefix,
            fallbackSrc: l.bind.fallbackSrc,
            maxLen: l.bind.maxLen,
          }
        : undefined,
    }))
    .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

  const settings = extractTemplateSettings({
    body: { settingsJson: templateRow.settingsJson },
    layers,
    backgroundSrc: templateRow.backgroundSrc,
  });

  return {
    canvas: { width: templateRow.canvasWidth, height: templateRow.canvasHeight },
    backgroundSrc: templateRow.backgroundSrc,
    meta: {
      name: templateRow.name,
      ...settingsToMeta(settings),
    },
    groups,
    layers,
  };
};

const templateSummaryFromRow = (row) => {
  const settings = extractTemplateSettings({
    body: { settingsJson: row.settingsJson },
    layers: row.layers || [],
    backgroundSrc: row.backgroundSrc,
  });
  return {
    id: row.id,
    name: row.name,
    app: row.app,
    format: row.format,
    isDefault: row.isDefault,
    isActive: row.isActive,
    settingsJson: settings,
    ...settings,
  };
};

// ✅ GET /editor/templates/:id/resolved
export const getTemplateResolvedById = async (req, res) => {
  try {
    const id = toInt(req.params.id, 0);

    const row = await EditorTemplate.findByPk(id, {
      include: [
        { model: EditorTemplateGroup, as: "groups" },
        {
          model: EditorTemplateLayer,
          as: "layers",
          include: [
            { model: EditorLayerProp, as: "props" },
            { model: EditorLayerBind, as: "bind" },
            { model: EditorTemplateGroup, as: "group" },
          ],
        },
      ],
    });

    if (!row) return res.status(404).json({ message: "Template no encontrado" });
    if (row.isActive === false) return res.status(404).json({ message: "Template inactivo" });

    const resolved = buildResolvedDocFromTemplateRow(row);

    return res.json({
      templateId: row.id,
      template: templateSummaryFromRow(row),
      resolved,
    });
  } catch (error) {
    console.error("getTemplateResolvedById error:", error);
    return res.status(500).json({ message: "Error resolviendo template" });
  }
};

// ✅ GET /editor/templates/default?app=EdDeli&format=16:9
export const getDefaultTemplateResolved = async (req, res) => {
  try {
    const app = req.query?.app ? String(req.query.app) : null;
    const format = req.query?.format ? String(req.query.format) : null;

    const whereDefault = { isActive: true, isDefault: true };
    if (app) whereDefault.app = app;
    if (format) whereDefault.format = format;

    // 1) intenta default activo
    let row = await EditorTemplate.findOne({
      where: whereDefault,
      order: [["updatedAt", "DESC"]],
      include: [
        { model: EditorTemplateGroup, as: "groups" },
        {
          model: EditorTemplateLayer,
          as: "layers",
          include: [
            { model: EditorLayerProp, as: "props" },
            { model: EditorLayerBind, as: "bind" },
            { model: EditorTemplateGroup, as: "group" },
          ],
        },
      ],
    });

    // 2) fallback: primero activo (por app/format si vienen)
    if (!row) {
      const whereAny = { isActive: true };
      if (app) whereAny.app = app;
      if (format) whereAny.format = format;

      row = await EditorTemplate.findOne({
        where: whereAny,
        order: [["id", "DESC"]],
        include: [
          { model: EditorTemplateGroup, as: "groups" },
          {
            model: EditorTemplateLayer,
            as: "layers",
            include: [
              { model: EditorLayerProp, as: "props" },
              { model: EditorLayerBind, as: "bind" },
              { model: EditorTemplateGroup, as: "group" },
            ],
          },
        ],
      });
    }

    if (!row) return res.status(404).json({ message: "No hay templates activos" });

    const resolved = buildResolvedDocFromTemplateRow(row);

    return res.json({
      templateId: row.id,
      template: templateSummaryFromRow(row),
      resolved,
    });
  } catch (error) {
    console.error("getDefaultTemplateResolved error:", error);
    return res.status(500).json({ message: "Error trayendo default" });
  }
};



export const deleteTemplate = async (req, res) => {
  try {
    const id = toInt(req.params.id, 0);

    const tpl = await EditorTemplate.findByPk(id);
    if (!tpl) {
      notifyFail("editor.template_delete_failed", `Plantilla #${id} no encontrada`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "Template no encontrado" });
    }

    await tpl.destroy();
    notifyOk("editor.template_deleted", `Plantilla #${id}`, { templateId: id });
    res.json({ message: "Template eliminado" });
  } catch (error) {
    console.error("deleteTemplate error:", error);
    notifyFail("editor.template_delete_failed", `Error eliminando plantilla #${req.params.id}`, {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "Error eliminando template" });
  }
};

/**
 * =========================
 * DESIGNS + OVERRIDES
 * =========================
 */

export const createDesign = async (req, res) => {
  try {
    // Payload JWT: accountId (AuthController), no req.user.id
    const createdBy = toInt(req.user?.accountId || req.body?.createdBy, 0);
    const templateId = toInt(req.body?.templateId, 0);

    if (!createdBy) {
      notifyFail("editor.design_create_failed", "createdBy requerido", { req, httpStatus: 400 });
      return res.status(400).json({ message: "createdBy requerido" });
    }
    if (!templateId) {
      notifyFail("editor.design_create_failed", "templateId requerido", { req, httpStatus: 400 });
      return res.status(400).json({ message: "templateId requerido" });
    }

    const tpl = await EditorTemplate.findByPk(templateId);
    if (!tpl) {
      notifyFail("editor.design_create_failed", "Template no existe", { req, httpStatus: 404 });
      return res.status(404).json({ message: "Template no existe" });
    }

    const row = await EditorDesign.create({
      templateId,
      name: req.body?.name || "Diseño sin nombre",
      targetType: req.body?.targetType || "custom",
      targetId: req.body?.targetId != null ? toInt(req.body.targetId, null) : null,
      dataJson: req.body?.dataJson ?? null,
      exportedUrl: null,
      isActive: toBool(req.body?.isActive, true),
      createdBy,
      updatedBy: null,
    });

    notifyOk("editor.design_created", "Diseño creado", { designId: row.id, templateId });
    res.json({ message: "Design creado", design: row });
  } catch (error) {
    console.error("createDesign error:", error);
    notifyFail("editor.design_create_failed", "Error creando design", { error, req, httpStatus: 500 });
    res.status(500).json({ message: "Error creando design" });
  }
};

export const updateDesign = async (req, res) => {
  try {
    const id = toInt(req.params.id, 0);
    const updatedBy = toInt(req.user?.accountId || req.body?.updatedBy, 0);

    const row = await EditorDesign.findByPk(id);
    if (!row) {
      notifyFail("editor.design_update_failed", `Design #${id} no encontrado`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "Design no encontrado" });
    }

    const patch = {};
    if (req.body.name != null) patch.name = String(req.body.name);
    if (req.body.dataJson !== undefined) patch.dataJson = req.body.dataJson;
    if (req.body.exportedUrl != null) patch.exportedUrl = req.body.exportedUrl ? String(req.body.exportedUrl) : null;
    if (req.body.isActive != null) patch.isActive = toBool(req.body.isActive, row.isActive);
    if (updatedBy) patch.updatedBy = updatedBy;

    await row.update(patch);
    notifyOk("editor.design_updated", `Diseño #${id}`, { designId: id });
    res.json({ message: "Design actualizado", design: row });
  } catch (error) {
    console.error("updateDesign error:", error);
    notifyFail("editor.design_update_failed", `Error actualizando design #${req.params.id}`, {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "Error actualizando design" });
  }
};

export const upsertOverride = async (req, res) => {
  const designId = toInt(req.params.id, 0);
  const layerKey = String(req.body?.layerKey || "").trim();

  if (!designId || !layerKey) {
    notifyFail("editor.override_upsert_failed", "designId y layerKey son requeridos", {
      req,
      httpStatus: 400,
    });
    return res.status(400).json({ message: "designId y layerKey son requeridos" });
  }

  const payload = {
    designId,
    layerKey,
    x: req.body.x != null ? toInt(req.body.x, null) : null,
    y: req.body.y != null ? toInt(req.body.y, null) : null,
    w: req.body.w != null ? toInt(req.body.w, null) : null,
    h: req.body.h != null ? toInt(req.body.h, null) : null,
    zIndex: req.body.zIndex != null ? toInt(req.body.zIndex, null) : null,
    visible: req.body.visible != null ? toBool(req.body.visible, null) : null,
    locked: req.body.locked != null ? toBool(req.body.locked, null) : null,
    propsJson: req.body.propsJson ?? null,
    bindJson: req.body.bindJson ?? null,
  };

  const t = await sequelize.transaction();
  try {
    const design = await EditorDesign.findByPk(designId, { transaction: t });
    if (!design) {
      await t.rollback();
      notifyFail("editor.override_upsert_failed", `Design #${designId} no encontrado`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "Design no encontrado" });
    }

    const [row, created] = await EditorDesignLayerOverride.findOrCreate({
      where: { designId, layerKey },
      defaults: payload,
      transaction: t,
    });

    if (!created) await row.update(payload, { transaction: t });

    await t.commit();
    notifyOk("editor.override_upserted", `Override diseño #${designId}`, {
      designId,
      layerKey,
    });
    res.json({ message: "Override guardado", override: row });
  } catch (error) {
    await t.rollback();
    console.error("upsertOverride error:", error);
    notifyFail("editor.override_upsert_failed", `Error guardando override design #${designId}`, {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "Error guardando override" });
  }
};

export const getDesignResolved = async (req, res) => {
  try {
    const id = toInt(req.params.id, 0);

    const design = await EditorDesign.findByPk(id, {
      include: [{ model: EditorDesignLayerOverride, as: "overrides" }],
    });
    if (!design) return res.status(404).json({ message: "Design no encontrado" });

    const template = await EditorTemplate.findByPk(design.templateId, {
      include: [
        { model: EditorTemplateGroup, as: "groups" },
        {
          model: EditorTemplateLayer,
          as: "layers",
          include: [
            { model: EditorLayerProp, as: "props" },
            { model: EditorLayerBind, as: "bind" },
            { model: EditorTemplateGroup, as: "group" },
          ],
        },
      ],
    });

    if (!template) return res.status(404).json({ message: "Template no encontrado" });

    // map overrides por layerKey
    const overrideMap = new Map();
    for (const o of design.overrides || []) overrideMap.set(o.layerKey, o);

    // merge layer inline (sin helper grande)
    const mergeLayer = (baseLayer, overrideRow) => {
      const out = JSON.parse(JSON.stringify(baseLayer));
      if (!overrideRow) return out;

      const fields = ["x", "y", "w", "h", "zIndex", "visible", "locked"];
      for (const f of fields) {
        if (overrideRow[f] !== null && overrideRow[f] !== undefined) out[f] = overrideRow[f];
      }

      if (overrideRow.propsJson && typeof overrideRow.propsJson === "object") {
        out.props = { ...(out.props || {}), ...overrideRow.propsJson };
      }
      if (overrideRow.bindJson && typeof overrideRow.bindJson === "object") {
        out.bind = { ...(out.bind || {}), ...overrideRow.bindJson };
      }
      return out;
    };

    const groups = (template.groups || []).map((g) => ({
      id: g.key,
      x: g.x,
      y: g.y,
      locked: g.locked,
      visible: g.visible,
    }));

    const layersBase = (template.layers || []).map((l) => ({
      id: l.key,
      groupId: l.group?.key || null,
      type: l.type,
      x: l.x,
      y: l.y,
      w: l.w,
      h: l.h,
      zIndex: l.zIndex,
      name: l.name,
      visible: l.visible,
      locked: l.locked,
      props: propsRowsToObject(l.props || []),
      bind: l.bind
        ? {
            textFrom: l.bind.textFrom,
            srcFrom: l.bind.srcFrom,
            srcPrefix: l.bind.srcPrefix,
            fallbackSrc: l.bind.fallbackSrc,
            maxLen: l.bind.maxLen,
          }
        : undefined,
    }));

    const layers = layersBase
      .map((l) => mergeLayer(l, overrideMap.get(l.id)))
      .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

    const resolved = {
      canvas: { width: template.canvasWidth, height: template.canvasHeight },
      backgroundSrc: template.backgroundSrc,
      groups,
      layers,
    };

    res.json({ design, resolved });
  } catch (error) {
    console.error("getDesignResolved error:", error);
    res.status(500).json({ message: "Error obteniendo design resuelto" });
  }
};
