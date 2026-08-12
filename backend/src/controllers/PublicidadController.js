/**
 * Publicidad — campañas, playlist en BD y catálogo de medios.
 */
import path from "path";
import fsp from "fs/promises";
import fileDirName from "../libs/file-dirname.js";
import { sequelize } from "../database/connection.js";
import {
  notifyPublicidadCampaignUpdated,
  notifyPublicidadDeviceUpdated,
} from "../sockets/publicidadSocket.js";
import {
  PublicidadCampaign,
  PublicidadPlaylistItem,
  PublicidadDevice,
} from "../models/Publicidad.js";
import { InventoryProduct, InventoryCategory } from "../models/Inventory.js";
import { buildMediaCatalog } from "../services/mediaCatalogService.js";
import { notifyOk, notifyFail } from "../services/notifyRaptorSolutions.js";

const { __dirname } = fileDirName(import.meta);
const IMG_BASE = path.resolve(__dirname, "../img");
const FILES_BASE = path.resolve(__dirname, "../files");

const TEMPLATE_TRANSITION_IN = "fade";
const TEMPLATE_TRANSITION_OUT = "fade";
const DEFAULT_DURATION_SEC = 8;
const TITLE_FONT_MIN = 28;
const TITLE_FONT_MAX = 120;

function normalizeTitleFontSize(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(TITLE_FONT_MAX, Math.max(TITLE_FONT_MIN, Math.round(n)));
}

const TITLE_FONT_STYLES = new Set(["default", "rounded", "outline", "shadow3d", "rounded3d"]);

function normalizeTitleFontStyle(value) {
  if (value == null || value === "") return null;
  const s = String(value).trim().toLowerCase();
  return TITLE_FONT_STYLES.has(s) ? s : null;
}

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
const VIDEO_EXT = new Set([".mp4", ".webm", ".mov", ".m4v"]);
const MUSIC_MODES = new Set(["none", "single_loop", "playlist_loop"]);

const PLAYLIST_INCLUDE = {
  model: PublicidadPlaylistItem,
  as: "playlistItems",
  separate: true,
  order: [["sortOrder", "ASC"]],
};

