/**
 * Tipos de la integración con el datáfono BAC (Transaction Manager local,
 * ver `services/datafono.ts` -> `POST http://10.0.5.250:2493`).
 *
 * El protocolo soporta varios tipos de operación (`transactionType`), cada
 * uno con su propio subconjunto de parámetros obligatorios — de ahí la unión
 * discriminada `TransaccionDatafono` en vez de una única interfaz con todos
 * los campos opcionales, que permitiría armar combinaciones inválidas
 * (ej. un SALE sin `totalAmount`, o un VOID con `invoice`).
 */

/** "SALE": cobro normal. "VOID": anulación de una transacción previa. "BATCH_SETTLEMENT": cierre de lote del terminal. */
export type TipoTransaccionDatafono = 'SALE' | 'VOID' | 'BATCH_SETTLEMENT'

interface TransaccionDatafonoBase {
  terminalId: string
}

/** Cobro: requiere el monto (string con 2 decimales, ej. "150.00") y el número de factura/orden interno. */
export interface TransaccionDatafonoSale extends TransaccionDatafonoBase {
  transactionType: 'SALE'
  totalAmount: string
  invoice: string
}

/** Anulación de una transacción previamente aprobada, identificada por su autorización/referencia (no por `invoice`). */
export interface TransaccionDatafonoVoid extends TransaccionDatafonoBase {
  transactionType: 'VOID'
  authorizationNumber: string
  referenceNumber: string
}

/** Cierre de lote del terminal: sólo necesita identificar el terminal, sin datos de una transacción específica. */
export interface TransaccionDatafonoBatchSettlement extends TransaccionDatafonoBase {
  transactionType: 'BATCH_SETTLEMENT'
}

export type TransaccionDatafono =
  | TransaccionDatafonoSale
  | TransaccionDatafonoVoid
  | TransaccionDatafonoBatchSettlement

/**
 * Cuerpo de respuesta del Transaction Manager (HTTP 200). Sólo `responseCode`
 * está garantizado; el resto de campos depende del tipo de transacción y de
 * si fue aprobada o no (ej. `authorizationNumber`/`referenceNumber` sólo
 * vienen en transacciones aprobadas). Se deja un índice `[clave: string]`
 * para no perder ningún campo adicional no documentado que el terminal
 * decida incluir (ej. últimos 4 dígitos de tarjeta, tipo de tarjeta, etc.),
 * aunque este código no los use todavía.
 */
export interface RespuestaDatafonoBody {
  responseCode: string
  responseCodeDescription?: string
  authorizationNumber?: string
  referenceNumber?: string
  [clave: string]: unknown
}

/**
 * Categoría final de un intento de transacción, ya resuelta a partir del
 * código HTTP y, si aplica, de `responseCode` (ver `interpretarRespuestaDatafono`
 * en `services/datafono.ts`). Esto es lo que consume la UI (`DatafonoPopup`)
 * para decidir ícono/color/mensaje/botón de reintentar, sin tener que conocer
 * los códigos HTTP ni `responseCode` directamente.
 */
export type CategoriaResultadoDatafono =
  /** responseCode "00". */
  | 'aprobada'
  /** responseCode "05". */
  | 'denegada'
  /** responseCode "13" (monto inválido) o "14" (tarjeta inválida). */
  | 'invalida'
  /** responseCode "96". */
  | 'error-sistema'
  /** Cualquier responseCode distinto a los anteriores. */
  | 'rechazo-generico'
  /** HTTP 400/404/429/500/503 (no llegó a haber `responseCode` que interpretar). */
  | 'error-http'
  /** El `fetch` mismo falló (Transaction Manager inalcanzable: apagado, sin red, IP/puerto mal configurados). */
  | 'error-red'
  /** Ya hay una transacción en curso en ese terminal; no se envió ninguna petición nueva (ver regla de una transacción activa por terminal). */
  | 'transaccion-en-curso'
  /** El datáfono no respondió dentro del tiempo límite (ver `TIMEOUT_MS` en `services/datafono.ts`); no se sabe si la transacción llegó a procesarse del lado del terminal. */
  | 'tiempo-agotado'
  /** El monto a cobrar no es un número finito mayor a cero (ver `formatMontoDatafono`); no se llegó a enviar ninguna petición HTTP. */
  | 'monto-invalido'

/** Resultado uniforme de `enviarTransaccionDatafono`, listo para mostrarse en `DatafonoPopup`. */
export interface ResultadoDatafono {
  categoria: CategoriaResultadoDatafono
  /** Mensaje ya resuelto para mostrar al usuario: `responseCodeDescription` del terminal si vino, si no una descripción fija por código/categoría. */
  mensaje: string
  /** Si `true`, `DatafonoPopup` muestra el botón "Intentar de nuevo". */
  permiteReintentar: boolean
  responseCode?: string
  authorizationNumber?: string
  referenceNumber?: string
  /** `true` sólo cuando este resultado vino del modo de simulación de pruebas (ver `SIMULACION_DATAFONO_ACTIVA` en `services/datafono.ts`), nunca en una transacción real — usado por `DatafonoPopup` para mostrar un aviso visual y no confundirlo con un cobro real. */
  simulado?: boolean
}
