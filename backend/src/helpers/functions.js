/**
 * Slug para URLs/categorías: normaliza acentos, minúsculas, reemplaza no-alfanuméricos por guiones.
 * Usado por CatalogController y CatalogVitrinaController.
 */
export function slugify(s = "") {
  return String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Función para calcular la fecha de expiración según `lic.time`
export function calculateExpirationDate(now, time) {
    const expirationDate = new Date(now);
    const value = parseInt(time.slice(0, -1));  // Extrae el número
    const unit = time.slice(-1);                // Extrae la unidad (s, m, h, d, w, y)
  
    switch (unit) {
      case 's': // Segundos
        expirationDate.setSeconds(expirationDate.getSeconds() + value);
        break;
      case 'm': // Minutos
        expirationDate.setMinutes(expirationDate.getMinutes() + value);
        break;
      case 'h': // Horas
        expirationDate.setHours(expirationDate.getHours() + value);
        break;
      case 'd': // Días
        expirationDate.setDate(expirationDate.getDate() + value);
        break;
      case 'w': // Semanas
        expirationDate.setDate(expirationDate.getDate() + value * 7);
        break;
      case 'y': // Años
        expirationDate.setFullYear(expirationDate.getFullYear() + value);
        break;
      default:
        throw new Error("Unidad de tiempo no válida en lic.time");
    }
  
    return expirationDate.toISOString(); // Devuelve en formato ISO para almacenar en la base de datos
  }
  

  