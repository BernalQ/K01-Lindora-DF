import type { TicketLine } from './tickets'
import logoTermicoUrl from '../assets/logo/logo-resta-termico.png'

/**
 * Codificador ESC/POS nativo del navegador (sin dependencias de Node).
 *
 * IMPORTANTE — por qué esto NO usa `node-thermal-printer` ni `node-escpos`:
 * ambas librerías son paquetes de Node.js: abren sockets TCP con el módulo
 * `net`, leen archivos del disco con `fs`, y (en el caso de `node-escpos`)
 * dependen de bindings nativos para decodificar imágenes. Nada de eso existe
 * en un navegador, y Vite no puede empaquetarlas para el bundle de la PWA
 * (fallarían en tiempo de build o de ejecución al faltar esos módulos).
 *
 * Esta es la razón original por la que el ESC/POS y el logo vivían en
 * `print-bridge` (servicio Node, ver `print-bridge/src/printers/print.ts`,
 * que sí puede usar `node-thermal-printer` porque corre en Node, no en el
 * navegador). Ahora que la PWA necesita generar los bytes ESC/POS ella
 * misma (para mandárselos ya armados a Backend-Print, ver
 * `services/backendPrint.ts`), se reimplementa aquí el mismo protocolo a
 * mano: son sólo secuencias de bytes bien documentadas (comandos ESC/GS) y
 * la imagen del logo se convierte a mapa de bits usando el `<canvas>` del
 * navegador — ningún Node API involucrado.
 *
 * Los comandos de texto (init, negrita, doble alto/ancho, alinear centro,
 * corte de papel) replican byte a byte los mismos que ya emitía
 * `node-thermal-printer`/`print.ts` (ver `epson-config.js` del paquete, y
 * `core.js` -> `cut()`/`setTextDoubleHeight()`/`setTextDoubleWidth()`), para
 * que el comportamiento en la impresora real no cambie.
 *
 * Ajustes específicos para la impresora real del kiosko (ZKTeco ZKP8016),
 * agregados sobre esa base original:
 * - `ESC t 0` al inicio de cada ticket, para fijar explícitamente la code
 *   page CP437 (en vez de asumir que ya es la tabla activa por defecto).
 * - El comprobante de cliente centra el encabezado (logo + datos del
 *   negocio) pero cambia a alineación izquierda (`ESC a 0`) para el detalle
 *   de productos — ver `MARCADOR_FIN_ENCABEZADO`.
 * - Avance extra de papel en blanco (`ESC d 5`) antes del corte en todo
 *   ticket, para que no se pierda texto al arrancar — ver `FEED_EXTRA_FINAL`.
 */

// --- Comandos ESC/POS (mismos bytes que epson-config.js de node-thermal-printer) ---
const HW_INIT = [0x1b, 0x40] // ESC @ — reset
const SEL_CODEPAGE_CP437 = [0x1b, 0x74, 0x00] // ESC t 0 — selecciona explícitamente la tabla de caracteres CP437 (n=0), para que el ₡/acentos de abajo se interpreten como se espera en la ZKTeco ZKP8016
const TXT_ALIGN_CT = [0x1b, 0x61, 0x01] // ESC a 1 — centrar
const TXT_ALIGN_LT = [0x1b, 0x61, 0x00] // ESC a 0 — alinear a la izquierda (usado para el detalle de productos del comprobante de cliente, ver MARCADOR_FIN_ENCABEZADO)
const TXT_BOLD_ON = [0x1b, 0x45, 0x01] // ESC E 1
const TXT_BOLD_OFF = [0x1b, 0x45, 0x00] // ESC E 0
const TXT_2HEIGHT = [0x1b, 0x21, 0x10] // ESC ! 0x10 — doble alto
const TXT_2WIDTH = [0x1b, 0x21, 0x20] // ESC ! 0x20 — doble ancho
const TXT_NORMAL = [0x1b, 0x21, 0x00] // ESC ! 0 — texto normal
const CTL_VT = [0x1b, 0x64, 0x04] // ESC d 4 — avance vertical antes del corte (secuencia original de node-thermal-printer, se conserva para no alterar el resto de la secuencia de corte)
const FEED_EXTRA_FINAL = [0x1b, 0x64, 0x05] // ESC d 5 — avance extra de 5 líneas en blanco al final de todo ticket, antes del corte, para que el usuario no arranque el papel sobre texto todavía útil
const PAPER_FULL_CUT = [0x1d, 0x56, 0x00] // GS V 0 — corte completo
const LF = 0x0a

