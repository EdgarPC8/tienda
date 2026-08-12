
import { sequelize } from '../../database/connection.js';
import {  InventoryProduct, InventoryRecipe } from '../../models/Inventory.js';
import { notifyOk, notifyFail } from "../../services/notifyRaptorSolutions.js";
// controllers/registerProductionController.js


const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export const registerProductionController = async (req, res) => {
  const payload = req.body || {};

  try {
    const intermedio = payload.intermedio || {};
    const productos = Array.isArray(payload.productos) ? payload.productos : [];
    const transformaciones = Array.isArray(payload.transformaciones)
      ? payload.transformaciones
      : [];
    const insumos = Array.isArray(payload.insumos) ? payload.insumos : [];

    if (!intermedio.id || !num(intermedio.gramos)) {
      notifyFail("production.intermediate_register_failed", "intermedio.id y gramos requeridos", {
        req,
        httpStatus: 400,
      });
      return res.status(400).json({
        error: "intermedio.id y intermedio.gramos son requeridos",
      });
    }

    const result = await sequelize.transaction(async (t) => {
      const resumen = {
        intermedio: null,
        productosAgregados: [],
        transformacionesRegistradas: [], // <- solo registro, NO stock
        insumosDescontados: [],
      };

      const fetchProduct = async (id) => {
        const p = await InventoryProduct.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!p) throw new Error(`Producto ${id} no encontrado`);
        return p;
      };

      const adjustStock = async (productId, delta, motivo) => {
        const p = await fetchProduct(productId);
        const prev = num(p.stock);
        const next = prev + delta;
        await p.update({ stock: next }, { transaction: t });
        return { id: p.id, nombre: p.name, unitId: p.unitId, antes: prev, despues: next, delta, motivo };
      };

      // 3) Descontar intermedio (gramos)
      {
        const p = await fetchProduct(intermedio.id);
        if (p.type !== "intermediate") {
          throw new Error(`El producto intermedio (${p.id}) no es de tipo "intermediate"`);
        }
        const gramosConsumidos = num(intermedio.gramos);
        const movimiento = await adjustStock(p.id, -gramosConsumidos, "Consumo intermedio (gramos)");
        resumen.intermedio = movimiento;
      }

      // 4) Agregar stock de todos los productos en el carrito (NETOS)
      for (const it of productos) {
        const p = await fetchProduct(it.id);
        const cantidad = num(it.cantidad);
        const delta = cantidad; // si manejas finales en gramos, ajusta aquí
        const movimiento = await adjustStock(p.id, +delta, "Producción (carrito neto)");
        resumen.productosAgregados.push({
          ...movimiento,
          gramosPorUnidadIntermedio: num(it.gramosPorUnidadIntermedio || 0),
        });
      }

      // 5) Transformaciones: SOLO registrar (no tocar stock)
      //    Si tienes tabla de auditoría, inserta aquí; por ahora lo dejamos en el resumen.
      for (const tr of transformaciones) {
        resumen.transformacionesRegistradas.push({
          hijoId: tr.hijoId,
          hijoNombre: tr.hijoNombre,
          cantidad: num(tr.cantidad),
          padreId: tr.padreId,
          unidadesPadrePorUnidadHijo: num(tr.unidadesPadrePorUnidadHijo),
        });
      }

      // 6) Insumos adicionales (dec) -> descontar
      for (const ins of insumos) {
        const prod = await fetchProduct(ins.id);
        let delta = 0;

        if (ins.gramos != null) {
          if (prod.unitId === 1) {
            const sw = num(prod.standardWeightGrams);
            delta = sw > 0 ? -(num(ins.gramos) / sw) : -num(ins.gramos);
          } else {
            delta = -num(ins.gramos);
          }
        } else if (ins.unidades != null) {
          if (prod.unitId === 1) {
            delta = -num(ins.unidades);
          } else {
            const sw = num(prod.standardWeightGrams);
            delta = sw > 0 ? -(num(ins.unidades) * sw) : -num(ins.unidades);
          }
        } else {
          continue;
        }

        const mov = await adjustStock(prod.id, delta, "Consumo de insumo adicional");
        resumen.insumosDescontados.push(mov);
      }

      return resumen;
    });

    notifyOk("production.intermediate_registered", "Producción intermedia", { resumen: result });
    return res.status(200).json({ ok: true, message: "Producción registrada", resumen: result });
  } catch (err) {
    console.error("registerProductionController error:", err);
    notifyFail("production.intermediate_register_failed", "Error al registrar la producción", {
      error: err,
      req,
      httpStatus: 500,
    });
    return res.status(500).json({
      ok: false,
      error: "Error al registrar la producción",
      detail: String(err?.message || err),
    });
  }
};


