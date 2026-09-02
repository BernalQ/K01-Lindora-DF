import { Router } from 'express'
import { exec } from 'node:child_process'

export const systemRouter = Router()

/**
 * Procesos de navegador a cerrar al salir del kiosko, separados por coma
 * (ver `KIOSK_BROWSER_PROCESSES` en `.env.example`). Por defecto se incluyen
 * Chrome y Edge (los dos navegadores más comunes para levantar kiosko en
 * Windows con `--kiosk`), así el mismo binario sirve sin importar cuál esté
 * configurado en la terminal M8W.
 */
const PROCESOS_POR_DEFECTO = 'chrome.exe,msedge.exe'

/**
 * `POST /system/exit-kiosk` — cierra el/los proceso(s) del navegador en modo
 * kiosko vía `taskkill` (Windows). La verificación de la clave numérica de
 * 6 dígitos ocurre del lado de la PWA (mismo patrón que `AdminScreen`, que
 * también valida el PIN en el cliente); este endpoint no repite esa
 * validación porque el servicio sólo escucha en `localhost` de la misma
 * terminal, igual que `/print` y el resto de rutas de este servicio.
 *
 * Al matar el proceso del navegador en modo kiosko (que ocupa toda la
 * pantalla sin barra de tareas visible), Windows queda mostrando el
 * escritorio detrás — no hace falta ningún paso adicional para "regresar al
 * escritorio", es el resultado natural de cerrar la única ventana visible.
 */
systemRouter.post('/system/exit-kiosk', (_req, res) => {
  const procesos = (process.env.KIOSK_BROWSER_PROCESSES ?? PROCESOS_POR_DEFECTO)
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)

  // Se responde ANTES de matar el navegador: si se hiciera al revés, el
  // `fetch` de la PWA jamás recibiría la respuesta (su propio proceso muere
  // a mitad de la petición) y quedaría colgado hasta expirar por timeout.
  res.status(200).json({ ok: true })

  // Pequeño margen para que la respuesta HTTP alcance a salir por la red
  // antes de que el proceso del navegador termine.
  setTimeout(() => {
    for (const proceso of procesos) {
      exec(`taskkill /IM ${proceso} /F`, (err) => {
        // `taskkill` sale con código de error si ese proceso puntual no
        // estaba corriendo (ej. la terminal usa Edge y no Chrome) — es
        // esperable cuando se intentan varios nombres de proceso a la vez,
        // así que sólo se deja constancia en el log, no se trata como falla.
        if (err) console.warn(`[print-bridge] taskkill ${proceso}:`, err.message)
      })
    }
  }, 400)
})