/**
 * Texto literal que `encabezadoCliente` (ver `services/tickets.ts`) usa como
 * primera línea del comprobante del cliente, marcando dónde iría el logo.
 * Cuando se embebe el logo real en ESC/POS, esta línea se omite del texto
 * (ver `construirBufferTicket`) para no imprimir la palabra "Logo Resta"
 * además de la imagen.
 */
const MARCADOR_LOGO: TicketLine = 'Logo Resta'

/**
 * Texto literal que `encabezadoCliente` (ver `services/tickets.ts`) agrega
 * como última línea del bloque de encabezado (logo + nombre + slogan +
 * contacto), para marcar dónde ese bloque termina. `construirBufferTicket`
 * reconoce esta línea, la omite del texto impreso y en su lugar emite
 * `TXT_ALIGN_LT` (ESC a 0), para que el encabezado salga centrado pero el
 * detalle de productos que sigue (precios, guarniciones, etc.) salga
 * alineado a la izquierda. Mismo patrón que `MARCADOR_LOGO` arriba.
 */
const MARCADOR_FIN_ENCABEZADO: TicketLine = 'Fin Encabezado'

/**
 * Subconjunto de CP437 (code page por defecto de la mayoría de impresoras
 * ESC/POS, incluyendo las ZKTeco del kiosko) necesario para los acentos y
 * símbolos que de verdad aparecen en los tickets (ver nombres de producto en
 * `data/catalog.ts` y textos fijos en `tickets.ts`). Los códigos 0-127 son
 * idénticos a ASCII, así que no necesitan tabla.
 *
 * Limitación conocida: el estándar CP437 no tiene el signo de colón (₡) ni
 * mayúsculas acentuadas (Á/Í/Ó/Ú, salvo É).
 *
 * Para el colón, la ZKTeco ZKP8016 del kiosko se confirmó con el byte
 * `0xA2` (en vez de la aproximación anterior con 'c' minúscula) — ver el
 * `else if (char === '₡')` en `codificarTexto` abajo. OJO: en la tabla CP437
 * estándar, `0xA2` es 'ó' (ya mapeada en este mismo objeto, abajo), así que
 * hay una colisión deliberada de byte: si la ZKP8016 usa CP437 estándar para
 * ese code point, "₡" y "ó" se imprimirían como el mismo glyph. Se deja así
 * porque fue la asignación pedida/validada para esta impresora; si en la
 * práctica se ve 'ó' en vez del símbolo de colón, hay que revisar la tabla de
 * caracteres real de la ZKP8016 (ver también `SEL_CODEPAGE_CP437`/`ESC t 0`
 * en las constantes de arriba, que fija explícitamente la tabla 0 al iniciar
 * el ticket).
 *
 * Las mayúsculas acentuadas no mapeadas en CP437 se resuelven quitándoles la
 * tilde (Á→A, Í→I, Ó→O, Ú→U, ver `MAPA_SIN_TILDE` abajo) en vez de caer en
 * '?' — confirmado con el cliente. Si la impresora real usa otra code page
 * (ej. WPC1252/CP858), ajustar este mapa — no afecta la estructura del resto
 * del protocolo.
 */
const MAPA_CP437: Record<string, number> = {
  ü: 0x81,
  é: 0x82,
  á: 0xa0,
  í: 0xa1,
  ó: 0xa2, // ver nota de colisión con '₡' arriba
  ú: 0xa3,
  ñ: 0xa4,
  Ñ: 0xa5,
  ª: 0xa6,
  º: 0xa7,
  '¿': 0xa8,
  '¡': 0xad,
  Ü: 0x9a,
  É: 0x90,
}

