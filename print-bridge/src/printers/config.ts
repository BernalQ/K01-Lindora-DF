import 'dotenv/config'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import type { PrinterId } from '../types.js'

export interface PrinterTarget {
  host: string
  port: number
}

interface PrinterEntradaJson {
  ip: string
  puerto: number
}

interface PrintersJsonConfig {
  protocolo?: string
  gatewayIp: string
  impresoras: Record<PrinterId, PrinterEntradaJson>
}

/**
 * Valores de respaldo si `config/printers.json` no existe o no se puede leer
 * (ej. primera instalación antes de copiar el archivo), para que el servicio
 * nunca falle al iniciar por un problema de configuración. Coinciden con el
 * plan de red real del kiosko documentado en
 * `pwa-kiosk/src/services/redConfig.ts`.
 */
const CONFIG_POR_DEFECTO: PrintersJsonConfig = {
  protocolo: 'ESC/POS',
  gatewayIp: '10.0.5.250',
  impresoras: {
    cliente: { ip: '10.0.5.247', puerto: 9100 },
    carniceria: { ip: '10.0.5.248', puerto: 9100 },
    restaurante: { ip: '10.0.5.249', puerto: 9100 },
  },
}

// src/printers/config.ts -> print-bridge/config/printers.json (fuera de
// src/dist, mismo patrón que DATA_DIR en src/data/paths.ts): así funciona
// tanto en desarrollo (tsx desde src/) como compilado (node desde dist/),
// ya que ambos quedan a la misma profundidad relativa a la raíz del proyecto.
const AQUI = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_JSON_PATH = path.resolve(AQUI, '../../config/printers.json')

/**
 * Lee la configuración de impresoras desde `config/printers.json` — el
 * archivo pensado para "fácil mantenimiento": basta editarlo y reiniciar el
 * servicio para cambiar una IP, puerto o el gateway, sin tocar código ni
 * recompilar. Si el archivo falta o está corrupto, se usa
 * `CONFIG_POR_DEFECTO` y se avisa por consola (el servicio sigue
 * arrancando igual).
 */
function leerConfigJson(): PrintersJsonConfig {
  try {
    const crudo = fs.readFileSync(CONFIG_JSON_PATH, 'utf-8')
    const json = JSON.parse(crudo) as Partial<PrintersJsonConfig>
    if (!json.impresoras || !json.gatewayIp) {
      console.warn(`[print-bridge] ${CONFIG_JSON_PATH} incompleto, usando configuración por defecto.`)
      return CONFIG_POR_DEFECTO
    }
    return {
      protocolo: json.protocolo ?? CONFIG_POR_DEFECTO.protocolo,
      gatewayIp: json.gatewayIp,
      impresoras: { ...CONFIG_POR_DEFECTO.impresoras, ...json.impresoras },
    }
  } catch (err) {
    console.warn(
      `[print-bridge] No se pudo leer ${CONFIG_JSON_PATH}, usando configuración por defecto.`,
      err,
    )
    return CONFIG_POR_DEFECTO
  }
}

const CONFIG_JSON = leerConfigJson()

/** Protocolo declarado en `config/printers.json` (informativo; la impresión real siempre usa ESC/POS vía `node-thermal-printer`, ver `printers/print.ts`). */
export const PROTOCOLO_IMPRESORAS = CONFIG_JSON.protocolo ?? 'ESC/POS'

/**
 * Destino TCP de cada una de las 3 impresoras térmicas del kiosko, tomado de
 * `config/printers.json`. Las variables de entorno `PRINTER_*_IP`/
 * `PRINTER_PORT` (ver `.env.example`) siguen soportadas como override
 * puntual de emergencia (ej. para probar una IP distinta sin editar el
 * archivo), pero el archivo JSON es ahora la fuente de verdad documentada.
 */
export const PRINTERS: Record<PrinterId, PrinterTarget> = {
  carniceria: {
    host: process.env.PRINTER_CARNICERIA_IP ?? CONFIG_JSON.impresoras.carniceria.ip,
    port: Number(process.env.PRINTER_PORT ?? CONFIG_JSON.impresoras.carniceria.puerto),
  },
  restaurante: {
    host: process.env.PRINTER_RESTAURANTE_IP ?? CONFIG_JSON.impresoras.restaurante.ip,
    port: Number(process.env.PRINTER_PORT ?? CONFIG_JSON.impresoras.restaurante.puerto),
  },
  cliente: {
    host: process.env.PRINTER_CLIENTE_IP ?? CONFIG_JSON.impresoras.cliente.ip,
    port: Number(process.env.PRINTER_PORT ?? CONFIG_JSON.impresoras.cliente.puerto),
  },
}

/**
 * IP fija del gateway de red del kiosko, usado como punto de salida para
 * transmitir JSON hacia AWS IoT Core y hacia Codisa (ver
 * `RED_CONFIG.ipGateway` en `pwa-kiosk/src/services/redConfig.ts`, que es
 * donde hoy se arma/envía ese JSON). Se expone aquí también por si en el
 * futuro el print-bridge (backend) termina siendo el punto de envío en vez
 * del navegador.
 */
export const GATEWAY_IP = process.env.GATEWAY_IP ?? CONFIG_JSON.gatewayIp
