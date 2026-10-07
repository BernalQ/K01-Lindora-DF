import type { Cliente } from './factura'

/**
 * Tipos de la integración con el API `df_api.php` de Codisa, usado tanto
 * para la búsqueda de cliente por cédula (`?action=cliente`) como para el
 * envío del pedido de factura electrónica (`?action=orden`) — ver
 * `services/wsdf.ts` para la configuración de host/endpoints
 * (`WSDF_CONFIG`, host fijo `10.0.1.24`, red distinta de `RED_CONFIG`).
 *
 * NOTA: varios campos numéricos (cantidad, precio, total_neto, id_tienda,
 * id_cliente) se envían como STRING, no como number, siguiendo el formato
 * documentado por Codisa. `porc_desc`, `total_desc`, `no_autoriza` son las
 * excepciones numéricas.
 */

/** Línea de detalle de un artículo dentro del pedido enviado a Codisa. */
export interface WsDfDetalleItem {
  id_articulo: string
  cantidad: string
  precio: string
  porc_desc: number
  porc_iv: string
  total_neto: string
  observaciones: string
}

/**
 * Cuerpo del pedido, tal como lo espera `?action=orden`. Incluye los datos
 * del cliente directamente en el pedido (no sólo el `id_cliente`), según el
 * ejemplo documentado por Codisa — ver `construirPedidoWsDf` en
 * `services/wsdf.ts` para cómo se derivan `nombre`/`apellido1`/`apellido2`
 * a partir de `Cliente.nombre` cuando no vienen ya separados.
 */
export interface WsDfPedido {
  id: string
  id_tienda: string
  id_cliente: string
  /** 'F' persona física, 'J' persona jurídica. */
  tipo_persona: 'F' | 'J'
  /** Código Hacienda/Codisa del tipo de identificación (ej. "1" = cédula física). */
  tipo_identificacion: string
  nombre: string
  apellido1: string
  apellido2: string
  genero: 'M' | 'F' | ''
  estado_civil: string
  email: string
  telefono: string
  direccion: string
  fecha: string
  total_desc: number
  total_imp: string
  total_envio: number | null
  total_neto: string
  observaciones: string
  /** Campo documentado por Codisa en el ejemplo de pedido; sin uso definido todavía en este kiosko, se envía en 0 por defecto. */
  no_autoriza: number
  /** Campo documentado por Codisa en el ejemplo de pedido; sin uso definido todavía en este kiosko, se envía vacío por defecto. */
  no_cuenta: string
  /** "1" = venta con factura electrónica, "0" = venta simple (sin factura). */
  fe: '0' | '1'
  despachar: 'S' | 'N'
  detalle: WsDfDetalleItem[]
}

/** Payload raíz esperado por `?action=orden`. */
export interface WsDfPayload {
  pedido: WsDfPedido
}

/** Resultado de validar un `WsDfPayload` antes de mostrarlo/enviarlo. */
export interface ValidacionWsDf {
  ok: boolean
  errores: string[]
}

/**
 * Cuerpo de respuesta de `?action=cliente` (búsqueda por cédula).
 * `coderror: "0"` + `data` no vacío significa cliente encontrado; cualquier
 * otro `coderror`, o `data` vacío/ausente, significa "no encontrado" (debe
 * mostrarse el formulario manual, ver `RegistroClienteScreen`). Las claves
 * exactas dentro de cada registro de `data[]` no están 100% documentadas por
 * Codisa, así que `buscarClienteCodisa` (en `services/wsdf.ts`) las lee de
 * forma defensiva, probando varios alias posibles por campo.
 */
export interface RespuestaClienteCodisa {
  coderror: string
  data?: Array<Record<string, string>>
  [clave: string]: unknown
}

/**
 * Resultado ya interpretado de `buscarClienteCodisa`, listo para consumir
 * desde `CedulaScreen`:
 * - 'encontrado': cédula válida y Codisa devolvió datos → autocompletar.
 * - 'no-encontrado': cédula válida pero Codisa no tiene ese cliente → la
 *   pantalla debe intentar el respaldo local y, si tampoco, ir al
 *   formulario manual (`RegistroClienteScreen`).
 * - 'invalida': la cédula no pasó el formato esperado (sólo números, 9
 *   dígitos) — NUNCA se llega a mandar la petición HTTP en este caso (ver
 *   `buscarClienteCodisa`).
 * - 'error-conexion': no se pudo contactar a Codisa, respondió con un HTTP
 *   de error, o no respondió dentro del tiempo límite — debe mostrarse un
 *   pop-up con opción de reintentar.
 * - 'error-api': Codisa SÍ respondió (HTTP 200) pero con un `coderror`
 *   distinto de "0" (error reportado por la propia API, no un simple
 *   "cliente no encontrado") — se distingue de 'no-encontrado' para no
 *   decirle al operador que el cliente no existe cuando en realidad Codisa
 *   tuvo un problema al procesar la búsqueda.
 */
export type ResultadoBusquedaClienteCodisa =
  | { categoria: 'encontrado'; cliente: Cliente }
  | { categoria: 'no-encontrado' }
  | { categoria: 'invalida'; mensaje: string }
  | { categoria: 'error-conexion'; mensaje: string }
  | { categoria: 'error-api'; mensaje: string }

/**
 * Categorías de resultado del envío del pedido a Codisa (`enviarPedidoWsDf`),
 * en el mismo espíritu que `CategoriaResultadoDatafono` (ver
 * `types/datafono.ts`): 'enviado' → popup de éxito sin reintentar;
 * cualquier otra categoría → popup de error, con reintentar salvo que el
 * problema sea de validación local (no tiene sentido reintentar sin
 * corregir el payload) o que ya haya un envío en curso ('en-curso': el
 * envío original, el que sí tiene la pista de ejecución real, sigue su
 * curso — no tiene sentido ofrecer "reintentar" sobre esta respuesta
 * inmediata y vacía, ver `envioOrdenEnCurso` en `services/wsdf.ts`).
 */
export type CategoriaResultadoOrdenCodisa =
  | 'enviado'
  | 'error-validacion'
  | 'error-http'
  | 'error-red'
  | 'rechazado'
  | 'en-curso'
  /** Codisa no respondió dentro del tiempo límite (ver `TIMEOUT_MS` en `services/wsdf.ts`); se desconoce si el pedido llegó a registrarse del lado de Codisa. */
  | 'tiempo-agotado'

export interface ResultadoOrdenCodisa {
  categoria: CategoriaResultadoOrdenCodisa
  mensaje: string
  permiteReintentar: boolean
}
