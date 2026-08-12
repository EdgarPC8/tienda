/**
 * Ejecuta un controlador Express (req, res) y devuelve el JSON como Promise.
 */
export function invokeController(handler, req = {}) {
  return new Promise((resolve, reject) => {
    let statusCode = 200;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        if (statusCode >= 400) {
          reject(Object.assign(new Error(data?.message || "Error en controlador"), { status: statusCode, data }));
          return;
        }
        resolve(data);
      },
    };

    Promise.resolve(handler(req, res)).catch(reject);
  });
}

function pickProductStockFields(p) {
  return {
    id: p.id,
    name: p.name,
    price: Number(p.price ?? 0),
    stock: Number(p.stock ?? 0),
    minStock: Number(p.minStock ?? 0),
    type: p.type,
    isActive: p.isActive,
  };
}

/**
 * Bandas de alerta respecto al mínimo M:
 * - agotados: stock ≤ 0
 * - critico / porAgotarse: 0 < stock ≤ M
 * - bajo: M < stock ≤ 1.5×M
 * - precaucion: 1.5×M < stock ≤ 2×M
 * (stock > 2×M o M≤0 con stock>0 → sin alerta)
 */
export function classifyStockAlertBand(stockRaw, minRaw) {
  const stock = Number(stockRaw ?? 0);
  const min = Number(minRaw ?? 0);
  if (stock <= 0) return "agotados";
  if (!(min > 0)) return null;
  if (stock <= min) return "critico";
  if (stock <= min * 1.5) return "bajo";
  if (stock <= min * 2) return "precaucion";
  return null;
}

export function buildProductsStockAlerts(products = []) {
  const list = Array.isArray(products) ? products : [];
  const agotados = [];
  const critico = [];
  const bajo = [];
  const precaucion = [];

  for (const p of list) {
    const band = classifyStockAlertBand(p.stock, p.minStock);
    if (!band) continue;
    const row = pickProductStockFields(p);
    if (band === "agotados") agotados.push(row);
    else if (band === "critico") critico.push(row);
    else if (band === "bajo") bajo.push(row);
    else if (band === "precaucion") precaucion.push(row);
  }

  agotados.sort((a, b) => String(a.name).localeCompare(String(b.name), "es"));
  const byStock = (a, b) => a.stock - b.stock || a.minStock - b.minStock;
  critico.sort(byStock);
  bajo.sort(byStock);
  precaucion.sort(byStock);

  return {
    agotados,
    /** @deprecated alias de critico (compat UI antigua) */
    porAgotarse: critico,
    critico,
    bajo,
    precaucion,
  };
}
