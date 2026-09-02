import type { Cliente, FacturaItem, ResultadoFacturaHacienda } from '../types.js'

/**
 * Envío de factura electrónica a Hacienda vía Codisa.
 *
 * ⚠️ STUB: Codisa aún no ha habilitado su API para esta empresa. Esta
 * función arma el payload que se enviaría y simula una respuesta exitosa,
 * para que el resto del flujo (PDF, correo, ticket, bitácora local) quede
 * funcionando de punta a punta desde ya. Cuando Codisa entregue endpoint y
 * credenciales reales:
 *   1. Definir CODISA_API_URL y CODISA_API_KEY en `.env`.
 *   2. Reemplazar el bloque marcado TODO(codisa) por el fetch/POST real.
 * El resto del sistema no requiere cambios: todos consumen esta misma
 * interfaz (`ResultadoFacturaHacienda`).
 *
 * La "clave" generada aquí tiene el largo de una clave numérica de
 * Hacienda (50 dígitos) sólo para que el PDF/ticket muestren un número de
 * referencia con formato consistente — NO es una clave autorizada
 * realmente por Hacienda mientras esta integración sea un stub.
 */
export async function enviarFacturaAHacienda(payload: {
  cliente: Cliente
  items: FacturaItem[]
  total: number
  mesa: string
}): Promise<ResultadoFacturaHacienda> {
  const codisaUrl = process.env.CODISA_API_URL
  const codisaKey = process.env.CODISA_API_KEY

  if (!codisaUrl || !codisaKey) {
    console.log(
      '[hacienda:stub] CODISA_API_URL/CODISA_API_KEY no configurados en .env. ' +
        'Simulando envío de factura electrónica (payload que se enviaría):',
      JSON.stringify(payload),
    )
    return { ok: true, clave: generarClaveInterna() }
  }

  // TODO(codisa): reemplazar por la llamada real una vez Codisa habilite el API.
  // const res = await fetch(`${codisaUrl}/facturas`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${codisaKey}` },
  //   body: JSON.stringify(payload),
  // })
  // if (!res.ok) return { ok: false, mensajeError: `Hacienda/Codisa rechazó la factura (HTTP ${res.status})` }
  // const data = await res.json()
  // return { ok: true, clave: data.clave }
  console.log('[hacienda:stub] Variables de Codisa presentes, pero la integración real aún no está implementada.')
  return { ok: true, clave: generarClaveInterna() }
}

function generarClaveInterna(): string {
  const digito = () => Math.floor(Math.random() * 10)
  return Array.from({ length: 50 }, digito).join('')
}
