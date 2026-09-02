import { create } from 'zustand'
import type { Venta } from '../types/order'
import { bloquearMesa, liberarMesa } from '../services/mesaLocks'

/**
 * Sesión de mesa: vive independiente del carrito (`cartStore`), porque debe
 * persistir a través de varias órdenes/pagos consecutivos bajo un mismo
 * "ID de mesa" (requerimiento: "El sistema debe persistir el ID de mesa
 * hasta que se cierre con la respuesta 'No'").
 *
 * - `compartida = false` (mesa simple, un solo comensal/orden): el ID de
 *   mesa es el número que el cliente escribe a mano en `MenuScreen`
 *   (comportamiento histórico, sin cambios). `mesaId` no se usa.
 * - `compartida = true` (mesa compartida, varios comensales pagan por
 *   separado bajo el mismo ID): el ID de mesa es fijo, elegido una sola
 *   vez en `MesaSetupScreen` de una lista de razas de ganado, y cada orden
 *   nueva bajo esa mesa hereda ese mismo `mesaId` sin que el cliente tenga
 *   que volver a escribirlo.
 * - `ordenes`: ventas ya cobradas de esta mesa compartida, acumuladas para
 *   poder generar un único tiquete consolidado de carnicería/restaurante
 *   cuando la mesa se cierra (se imprime uno solo al final, no uno por
 *   cada orden individual).
 */
interface MesaState {
  activa: boolean
  compartida: boolean
  mesaId: string
  ordenes: Venta[]
  /** Abre una sesión de mesa nueva (simple o compartida). */
  iniciar: (mesaId: string, compartida: boolean) => void
  /** Acumula una venta ya cobrada, para el tiquete consolidado al cerrar. */
  registrarOrden: (venta: Venta) => void
  /** Cierra la mesa: nadie puede agregar más órdenes bajo este ID luego de esto. */
  cerrar: () => void
  /**
   * Cancela la orden en curso ("Cancelar Orden" en `PaymentScreen`): a
   * diferencia de `cerrar` (cierre normal tras cobrar), acá el identificador
   * de mesa NUNCA se llegó a cobrar, así que además se libera de inmediato
   * el bloqueo de 30 minutos (ver `services/mesaLocks.ts`) para que quede
   * disponible enseguida para otra mesa, en vez de esperar a que expire.
   */
  cancelar: () => void
}

export const useMesaStore = create<MesaState>((set, get) => ({
  activa: false,
  compartida: false,
  mesaId: '',
  ordenes: [],

  iniciar: (mesaId, compartida) => {
    // Bloquea el identificador por 30 minutos para que no pueda elegirse de
    // nuevo en otra sesión hasta que expire (ver `services/mesaLocks.ts`).
    bloquearMesa(mesaId)
    set({ activa: true, compartida, mesaId, ordenes: [] })
  },

  registrarOrden: (venta) => set((state) => ({ ordenes: [...state.ordenes, venta] })),

  cerrar: () => set({ activa: false, compartida: false, mesaId: '', ordenes: [] }),

  cancelar: () => {
    liberarMesa(get().mesaId)
    set({ activa: false, compartida: false, mesaId: '', ordenes: [] })
  },
}))
