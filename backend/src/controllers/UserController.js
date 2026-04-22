import { Users } from "../models/Users.js";
import { UniqueConstraintError } from "sequelize";

export const addUser = async (req, res) => {
  try {
    const { photo, ...data } = req.body;

    const newUser = await Users.create(data);

    return res.json({
      message: "agregado con éxito",
      user: newUser,
    });
  } catch (error) {
    if (error instanceof UniqueConstraintError || error.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({
        message: "Esa cédula ya existe",
      });
    }
    console.error("error al crear el usuario:", error);
    return res.status(500).json({
      message: "Error al crear el usuario",
      error: error.message,
    });
  }
};

export const updateUserData = async (req, res) => {
  try {
    const { photo, ...data } = req.body;

    await Users.update(data, {
      where: { id: req.params.userId },
    });

    return res.json({ message: "usuario editado con éxito" });
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

export const getUsers = async (req, res) => {
  try {
    const users = await Users.findAll();

    if (!users || users.length === 0) {
      return res.status(404).json({ message: "No se encontraron usuarios." });
    }

    res.json(users);
  } catch (error) {
    console.error("Error al obtener usuarios:", error);
    res.status(500).json({ message: "Error en el servidor." });
  }
};

export const getOneUser = async (req, res) => {
  const { userId } = req.params;
  try {
    const user = await Users.findOne({
      where: { id: userId },
    });

    res.json(user);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

export const deleteUser = async (req, res) => {
  try {
    await Users.destroy({
      where: {
        id: req.params.userId,
      },
    });

    res.json({ message: "Usuario eleminado con éxito" });
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

export const addUsersBulk = async (req, res) => {
  let usuarios = req.body;

  if (!Array.isArray(usuarios) || usuarios.length === 0) {
    return res.status(400).json({ message: "No hay usuarios para registrar" });
  }
  usuarios = usuarios.map(({ id, ...rest }) => rest);
  try {
    const resultado = await Users.bulkCreate(usuarios, {
      ignoreDuplicates: true,
      returning: true,
    });

    res.json({
      insertados: resultado.length,
      detalles: resultado,
    });
  } catch (error) {
    console.error("Error al insertar usuarios:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};
