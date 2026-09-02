import type { Cliente, FacturaItem, ResultadoFactura } from '../types/factura'

const BRIDGE_URL = 'http://localhost:4000'

/**
 * Servicio de facturación electrónica: habla con el print-bridge local
 * (mismo servicio que ya maneja las impresoras — ver services/printBridge.ts),
 * que a su vez consulta/actualiza la base local de clientes (Excel) y,
 * cuando el API de Codisa esté habilitado, reenviará a Hacienda.
 *
 * Igual que en printBridge.ts/codisa.ts: si el print-bridge no está
 * disponible (ej. desarrollo sin el servicio corriendo), las funciones
 * fallan de forma controlada en vez de bloquear el flujo del kiosko.
 */

/** Busca un cliente por cédula en el Excel local. `null` si no existe o si el servicio no está disponible. */
export async function buscarCliente(cedula: string): Promise<Cliente | null> {
  try {
    const res = await fetch(`${BRIDGE_URL}/clientes/${encodeURIComponent(cedula)}`)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Error HTTP ${res.status}`)
    const data = await res.json()
    return data.cliente as Cliente
  } catch (err) {
    console.log('[facturacion] No se pudo consultar el cliente (print-bridge no disponible):', err)
    return null
  }
}

/** Guarda (crea o actualiza) un cliente en el Excel local, cédula como llave primaria. */
export async function guardarCliente(cliente: Cliente): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${BRIDGE_URL}/clientes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cliente),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error ?? `Error HTTP ${res.status}`)
    }
    return { ok: true }
  } catch (err) {
    console.log('[facturacion] No se pudo guardar el cliente (print-bridge no disponible):', err)
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
  /** Consecutivo de la orden en el kiosko (ej. "01-2026-08-00001"), ver services/consecutivo.ts. */
  numeroFactura: string
}): Promise<ResultadoFactura> {
  try {
    const res = await fetch(`${BRIDGE_URL}/factura`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, mensajeError: data.error ?? `Error HTTP ${res.status}` }
    }
    return {
      ok: true,
      clave: data.clave,
      pdfUrl: data.pdfUrl ? `${BRIDGE_URL}${data.pdfUrl}` : undefined,
      correoEnviado: data.correoEnviado,
    }
  } catch (err) {
    console.error('[facturacion] Error generando factura:', err)
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
    const res = await fetch(`${BRIDGE_URL}/ventas/simple`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(`Error HTTP ${res.status}`)
  } catch (err) {
    console.log('[facturacion] No se pudo registrar la venta simple (print-bridge no disponible):', err)
  }
}
