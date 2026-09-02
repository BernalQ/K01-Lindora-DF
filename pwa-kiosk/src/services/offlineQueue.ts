import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { EstadoVenta, Venta, VentaEnCola } from '../types/order'

interface KioskoDB extends DBSchema {
  ventas: {
    key: string
    value: VentaEnCola
    indexes: { 'by-estado': string }
  }
}

const DB_NAME = 'kiosko-db'
const DB_VERSION = 1
const STORE = 'ventas'

let dbPromise: Promise<IDBPDatabase<KioskoDB>> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<KioskoDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('by-estado', 'estado')
      },
    })
  }
  return dbPromise
}

/** Guarda la venta en la cola local, para poder reintentar impresión o sincronización luego. */
export async function encolarVenta(venta: Venta): Promise<void> {
  const db = await getDB()
  const item: VentaEnCola = {
    id: venta.id,
    venta,
    estado: 'pendiente',
    intentos: 0,
    creadaEn: new Date().toISOString(),
  }
  await db.put(STORE, item)
}

export async function obtenerVentasPendientes(): Promise<VentaEnCola[]> {
  const db = await getDB()
  return db.getAllFromIndex(STORE, 'by-estado', 'pendiente')
}

export async function actualizarEstadoVenta(id: string, estado: EstadoVenta): Promise<void> {
  const db = await getDB()
  const existing = await db.get(STORE, id)
  if (!existing) return
  existing.estado = estado
  if (estado === 'error') existing.intentos += 1
  await db.put(STORE, existing)
}

export async function obtenerTodasLasVentas(): Promise<VentaEnCola[]> {
  const db = await getDB()
  return db.getAll(STORE)
}
