import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

// src/data/paths.ts -> print-bridge/data (fuera de src/dist, junto al proyecto)
const AQUI = path.dirname(fileURLToPath(import.meta.url))
export const DATA_DIR = path.resolve(AQUI, '../../data')
export const FACTURAS_DIR = path.join(DATA_DIR, 'facturas')
export const CLIENTES_XLSX = path.join(DATA_DIR, 'clientes.xlsx')
export const VENTAS_XLSX = path.join(DATA_DIR, 'ventas.xlsx')
/** Log local (texto plano, una línea JSON por evento) de facturas rechazadas o fallidas. */
export const ERRORES_FACTURA_LOG = path.join(DATA_DIR, 'facturas-errores.log')

/**
 * Asegura que exista la carpeta `data/` (y `data/facturas/`) del print-bridge.
 * Contiene información personal de clientes (cédula, correo, teléfono,
 * dirección): NO debe subirse al repositorio (ver .gitignore raíz).
 */
export function asegurarCarpetaDatos(): void {
  fs.mkdirSync(FACTURAS_DIR, { recursive: true })
}