async function buildSimulation(productId, cantidadFinal, multiplicador = 1, debugLog = [], variablesUtilizadas = [],nivel=0) {
  const productoFinal = await InventoryProduct.findByPk(productId);
  if (!productoFinal) throw new Error("Producto no encontrado");

  const receta = await InventoryRecipe.findAll({ where: { productFinalId: productId } });



  const resultado = {
    producto: productoFinal.name,
    id: productoFinal.id,
    cantidadDeseada: cantidadFinal,
    unidad: productoFinal.unitId === 1 ? "unidad" : "gramos",
    requiere: [],
  };


     for (const item of receta) {
    const insumo = await InventoryProduct.findByPk(item.productRawId);
    // const recetaInsumo = await InventoryRecipe.findAll({ where: { productFinalId: insumo.id } });

    if (!insumo) continue;

    const esIntermedio = insumo.type === "intermediate";
    const unitEsUnidad = insumo.unitId === 1;
    const itemQty = parseFloat(item.quantity);
    const isCantidadEnGrams = item.isQuantityInGrams === true;

    let cantidadBase = itemQty * cantidadFinal * multiplicador;
    let cantidadGramos = cantidadBase;
    let cantidadUnidades = cantidadBase;

    const productionYieldGrams = insumo.productionYieldGrams || insumo.standardWeightGrams || 0;

    let lotesNecesarios = 1;
    let productionYield = 0;
    let sobrante = 0;

    let stockDisponible = insumo.stock || 0;
    let stockFinalEstimado = stockDisponible;

    if (esIntermedio) {
      if (isCantidadEnGrams && unitEsUnidad && productionYieldGrams > 0) {
        cantidadGramos = itemQty * cantidadFinal;

        // RESTAR stock antes de calcular
        const stockUsado = Math.min(cantidadGramos, stockDisponible);
        const faltante = Math.max(0, cantidadGramos - stockDisponible);

        lotesNecesarios = Math.ceil((faltante / productionYieldGrams) * 2) / 2;
        const producido = lotesNecesarios * productionYieldGrams;
        sobrante = producido + stockUsado - cantidadGramos;
        cantidadUnidades = lotesNecesarios;
        productionYield = productionYieldGrams;
        stockFinalEstimado = stockDisponible - stockUsado;
      } else if (unitEsUnidad) {
        const stockUsado = Math.min(cantidadUnidades, stockDisponible);
        const faltante = Math.max(0, cantidadUnidades - stockDisponible);

        lotesNecesarios = Math.ceil(faltante * 2) / 2;
        productionYield = 1;
        sobrante = lotesNecesarios + stockUsado - cantidadUnidades;
        stockFinalEstimado = stockDisponible - stockUsado;
      } else {
        const recetaInsumo = await InventoryRecipe.findAll({ where: { productFinalId: insumo.id } });

        let totalIngredientes = 0;
        for (const ingr of recetaInsumo) {
          const prodIngr = await InventoryProduct.findByPk(ingr.productRawId);
          let cantidad = parseFloat(ingr.quantity);
          if (prodIngr.unitId === 1 && prodIngr.standardWeightGrams) {
            cantidad *= prodIngr.standardWeightGrams;
          }
          totalIngredientes += cantidad;
        }

        productionYield = totalIngredientes;

        const stockUsado = Math.min(cantidadGramos, stockDisponible);
        const faltante = Math.max(0, cantidadGramos - stockDisponible);

        lotesNecesarios = Math.ceil((faltante / productionYield) * 2) / 2;
        const producido = lotesNecesarios * productionYield;
        sobrante = producido + stockUsado - cantidadGramos;
        stockFinalEstimado = stockDisponible - stockUsado;
      }
    } else {
      if (unitEsUnidad) {
        stockFinalEstimado = stockDisponible - cantidadUnidades;
      } else {
        stockFinalEstimado = stockDisponible - cantidadGramos;
      }
    }

    variablesUtilizadas.push({
      productoFinalId: productoFinal.id,
      productoFinalNombre: productoFinal.name,
      insumoId: insumo.id,
      insumoNombre: insumo.name,
      cantidadRequeridaPorUnidad: itemQty,
      cantidadFinalSolicitada: cantidadFinal,
      cantidadBase,
      cantidadGramos,
      cantidadUnidades,
      esIntermedio,
      unitId: insumo.unitId,
      unidad: unitEsUnidad ? "unidad" : "gramos",
      standardWeightGrams: insumo.standardWeightGrams || null,
      productionYieldGrams: insumo.productionYieldGrams || null,
      stockActual: stockDisponible,
      stockFinalEstimado,
      cantidadEnGramos: isCantidadEnGrams,
    });

    const nodo = {
      producto: insumo.name,
      id: insumo.id,
      stockActual: stockDisponible,
      stockFinalEstimado,
      esIntermedio,
      unitId: insumo.unitId,
    };

    if (!esIntermedio) {
      if (unitEsUnidad) {
        nodo.cantidadUnidades = Math.ceil(cantidadUnidades);
        nodo.cantidadConsumida = cantidadUnidades;
      } else {
        nodo.cantidadGramos = cantidadGramos;
        nodo.cantidadConsumida = cantidadGramos;
    //                 if (productoFinal.standardWeightGrams>0 
    //                   && nivel===0 
    //                   && insumo.unitId!==0
    //                   && recetaInsumo.length > 0
    //                 ) {
    //     nodo.cantidadGramos = cantidadFinal * (itemQty / productoFinal.standardWeightGrams);
    // }
    //con ese de nivel solucione lo que afecta a los demas insumos, pero ahora tambien afecta a lo de las grajeas 

      }
    } 
    else {
      nodo.lotesNecesarios = lotesNecesarios;
      nodo.productionYield = productionYield;
      nodo.sobrante = sobrante;
      if (unitEsUnidad) {
        nodo.cantidadUnidades = cantidadUnidades;
        nodo.cantidadConsumida = cantidadUnidades;
      } else {
        nodo.cantidadGramos = cantidadGramos;
        nodo.cantidadConsumida = cantidadGramos;
       
      }

      const subResultado = await buildSimulation(
        insumo.id,
        lotesNecesarios,
        1,
        debugLog,
        variablesUtilizadas,
        nivel + 1
      );
      nodo.requiere = subResultado.resultado.requiere;
    }
 

    resultado.requiere.push(nodo);
  }



// Helper: calcula cuántos gramos rinde la receta base para productId

  return { resultado, debugLog, variablesUtilizadas };
}
// Controlador Express
export const simulateProductionController = async (req, res) => {
  try {
    const productId = parseInt(req.query.productId);
    const cantidad = parseInt(req.query.cantidad);


    // console.log("Producto:", productId);
    // 📦 Ejecutar


    if (!productId || !cantidad || isNaN(productId) || isNaN(cantidad)) {
      return res.status(400).json({ message: "Parámetros inválidos" });
    }
    const resultado = await buildSimulation(productId, cantidad);
    res.status(200).json(resultado);
  } catch (error) {
    console.error("Error en simulación de producción:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};


// Helper: construye un nodo piramidal de producción
async function buildProductionNode(productId) {
  const producto = await InventoryProduct.findByPk(productId);
  if (!producto) return null;

  const nodo = {
    producto: producto.name,
    id: producto.id,
    esIntermedio: producto.type === "intermediate",
    unidad: producto.unitId === 1 ? "unidad" : "gramos",
    requiere: [],
    puedeProducir: [],
  };

  // 1) Qué requiere (su receta)
  const receta = await InventoryRecipe.findAll({ where: { productFinalId: productId } });
  for (const item of receta) {
    const insumo = await InventoryProduct.findByPk(item.productRawId);
    if (!insumo) continue;
    nodo.requiere.push({
      producto: insumo.name,
      id: insumo.id,
      esIntermedio: insumo.type === "intermediate",
      unidad: insumo.unitId === 1 ? "unidad" : "gramos",
      cantidad: item.quantity,
      isQuantityInGrams: item.isQuantityInGrams === true,
    });
  }

  // 2) En qué productos se puede usar (hijos)
  const usos = await InventoryRecipe.findAll({ where: { productRawId: productId } });
  for (const uso of usos) {
    const destino = await InventoryProduct.findByPk(uso.productFinalId);
    if (!destino) continue;

    const subNodo = await buildProductionNode(destino.id); // 👈 recursión aquí
    if (subNodo) {
      subNodo.consumoPorUnidad = uso.isQuantityInGrams
        ? uso.quantity
        : uso.quantity * (producto.standardWeightGrams || 1);

      nodo.puedeProducir.push(subNodo);
    }
  }

  return nodo;
}

export const simulateFromIntermediate = async (req, res) => {
  try {
    const intermediateId = Number(req.body?.intermediateId ?? req.query?.intermediateId);
    if (!Number.isFinite(intermediateId) || intermediateId <= 0) {
      return res.status(400).json({ error: "intermediateId inválido" });
    }

    const inter = await InventoryProduct.findByPk(intermediateId);
    if (!inter) return res.status(404).json({ error: "Intermedio no encontrado" });
    if (inter.type !== "intermediate" && !inter.esIntermedio) {
      return res.status(400).json({ error: "El producto indicado no es intermedio" });
    }

    // Calcular masa producida (igual que antes)
    let producedGrams = Number(inter.standardWeightGrams || 0);
    if (!(producedGrams > 0)) {
      const recetaInsumos = await InventoryRecipe.findAll({ where: { productFinalId: intermediateId } });
      let suma = 0;
      for (const insumo of recetaInsumos) {
        const prodInsumo = await InventoryProduct.findByPk(insumo.productRawId);
        if (!prodInsumo) continue;
        if (prodInsumo.unitId === 1 && prodInsumo.standardWeightGrams) {
          suma += Number(insumo.quantity) * Number(prodInsumo.standardWeightGrams);
        } else {
          suma += Number(insumo.quantity);
        }
      }
      producedGrams = suma;
    }

    // Construir el árbol completo desde el intermedio
    const arbol = await buildProductionNode(intermediateId);
    arbol.producedGrams = producedGrams; // añadir masa calculada

    return res.json(arbol);
  } catch (error) {
    console.error("simulateFromIntermediate error:", error);
    return res.status(500).json({
      error: "Error interno en simulateFromIntermediate",
      detail: String(error),
    });
  }
};






