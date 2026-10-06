const ID_PARAMS = [
  "id",
  "storeId",
  "productId",
  "exhibidorId",
  "userId",
  "accountId",
  "customerId",
  "orderId",
  "genericId",
  "productFinalId",
  "movementId",
  "templateId",
];

export function attachNumericParams(router) {
  if (!router?.param) return;
  for (const name of ID_PARAMS) {
    router.param(name, (_req, res, next, value) => {
      if (!/^\d+$/.test(String(value || ""))) {
        res.status(400).json({ message: "El identificador no es válido" });
        return;
      }
      next();
    });
  }
}