const slideUid = () =>
  `slide_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

async function walkFiles(baseDir, folderRel = "", maxDepth = 6, filterExt = null) {
  const rootFull = path.resolve(baseDir, folderRel);
  if (!rootFull.startsWith(baseDir)) return [];

  const walk = async (dirFull, dirRel, depth) => {
    if (depth > maxDepth) return [];
    const entries = await fsp.readdir(dirFull, { withFileTypes: true }).catch(() => []);
    const out = [];
    for (const ent of entries) {
      const full = path.join(dirFull, ent.name);
      const rel = path.join(dirRel, ent.name).replace(/\\/g, "/");
      if (rel.includes("..")) continue;
      if (ent.isDirectory()) {
        out.push(...(await walk(full, rel, depth + 1)));
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase();
        if (filterExt && !filterExt.has(ext)) continue;
        out.push({ relPath: rel, name: ent.name, ext });
      }
    }
    return out;
  };

  const exists = await fsp.stat(rootFull).catch(() => null);
  if (!exists?.isDirectory()) return [];
  return walk(rootFull, folderRel.replace(/^\/+/, ""), 0);
}

/** MySQL puede devolver JSON/LONGTEXT como string — normalizar antes de usar. */
function parseMenuItemsRaw(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeMenuItems(raw = []) {
  const list = parseMenuItemsRaw(raw);
  return list.map((item, i) => ({
    id: item.id || `menu_item_${i}`,
    contentType: item.contentType || "product",
    contentId: item.contentId ?? null,
    title: String(item.title || "Producto").slice(0, 200),
    subtitle: item.subtitle ? String(item.subtitle).slice(0, 300) : "",
    mediaPath: item.mediaPath ? String(item.mediaPath).replace(/^\/+/, "") : null,
    price: item.price != null ? Number(item.price) : null,
  }));
}

function normalizeMusicMode(value) {
  const mode = String(value || "none").trim().toLowerCase();
  return MUSIC_MODES.has(mode) ? mode : "none";
}

function normalizeMusicTracks(raw = []) {
  const list = parseMenuItemsRaw(raw);
  return list
    .map((item, index) => ({
      id: item.id || `track_${index}_${Date.now().toString(36)}`,
      title: String(item.title || "Pista").slice(0, 200),
      mediaPath: item.mediaPath ? String(item.mediaPath).replace(/^\/+/, "") : null,
      durationSeconds:
        item.durationSeconds != null && Number.isFinite(Number(item.durationSeconds))
          ? Math.max(1, Math.round(Number(item.durationSeconds)))
          : null,
      order: index,
    }))
    .filter((t) => t.mediaPath);
}

function normalizePlaylist(raw = []) {
  const list = Array.isArray(raw) ? raw : [];
  return list.map((item, index) => {
    const contentType = item.contentType || "image";
    const isVideo = contentType === "video";
    const maxDur = isVideo ? 600 : 120;
    const defaultDur = isVideo ? 60 : DEFAULT_DURATION_SEC;
    const base = {
      id: item.id || item.slideKey || slideUid(),
      contentType,
      contentId: item.contentId ?? null,
      title: String(item.title || "Sin título").slice(0, 200),
      subtitle: item.subtitle ? String(item.subtitle).slice(0, 300) : "",
      mediaPath: item.mediaPath ? String(item.mediaPath).replace(/^\/+/, "") : null,
      price: item.price != null ? Number(item.price) : null,
      durationSeconds: Math.min(
        maxDur,
        Math.max(3, Number(item.durationSeconds) || defaultDur),
      ),
      transitionIn: TEMPLATE_TRANSITION_IN,
      transitionOut: TEMPLATE_TRANSITION_OUT,
      titleFontSize: normalizeTitleFontSize(item.titleFontSize),
      titleFontStyle: normalizeTitleFontStyle(item.titleFontStyle),
      order: index,
    };
    if (contentType === "menu") {
      base.menuItems = normalizeMenuItems(item.menuItems);
    }
    return base;
  });
}

function playlistFromCampaignRow(c) {
  const items = c.playlistItems || [];
  return normalizePlaylist(
    items.map((item) => ({
      id: item.slideKey || String(item.id),
      contentType: item.contentType,
      contentId: item.contentId,
      title: item.title,
      subtitle: item.subtitle,
      mediaPath: item.mediaPath,
      price: item.price != null ? Number(item.price) : null,
      durationSeconds: item.durationSeconds,
      transitionIn: item.transitionIn,
      transitionOut: item.transitionOut,
      titleFontSize: item.titleFontSize ?? null,
      titleFontStyle: item.titleFontStyle ?? null,
      order: item.sortOrder,
      menuItems:
        item.contentType === "menu" ? parseMenuItemsRaw(item.menuItems) : undefined,
    })),
  );
}

function campaignToJson(row) {
  const c = row.toJSON ? row.toJSON() : row;
  const musicTracks = normalizeMusicTracks(c.musicTracks);
  const musicMode = normalizeMusicMode(c.musicMode);
  return {
    id: String(c.id),
    name: c.name,
    description: c.description || "",
    status: c.status,
    screenIds: Array.isArray(c.screenIds) ? c.screenIds : [],
    loop: c.loop !== false,
    musicMode: musicMode === "none" || !musicTracks.length ? "none" : musicMode,
    musicTracks,
    playlist: playlistFromCampaignRow(c),
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

async function replacePlaylistItems(campaignId, playlist, transaction) {
  const normalized = normalizePlaylist(playlist);
  await PublicidadPlaylistItem.destroy({ where: { campaignId }, transaction });
  if (!normalized.length) return;

  await PublicidadPlaylistItem.bulkCreate(
    normalized.map((item, index) => ({
      campaignId,
      slideKey: item.id,
      contentType: item.contentType,
      contentId: item.contentId != null ? String(item.contentId) : null,
      title: item.title,
      subtitle: item.subtitle || "",
      mediaPath: item.mediaPath,
      price: item.price,
      durationSeconds: item.durationSeconds,
      transitionIn: item.transitionIn,
      transitionOut: item.transitionOut,
      titleFontSize: item.titleFontSize ?? null,
      titleFontStyle: item.titleFontStyle ?? null,
      sortOrder: index,
      menuItems: item.contentType === "menu" ? item.menuItems || [] : null,
    })),
    { transaction },
  );
}

async function loadCampaign(id) {
  return PublicidadCampaign.findByPk(id, { include: [PLAYLIST_INCLUDE] });
}

const DEVICE_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

function normalizeDeviceId(raw) {
  const id = String(raw || "").trim();
  if (!id || !DEVICE_ID_RE.test(id)) return null;
  return id.toLowerCase();
}

const DEVICE_INCLUDE = {
  model: PublicidadCampaign,
  as: "campaign",
  attributes: ["id", "name", "status"],
};

function deviceToJson(row) {
  const d = row.toJSON ? row.toJSON() : row;
  const campaign = d.campaign;
  return {
    id: d.id,
    deviceId: d.deviceId,
    label: d.label || "",
    status: d.status,
    campaignId: d.campaignId ?? null,
    campaignName: campaign?.name || null,
    campaignStatus: campaign?.status || null,
    lastSeenAt: d.lastSeenAt,
    notes: d.notes || "",
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

async function findActiveCampaignByScreenId(deviceId) {
  const rows = await PublicidadCampaign.findAll({
    where: { status: "active" },
    include: [PLAYLIST_INCLUDE],
    order: [["updatedAt", "DESC"]],
  });
  const needle = deviceId.toLowerCase();
  return (
    rows.find((c) => {
      const ids = Array.isArray(c.screenIds) ? c.screenIds : [];
      return ids.some((s) => String(s).trim().toLowerCase() === needle);
    }) || null
  );
}

/** Resuelve qué campaña debe reproducir un dispositivo aprobado. */
async function resolveCampaignForDevice(device) {
  if (device.campaignId) {
    const row = await loadCampaign(device.campaignId);
    if (!row) {
      return {
        error: "campaign_not_found",
        message: "La campaña asignada ya no existe. Asigna otra en Dispositivos TV.",
      };
    }
    if (row.status !== "active") {
      return {
        error: "campaign_inactive",
        campaign: row,
        message: `La campaña "${row.name}" está en estado "${row.status}". Actívala o asigna otra.`,
      };
    }
    return { campaign: row, source: "assigned" };
  }

  const byScreen = await findActiveCampaignByScreenId(device.deviceId);
  if (byScreen) return { campaign: byScreen, source: "screenIds" };

  return {
    error: "no_campaign",
    message:
      "Sin campaña asignada. En Publicidad → Dispositivos TV elige qué campaña debe mostrar este dispositivo.",
  };
}

async function touchDeviceLastSeen(device) {
  await device.update({ lastSeenAt: new Date() });
}

// —— CRUD campañas ——

export const listCampaigns = async (_req, res) => {
  try {
    const rows = await PublicidadCampaign.findAll({
      include: [PLAYLIST_INCLUDE],
      order: [["updatedAt", "DESC"]],
    });
    res.json(rows.map(campaignToJson));
  } catch (error) {
    console.error("listCampaigns:", error);
    res.status(500).json({ message: "Error al listar campañas", error: error.message });
  }
};

export const getCampaignById = async (req, res) => {
  try {
    const row = await loadCampaign(req.params.id);
    if (!row) return res.status(404).json({ message: "Campaña no encontrada" });
    res.json({ ...campaignToJson(row), message: "Campaña cargada" });
  } catch (error) {
    console.error("getCampaignById:", error);
    res.status(500).json({ message: "Error al obtener campaña", error: error.message });
  }
};

/** Lectura pública para reproductores TV / APK (solo playlist, sin auth). */
export const getCampaignPlayback = async (req, res) => {
  try {
    const row = await loadCampaign(req.params.id);
    if (!row) return res.status(404).json({ message: "Campaña no encontrada" });
    const json = campaignToJson(row);
    res.json({
      id: json.id,
      name: json.name,
      loop: json.loop,
      musicMode: json.musicMode,
      musicTracks: json.musicTracks,
      playlist: json.playlist,
      message: "Playlist para reproducción",
    });
  } catch (error) {
    console.error("getCampaignPlayback:", error);
    res.status(500).json({ message: "Error al obtener playlist", error: error.message });
  }
};

export const createCampaign = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { name, description, status, screenIds, loop, playlist, musicMode, musicTracks } =
      req.body || {};
    if (!String(name || "").trim()) {
      await t.rollback();
      notifyFail("publicidad_campaign.create_failed", "El nombre es obligatorio", {
        req,
        httpStatus: 400,
      });
      return res.status(400).json({ message: "El nombre es obligatorio" });
    }

    const normalizedTracks = normalizeMusicTracks(musicTracks);
    const normalizedMusicMode = normalizeMusicMode(musicMode);

    const row = await PublicidadCampaign.create(
      {
        name: String(name).trim(),
        description: description ? String(description) : "",
        status: status || "draft",
        screenIds: Array.isArray(screenIds) ? screenIds : [],
        loop: loop !== false,
        musicMode:
          normalizedMusicMode === "none" || !normalizedTracks.length
            ? "none"
            : normalizedMusicMode,
        musicTracks: normalizedTracks,
        createdByAccountId: req.user?.accountId ?? null,
      },
      { transaction: t },
    );

    await replacePlaylistItems(row.id, playlist, t);
    await t.commit();

    const full = await loadCampaign(row.id);
    const json = campaignToJson(full);
    if (json.status === "active") {
      await notifyPublicidadCampaignUpdated(json);
    }
    notifyOk("publicidad_campaign.created", "Campaña creada", { campaignId: json.id });
    res.status(201).json({
      ...json,
      message: "Campaña creada y guardada correctamente",
    });
  } catch (error) {
    await t.rollback();
    console.error("createCampaign:", error);
    notifyFail("publicidad_campaign.create_failed", "Error al crear campaña", {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "Error al crear campaña", error: error.message });
  }
};

export const updateCampaign = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const row = await PublicidadCampaign.findByPk(req.params.id, { transaction: t });
    if (!row) {
      await t.rollback();
      notifyFail("publicidad_campaign.update_failed", `Campaña #${req.params.id} no encontrada`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "Campaña no encontrada" });
    }

    const { name, description, status, screenIds, loop, playlist, musicMode, musicTracks } =
      req.body || {};
    const patch = {};
    if (name != null) patch.name = String(name).trim();
    if (description != null) patch.description = String(description);
    if (status != null) patch.status = status;
    if (screenIds != null) patch.screenIds = Array.isArray(screenIds) ? screenIds : [];
    if (loop != null) patch.loop = !!loop;
    if (musicMode != null || musicTracks != null) {
      const normalizedTracks = normalizeMusicTracks(
        musicTracks != null ? musicTracks : row.musicTracks,
      );
      const normalizedMusicMode = normalizeMusicMode(
        musicMode != null ? musicMode : row.musicMode,
      );
      patch.musicTracks = normalizedTracks;
      patch.musicMode =
        normalizedMusicMode === "none" || !normalizedTracks.length
          ? "none"
          : normalizedMusicMode;
    }

    if (Object.keys(patch).length) await row.update(patch, { transaction: t });
    if (playlist != null) await replacePlaylistItems(row.id, playlist, t);

    await t.commit();

    const full = await loadCampaign(row.id);
    const json = campaignToJson(full);
    if (json.status === "active") {
      await notifyPublicidadCampaignUpdated(json);
    } else {
      const devices = await PublicidadDevice.findAll({
        where: { campaignId: json.id },
        attributes: ["deviceId"],
      });
      for (const d of devices) {
        notifyPublicidadDeviceUpdated(d.deviceId, {
          campaignId: json.id,
          reason: "campaign_inactive",
        });
      }
    }
    notifyOk("publicidad_campaign.updated", `Campaña #${json.id}`, { campaignId: json.id });
    res.json({
      ...json,
      message: "Campaña actualizada correctamente",
    });
  } catch (error) {
    await t.rollback();
    console.error("updateCampaign:", error);
    notifyFail("publicidad_campaign.update_failed", `Error al actualizar campaña #${req.params.id}`, {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "Error al actualizar campaña", error: error.message });
  }
};

