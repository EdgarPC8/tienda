/** Respuesta JSON uniforme para toasts del frontend ({ message }). */
const SQLISH = /sequelize|sql|syntax|foreign key|cannot add or update|cannot be null|ER_|violation|constraint/i;

function cleanMessage(message, status) {
  if (typeof message !== "string" || !SQLISH.test(message)) return message;
  return Number(status) >= 500
    ? "Error interno del servidor"
    : "No se pudo guardar. Revisá los datos.";
}

export function scrubSqlResponses(req, res, next) {
  const orig = res.json.bind(res);
  res.json = (body) => {
    if (!body || typeof body !== "object" || Array.isArray(body)) return orig(body);
    const nextBody = { ...body };
    if (typeof nextBody.message === "string") {
      nextBody.message = cleanMessage(nextBody.message, res.statusCode);
    }
    if (nextBody.error != null && (typeof nextBody.error !== "string" || SQLISH.test(nextBody.error))) {
      delete nextBody.error;
      if (!nextBody.message) nextBody.message = cleanMessage("sequelize", res.statusCode);
    }
    return orig(nextBody);
  };
  next();
}

export function notFoundMiddleware(req, res) {
  res.status(404).json({ message: "Ruta no encontrada" });
}

export function errorMiddleware(err, req, res, next) {
  if (res.headersSent) return next(err);

  console.error("[API Error]", err);

  const status = Number(err.status || err.statusCode) || 500;
  let message = "Error interno del servidor";

  if (typeof err.message === "string" && err.message.trim()) {
    message = err.message.trim();
  }
  if (status >= 500 && SQLISH.test(message)) {
    message = "Error interno del servidor";
  }

  if (status === 500 && message.startsWith("Origen no permitido")) {
    return res.status(403).json({ message });
  }

  res.status(status).json({ message });
}
