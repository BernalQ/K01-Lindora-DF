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

export async function obtenerVentaPorId(id: string): Promise<Venta | null> {
  const db = await getDB()
  return (await db.get(STORE, id))?.venta ?? null
}

/** `true` si la orden fue anulada. Ventas antiguas sin `status` cuentan como activas. */
export function estaCancelada(venta: Venta): boolean {
  return venta.status === 'CANCELLED'
}

/** Sólo las órdenes que cuentan para ventas, métricas y cierre de caja (las canceladas quedan únicamente para auditoría). */
export function soloOrdenesActivas<T extends { venta: Venta }>(items: T[]): T[] {
  return items.filter(({ venta }) => !estaCancelada(venta))
}

export type ResultadoMarcarCancelada =
  | { estado: 'cancelada'; venta: Venta }
  | { estado: 'ya-cancelada'; venta: Venta }
  | { estado: 'no-existe' }

/**
 * Marca la orden como `CANCELLED` (sin borrarla) en una sola transacción de
 * IndexedDB, así que dos intentos simultáneos no pueden cancelarla dos veces:
 * el segundo ve el estado ya cambiado y devuelve `'ya-cancelada'`.
 */
export async function marcarVentaCancelada(
  id: string,
  datos: { cancelledAt: string; cancelledBy: string },
): Promise<ResultadoMarcarCancelada> {
  const db = await getDB()
  const tx = db.transaction(STORE, 'readwrite')
  const existente = await tx.store.get(id)
  if (!existente) {
    await tx.done
    return { estado: 'no-existe' }
  }
  if (estaCancelada(existente.venta)) {
    await tx.done
    return { estado: 'ya-cancelada', venta: existente.venta }
  }
  existente.venta = { ...existente.venta, status: 'CANCELLED', ...datos }
  await tx.store.put(existente)
  await tx.done
  return { estado: 'cancelada', venta: existente.venta }
}
