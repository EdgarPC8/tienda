/**
 * Conexión al gestor central (Raptor Solutions).
 * Variables en backend/.env — ver .env.example
 */
export const subscription = {
  api:
    process.env.SUBSCRIPTION_API_URL ||
    "https://aplicaciones.marianosamaniego.edu.ec/raptorsolutions/api",
};
