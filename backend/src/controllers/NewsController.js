import { AppNews } from "../models/AppNews.js";

/**
 * PUT — sync desde gestor desactivado.
 * Las noticias viven en el frontend (appNewsCatalog.js).
 */
export async function putNewsSyncFromGestor(req, res) {
  res.status(410).json({
    ok: false,
    message:
      "Sync de noticias desactivado: el periódico usa catálogo fijo en código (appNewsCatalog.js).",
  });
}

/**
 * GET — legado BD local. El frontend ya no lo usa (catálogo fijo).
 * Se mantiene por si algún cliente viejo aún llama /news.
 */
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