export const deleteCampaign = async (req, res) => {
  try {
    const row = await PublicidadCampaign.findByPk(req.params.id);
    if (!row) {
      notifyFail("publicidad_campaign.delete_failed", `Campaña #${req.params.id} no encontrada`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "Campaña no encontrada" });
    }
    const campaignId = row.id;
    const devices = await PublicidadDevice.findAll({
      where: { campaignId },
      attributes: ["deviceId"],
    });
    await row.destroy();
    for (const d of devices) {
      notifyPublicidadDeviceUpdated(d.deviceId, { campaignId: null, reason: "campaign_deleted" });
    }
    notifyOk("publicidad_campaign.deleted", `Campaña #${campaignId}`, { campaignId });
    res.json({ ok: true, message: "Campaña eliminada correctamente" });
  } catch (error) {
    console.error("deleteCampaign:", error);
    notifyFail("publicidad_campaign.delete_failed", `Error al eliminar campaña #${req.params.id}`, {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "Error al eliminar campaña", error: error.message });
  }
};

// —— Dispositivos TV / APK ——

/** Registro público: el dispositivo se da de alta o actualiza su presencia. */
export const registerDevice = async (req, res) => {
  try {
    const deviceId = normalizeDeviceId(req.body?.deviceId);
    if (!deviceId) {
      notifyFail("publicidad_device.register_failed", "ID de dispositivo inválido", {
        req,
        httpStatus: 400,
      });
      return res.status(400).json({ message: "ID de dispositivo inválido (use letras, números, - y _)" });
    }

    const label = req.body?.label ? String(req.body.label).trim().slice(0, 160) : null;
    let row = await PublicidadDevice.findOne({ where: { deviceId } });

    if (!row) {
      row = await PublicidadDevice.create({
        deviceId,
        label,
        status: "pending",
        lastSeenAt: new Date(),
      });
      notifyOk("publicidad_device.registered", `Dispositivo ${deviceId}`, { deviceId });
      return res.status(201).json({
        ...deviceToJson(row),
        message: "Dispositivo registrado. Esperando aprobación del administrador.",
      });
    }

    const patch = { lastSeenAt: new Date() };
    if (label && !row.label) patch.label = label;
    await row.update(patch);

    const messages = {
      pending: "Esperando aprobación del administrador.",
      approved: "Dispositivo autorizado.",
      rejected: "Dispositivo rechazado. Contacte al administrador.",
      disabled: "Dispositivo deshabilitado.",
    };

    notifyOk("publicidad_device.registered", `Dispositivo ${deviceId}`, { deviceId, status: row.status });
    res.json({
      ...deviceToJson(row),
      message: messages[row.status] || "Estado del dispositivo",
    });
  } catch (error) {
    console.error("registerDevice:", error);
    notifyFail("publicidad_device.register_failed", "Error al registrar dispositivo", {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "Error al registrar dispositivo", error: error.message });
  }
};

