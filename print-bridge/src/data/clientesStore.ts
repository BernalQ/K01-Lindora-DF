import ExcelJS from 'exceljs'
import fs from 'node:fs'
import { CLIENTES_XLSX, asegurarCarpetaDatos } from './paths.js'
import { crearCola } from './colaEscritura.js'
import type { Cliente } from '../types.js'

/**
 * Base "temporal" de clientes para facturación electrónica, respaldada en
 * un archivo Excel local (`print-bridge/data/clientes.xlsx`), tal como se
 * pidió mientras no exista integración con el API de Codisa (ver punto 4
 * del requerimiento: cuando el API esté habilitado, este archivo se migra
 * a la base central usando `cedula` como llave primaria — ver
 * `buscarClientePorCedula`, que ya está aislado detrás de esta interfaz
 * para que ese cambio no afecte al resto del sistema).
 */

const HOJA = 'clientes'
const COLUMNAS: Partial<ExcelJS.Column>[] = [
  { header: 'cedula', key: 'cedula', width: 16 },
  { header: 'nombre', key: 'nombre', width: 30 },
  { header: 'correo', key: 'correo', width: 30 },
  { header: 'telefono', key: 'telefono', width: 16 },
  { header: 'direccion', key: 'direccion', width: 40 },
  { header: 'actualizadoEn', key: 'actualizadoEn', width: 22 },
]

const encolar = crearCola()

async function abrirLibro(): Promise<ExcelJS.Workbook> {
  asegurarCarpetaDatos()
  const workbook = new ExcelJS.Workbook()
  if (fs.existsSync(CLIENTES_XLSX)) {
    await workbook.xlsx.readFile(CLIENTES_XLSX)
  }
  let hoja = workbook.getWorksheet(HOJA)
  if (!hoja) hoja = workbook.addWorksheet(HOJA)
  // Reasignar columnas es seguro tanto en hojas nuevas como recién leídas:
  // sólo define encabezado + llaves de columna, no borra filas existentes.
  hoja.columns = COLUMNAS
  return workbook
}

function normalizarCedula(cedula: string): string {
  return cedula.trim()
}

export async function buscarClientePorCedula(cedula: string): Promise<Cliente | null> {
  return encolar(async () => {
    const workbook = await abrirLibro()
    const hoja = workbook.getWorksheet(HOJA)!
    const buscada = normalizarCedula(cedula)
    let encontrado: Cliente | null = null
    hoja.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return // encabezado
      const valor = String(row.getCell('cedula').value ?? '').trim()
      if (valor === buscada) {
        encontrado = {
          cedula: valor,
          nombre: String(row.getCell('nombre').value ?? ''),
          correo: String(row.getCell('correo').value ?? ''),
          telefono: String(row.getCell('telefono').value ?? ''),
          direccion: String(row.getCell('direccion').value ?? ''),
        }
      }
    })
    return encontrado
  })
}

/** Inserta o actualiza (upsert) un cliente usando la cédula como llave primaria. */
export async function guardarCliente(cliente: Cliente): Promise<void> {
  await encolar(async () => {
    const workbook = await abrirLibro()
    const hoja = workbook.getWorksheet(HOJA)!
    const cedula = normalizarCedula(cliente.cedula)
    const ahora = new Date().toISOString()

    let filaExistente: ExcelJS.Row | null = null
    hoja.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return
      if (String(row.getCell('cedula').value ?? '').trim() === cedula) {
        filaExistente = row
      }
    })

    if (filaExistente) {
      const row = filaExistente as ExcelJS.Row
      row.getCell('nombre').value = cliente.nombre
      row.getCell('correo').value = cliente.correo
      row.getCell('telefono').value = cliente.telefono
      row.getCell('direccion').value = cliente.direccion
      row.getCell('actualizadoEn').value = ahora
      row.commit()
    } else {
      hoja.addRow({ ...cliente, cedula, actualizadoEn: ahora }).commit()
    }

    await workbook.xlsx.writeFile(CLIENTES_XLSX)
  })
}

/** Lista completa de clientes — usada más adelante para migrar a Codisa. */
export async function listarClientes(): Promise<Cliente[]> {
  return encolar(async () => {
    const workbook = await abrirLibro()
    const hoja = workbook.getWorksheet(HOJA)!
    const clientes: Cliente[] = []
    hoja.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return
      const cedula = String(row.getCell('cedula').value ?? '').trim()
      if (!cedula) return
      clientes.push({
        cedula,
        nombre: String(row.getCell('nombre').value ?? ''),
        correo: String(row.getCell('correo').value ?? ''),
        telefono: String(row.getCell('telefono').value ?? ''),
        direccion: String(row.getCell('direccion').value ?? ''),
      })
    })
    return clientes
  })
}
