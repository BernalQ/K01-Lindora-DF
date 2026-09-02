/**
 * Configuración de red fija del kiosko: IPs estáticas asignadas por el
 * equipo de redes para las 3 impresoras térmicas y para el gateway usado
 * como punto de salida hacia servicios externos.
 *
 * Impresoras: la PWA (navegador) no abre conexiones TCP directas a las
 * impresoras — eso lo hace el print-bridge (servicio Node local, ver
 * `print-bridge/src/printers/config.ts`, que usa estas mismas IPs como
 * valor por defecto). Se dejan documentadas también aquí para que la PWA
 * "reconozca" la configuración de red completa del kiosko en un solo lugar
 * y quede disponible por si algún flujo del frontend necesita mostrarlas o
 * referenciarlas (diagnóstico, etc.).
 *
 * Gateway: sí se usa directamente desde la PWA, como host de los envíos de
 * JSON hacia servicios externos (ver `WSDF_CONFIG.endpoint` en `wsdf.ts`
 * para Codisa, y `services/awsIot.ts` para AWS IoT Core).
 *
 * Subred: 10.0.5.0/24 (máscara 255.255.255.0) — informativo, no lo usa
 * ningún código: ni el `fetch` del navegador ni el `connect()` TCP del
 * print-bridge necesitan la máscara de subred, sólo la IP de destino.
 *
 * TODO: si se agregan kioskos con distinta red, esto debe volverse
 * configurable por dispositivo en vez de quedar hardcodeado — mismo TODO ya
 * documentado para `PUNTO_VENTA` en `services/consecutivo.ts` y para
 * `WSDF_CONFIG.idTienda` en `wsdf.ts`.
 */
export const RED_CONFIG = {
  impresoras: {
    /** impresora_cliente */
    cliente: '10.0.5.247',
    /** impresora_carniceria */
    carniceria: '10.0.5.248',
    /** impresora_parrilla (id interno `restaurante`, ver NOMBRES_IMPRESORA en tickets.ts) */
    parrilla: '10.0.5.249',
  },
  /** Máscara de subred de las 3 impresoras (10.0.5.0/24). Sólo informativo. */
  mascaraSubred: '255.255.255.0',
  /** ip_gateway: punto de salida para JSON hacia AWS IoT Core y hacia Codisa. */
  ipGateway: '10.0.5.1',
} as const