/** Playlist pública por dispositivo aprobado (campaña activa con ese ID en screenIds). */
export const getDevicePlayback = async (req, res) => {
  try {
    const deviceId = normalizeDeviceId(req.params.deviceId);
    if (!deviceId) {
      return res.status(400).json({ message: "ID de dispositivo inválido" });
    }

    let device = await PublicidadDevice.findOne({ where: { deviceId } });
    if (!device) {
      device = await PublicidadDevice.create({
        deviceId,
        status: "pending",
        lastSeenAt: new Date(),
      });
      return res.status(403).json({
        code: "pending",
        deviceId,
        status: "pending",
        message: "Dispositivo registrado. Esperando aprobación del administrador.",
      });
    }

    await touchDeviceLastSeen(device);

    if (device.status === "pending") {
      return res.status(403).json({
        code: "pending",
        ...deviceToJson(device),
        message: "Esperando aprobación del administrador.",
      });
    }
    if (device.status === "rejected" || device.status === "disabled") {
      return res.status(403).json({
        code: "denied",
        ...deviceToJson(device),
        message:
          device.status === "rejected"
            ? "Dispositivo rechazado."
            : "Dispositivo deshabilitado.",
      });
    }

    const resolved = await resolveCampaignForDevice(device);
    if (!resolved.campaign) {
      return res.status(404).json({
        code: resolved.error || "no_campaign",
        deviceId,
        campaignId: device.campaignId ?? null,
        message: resolved.message,
      });
    }

    const json = campaignToJson(resolved.campaign);
    res.json({
      deviceId,
      campaignId: json.id,
      name: json.name,
      loop: json.loop,
      musicMode: json.musicMode,
      musicTracks: json.musicTracks,
      playlist: json.playlist,
      source: resolved.source,
      message: "Playlist para reproducción",
    });
  } catch (error) {
    console.error("getDevicePlayback:", error);
    res.status(500).json({ message: "Error al obtener playlist del dispositivo", error: error.message });
  }
};

