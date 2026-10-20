import { CAJA_ID } from './consecutivo'

/**
 * Direccionamiento de red para la comunicación DIRECTA entre los dos
 * kioskos físicos (requerimientos "Sincronización de mesas" / "Disponibilidad
 * de productos" / "Actualización de precios" / "Resincronización
 * automática"): cada kiosko le habla DIRECTAMENTE a la IP de la máquina del
 * otro, puerto 3005 — un servidor dedicado para esto (ver
 * `print-bridge/src/kioskoSync/server.ts`), DISTINTO del print-bridge normal
 * de puerto 4000 (impresión/facturación, ver `services/facturacion.ts`).
 *
 * Ver `services/kioskoTransport.ts` para el `fetch` real que usa estos
 * valores.
 */

/**
 * IP de cada kiosko conocido, por `CAJA_ID` — HARDCODEADAS a propósito (antes
 * configurables por `.env`, ver historial de `VITE_IP_KIOSKO_K001`/`_K002` en
 * `.env.example`/`vite-env.d.ts`): con el `CAJA_ID` ahora elegido A MANO desde
 * el panel de administración (ver `PanelKiosko` en
 * `components/screens/AdminScreen.tsx`), la única configuración que el
 * operador debe hacer correctamente es ESA elección — no hace falta además
 * mantener sincronizadas estas IPs entre el `.env` y la realidad física. Si
 * algún día cambian las IPs reales de las máquinas, se edita directamente
 * acá (y se reconstruye el build).
 */
const IP_KIOSKOS: Record<string, string> = {
  K001: '10.0.5.250',
  K002: '10.0.5.251',
}

/** Puerto donde escucha el servidor de sincronización entre kioskos, en AMBAS máquinas. */
export const KIOSKO_SYNC_PORT = 3005

/**
 * IP del OTRO kiosko (hardcodeada, ver `IP_KIOSKOS` arriba): si `CAJA_ID` es
 * K001 devuelve la IP de K002 (10.0.5.251) y viceversa (10.0.5.250). Con sólo
 * 2 kioskos conocidos hoy, "el otro" es simplemente el que no es `CAJA_ID` —
 * si en el futuro se agregan más terminales, esto debería migrar a una tabla
 * de rutas explícita en vez de "el que no soy yo".
 */
export function ipOtroKiosko(): string {
  const otraCaja = Object.keys(IP_KIOSKOS).find((caja) => caja !== CAJA_ID)
  return otraCaja ? IP_KIOSKOS[otraCaja] : ''
}
