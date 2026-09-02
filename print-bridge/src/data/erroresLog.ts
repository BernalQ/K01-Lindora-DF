import fs from 'node:fs'
import { ERRORES_FACTURA_LOG, asegurarCarpetaDatos } from './paths.js'

export interface ErrorFactura {
  cedula: string
  nombre: string
  mesa: string
  total: number
  mensajeError: string
}

/**
 * Registra en un log local (texto plano, una línea JSON por evento) cada vez
 * que Hacienda/Codisa rechaza una factura o el flujo de facturación falla
 * por otra razón (requerimiento 6: "Registrar error en log local").
 *
 * Es un complemento a `ventas.xlsx` (que ya guarda una fila cuando se
 * rechaza una venta con factura): este archivo permite auditar rápido el
 * detalle del error sin tener que abrir el Excel, y sobrevive a reinicios
 * del proceso (a diferencia de sólo loguear con console.error).
 *
 * No lanza si falla la escritura: registrar el error nunca debe bloquear
 * la respuesta al PWA.
 */
export function registrarErrorFactura(error: ErrorFactura): void {
  try {
    asegurarCarpetaDatos()
    const linea = JSON.stringify({ fecha: new Date().toISOString(), ...error })
    fs.appendFileSync(ERRORES_FACTURA_LOG, linea + '\n', 'utf-8')
  } catch (err) {
    console.error('[print-bridge] No se pudo escribir el log local de errores de factura:', err)
  }
}
