/** Respuesta JSON uniforme para toasts del frontend ({ message }). */
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

  if (status === 500 && message.startsWith("Origen no permitido")) {
    return res.status(403).json({ message });
  }

  res.status(status).json({ message });
}
