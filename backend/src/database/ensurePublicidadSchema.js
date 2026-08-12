/**
 * @deprecated No se ejecuta en el arranque del API. Usa `npm run db:sync`.
 * Mantenido por si algún script lo invoca explícitamente.
 */
import {
  PublicidadCampaign,
  PublicidadPlaylistItem,
  PublicidadDevice,
} from "../models/Publicidad.js";
import { MediaAsset } from "../models/MediaAsset.js";

export async function ensurePublicidadSchema() {
  await MediaAsset.sync();
  await PublicidadCampaign.sync({ alter: true });
  await PublicidadPlaylistItem.sync({ alter: true });
  await PublicidadDevice.sync({ alter: true });
}
