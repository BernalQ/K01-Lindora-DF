import type { Cliente, FacturaItem, ResultadoFactura } from '../types/factura'
import { clasificarCedula, limpiarCedula } from './wsdf'
import { registrarLogFacturacion } from './facturacionLogs'
import { encabezadoTokenKiosko } from './kioskToken'

const BRIDGE_URL = 'http://localhost:4000'

/**
 * Servicio de facturación electrónica: habla con el print-bridge local
 * (el mismo servicio Node en el puerto 4000 — ver `services/systemBridge.ts`
 * para otro ejemplo de endpoint propio de ese servicio; las impresoras
 * térmicas, en cambio, ya no pasan por print-bridge sino por Backend-Print,
 * ver `services/backendPrint.ts`), que a su vez consulta/actualiza la base
 * local de clientes (Excel) y, cuando el API de Codisa esté habilitado,
 * reenviará a Hacienda.
 *
 * Igual que en systemBridge.ts/codisa.ts: si el print-bridge no está
 * disponible (ej. desarrollo sin el servicio corriendo), las funciones
 * fallan de forma controlada en vez de bloquear el flujo del kiosko.
 */

/**
 * Busca un cliente por cédula en el Excel local. `null` si no existe, si la
 * cédula no tiene un formato válido, o si el servicio no está disponible.
 *
 * Reutiliza `clasificarCedula`/`limpiarCedula` (ya usadas en `wsdf.ts` para
 * validar contra Codisa) como guard ANTES de tocar red: antes esta función
 * no validaba nada, así que una cédula malformada (o con guiones, distinto
 * del formato puramente numérico que usa Codisa para `id_cliente`) se
 * enviaba igual al print-bridge y podía quedar guardada como llave primaria
 * inconsistente en el Excel (ver hallazgo de auditoría).
 */
export async function buscarCliente(cedula: string): Promise<Cliente | null> {
  const cedulaLimpia = limpiarCedula(cedula)
  if (!clasificarCedula(cedulaLimpia)) {
    console.warn(`[facturacion] Cédula "${cedula}" no tiene un formato válido; no se consulta el Excel local.`)
    return null
  }

  try {
    registrarLogFacturacion('request', { operacion: 'buscarCliente', cedula: cedulaLimpia })
    const res = await fetch(`${BRIDGE_URL}/clientes/${encodeURIComponent(cedulaLimpia)}`, {
      headers: encabezadoTokenKiosko(),
    })
    if (res.status === 404) {
      registrarLogFacturacion('response', { operacion: 'buscarCliente', cedula: cedulaLimpia, resultado: 'no-encontrado' })
      return null
    }
    if (!res.ok) throw new Error(`Error HTTP ${res.status}`)
    const data = await res.json()
    registrarLogFacturacion('response', { operacion: 'buscarCliente', cedula: cedulaLimpia, resultado: 'encontrado' })
    return data.cliente as Cliente
  } catch (err) {
    console.log('[facturacion] No se pudo consultar el cliente (print-bridge no disponible):', err)
    registrarLogFacturacion('response', { operacion: 'buscarCliente', cedula: cedulaLimpia, error: (err as Error).message })
    return null
  }
}

/**
 * Guarda (crea o actualiza) un cliente en el Excel local, cédula como llave
 * primaria. Normaliza la cédula con `limpiarCedula` antes de guardarla
 * (quita guiones/espacios) y rechaza con `clasificarCedula` cualquier valor
 * que no tenga un formato válido ANTES de tocar red — mismo guard que
 * `buscarCliente` arriba, evita que la llave primaria del Excel quede en un
 * formato inconsistente con el que usa Codisa (ver hallazgo de auditoría).
 */
export async function guardarCliente(cliente: Cliente): Promise<{ ok: boolean; error?: string }> {
  const cedulaLimpia = limpiarCedula(cliente.cedula)
  if (!clasificarCedula(cedulaLimpia)) {
    const error = `Cédula "${cliente.cedula}" no tiene un formato válido.`
    console.warn(`[facturacion] ${error} No se guarda en el Excel local.`)
    registrarLogFacturacion('response', { operacion: 'guardarCliente', cedula: cliente.cedula, error })
    return { ok: false, error }
  }
  const clienteNormalizado: Cliente = { ...cliente, cedula: cedulaLimpia }

  try {
    registrarLogFacturacion('request', { operacion: 'guardarCliente', cliente: clienteNormalizado })
    const res = await fetch(`${BRIDGE_URL}/clientes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...encabezadoTokenKiosko() },
      body: JSON.stringify(clienteNormalizado),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error ?? `Error HTTP ${res.status}`)
    }
    registrarLogFacturacion('response', { operacion: 'guardarCliente', cedula: cedulaLimpia, resultado: 'ok' })
    return { ok: true }
  } catch (err) {
    console.log('[facturacion] No se pudo guardar el cliente (print-bridge no disponible):', err)
    registrarLogFacturacion('response', { operacion: 'guardarCliente', cedula: cedulaLimpia, error: (err as Error).message })
    return { ok: false, error: (err as Error).message }
  }
}

/**
 * Genera y envía la factura electrónica (JSON) al print-bridge, que a su
 * vez la envía a Hacienda vía Codisa (stub mientras no exista API real),
 * genera el PDF y lo envía por correo. Ver print-bridge/src/routes/factura.ts.
 */
export async function generarFactura(payload: {
  mesa: string
  items: FacturaItem[]
  total: number
  cliente: Cliente
  /** Consecutivo global de la orden en el kiosko (ej. "000000005"), ver services/consecutivo.ts. */
  numeroFactura: string
}): Promise<ResultadoFactura> {
  try {
    registrarLogFacturacion('request', { operacion: 'generarFactura', payload })
    const res = await fetch(`${BRIDGE_URL}/factura`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...encabezadoTokenKiosko() },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const error = data.error ?? `Error HTTP ${res.status}`
      registrarLogFacturacion('response', { operacion: 'generarFactura', error })
      return { ok: false, mensajeError: error }
    }
    registrarLogFacturacion('response', {
      operacion: 'generarFactura',
      resultado: 'ok',
      clave: data.clave,
      correoEnviado: data.correoEnviado,
    })
    return {
      ok: true,
      clave: data.clave,
      pdfUrl: data.pdfUrl ? `${BRIDGE_URL}${data.pdfUrl}` : undefined,
      correoEnviado: data.correoEnviado,
    }
  } catch (err) {
    console.error('[facturacion] Error generando factura:', err)
    registrarLogFacturacion('response', { operacion: 'generarFactura', error: (err as Error).message })
    return { ok: false, mensajeError: 'No se pudo conectar con el servicio de facturación' }
  }
}

/** Registra en la bitácora local (Excel) una venta pagada sin factura electrónica. */
export async function registrarVentaSimple(payload: {
  mesa: string
  items: FacturaItem[]
  total: number
}): Promise<void> {
  try {
    registrarLogFacturacion('request', { operacion: 'registrarVentaSimple', payload })
    const res = await fetch(`${BRIDGE_URL}/ventas/simple`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...encabezadoTokenKiosko() },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(`Error HTTP ${res.status}`)
    registrarLogFacturacion('response', { operacion: 'registrarVentaSimple', resultado: 'ok' })
  } catch (err) {
    console.log('[facturacion] No se pudo registrar la venta simple (print-bridge no disponible):', err)
    registrarLogFacturacion('response', { operacion: 'registrarVentaSimple', error: (err as Error).message })
  }
}
