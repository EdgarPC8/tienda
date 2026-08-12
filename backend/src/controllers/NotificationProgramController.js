import { NotificationProgram } from "../models/NotificationProgram.js";
import { dispatchProgramToUsers } from "../services/notificationService.js";
import { notifyOk, notifyFail } from "../services/notifyRaptorSolutions.js";

const ADMIN_ROLES = new Set(["Administrador", "Programador"]);

function assertAdmin(req, res) {
  if (!ADMIN_ROLES.has(String(req.user?.loginRol || ""))) {
    notifyFail("notification_program.unauthorized", "No autorizado", { req, httpStatus: 403 });
    res.status(403).json({ message: "No autorizado." });
    return false;
  }
  return true;
}

function normalizePayload(body) {
  const out = { ...body };
  if ("targetRoleIds" in out && typeof out.targetRoleIds === "string") {
    try {
      out.targetRoleIds = JSON.parse(out.targetRoleIds);
    } catch {
      out.targetRoleIds = [];
    }
  }
  if (out.scheduleIntervalMinutes != null && out.scheduleIntervalMinutes !== "") {
    out.scheduleIntervalMinutes = Number(out.scheduleIntervalMinutes);
  }
  if (out.active != null) out.active = Boolean(out.active);
  return out;
}

export const listNotificationPrograms = async (req, res) => {
  if (!assertAdmin(req, res)) return;
  try {
    const rows = await NotificationProgram.findAll({ order: [["code", "ASC"]] });
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createNotificationProgram = async (req, res) => {
  if (!assertAdmin(req, res)) return;
  try {
    const payload = normalizePayload(req.body);
    const row = await NotificationProgram.create(payload);
    notifyOk("notification_program.created", "Programa notificación creado", {
      programId: row.id,
    });
    res.status(201).json(row);
  } catch (error) {
    notifyFail("notification_program.create_failed", "Error al crear programa", {
      error,
      req,
      httpStatus: 400,
    });
    res.status(400).json({ message: error.message });
  }
};

export const updateNotificationProgram = async (req, res) => {
  if (!assertAdmin(req, res)) return;
  try {
    const row = await NotificationProgram.findByPk(req.params.id);
    if (!row) {
      notifyFail("notification_program.update_failed", `Programa #${req.params.id} no encontrado`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "No encontrado" });
    }
    await row.update(normalizePayload(req.body));
    notifyOk("notification_program.updated", `Programa notificación #${row.id}`, {
      programId: row.id,
    });
    res.json(row);
  } catch (error) {
    notifyFail("notification_program.update_failed", `Error al actualizar programa #${req.params.id}`, {
      error,
      req,
      httpStatus: 400,
    });
    res.status(400).json({ message: error.message });
  }
};

export const deleteNotificationProgram = async (req, res) => {
  if (!assertAdmin(req, res)) return;
  try {
    const row = await NotificationProgram.findByPk(req.params.id);
    if (!row) {
      notifyFail("notification_program.delete_failed", `Programa #${req.params.id} no encontrado`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "No encontrado" });
    }
    if (String(row.code).startsWith("SYSTEM_")) {
      notifyFail("notification_program.delete_failed", "Los programas de sistema no se eliminan", {
        req,
        httpStatus: 400,
        extra: { programId: row.id },
      });
      return res.status(400).json({
        message: "Los programas de sistema no se eliminan; desactívalos.",
      });
    }
    await row.destroy();
    notifyOk("notification_program.deleted", `Programa notificación #${req.params.id}`, {
      programId: req.params.id,
    });
    res.json({ message: "Eliminado" });
  } catch (error) {
    notifyFail("notification_program.delete_failed", `Error al eliminar programa #${req.params.id}`, {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: error.message });
  }
};

export const sendNotificationProgramNow = async (req, res) => {
  if (!assertAdmin(req, res)) return;
  try {
    const row = await NotificationProgram.findByPk(req.params.id);
    if (!row) {
      notifyFail("notification_program.send_failed", `Programa #${req.params.id} no encontrado`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "No encontrado" });
    }
    const result = await dispatchProgramToUsers(row, { force: true });
    notifyOk("notification_program.sent", `Programa enviado #${row.id}`, result);
    res.json({
      message: `Enviado a ${result.sent} destinatario(s).`,
      ...result,
    });
  } catch (error) {
    notifyFail("notification_program.send_failed", `Error al enviar programa #${req.params.id}`, {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: error.message });
  }
};
