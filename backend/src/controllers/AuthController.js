import { Users } from "../models/Users.js";
import { Account } from "../models/Account.js";
import bcrypt from "bcryptjs";
import { createAccessToken, createLicenseToken, getHeaderToken, verifyJWT } from "../libs/jwt.js";
import { Roles } from "../models/Roles.js";
import { logger } from "../log/LogActivity.js";
import { License } from "../models/License.js";
import { calculateExpirationDate } from "../helpers/functions.js";
import { notifyOk, notifyFail } from "../services/notifyRaptorSolutions.js";

export const login = async (req, res) => {
  let { username, password, selectedRoleId } = req.body;
  // const system = req.headers['user-agent'];

  try {
    const account = await Account.findOne({
      where: { username },
      include: [
        {
          model: Users,
          as: 'user'
        },
        {
          model: Roles,
          as: 'roles', // MANY TO MANY
          through: { attributes: [] }
        }
      ]
    });

    if (!account) {
      notifyFail("auth.login_failed", "Datos incorrectos", {
        req,
        httpStatus: 400,
        extra: { reason: "account_not_found", username },
      });
      return res.status(400).json({ message: "Datos incorrectos" });
    }

    const isCorrectPassword = await bcrypt.compare(password, account.password);
    if (!isCorrectPassword) {
      notifyFail("auth.login_failed", "Datos incorrectos", {
        req,
        httpStatus: 400,
        extra: { reason: "invalid_password", accountId: account.id },
      });
      return res.status(400).json({ message: "Datos incorrectos" });
    }

    if (account.isActive === false) {
      notifyFail("auth.login_failed", "Cuenta inactiva", {
        req,
        httpStatus: 403,
        extra: { reason: "account_inactive", accountId: account.id },
      });
      return res.status(403).json({
        message: "Cuenta inactiva. Contacte al administrador.",
      });
    }

    // Si no se seleccionó un rol y tiene más de uno, devolvemos la lista para que el frontend elija
    if (!selectedRoleId) {
      if (account.roles.length > 1) {
        return res.json({
          selectRole: true,
          roles: account.roles.map((role) => ({
            id: role.id,
            name: role.name,
          })),
          accountId: account.id,
        });
      }

      // Si tiene uno solo, lo usamos directamente
      selectedRoleId = account.roles[0]?.id;
    }

    const selectedRole = account.roles.find((r) => r.id === selectedRoleId);
    if (!selectedRole) {
      notifyFail("auth.login_failed", "Rol seleccionado inválido", {
        req,
        httpStatus: 400,
        extra: { reason: "invalid_role", accountId: account.id, selectedRoleId },
      });
      return res.status(400).json({ message: "Rol seleccionado inválido" });
    }

    const payload = {
      userId: account.userId,
      accountId: account.id,
      rolId: selectedRole.id,
      loginRol: selectedRole.name,
    };

    const token = await createAccessToken({ payload });

    notifyOk("auth.login", "Inicio de sesión", {
      accountId: account.id,
      userId: account.userId,
      rolId: selectedRole.id,
      loginRol: selectedRole.name,
    });
    res.json({ message: "User authenticated", token });
  } catch (error) {
    console.error("Error en login:", error);
    notifyFail("auth.login_failed", "Error en inicio de sesión", {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: error.message });
  }
};

export const changeRole = async (req, res) => {
  const { accountId, rolId } = req.body;

  if (!accountId || !rolId) {
    notifyFail("auth.role_change_failed", "accountId y rolId son obligatorios", {
      req,
      httpStatus: 400,
      extra: { reason: "missing_fields" },
    });
    return res.status(400).json({ message: "accountId y rolId son obligatorios" });
  }

  if (Number(accountId) !== Number(req.user?.accountId)) {
    notifyFail("auth.role_change_failed", "No puedes cambiar el rol de otra cuenta", {
      req,
      httpStatus: 403,
      extra: { accountId, reason: "forbidden_account" },
    });
    return res.status(403).json({ message: "No puedes cambiar el rol de otra cuenta" });
  }

  try {
    const account = await Account.findByPk(accountId, {
      include: [
        {
          model: Roles,
          as: 'roles',
          through: { attributes: [] },
        },
      ],
    });

    if (!account) {
      notifyFail("auth.role_change_failed", "Cuenta no encontrada", {
        req,
        httpStatus: 404,
        extra: { accountId },
      });
      return res.status(404).json({ message: "Cuenta no encontrada" });
    }

    if (account.isActive === false) {
      notifyFail("auth.role_change_failed", "Cuenta inactiva", {
        req,
        httpStatus: 403,
        extra: { accountId, reason: "account_inactive" },
      });
      return res.status(403).json({ message: "Cuenta inactiva. Contacte al administrador." });
    }

    const hasRole = account.roles.find((r) => r.id === rolId);
    if (!hasRole) {
      notifyFail("auth.role_change_failed", "No tiene asignado ese rol", {
        req,
        httpStatus: 403,
        extra: { accountId, rolId, reason: "role_not_assigned" },
      });
      return res.status(403).json({ message: "No tiene asignado ese rol" });
    }

    const payload = {
      userId: account.userId,
      accountId: account.id,
      rolId: hasRole.id,
      loginRol: hasRole.name,
    };

    const token = await createAccessToken({ payload });
    notifyOk("auth.role_changed", "Cambio de rol", {
      accountId: account.id,
      rolId: hasRole.id,
      loginRol: hasRole.name,
    });
    res.json({
      token,
      message: `Rol cambiado a ${hasRole.name}`,
    });
  } catch (error) {
    notifyFail("auth.role_change_failed", "Error al cambiar de rol", {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "Error al cambiar de rol", error: error.message });
  }
};


