/**
 * Conexión al gestor central (gestor-proyectos-negocios).
 * Variables en backend/.env — ver .env.example
 */
export const subscription = {
  api:
    process.env.SUBSCRIPTION_API_URL ||
    "https://aplicaciones.marianosamaniego.edu.ec/gestor-proyectos-negocios/api",
};
