import { create } from 'zustand'

/**
 * Estado reactivo de disponibilidad del kiosko remoto (requerimiento "Modo
 * autónomo"), para que `components/ui/IndicadorSyncRemoto.tsx` muestre u
 * oculte el aviso "Operando sin sincronización" sin tener que hacer polling
 * manual. La lógica de CUÁNDO cambia este valor vive en
 * `services/kioskoTransport.ts` -> `marcarConexion` (se marca `false` cuando
 * un envío/consulta de red al otro kiosko falla o vence el timeout, `true`
 * cuando vuelve a tener éxito). Qué más dispara ese cambio (relanzar
 * `solicitarResincronizacion` en la transición false -> true) vive en
 * `services/kioskoSyncPolling.ts`, que se suscribe a este store — este
 * archivo sólo guarda el valor actual y lo expone a React.
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