/**
 * Mayúsculas acentuadas que CP437 no tiene (salvo É, ya mapeada arriba). En
 * vez de imprimir '?', se imprime la misma letra sin tilde — más legible en
 * un ticket que un signo de interrogación suelto en medio de una palabra
 * (ej. "CARNICERIA" en vez de "CARNICER?A"). Decisión confirmada con el
 * cliente para la impresora ZKTeco ZKP8016 del kiosko.
 */
const MAPA_SIN_TILDE: Record<string, number> = {
  Á: 0x41, // 'A'
  Í: 0x49, // 'I'
  Ó: 0x4f, // 'O'
  Ú: 0x55, // 'U'
}

function codificarTexto(texto: string): number[] {
  const bytes: number[] = []
  for (const char of texto) {
    const codigo = char.codePointAt(0) ?? 0x3f
    if (codigo < 128) {
      bytes.push(codigo)
    } else if (codigo === 0xa0) {
      // Espacio irrompible (U+00A0): lo usa `Intl.NumberFormat('es-CR')` como
      // separador de miles (ver `formatCRC` en `data/catalog.ts`, ej.
      // "₡2 000"), así que aparece en casi cada línea con monto del ticket.
      // Coincide en valor numérico con 0xA0 de CP437 ('á'), pero acá NO es
      // una á — es un espacio — así que se mapea aparte, antes de la tabla
      // CP437, a un espacio normal (0x20); de lo contrario saldría como '?'.
      bytes.push(0x20)
    } else if (char === '₡') {
      bytes.push(0xa2) // byte confirmado para la ZKTeco ZKP8016, ver nota de colisión con 'ó' documentada arriba
    } else if (MAPA_CP437[char] !== undefined) {
      bytes.push(MAPA_CP437[char])
    } else if (MAPA_SIN_TILDE[char] !== undefined) {
      bytes.push(MAPA_SIN_TILDE[char])
    } else {
      bytes.push(0x3f) // '?'
    }
  }
  return bytes
}

/** Agrega los bytes de una línea de ticket (texto + estilos bold/big), igual que el `for` de `print.ts`. */
function agregarLinea(partes: (number[] | Uint8Array)[], line: TicketLine): void {
  if (typeof line === 'string') {
    partes.push(codificarTexto(line), [LF])
    return
  }
  if (line.bold) partes.push(TXT_BOLD_ON)
  // `big` replica exactamente print.ts: manda doble-alto y luego doble-ancho
  // como dos comandos ESC ! separados (no es un bug nuevo de este archivo,
  // así ya se comporta `node-thermal-printer` en producción).
  if (line.big) partes.push(TXT_2HEIGHT, TXT_2WIDTH)
  partes.push(codificarTexto(line.text), [LF])
  if (line.big) partes.push(TXT_NORMAL)
  if (line.bold) partes.push(TXT_BOLD_OFF)
}

/** Carga una imagen como `HTMLImageElement`, esperando a que termine de decodificar. */
function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`No se pudo cargar la imagen del logo (${src})`))
    img.src = src
  })
}

/**
 * Convierte un `ImageData` (RGBA) a bytes de imagen raster ESC/POS
 * (comando `GS v 0`): 1 bit por píxel, 1 = negro/imprime, 0 = blanco.
 * El ancho en bytes (`width / 8`) debe ser exacto — por eso el canvas que
 * genera este `ImageData` ya se dimensiona en un múltiplo de 8 px de ancho
 * (ver `generarRasterLogo`).
 */
function imageDataARasterEscPos(imageData: ImageData, umbral = 128): number[] {
  const { width, height, data } = imageData
  const bytesPorFila = width / 8
  const bitmap = new Uint8Array(bytesPorFila * height)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const alpha = data[i + 3]
      // Transparente -> blanco (no imprime); si no, luminancia simple RGB.
      const luminancia = alpha === 0 ? 255 : 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      if (luminancia < umbral) {
        bitmap[y * bytesPorFila + (x >> 3)] |= 0x80 >> x % 8
      }
    }
  }

  const xL = bytesPorFila & 0xff
  const xH = (bytesPorFila >> 8) & 0xff
  const yL = height & 0xff
  const yH = (height >> 8) & 0xff
  return [0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH, ...bitmap]
}

