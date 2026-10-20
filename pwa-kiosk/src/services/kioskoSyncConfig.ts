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

/** IP de cada kiosko conocido, por `CAJA_ID`. Configurable por `.env` (ver `.env.example`) para no recompilar al cambiar de red/sitio. */
const IP_KIOSKOS: Record<string, string> = {
  K001: import.meta.env.VITE_IP_KIOSKO_K001 || '10.0.5.250',
  K002: import.meta.env.VITE_IP_KIOSKO_K002 || '10.0.5.251',
}

/** Puerto donde escucha el servidor de sincronización entre kioskos, en AMBAS máquinas. */
export const KIOSKO_SYNC_PORT = 3005

/** IP de ESTE kiosko (según su `CAJA_ID`, ver `services/consecutivo.ts`). */
export function ipPropia(): string {
  return IP_KIOSKOS[CAJA_ID] ?? ''
}

/**
 * IP del OTRO kiosko. Con sólo 2 kioskos conocidos hoy (K001/K002), "el
 * otro" es simplemente el que no es `CAJA_ID` — si en el futuro se agregan
 * más terminales, esto debería migrar a una tabla de rutas explícita en vez
 * de "el que no soy yo".
 */
export function ipOtroKiosko(): string {
  const otraCaja = Object.keys(IP_KIOSKOS).find((caja) => caja !== CAJA_ID)
  return otraCaja ? IP_KIOSKOS[otraCaja] : ''
}
