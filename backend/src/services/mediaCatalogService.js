/**
 * Catálogo de medios: escaneo de carpetas + registros en BD.
 */
import path from "path";
import fsp from "fs/promises";
import fileDirName from "../libs/file-dirname.js";
import { MediaAsset } from "../models/MediaAsset.js";
import { getMediaFolders } from "../services/appSettingsService.js";

const { __dirname } = fileDirName(import.meta);
const IMG_BASE = path.resolve(__dirname, "../img");
const FILES_BASE = path.resolve(__dirname, "../files");

export const VIDEO_EXT = new Set([".mp4", ".webm", ".mov", ".m4v"]);
export const AUDIO_EXT = new Set([".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"]);
export const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);

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

function scanToItems(files, type, storage = "files") {
  const seen = new Set();
  return files
    .filter((f) => {
      if (seen.has(f.relPath)) return false;
      seen.add(f.relPath);
      return true;
    })
    .map((f) => ({
      id: f.relPath,
      type,
      title: f.name,
      subtitle: f.relPath,
      mediaPath: f.relPath,
      storage,
      durationHint: type === "video" ? 30 : type === "audio" ? 180 : null,
      source: "scan",
    }));
}

export async function scanMediaByType(mediaType) {
  const MEDIA_FOLDERS = getMediaFolders();
  if (mediaType === "image") {
    const files = [];
    for (const folder of MEDIA_FOLDERS.image) {
      files.push(...(await walkFiles(IMG_BASE, folder, 5, IMAGE_EXT)));
    }
    return scanToItems(files, "image", "img");
  }

  const ext = mediaType === "video" ? VIDEO_EXT : AUDIO_EXT;
  const folders = MEDIA_FOLDERS[mediaType] || [];
  const files = [];
  for (const folder of folders) {
    files.push(...(await walkFiles(FILES_BASE, folder, 4, ext)));
  }
  return scanToItems(files, mediaType, "files");
}

function assetRowToItem(row) {
  const j = row.toJSON ? row.toJSON() : row;
  return {
    id: `asset:${j.id}`,
    assetId: j.id,
    type: j.mediaType,
    title: j.title,
    subtitle: j.relativePath,
    mediaPath: j.relativePath,
    storage: j.storage,
    durationHint: j.durationSeconds || (j.mediaType === "video" ? 30 : 180),
    module: j.module,
    source: "db",
  };
}

/** Fusiona escaneo de disco + registros BD (BD tiene prioridad por path). */
export async function buildMediaCatalog({ module, mediaType } = {}) {
  const types = mediaType ? [mediaType] : ["video", "audio", "image"];
  const result = { videos: [], audios: [], images: [] };

  for (const type of types) {
    const scanned = await scanMediaByType(type);
    const where = { mediaType: type };
    if (module) where.module = module;
    const dbRows = await MediaAsset.findAll({ where, order: [["createdAt", "DESC"]] });
    const dbItems = dbRows.map(assetRowToItem);

    const byPath = new Map();
    for (const item of scanned) byPath.set(item.mediaPath, item);
    for (const item of dbItems) byPath.set(item.mediaPath, item);

    const merged = [...byPath.values()].sort((a, b) =>
      String(a.title).localeCompare(String(b.title)),
    );

    if (type === "video") result.videos = merged;
    if (type === "audio") result.audios = merged;
    if (type === "image") result.images = merged;
  }

  return result;
}

export function inferMediaTypeFromFilename(fileName) {
  const ext = path.extname(String(fileName || "")).toLowerCase();
  if (VIDEO_EXT.has(ext)) return "video";
  if (AUDIO_EXT.has(ext)) return "audio";
  if (IMAGE_EXT.has(ext)) return "image";
  return null;
}
