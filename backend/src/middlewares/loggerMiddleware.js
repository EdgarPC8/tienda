// loggerMiddleware.js
import { getHeaderToken, verifyJWT } from "../libs/jwt.js";
import { logger } from "../log/LogActivity.js";
import { resolveLogAction } from "../log/logActionCatalog.js";
import { Account } from "../models/Account.js";
import { Roles } from "../models/Roles.js";
import { Users } from "../models/Users.js";

const methodsToFilter = ["GET", "OPTIONS", "HEAD"];

export const loggerMiddleware = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const system = req.headers["user-agent"];
  const method = req.method;
  const endPoint = req.originalUrl || req.url || "";

  if (methodsToFilter.includes(method)) {
    return next();
  }

  const action = resolveLogAction(method, endPoint);
  const isLogin = action === "Login";

  // Login: registrar aunque aún no haya token
  if (isLogin) {
    try {
      logger({
        httpMethod: method,
        endPoint,
        action,
        description: "Intento de inicio de sesión",
        system,
      });
    } catch (error) {
      console.error("Error al registrar log de login:", error);
    }
    return next();
  }

  if (!authHeader || authHeader === "Bearer null") {
    return next();
  }

  try {
    const token = getHeaderToken(req);
    const user = await verifyJWT(token);

    const account = await Account.findOne({
      include: [
        {
          model: Roles,
          as: "roles",
          through: { attributes: [] },
        },
        {
          model: Users,
          as: "user",
        },
      ],
      where: { id: user.accountId },
    });

    const rolName = account?.roles?.[0]?.name || user.loginRol || "Rol desconocido";
    const firstName = account?.user?.firstName || "";
    const lastName = account?.user?.firstLastName || "";
    const who = [firstName, lastName].filter(Boolean).join(" ") || `cuenta #${user.accountId}`;

    logger({
      httpMethod: method,
      endPoint,
      action,
      description: `El ${rolName} ${who} realizó: ${action}`,
      system,
    });
  } catch (error) {
    console.error("Error al procesar la solicitud (logger):", error);
  }

  next();
};