export const listDevices = async (_req, res) => {
  try {
    const rows = await PublicidadDevice.findAll({
      include: [DEVICE_INCLUDE],
      order: [["updatedAt", "DESC"]],
    });
    res.json(rows.map(deviceToJson));
  } catch (error) {
    console.error("listDevices:", error);
    res.status(500).json({ message: "Error al listar dispositivos", error: error.message });
  }
};

export const updateDevice = async (req, res) => {
  try {
    const deviceId = normalizeDeviceId(req.params.deviceId);
    if (!deviceId) {
      notifyFail("publicidad_device.update_failed", "ID de dispositivo inválido", {
        req,
        httpStatus: 400,
      });
      return res.status(400).json({ message: "ID de dispositivo inválido" });
    }

    const row = await PublicidadDevice.findOne({ where: { deviceId } });
    if (!row) {
      notifyFail("publicidad_device.update_failed", `Dispositivo ${deviceId} no encontrado`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "Dispositivo no encontrado" });
    }

    const { status, label, notes, campaignId } = req.body || {};
    const patch = {};
    const allowed = new Set(["pending", "approved", "rejected", "disabled"]);
    if (status != null) {
      if (!allowed.has(status)) {
        notifyFail("publicidad_device.update_failed", "Estado inválido", {
          req,
          httpStatus: 400,
          extra: { deviceId },
        });
        return res.status(400).json({ message: "Estado inválido" });
      }
      patch.status = status;
    }
    if (label != null) patch.label = String(label).trim().slice(0, 160);
    if (notes != null) patch.notes = String(notes);
    if (campaignId !== undefined) {
      if (campaignId === null || campaignId === "") {
        patch.campaignId = null;
      } else {
        const cid = Number(campaignId);
        if (!Number.isFinite(cid)) {
          notifyFail("publicidad_device.update_failed", "ID de campaña inválido", {
            req,
            httpStatus: 400,
            extra: { deviceId },
          });
          return res.status(400).json({ message: "ID de campaña inválido" });
        }
        const camp = await PublicidadCampaign.findByPk(cid);
        if (!camp) {
          notifyFail("publicidad_device.update_failed", "Campaña no encontrada", {
            req,
            httpStatus: 400,
            extra: { deviceId, campaignId: cid },
          });
          return res.status(400).json({ message: "Campaña no encontrada" });
        }
        patch.campaignId = cid;
      }
    }

    if (Object.keys(patch).length) await row.update(patch);

    const full = await PublicidadDevice.findOne({
      where: { deviceId },
      include: [DEVICE_INCLUDE],
    });

    notifyPublicidadDeviceUpdated(deviceId, {
      status: full?.status ?? row.status,
      campaignId: full?.campaignId ?? row.campaignId ?? null,
      reason: "admin_update",
    });

    if (full?.campaignId && full.status === "approved") {
      const camp = await loadCampaign(full.campaignId);
      if (camp?.status === "active") {
        await notifyPublicidadCampaignUpdated(campaignToJson(camp));
      }
    }

    notifyOk("publicidad_device.updated", `Dispositivo ${deviceId}`, { deviceId });
    res.json({
      ...deviceToJson(full || row),
      message: "Dispositivo actualizado",
    });
  } catch (error) {
    console.error("updateDevice:", error);
    notifyFail("publicidad_device.update_failed", "Error al actualizar dispositivo", {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "Error al actualizar dispositivo", error: error.message });
  }
};

