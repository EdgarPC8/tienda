import { Op } from "sequelize";
import { AppNews } from "../models/AppNews.js";

const KINDS = new Set([
  "portada",
  "interior",
  "breve",
  "editorial",
  "proximamente",
]);

function normalizeItem(raw) {
  const id = Number(raw?.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  const title = String(raw?.title || "").trim();
  if (!title) return null;
  const kind = String(raw?.kind || "interior").trim();
  if (!KINDS.has(kind)) return null;
  return {
    gestorNewsId: id,
    title,
    subtitle: raw?.subtitle != null ? String(raw.subtitle).trim() || null : null,
    body: raw?.body != null ? String(raw.body).trim() || null : null,
    kind,
    publishedAt: raw?.published_at ? new Date(raw.published_at) : new Date(),
    sortOrder: Number.isFinite(Number(raw?.sort_order)) ? Number(raw.sort_order) : 0,
    syncedAt: new Date(),
  };
}

/** PUT — gestor empuja el lote publicado para esta app. */
export async function putNewsSyncFromGestor(req, res, next) {
  try {
    const itemsIn = Array.isArray(req.body?.items) ? req.body.items : [];
    const normalized = itemsIn.map(normalizeItem).filter(Boolean);
    const keepIds = normalized.map((n) => n.gestorNewsId);

    await AppNews.sequelize.transaction(async (t) => {
      await AppNews.destroy({
        where: keepIds.length
          ? { gestorNewsId: { [Op.notIn]: keepIds } }
          : {},
        transaction: t,
      });

      for (const row of normalized) {
        const existing = await AppNews.findOne({
          where: { gestorNewsId: row.gestorNewsId },
          transaction: t,
        });
        if (existing) {
          await existing.update(row, { transaction: t });
        } else {
          await AppNews.create(row, { transaction: t });
        }
      }
    });

    const count = await AppNews.count();
    res.json({ ok: true, count });
  } catch (err) {
    next(err);
  }
}

/** GET — listado local para el frontend (periódico). */
export async function listLocalNews(req, res, next) {
  try {
    const rows = await AppNews.findAll({
      order: [
        ["sortOrder", "ASC"],
        ["publishedAt", "DESC"],
        ["id", "DESC"],
      ],
    });
    res.json(
      rows.map((r) => ({
        id: r.id,
        gestorNewsId: r.gestorNewsId,
        title: r.title,
        subtitle: r.subtitle,
        body: r.body,
        kind: r.kind,
        publishedAt: r.publishedAt,
        sortOrder: r.sortOrder,
      })),
    );
  } catch (err) {
    next(err);
  }
}
