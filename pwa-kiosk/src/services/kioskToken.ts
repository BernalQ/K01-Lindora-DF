/**
 * Header opcional con el token compartido del kiosko (ver `KIOSK_TOKEN` en
 * `print-bridge/.env.example` y el guard `requireKioskToken` en
 * `print-bridge/src/server.ts`): protege las rutas de print-bridge
 * (clientes/factura/ventas/print) para que no cualquier dispositivo
 * en la red 10.0.5.0/24 pueda llamarlas sin credencial (ver hallazgo de
 * auditoría).
 *
 * Se consume desde `services/facturacion.ts` (el archivo de la PWA que
 * habla con print-bridge, puerto 4000).
 *
 * Si `VITE_KIOSK_TOKEN` no está configurado en este build, el objeto queda
 * vacío y simplemente no se manda el header — print-bridge, por su lado,
 * sólo exige el token si él mismo tiene `KIOSK_TOKEN` configurado (ver
 * comentario en `server.ts`), así que ambos lados deben configurarse juntos
 * al habilitar esto (si sólo uno de los dos tiene el valor, las peticiones
 * reales empezarán a fallar con 401).
 */
export function encabezadoTokenKiosko(): Record<string, string> {
  const token = import.meta.env.VITE_KIOSK_TOKEN
  return token ? { 'x-kiosk-token': token } : {}
}