export const deleteDevice = async (req, res) => {
  try {
    const deviceId = normalizeDeviceId(req.params.deviceId);
    if (!deviceId) {
      notifyFail("publicidad_device.delete_failed", "ID de dispositivo inválido", {
        req,
        httpStatus: 400,
      });
      return res.status(400).json({ message: "ID de dispositivo inválido" });
    }
    const row = await PublicidadDevice.findOne({ where: { deviceId } });
    if (!row) {
      notifyFail("publicidad_device.delete_failed", `Dispositivo ${deviceId} no encontrado`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "Dispositivo no encontrado" });
    }
    await row.destroy();
    notifyOk("publicidad_device.deleted", `Dispositivo ${deviceId}`, { deviceId });
    res.json({ ok: true, message: "Dispositivo eliminado" });
  } catch (error) {
    console.error("deleteDevice:", error);
    notifyFail("publicidad_device.delete_failed", "Error al eliminar dispositivo", {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "Error al eliminar dispositivo", error: error.message });
  }
};

// —— Catálogo de medios ——

export const getMediaCatalog = async (_req, res) => {
  try {
    const products = await InventoryProduct.findAll({
      where: { isActive: true },
      include: [{ model: InventoryCategory, attributes: ["id", "name"] }],
      order: [["name", "ASC"]],
    });

    const productItems = products
      .filter((p) => p.primaryImageUrl)
      .map((p) => ({
        id: p.id,
        type: "product",
        title: p.name,
        subtitle: p.ERP_inventory_category?.name || p.desc?.slice(0, 80) || "",
        mediaPath: p.primaryImageUrl,
        price: p.price != null ? Number(p.price) : null,
      }));

    const media = await buildMediaCatalog({});

    res.json({
      products: productItems,
      images: media.images.map((f) => ({ ...f, type: "image" })),
      videos: media.videos.map((f) => ({ ...f, type: "video" })),
      audios: media.audios.map((f) => ({ ...f, type: "audio" })),
    });
  } catch (error) {
    console.error("getMediaCatalog:", error);
    res.status(500).json({ message: "Error al cargar catálogo de medios", error: error.message });
  }
};
