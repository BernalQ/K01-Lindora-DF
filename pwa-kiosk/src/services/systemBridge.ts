const PRINT_BRIDGE_URL = 'http://localhost:4000'

export interface ResultadoSalirKiosko {
  ok: boolean
  error?: string
}

/**
 * Pide al `print-bridge` local (mismo mecanismo que `enviarTicket` en
 * `printBridge.ts`) que cierre el navegador en modo kiosko, lo que además
 * revela el escritorio de Windows detrás (ver `routes/system.ts` en
 * `print-bridge`, que hace el `taskkill` real).
 *
 * A diferencia de `enviarTicket`, aquí NO se simula un éxito si el servicio
 * no responde: si no hay forma real de cerrar el navegador, hay que
 * decírselo al usuario en vez de fingir que funcionó.
 */
export async function salirDeKiosko(): Promise<ResultadoSalirKiosko> {
  try {
    const res = await fetch(`${PRINT_BRIDGE_URL}/system/exit-kiosk`, { method: 'POST' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error ?? `Error HTTP ${res.status}`)
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
