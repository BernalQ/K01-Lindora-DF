import { RED_CONFIG } from './redConfig'
import type { Venta } from '../types/order'

/**
 * Interfaz prevista para el envío de la venta como JSON hacia AWS IoT Core.
 *
 * El punto de salida de red ya está fijo (`RED_CONFIG.ipGateway`, gateway
 * 10.0.5.1, ver `services/redConfig.ts`): el gateway local es quien recibe
 * este JSON y lo reenvía hacia AWS IoT Core.
 *
 * TODO: implementar el envío real (tópico MQTT/HTTPS, certificados/
 * credenciales) cuando estén definidos. Mientras tanto este stub sólo
 * registra la venta localmente, igual que `enviarVentaACodisa` en
 * `services/codisa.ts`, para que el resto del flujo (cobro, impresión,
 * confirmación) no dependa de esta integración.
 */
export async function enviarVentaAAwsIot(venta: Venta): Promise<{ ok: boolean }> {
  console.log(
    `[aws-iot:stub] Venta pendiente de envío a AWS IoT Core vía gateway ${RED_CONFIG.ipGateway}:`,
    venta,
  )
  return { ok: true }
}
