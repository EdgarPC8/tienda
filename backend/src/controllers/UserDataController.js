import { UserData } from "../models/UserData.js";
import { notifyOk, notifyFail } from "../services/notifyRaptorSolutions.js";

const allowedFields = [
  "direction",
  "placeResidence",
  "phone",
  "cellPhone",
  "bloodType",
  "personalEmail",
  "institutionalEmail",
];

function pickBody(body) {
  const out = {};
  allowedFields.forEach((key) => {
    if (body[key] !== undefined) out[key] = body[key];
  });
  return out;
}

/**
 * Obtiene los datos adicionales del usuario autenticado.
 * Crea un registro vacío si no existe.
 */
export const getMyData = async (req, res) => {
  try {
    const idUser = req.user?.userId;
    if (!idUser)
      return res.status(401).json({ message: "No autenticado" });

    let data = await UserData.findOne({ where: { idUser } });
    if (!data) {
      data = await UserData.create({ idUser });
    }
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Actualiza o crea los datos adicionales del usuario autenticado.
 */
export const updateMyData = async (req, res) => {
  try {
    const idUser = req.user?.userId;
    if (!idUser) {
      notifyFail("user.data_update_failed", "No autenticado", {
        req,
        httpStatus: 401,
        extra: { reason: "unauthenticated" },
      });
      return res.status(401).json({ message: "No autenticado" });
    }

    const payload = pickBody(req.body);
    const [row, created] = await UserData.findOrCreate({
      where: { idUser },
      defaults: { idUser },
    });
    await row.update(payload);
    notifyOk("user.data_updated", "Datos personales actualizados", {
      userId: idUser,
      created,
      data: row,
    });
    res.json({ message: "Datos actualizados", data: row });
  } catch (error) {
    notifyFail("user.data_update_failed", "Error al actualizar datos personales", {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: error.message });
  }
};
