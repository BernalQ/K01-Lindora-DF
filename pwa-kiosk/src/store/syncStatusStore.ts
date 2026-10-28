import { create } from 'zustand'

/**
 * Estado reactivo de disponibilidad del kiosko remoto (requerimiento "Modo
 * autónomo"). Además de disparar `solicitarResincronizacion` en
 * `services/kioskoSyncPolling.ts` (transición false -> true), este store
 * ahora también alimenta el indicador visible "Sincronizado"/"No Sync" del
 * panel de kiosko en `AdminScreen.tsx` (`EstadoSincronizacion`) — por eso
 * guarda también `ultimaConexionExitosaEn`, para poder mostrar "última
 * conexión: ...". La lógica de CUÁNDO cambia `remotoDisponible` vive en
 * `services/kioskoTransport.ts` -> `marcarConexion`: se marca `false` sólo
 * después de agotar los reintentos configurados ahí (3 intentos — ver
 * `MAX_INTENTOS`), `true` en cuanto cualquier intento (envío real o chequeo
 * de salud en segundo plano) tiene éxito — este archivo sólo guarda el valor
 * actual y lo expone.
 *
 * Arranca en `true` (optimista): hasta que no se detecte lo contrario (vía
 * el transporte real, ver `services/kioskoTransport.ts`), se asume que el
 * otro kiosko está disponible.
 */
interface SyncStatusState {
  remotoDisponible: boolean
  /** Epoch ms del último intento exitoso (envío o chequeo de salud) contra el otro kiosko; `null` si todavía no se ha confirmado ninguno desde que arrancó esta PWA. */
  ultimaConexionExitosaEn: number | null
  fijarRemotoDisponible: (disponible: boolean) => void
}

export const useSyncStatusStore = create<SyncStatusState>((set) => ({
  remotoDisponible: true,
  ultimaConexionExitosaEn: null,
  fijarRemotoDisponible: (disponible) =>
    set((state) => ({
      remotoDisponible: disponible,
      // Sólo avanza el timestamp en un éxito; en una falla se conserva el
      // último éxito conocido (para poder mostrar "última conexión: hace
      // X" incluso mientras el indicador está en "No Sync").
      ultimaConexionExitosaEn: disponible ? Date.now() : state.ultimaConexionExitosaEn,
    })),
}))
