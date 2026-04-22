import { Logs } from "../models/Logs.js";

export const loggerMiddleware = (req, res, next) => {
  Logs.create({
    httpMethod: req.method,
    action: "request",
    endPoint: req.originalUrl,
    description: `${req.method} ${req.originalUrl}`,
    system: "tienda",
  }).catch(() => {
    // Mantener el request vivo aunque falle el insert de logs
  });

  next();
};
