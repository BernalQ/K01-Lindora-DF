import { useSyncStatusStore } from '../../store/syncStatusStore'
import { useLanguage } from '../../context/useLanguage'

/**
 * Indicador flotante, pequeño y no intrusivo (requerimiento "Modo autónomo":
 * "Mostrar indicador pequeño: Operando sin sincronización"). Se renderiza
 * siempre junto a la pantalla activa (ver `App.tsx`) pero sólo se hace
 * visible cuando `remotoDisponible` es `false` (ver
 * `store/syncStatusStore.ts` / `services/kioskoSync.ts`) — en operación
 * normal (ambos kioskos conectados) no muestra nada.
 */
export default function IndicadorSyncRemoto() {
  const remotoDisponible = useSyncStatusStore((s) => s.remotoDisponible)
  const { t } = useLanguage()

  if (remotoDisponible) return null

  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-50 rounded-full bg-amber-600/95 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-black/20">
      {t('sync.operandoSinSincronizacion')}
    </div>
  )
}
