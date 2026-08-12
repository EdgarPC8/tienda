import { PublicidadDevice } from "../models/Publicidad.js";

let io;

const DEVICE_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

export const PUBLICIDAD_WS = {
  SCREEN_REGISTER: "publicidad:screen:register",
  SCREEN_REGISTERED: "publicidad:screen:registered",
  SCREEN_PLAYLIST: "publicidad:screen:playlist",
  PLAYLIST_UPDATE: "publicidad:playlist:update",
  PLAYBACK_CONTROL: "publicidad:playback:control",
  PLAYBACK_COMMAND: "publicidad:playback:command",
  DEVICE_UPDATED: "publicidad:device:updated",
};

function normalizeDeviceId(raw) {
  const id = String(raw || "").trim();
  if (!id || !DEVICE_ID_RE.test(id)) return null;
  return id.toLowerCase();
}

function deviceRoom(deviceId) {
  return `publicidad:device:${deviceId}`;
}

function campaignRoom(campaignId) {
  return `publicidad:campaign:${String(campaignId)}`;
}

function playlistPayload(campaignJson) {
  return {
    campaignId: String(campaignJson.id),
    id: String(campaignJson.id),
    name: campaignJson.name,
    loop: campaignJson.loop !== false,
    playlist: campaignJson.playlist || [],
    musicMode: campaignJson.musicMode || "none",
    musicTracks: campaignJson.musicTracks || [],
    updatedAt: Date.now(),
  };
}

export function initPublicidadSocket(ioServer) {
  io = ioServer;

  io.on("connection", (socket) => {
    socket.on(PUBLICIDAD_WS.SCREEN_REGISTER, (payload = {}) => {
      const deviceId = normalizeDeviceId(payload.deviceId || payload.screenId);
      const campaignId =
        payload.campaignId != null && payload.campaignId !== ""
          ? String(payload.campaignId)
          : null;

      if (deviceId) socket.join(deviceRoom(deviceId));
      if (campaignId) socket.join(campaignRoom(campaignId));

      socket.emit(PUBLICIDAD_WS.SCREEN_REGISTERED, {
        ok: true,
        deviceId,
        campaignId,
      });
    });

    socket.on(PUBLICIDAD_WS.PLAYBACK_CONTROL, (payload = {}) => {
      const targetDevice = normalizeDeviceId(payload.deviceId || payload.screenId);
      const targetCampaign =
        payload.campaignId != null && payload.campaignId !== ""
          ? String(payload.campaignId)
          : null;
      const action = String(payload.action || "").trim().toLowerCase();
      if (!action) return;

      const command = { action, at: Date.now() };

      if (targetDevice) {
        io.to(deviceRoom(targetDevice)).emit(PUBLICIDAD_WS.PLAYBACK_COMMAND, command);
      }
      if (targetCampaign) {
        io.to(campaignRoom(targetCampaign)).emit(PUBLICIDAD_WS.PLAYBACK_COMMAND, command);
      }
    });
  });
}

/** Notifica playlist actualizada a pantallas suscritas a la campaña y dispositivos asignados. */
export async function notifyPublicidadCampaignUpdated(campaignJson) {
  if (!io || !campaignJson?.id) return;
  if (campaignJson.status && campaignJson.status !== "active") return;

  const payload = playlistPayload(campaignJson);
  const cid = payload.campaignId;

  io.to(campaignRoom(cid)).emit(PUBLICIDAD_WS.SCREEN_PLAYLIST, payload);
  io.to(campaignRoom(cid)).emit(PUBLICIDAD_WS.PLAYLIST_UPDATE, payload);

  const devices = await PublicidadDevice.findAll({
    where: { campaignId: campaignJson.id, status: "approved" },
    attributes: ["deviceId"],
  });

  for (const row of devices) {
    const deviceId = normalizeDeviceId(row.deviceId);
    if (!deviceId) continue;
    io.to(deviceRoom(deviceId)).emit(PUBLICIDAD_WS.SCREEN_PLAYLIST, {
      ...payload,
      deviceId,
      source: "assigned",
    });
  }

  const screenIds = Array.isArray(campaignJson.screenIds) ? campaignJson.screenIds : [];
  for (const sid of screenIds) {
    const deviceId = normalizeDeviceId(sid);
    if (!deviceId) continue;
    io.to(deviceRoom(deviceId)).emit(PUBLICIDAD_WS.SCREEN_PLAYLIST, {
      ...payload,
      deviceId,
      source: "screenIds",
    });
  }
}

/** Dispositivo aprobado, asignado o reconfigurado — el player debe refrescar estado. */
export function notifyPublicidadDeviceUpdated(deviceId, extra = {}) {
  if (!io) return;
  const id = normalizeDeviceId(deviceId);
  if (!id) return;
  io.to(deviceRoom(id)).emit(PUBLICIDAD_WS.DEVICE_UPDATED, {
    deviceId: id,
    updatedAt: Date.now(),
    ...extra,
  });
}
