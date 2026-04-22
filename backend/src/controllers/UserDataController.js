import { UserData } from "../models/UserData.js";

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

export const getMyData = async (req, res) => {
  try {
    const idUser = req.user?.userId;
    if (!idUser) return res.status(401).json({ message: "No autenticado" });

    let data = await UserData.findOne({ where: { idUser } });
    if (!data) {
      data = await UserData.create({ idUser });
    }
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateMyData = async (req, res) => {
  try {
    const idUser = req.user?.userId;
    if (!idUser) return res.status(401).json({ message: "No autenticado" });

    const payload = pickBody(req.body);
    const [row] = await UserData.findOrCreate({
      where: { idUser },
      defaults: { idUser },
    });
    await row.update(payload);
    res.json({ message: "Datos actualizados", data: row });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
