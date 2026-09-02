import path from 'node:path'
import { fileURLToPath } from 'node:url'

// src/assets.ts -> print-bridge/assets (fuera de src/dist, junto al proyecto,
// mismo patrón de resolución de rutas que DATA_DIR en data/paths.ts).
const AQUI = path.dirname(fileURLToPath(import.meta.url))

/**
 * Logo de alta resolución (640x640px), usado en el encabezado del PDF de
 * factura electrónica (services/pdfFactura.ts): pdfkit lo embebe e imprime
 * de forma vectorial/escalada, así que no hay penalidad por usar la versión
 * grande.
 */
export const LOGO_PATH = path.resolve(AQUI, '../assets/logo-resta.png')

/**
 * Logo reducido (384x384px) para impresión térmica ESC/POS del comprobante
 * del comensal (printers/print.ts): node-thermal-printer imprime el bitmap
 * a resolución nativa en píxeles, sin reescalar, así que se usa una versión
 * más chica que la del PDF para no exceder el ancho imprimible del cabezal
 * térmico (papel de 80mm) ni imprimir de forma innecesariamente lenta.
 * Generada a partir del mismo `logo-resta.png` (ver print-bridge/assets/).
 */
export const LOGO_TERMICO_PATH = path.resolve(AQUI, '../assets/logo-resta-termico.png')
