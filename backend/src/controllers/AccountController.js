import { sequelize } from "../database/connection.js";
import { Account, AccountRoles } from "../models/Account.js";
import { Roles } from "../models/Roles.js";
import { Users } from "../models/Users.js";
import bcrypt from "bcryptjs";
import { notifyOk, notifyFail } from "../services/notifyRaptorSolutions.js";

/** Quita el rol Programador de un listado de IDs si quien pide no es Programador. */
async function sanitizeRoleIdsForRequester(roleIds, loginRol) {
  if (!Array.isArray(roleIds) || loginRol === "Programador") return roleIds;
  const programmer = await Roles.findOne({ where: { name: "Programador" } });
  if (!programmer) return roleIds;
  return roleIds.filter((id) => Number(id) !== Number(programmer.id));
}

export const getRoles = async (req, res) => {
  try {
    const data = await Roles.findAll();
    // Rol interno: solo visible si la sesión actual es Programador
    const roles =
      req.user?.loginRol === "Programador"
        ? data
        : data.filter((r) => r.name !== "Programador");
    res.json(roles);
  } catch (error) {
    console.error("Error al obtener los roles:", error);
    res.status(500).json({ message: "Error en el servidor." });
  }
};

export const addAccount = async (req, res) => {
  try {
    const {
      username,
      newPassword,
      confirmPassword,
      roles,  // Array de IDs de roles
      userId,
    } = req.body;

    if (!newPassword || newPassword.trim() === "") {
      notifyFail("account.create_failed", "La contraseña es obligatoria", {
        req,
        httpStatus: 400,
        extra: { reason: "missing_password" },
      });
      return res.status(400).json({ message: "La contraseña es obligatoria" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    // Crear la cuenta
    const newAccount = await Account.create({
      username,
      password: hashedPassword,
      userId,
      isActive: req.body?.isActive !== false,
    });
    // Insertar los roles
    if (roles && roles.length > 0) {
      const safeRoles = await sanitizeRoleIdsForRequester(
        roles,
        req.user?.loginRol,
      );
      const roleEntries = safeRoles.map(roleId => ({
        accountId: newAccount.id,
        roleId,
      }));
      await AccountRoles.bulkCreate(roleEntries);
    }

    notifyOk("account.created", "Cuenta creada", {
      accountId: newAccount.id,
      username: newAccount.username,
      userId: newAccount.userId,
    });
    res.json({ message: "Cuenta creada con éxito", data: newAccount });
  } catch (error) {
    console.error("Error al crear cuenta:", error);
    notifyFail("account.create_failed", "Error al crear cuenta", {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: error.message });
  }
};


export const updateAccount = async (req, res) => {
  const data = req.body;
  const idAccount = req.params.id;

  try {
    const cuenta = await Account.findByPk(idAccount);

    if (!cuenta) {
      notifyFail("account.update_failed", `Cuenta #${idAccount} no encontrada`, {
        req,
        httpStatus: 404,
        extra: { accountId: idAccount },
      });
      return res.status(404).json({ message: "Cuenta no encontrada" });
    }

    // ✅ Actualizar el username si viene
    if (data.username) {
      cuenta.username = data.username;
    }

    if (data.isActive !== undefined) {
      cuenta.isActive = data.isActive !== false && data.isActive !== "false";
    }

    // ✅ Solo actualiza la contraseña si se mandó explícitamente
    if (data.newPassword && data.confirmPassword) {
      if (data.newPassword !== data.confirmPassword) {
        notifyFail("account.update_failed", "Las contraseñas nuevas no coinciden", {
          req,
          httpStatus: 400,
          extra: { accountId: idAccount, reason: "password_mismatch" },
        });
        return res.status(400).json({ message: "Las contraseñas nuevas no coinciden" });
      }

      const passgenerate = await bcrypt.hash(data.newPassword, 10);
      cuenta.password = passgenerate;
    }

    // ✅ Guardar cambios básicos
    await cuenta.save();

    // ✅ Actualizar roles si vienen
    if (Array.isArray(data.roles)) {
      const safeRoles = await sanitizeRoleIdsForRequester(
        data.roles,
        req.user?.loginRol,
      );
      await cuenta.setRoles(safeRoles); // ← esto borra y vuelve a insertar
    }

    notifyOk("account.updated", `Cuenta #${idAccount}`, { accountId: idAccount });
    return res.json({ message: "Cuenta actualizada con éxito" });
  } catch (err) {
    console.error(err);
    notifyFail("account.update_failed", `Error al actualizar cuenta #${idAccount}`, {
      error: err,
      req,
      httpStatus: 500,
    });
    return res.status(500).json({ message: "Error al actualizar cuenta" });
  }
};


export const updateAccountUser = async (req, res) => {
  const data = req.body;
  const idAccount = req.params.id;
  console.log("-------------------:",idAccount)

  try {
    const cuenta = await Account.findByPk(idAccount, {
      include: [
        { model: Roles},
        { model: Users }
      ]
    });

    if (!cuenta) {
      notifyFail("account.user_update_failed", `Cuenta #${idAccount} no encontrada`, {
        req,
        httpStatus: 404,
        extra: { accountId: idAccount },
      });
      return res.status(404).json({ message: "Cuenta no encontrada" });
    }

    // Actualizar username si viene
    if (data.username) {
      cuenta.username = data.username;
    }

    // 🔒 Cambiar contraseña solo si se proveen ambas: old + new
    if (data.oldPassword && data.newPassword) {
      const isValid = await bcrypt.compare(data.oldPassword, cuenta.password);
      if (!isValid) {
        notifyFail("account.user_update_failed", "La contraseña anterior es incorrecta", {
          req,
          httpStatus: 401,
          extra: { accountId: idAccount, reason: "invalid_old_password" },
        });
        return res.status(401).json({ message: "La contraseña anterior es incorrecta" });
      }

      const hashed = await bcrypt.hash(data.newPassword, 10);
      cuenta.password = hashed;
    }

    await cuenta.save();

    // Actualizar roles si se envían
    if (Array.isArray(data.roles)) {
      const safeRoles = await sanitizeRoleIdsForRequester(
        data.roles,
        req.user?.loginRol,
      );
      await cuenta.setRoles(safeRoles);
    }

    // También podrías enviar los datos actualizados del usuario si quieres
    notifyOk("account.user_updated", `Cuenta #${idAccount}`, { accountId: idAccount });
    return res.json({
      message: "Cuenta actualizada con éxito",
      data: {
        id: cuenta.id,
        username: cuenta.username,
        roles: await cuenta.getRoles(), // opcional
      }
    });

  } catch (error) {
    console.error("Error actualizando cuenta:", error);
    notifyFail("account.user_update_failed", `Error al actualizar cuenta #${idAccount}`, {
      error,
      req,
      httpStatus: 500,
    });
    return res.status(500).json({ message: error.message });
  }
};


export const getAccounts = async (req, res) => {
  try {
    const data = await Account.findAll({
      attributes: ["id", "username", "isActive"], // solo lo necesario de Account
      include: [
        {
          model: Roles,
          as: "roles",
          attributes: ["id", "name"], // solo el nombre del rol
          through: { attributes: [] },
        },
        {
          model: Users,
          as: "user",
          attributes: [
            "firstName",
            "secondName",
            "firstLastName",
            "secondLastName",
            "gender",
          ],
        },
      ],
    });

    res.json(data);
  } catch (error) {
    console.error("Error al obtener cuentas:", error);
    res.status(500).json({ message: "Error en el servidor." });
  }
};

  
  export const getOneAccount= async (req, res) => {
    const { id } = req.params;
    try {
      const data = await Account.findOne({
        where: { id },
        include: [
          {
            model: Roles,
            as: 'roles', // asegúrate de tener esta asociación en tus modelos
            through: { attributes: [] }
          }
        ]
      });
      
      res.json({
        ...data.toJSON(),
        roles: data.roles.map(r => r.id)
      });
      
    } catch (error) {
      res.status(500).json({
        message: error.message,
      });
    }
  };
  export const getAccount = async (req, res) => {
    const { accountId, rolId } = req.params;
  
    try {
      const data = await Account.findOne({
        where: { id:accountId },
        attributes: [
          "username",
          "id",
          "userId"
        ],
        include: [
          {
            model: Roles,
            as: 'roles',
            through: { attributes: [] }, // trae todos los roles, sin info de tabla intermedia
          },
          {
            model: Users,
            as: 'user',
            attributes: [
              "id",
              "firstName",
              "secondName",
              "firstLastName",
              "secondLastName",
              "photo",
              "ci",
              "birthday",
              "gender"
            ]
          }
        ]
      });
  
      if (!data) {
        return res.status(404).json({ message: "Cuenta no encontrada" });
      }
  
      res.json({
        ...data.toJSON(),
        activeRoleId: parseInt(rolId), // <- opcionalmente indicamos cuál es el rol actual
      });
  
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  };

  export const deleteAccount = async (req, res) => {
    try {
      const accountId = req.params.id;
      await Account.destroy({
        where: {
          id: accountId,
        },
      });

      notifyOk("account.deleted", `Cuenta #${accountId}`, { accountId });
      res.json({ message: "Cuenta eleminado con éxito" });
    } catch (error) {
      notifyFail("account.delete_failed", `Error al eliminar cuenta #${req.params.id}`, {
        error,
        req,
        httpStatus: 500,
      });
      return res.status(500).json({
        message: error.message,
      });
    }
  };

  export const resetPassword = async (req, res) => {
    // const data=req.body;
    const idAccount=req.params.id;

  
    try {

      const passgenerate = await bcrypt.hash("12345678", 10);

     await Account.update({
      password:passgenerate,
     },
        {
          where: {
            id: idAccount
          },
        }
      );
      notifyOk("account.password_reset", `Reset contraseña cuenta #${idAccount}`, {
        accountId: idAccount,
      });
      res.json({ message: "Password Reseteda a 12345678 con éxito" });
    } catch (error) {
      notifyFail("account.password_reset_failed", `Error al resetear contraseña cuenta #${idAccount}`, {
        error,
        req,
        httpStatus: 500,
      });
      res.status(500).json({
        message: error.message,
      });
    }
  };


  export const getOneRol= async (req, res) => {
    const { id } = req.params;
    try {
      const data = await Roles.findOne({
        where: { id:id },
      });
  
      res.json(data);
    } catch (error) {
      res.status(500).json({
        message: error.message,
      });
    }
  };
  export const addRol = async (req, res) => {
    try {
      const data= req.body;
    const newData = await Roles.create(data);
    notifyOk("role.created", "Rol creado", { role: newData });
    res.json({ message: `agregado con éxito`,data:newData});
    } catch (error) {
      console.error("error al crear el rol:", error);
      notifyFail("role.create_failed", "Error al crear el rol", {
        error,
        req,
        httpStatus: 500,
      });
      res.status(500).json({ message: error.message });
    }
  };
  export const deleteRol = async (req, res) => {
    try {
      const roleId = req.params.id;
      await Roles.destroy({
        where: {
          id: roleId,
        },
      });

      notifyOk("role.deleted", `Rol #${roleId}`, { roleId });
      res.json({ message: "Rol eleminado con éxito" });
    } catch (error) {
      notifyFail("role.delete_failed", `Error al eliminar rol #${req.params.id}`, {
        error,
        req,
        httpStatus: 500,
      });
      return res.status(500).json({
        message: error.message,
      });
    }
  };
  export const updateRol = async (req, res) => {
    const data=req.body;
    const roleId = req.params.id;

    try {
     await Roles.update(data,
        {
          where: {
            id: roleId,
          },
        }
      );
      notifyOk("role.updated", `Rol #${roleId}`, { roleId });
      res.json({ message: "Rol editado con éxito" });
    } catch (error) {
      notifyFail("role.update_failed", `Error al editar rol #${roleId}`, {
        error,
        req,
        httpStatus: 500,
      });
      res.status(500).json({
        message: error.message,
      });
    }
  };
