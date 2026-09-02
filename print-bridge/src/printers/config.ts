import 'dotenv/config'
import type { PrinterId } from '../types.js'

interface PrinterTarget {
  host: string
  port: number
}

const PRINTER_PORT = Number(process.env.PRINTER_PORT ?? 9100)

/**
 * IPs fijas asignadas por el equipo de redes a las 3 impresoras térmicas del
 * kiosko, dentro de la subred 10.0.5.0/24 (máscara 255.255.255.0), gateway
 * 10.0.5.1 (ver `GATEWAY_IP` más abajo):
 *   - impresora_cliente:    10.0.5.247
 *   - impresora_carniceria: 10.0.5.248
 *   - impresora_parrilla:   10.0.5.249 (id interno `restaurante`, ver
 *     `NOMBRES_IMPRESORA` en `pwa-kiosk/src/services/tickets.ts`)
 * Se usan como valor por defecto si no hay `PRINTER_*_IP` en el entorno
 * (`.env`), para que el bridge funcione con la red real del local sin
 * configuración adicional; overrideable vía `.env` si una impresora cambia
 * de IP sin tocar código (ver `.env.example`).
 */
export const PRINTERS: Record<PrinterId, PrinterTarget> = {
  carniceria: {
    host: process.env.PRINTER_CARNICERIA_IP ?? '10.0.5.248',
    port: PRINTER_PORT,
  },
  restaurante: {
    host: process.env.PRINTER_RESTAURANTE_IP ?? '10.0.5.249',
    port: PRINTER_PORT,
  },
  cliente: {
    host: process.env.PRINTER_CLIENTE_IP ?? '10.0.5.247',
    port: PRINTER_PORT,
  },
}

/**
 * IP fija del gateway de red del kiosko (10.0.5.1), usado como punto de
 * salida para transmitir JSON hacia AWS IoT Core y hacia Codisa (ver
 * `RED_CONFIG.ipGateway` en `pwa-kiosk/src/services/redConfig.ts`, que es
 * donde hoy se arma/envía ese JSON). Se expone aquí también por si en el
 * futuro el print-bridge (backend) termina siendo el punto de envío en vez
 * del navegador.
 */
export const GATEWAY_IP = process.env.GATEWAY_IP ?? '10.0.5.1'
