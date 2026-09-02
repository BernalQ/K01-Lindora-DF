import fs from 'node:fs'
import { printer as ThermalPrinter, types as PrinterTypes } from 'node-thermal-printer'
import { PRINTERS } from './config.js'
import { LOGO_TERMICO_PATH } from '../assets.js'
import type { PrinterId, TicketLine } from '../types.js'

export async function printTicket(printerId: PrinterId, lines: TicketLine[]): Promise<void> {
  const target = PRINTERS[printerId]

  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: `tcp://${target.host}:${target.port}`,
    removeSpecialCharacters: false,
    width: 42, // ancho aprox. en caracteres para papel 80mm
  })

  const connected = await printer.isPrinterConnected()
  if (!connected) {
    throw new Error(
      `No se pudo conectar con la impresora "${printerId}" en ${target.host}:${target.port}`,
    )
  }

  printer.alignCenter()

  // Comprobante del comensal: logo centrado como primera línea del tiquete
  // (ver LOGO_TERMICO_PATH en ../assets.js). Se imprime acá, como paso previo
  // del hardware, y no como un TicketLine más, porque sólo print-bridge tiene
  // acceso al archivo local y al driver ESC/POS — la PWA sólo envía texto
  // (ver services/tickets.ts -> ticketCliente).
  //
  // Se deja en un try/catch propio (en vez de dejar que un fallo del logo
  // tumbe todo el comprobante): algunas impresoras térmicas genéricas no
  // implementan bien el comando de imagen raster (GS v 0) aunque sí impriman
  // texto sin problema, y preferimos que el resto del tiquete (los datos que
  // sí importan al cliente) salga igual. Los console.error/warn quedan como
  // rastro para diagnosticar por qué no salió el logo (archivo no encontrado
  // vs. la impresora rechazó el comando de imagen).
  if (printerId === 'cliente') {
    if (fs.existsSync(LOGO_TERMICO_PATH)) {
      try {
        await printer.printImage(LOGO_TERMICO_PATH)
      } catch (err) {
        console.error(
          '[print-bridge] Falló la impresión del logo en el comprobante del cliente (se continúa sin logo):',
          err,
        )
      }
    } else {
      console.warn(
        `[print-bridge] No se encontró el logo térmico en ${LOGO_TERMICO_PATH}; se omite del comprobante del cliente.`,
      )
    }
  }

  for (const line of lines) {
    if (typeof line === 'string') {
      printer.println(line)
      continue
    }

    // Línea con estilo (ej. nombre de mesa en el tiquete consolidado):
    // se resalta con negrita y/o doble alto/ancho, y se resetea después.
    if (line.bold) printer.bold(true)
    if (line.big) {
      printer.setTextDoubleHeight()
      printer.setTextDoubleWidth()
    }
    printer.println(line.text)
    if (line.big) printer.setTextNormal()
    if (line.bold) printer.bold(false)
  }
  printer.cut()

  await printer.execute()
}