/**
 * Genera los bytes ESC/POS del logo (comando `GS v 0`), equivalente a lo que
 * `printer.printImage(LOGO_TERMICO_PATH)` hacía en `print-bridge` (ver
 * `print.ts`), pero decodificando la imagen en el navegador con `<canvas>`
 * en vez de en Node. Usa `logo-resta-termico.png` (384×384px, ya recortado
 * para impresión térmica — mismo archivo fuente que usaba print-bridge,
 * copiado a `pwa-kiosk/src/assets/logo/`).
 */
export async function generarRasterLogo(anchoDestino = 384): Promise<number[]> {
  const img = await cargarImagen(logoTermicoUrl)
  const anchoBytes = Math.ceil(anchoDestino / 8) * 8 // el ancho en px debe ser múltiplo de 8
  const altoDestino = Math.round(anchoBytes * (img.naturalHeight / img.naturalWidth))

  const canvas = document.createElement('canvas')
  canvas.width = anchoBytes
  canvas.height = altoDestino
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo obtener el contexto 2D del canvas para generar el logo ESC/POS')

  // Fondo blanco primero: el PNG del logo tiene zonas transparentes, que sin
  // esto se leerían como negro (alpha 0 -> RGB 0,0,0) al convertir a 1 bit.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, anchoBytes, altoDestino)
  ctx.drawImage(img, 0, 0, anchoBytes, altoDestino)

  const imageData = ctx.getImageData(0, 0, anchoBytes, altoDestino)
  return imageDataARasterEscPos(imageData)
}

export interface OpcionesBufferTicket {
  /** Si es `true`, embebe el logo real (ver `generarRasterLogo`) y omite el texto "Logo Resta". Sólo aplica al comprobante del cliente. */
  incluirLogo?: boolean
}

/**
 * Construye el buffer ESC/POS completo de un ticket: init + selección
 * explícita de code page CP437 (`ESC t 0`), alinear al centro para el
 * encabezado (logo + nombre + slogan + contacto, igual que `print.ts`),
 * logo embebido opcional, cada línea con sus estilos — con un cambio a
 * alineación izquierda (`ESC a 0`) justo antes del detalle de productos en
 * el comprobante de cliente (ver `MARCADOR_FIN_ENCABEZADO`) —, avance extra
 * de papel en blanco (`ESC d 5`) y el corte final.
 */
export async function construirBufferTicket(
  lines: TicketLine[],
  opciones: OpcionesBufferTicket = {},
): Promise<Uint8Array> {
  const partes: (number[] | Uint8Array)[] = [HW_INIT, SEL_CODEPAGE_CP437, TXT_ALIGN_CT]

  if (opciones.incluirLogo) {
    partes.push(await generarRasterLogo())
  }

  for (const line of lines) {
    if (opciones.incluirLogo && line === MARCADOR_LOGO) continue
    if (line === MARCADOR_FIN_ENCABEZADO) {
      partes.push(TXT_ALIGN_LT)
      continue
    }
    agregarLinea(partes, line)
  }

  // Avance extra de 5 líneas en blanco antes del corte (además del avance de
  // 4 líneas x2 que ya hacía `cut()` en node-thermal-printer, ver CTL_VT más
  // arriba), para que al arrancar el papel el usuario no se lleve texto
  // todavía útil del comprobante.
  partes.push(FEED_EXTRA_FINAL, CTL_VT, CTL_VT, PAPER_FULL_CUT, HW_INIT)

  const totalBytes = partes.reduce((acc, parte) => acc + parte.length, 0)
  const resultado = new Uint8Array(totalBytes)
  let offset = 0
  for (const parte of partes) {
    resultado.set(parte, offset)
    offset += parte.length
  }
  return resultado
}
