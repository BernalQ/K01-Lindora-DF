import ExcelJS from 'exceljs'
import fs from 'node:fs'
import { VENTAS_XLSX, asegurarCarpetaDatos } from './paths.js'
import { crearCola } from './colaEscritura.js'
import type { FacturaItem } from '../types.js'

/**
 * Bitácora ligera de ventas (con y sin factura electrónica), respaldada en
 * `print-bridge/data/ventas.xlsx`, para control interno mientras no exista
 * una base central (Codisa). Es sólo un registro de auditoría/control de
 * ventas — no reemplaza la cola de impresión/reintento en IndexedDB del
 * lado de la PWA (`offlineQueue.ts`).
 */

const HOJA = 'ventas'
const COLUMNAS: Partial<ExcelJS.Column>[] = [
  { header: 'fecha', key: 'fecha', width: 22 },
  { header: 'mesa', key: 'mesa', width: 10 },
  { header: 'tipoPago', key: 'tipoPago', width: 14 },
  { header: 'cedulaCliente', key: 'cedulaCliente', width: 16 },
  { header: 'nombreCliente', key: 'nombreCliente', width: 30 },
  { header: 'total', key: 'total', width: 12 },
  { header: 'claveFactura', key: 'claveFactura', width: 55 },
  { header: 'items', key: 'items', width: 60 },
]

export interface RegistroVenta {
  mesa: string
  tipoPago: 'factura' | 'simple'
  total: number
  items: FacturaItem[]
  cedulaCliente?: string
  nombreCliente?: string
  claveFactura?: string
}

const encolar = crearCola()

async function abrirLibro(): Promise<ExcelJS.Workbook> {
  asegurarCarpetaDatos()
  const workbook = new ExcelJS.Workbook()
  if (fs.existsSync(VENTAS_XLSX)) {
    await workbook.xlsx.readFile(VENTAS_XLSX)
  }
  let hoja = workbook.getWorksheet(HOJA)
  if (!hoja) hoja = workbook.addWorksheet(HOJA)
  hoja.columns = COLUMNAS
  return workbook
}

/** Agrega una fila al log de ventas (control interno, tipo bitácora, sólo inserción). */
export async function registrarVentaEnExcel(registro: RegistroVenta): Promise<void> {
  await encolar(async () => {
    const workbook = await abrirLibro()
    const hoja = workbook.getWorksheet(HOJA)!
    const resumenItems = registro.items
      .map((i) => (i.cantidad > 1 ? `${i.nombre} x${i.cantidad}` : i.nombre))
      .join(', ')
    hoja
      .addRow({
        fecha: new Date().toISOString(),
        mesa: registro.mesa,
        tipoPago: registro.tipoPago,
        cedulaCliente: registro.cedulaCliente ?? '',
        nombreCliente: registro.nombreCliente ?? '',
        total: registro.total,
        claveFactura: registro.claveFactura ?? '',
        items: resumenItems,
      })
      .commit()
    await workbook.xlsx.writeFile(VENTAS_XLSX)
  })
}
