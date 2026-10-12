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
 * para Codisa, `services/awsIot.ts` para AWS IoT Core, y
 * `DATAFONO_CONFIG.endpoint` en `services/datafono.ts` para el datáfono BAC
 * -- Transaction Manager -- puerto 2493).
 *
 * Subred: 10.0.5.0/24 (máscara 255.255.255.0) — informativo, no lo usa
 * ningún código: ni el `fetch` del navegador ni el `connect()` TCP del
 * print-bridge necesitan la máscara de subred, sólo la IP de destino.
 *
 * Configurable por kiosko vía variables de entorno `VITE_*` (ver
 * `.env.example` en la raíz de `pwa-kiosk/` y la tipificación en
 * `src/vite-env.d.ts`): así el mismo build se puede desplegar en un kiosko
 * con otra IP/terminal sin recompilar con un valor distinto hardcodeado (ver
 * hallazgo de auditoría — antes era el TODO de aquí abajo). Si una variable
 * no está definida (ej. desarrollo local sin `.env`), se usa el valor fijo
 * de siempre como respaldo.
 *
 * TODO: mismo ajuste pendiente para `CAJA_ID` en `services/consecutivo.ts`
 * (`WSDF_CONFIG.idTienda` en `wsdf.ts` ya quedó resuelto igual que esto).
 */
export const RED_CONFIG = {
  impresoras: {
    /** impresora_cliente */
    cliente: import.meta.env.VITE_IP_IMPRESORA_CLIENTE || '10.0.5.247',
    /** impresora_carniceria */
    carniceria: import.meta.env.VITE_IP_IMPRESORA_CARNICERIA || '10.0.5.248',
    /** impresora_parrilla (id interno `restaurante`, ver NOMBRES_IMPRESORA en tickets.ts) */
    parrilla: import.meta.env.VITE_IP_IMPRESORA_PARRILLA || '10.0.5.249',
  },
  /** Máscara de subred de las 3 impresoras (10.0.5.0/24). Sólo informativo. */
  mascaraSubred: '255.255.255.0',
  /** ip_gateway: punto de salida para JSON hacia AWS IoT Core y hacia Codisa. */
  ipGateway: import.meta.env.VITE_IP_GATEWAY || '10.0.5.250',
}
