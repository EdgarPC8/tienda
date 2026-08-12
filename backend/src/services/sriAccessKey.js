/** Clave de acceso SRI (49 dígitos) + dígito verificador módulo 11. */

export function padDigits(value, length) {
  return String(value ?? "")
    .replace(/\D/g, "")
    .padStart(length, "0")
    .slice(-length);
}

/** Ambiente SRI en clave: pruebas=1, producción=2 */
export function sriAmbienteCode(environment) {
  return environment === "produccion" ? "2" : "1";
}

/**
 * Dígito verificador módulo 11 (algoritmo SRI).
 * @param {string} base48 primeros 48 dígitos
 */
export function sriCheckDigit(base48) {
  const factors = [2, 3, 4, 5, 6, 7];
  let sum = 0;
  let fi = 0;
  for (let i = base48.length - 1; i >= 0; i -= 1) {
    sum += Number(base48[i]) * factors[fi % 6];
    fi += 1;
  }
  const mod = sum % 11;
  const check = 11 - mod;
  if (check === 11) return "0";
  if (check === 10) return "1";
  return String(check);
}

/**
 * @param {{
 *   issueDate: Date,
 *   documentType?: string,
 *   ruc: string,
 *   environment: string,
 *   establishmentCode: string,
 *   emissionPointCode: string,
 *   sequential: number,
 *   numericCode?: string,
 *   emissionType?: string,
 * }} opts
 */
export function buildAccessKey(opts) {
  const d = opts.issueDate instanceof Date ? opts.issueDate : new Date(opts.issueDate);
  const dd = padDigits(d.getDate(), 2);
  const mm = padDigits(d.getMonth() + 1, 2);
  const yyyy = String(d.getFullYear());
  const datePart = `${dd}${mm}${yyyy}`;
  const tipo = padDigits(opts.documentType || "01", 2);
  const ruc = padDigits(opts.ruc, 13);
  const ambiente = sriAmbienteCode(opts.environment);
  const serie = `${padDigits(opts.establishmentCode, 3)}${padDigits(opts.emissionPointCode, 3)}`;
  const secuencial = padDigits(opts.sequential, 9);
  const codigo =
    opts.numericCode != null
      ? padDigits(opts.numericCode, 8)
      : padDigits(Math.floor(Math.random() * 1e8), 8);
  const tipoEmision = padDigits(opts.emissionType || "1", 1);
  const base48 = `${datePart}${tipo}${ruc}${ambiente}${serie}${secuencial}${codigo}${tipoEmision}`;
  if (base48.length !== 48 || !/^\d{48}$/.test(base48)) {
    throw Object.assign(new Error("No se pudo armar la clave de acceso"), { status: 500 });
  }
  return `${base48}${sriCheckDigit(base48)}`;
}
