import { create } from 'zustand'

/**
 * Estado reactivo de disponibilidad del kiosko remoto (requerimiento "Modo
 * autónomo"). Ya no hay un indicador visible en pantalla que dependa de este
 * valor (se quitó el aviso "Operando sin sincronización" a pedido) — hoy
 * este store sólo existe para que `services/kioskoSyncPolling.ts` detecte la
 * transición false -> true y dispare `solicitarResincronizacion`
 * automáticamente (requerimiento "cuando K001 regrese: ejecutar
 * resincronización automática"). La lógica de CUÁNDO cambia este valor vive
 * en `services/kioskoTransport.ts` -> `marcarConexion` (se marca `false`
 * cuando un envío/consulta de red al otro kiosko falla o vence el timeout,
 * `true` cuando vuelve a tener éxito) — este archivo sólo guarda el valor
 * actual y lo expone.
 *
 * Arranca en `true` (optimista): hasta que no se detecte lo contrario (vía
 * el transporte real, ver `services/kioskoTransport.ts`), se asume que el
 * otro kiosko está disponible.
 */
interface SyncStatusState {
  remotoDisponible: boolean
  fijarRemotoDisponible: (disponible: boolean) => void
}

export const useSyncStatusStore = create<SyncStatusState>((set) => ({
  remotoDisponible: true,
  fijarRemotoDisponible: (disponible) => set({ remotoDisponible: disponible }),
}))