export const verifytoken = async (req, res) => {
  
  try {
    const token = getHeaderToken(req);

  if (!token) return res.status(401).json({ message: "Unauthorized" });

    const decoded = await verifyJWT(token);

    res.json(decoded);
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized" });
  }
};
export const renoveLicense = async (req, res) => {
  const {name} = req.body;
  const now = new Date();
  try {
    const lic= await License.findOne({
      where: {...name,valide:1}
    });

    if(!lic) {
      notifyFail("license.renew_failed", "Clave incorrecta para Licencia", {
        req,
        httpStatus: 401,
        extra: { reason: "invalid_key" },
      });
      return res.status(401).json({ message: "Clave incorrecta para Licencia" });
    }

    const dateExpiration = calculateExpirationDate(now, lic.time);


  const payload={
    time:lic.time,
    dateCreation:lic.dateCreation,
    codex:lic.name,
  }
  const token = await createLicenseToken({payload})
     await License.update({valide:0,token:token,dateUse:now,dateExpiration:dateExpiration},
      {
        where: {
          valide: 1,id:lic.id
        },
      }
    );

    const newTokenKey= await License.findOne({
      attributes:["token",'dateCreation',"name","time","dateExpiration"],
      where: {id:lic.id}
    });
    notifyOk("license.renewed", "Licencia renovada", {
      licenseId: lic.id,
      name: lic.name,
    });
    res.json({ message: "Clave correcta para Licencia",data:newTokenKey });
  } catch (error) {
    notifyFail("license.renew_failed", "License Caducada", {
      error,
      req,
      httpStatus: 401,
    });
    return res.status(401).json({ message: "License Caducada" });
  }
};
export const getLicenses = async (req, res) => {
  try {
    const data = await License.findAll();

    // console.log("Consulta completada:", users);
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Error en el servidor." });
  }
  };
  export const addLicense = async (req, res) => {
    try {
    
      const {time,valorTime,name}= req.body;
  
      const newData = await License.create({
        time:`${valorTime}${time}`,
        name:name
      });
      notifyOk("license.created", "Licencia creada", {
        licenseId: newData.id,
        name: newData.name,
      });
      res.json({ message: `agregado con éxito`,data:newData});
  
    } catch (error) {
      console.error("error al crear el rol:", error);
      notifyFail("license.create_failed", "Error al crear la licencia", {
        error,
        req,
        httpStatus: 500,
      });
      res.status(500).json({ message: error.message });
    }
  };

  export const getOneLicense = async (req, res) => {
    const { id } = req.params;
    try {
      const data = await License.findOne({
        where: { id:id },
      });
      res.json(data);
    } catch (error) {
      res.status(500).json({
        message: error.message,
      });
    }
  };
 
  export const deleteLicense= async (req, res) => {
    try {
      const licenseId = req.params.id;
      await License.destroy({
        where: {
          id: licenseId,
        },
      });
      notifyOk("license.deleted", `Licencia #${licenseId}`, { licenseId });
      res.json({ message: "Licencia eleminada con éxito" });
    } catch (error) {
      notifyFail("license.delete_failed", `Error al eliminar licencia #${req.params.id}`, {
        error,
        req,
        httpStatus: 500,
      });
      return res.status(500).json({
        message: error.message,
      });
    }
  };
  export const updateLicense = async (req, res) => {
    const data=req.body;
    const licenseId = req.params.id;
    try {
      const lic = await License.findOne({
        where: { id: licenseId },
      });
      if(lic.valide==0) {
        notifyFail("license.update_failed", "Ya no se puede Editar", {
          req,
          httpStatus: 401,
          extra: { licenseId, reason: "already_used" },
        });
        return res.status(401).json({ message: "Ya no se puede Editar" });
      }

      await License.update(data,
        {
          where: {
            id: licenseId,
          },
        }
      );
      notifyOk("license.updated", `Licencia #${licenseId}`, { licenseId });
      res.json({ message: "Licencia editada con éxito" });
    } catch (error) {
      notifyFail("license.update_failed", `Error al editar licencia #${licenseId}`, {
        error,
        req,
        httpStatus: 500,
      });
      res.status(500).json({
        message: error.message,
      });
    }
  };
  

// export { login, verifytoken };
