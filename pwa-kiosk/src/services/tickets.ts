import { GUARNICIONES, PRODUCTS, formatCRC, opcionParaMostrar } from '../data/catalog'
import type { CategoryId } from '../types/catalog'
import type { OrderItem, Venta } from '../types/order'

export type PrinterId = 'carniceria' | 'restaurante' | 'cliente'

/**
 * Nombres de impresora en español (fijos), usados como título de sección en
 * los popups de tickets. El identificador interno (`PrinterId`, la clave de
 * este objeto) sigue siendo `'restaurante'` para no romper la integración
 * con el print-bridge/hardware existente; sólo cambia el nombre visible,
 * que ahora es "Parrilla" (antes "Restaurante").
 */
export const NOMBRES_IMPRESORA: Record<PrinterId, string> = {
  carniceria: 'Carnicería',
  restaurante: 'Parrilla',
  cliente: 'Cliente',
}

/**
 * Línea de ticket: normalmente texto plano, pero puede llevar estilo
 * (`big`/`medium`/`bold`) para elementos que deben resaltar en la impresión
 * térmica. `big` se reserva para elementos muy prominentes (ej. el nombre/ID
 * de mesa en el tiquete consolidado de mesa compartida); `medium` es un
 * aumento más discreto, usado para agrandar ligeramente todo el texto del
 * ticket de parrilla sin llegar al tamaño de `big`. Los strings planos
 * siguen siendo válidos en cualquier lugar donde se espere `TicketLine`, así
 * que esto es compatible con todo el código existente que arma tickets como
 * `string[]`.
 */
export type TicketLine = string | { text: string; big?: boolean; medium?: boolean; bold?: boolean }

const ANCHO = 32
const SEPARADOR = '-'.repeat(ANCHO)

function nombreGuarnicion(id: string): string {
  return GUARNICIONES.find((g) => g.id === id)?.name ?? id
}

function categoriaDe(item: OrderItem): CategoryId | undefined {
  return PRODUCTS.find((p) => p.id === item.productId)?.categoryId
}

/** Texto de ingredientes excluidos de un item (ej. "Sin Tomate, Sin Queso"), o `null` si no aplica. */
function extrasTexto(item: OrderItem): string | null {
  if (!item.extras || item.extras.length === 0) return null
  return `  Sin: ${item.extras.join(', ')}`
}

/**
 * Texto de la opción única elegida (ej. "Sin Aderezo"), o `null` si no
 * aplica o si es la opción por defecto del producto (ver
 * `opcionParaMostrar`), que no se imprime porque no es un cambio respecto a
 * la preparación estándar.
 */
function opcionTexto(item: OrderItem): string | null {
  const opcion = opcionParaMostrar(item.productId, item.opcion)
  if (!opcion) return null
  return `  Personalizacion: ${opcion}`
}

interface GuarnicionesTextoOpciones {
  /**
   * Si es `true`, el nombre de la guarnición y su opción se combinan en una
   * sola línea separados por " * " (ej. "Papa Asada * Con Natilla"). Si es
   * `false` (por defecto), la opción va en una línea secundaria debajo.
   */
  compacto?: boolean
  /**
   * Si es `true` (por defecto), se antepone el encabezado "  Guarniciones:"
   * y cada guarnición va indentada debajo. Si es `false` (usado por los
   * items de la sección "Parrilla" del ticket de cocina), se omite ese
   * encabezado y cada guarnición se imprime directamente, al mismo nivel de
   * indentación que el término de cocción.
   */
  conTitulo?: boolean
}

/**
 * Líneas de guarniciones incluidas de un item de parrilla, listas para
 * imprimir: por defecto, un encabezado "Guarniciones:", seguido de una línea
 * por cada guarnición elegida (agrupando repeticiones idénticas con
 * "x{cantidad}") y, si esa guarnición tiene una opción de personalización
 * elegida (ej. "Con Natilla" para Papa Asada, ver `Product.opcionUnica`), su
 * opción. Devuelve un array vacío si el item no tiene guarniciones. Ver
 * `GuarnicionesTextoOpciones` para las variantes `compacto`/`conTitulo`
 * usadas por `lineasItemCocina` (ticket de parrilla); `ticketCliente` sigue
 * usando los valores por defecto, sin cambios.
 */
function guarnicionesTexto(item: OrderItem, opciones: GuarnicionesTextoOpciones = {}): string[] {
  const { compacto = false, conTitulo = true } = opciones
  if (!item.guarniciones || item.guarniciones.length === 0) return []
  const counts = new Map<string, { id: string; opcion?: string; count: number }>()
  for (const g of item.guarniciones) {
    const key = `${g.id}|${g.opcion ?? ''}`
    const actual = counts.get(key)
    if (actual) actual.count += 1
    else counts.set(key, { id: g.id, opcion: g.opcion, count: 1 })
  }
  const indentPrincipal = conTitulo ? '    ' : '  '
  const indentOpcion = conTitulo ? '      ' : '  '
  const lineas: string[] = conTitulo ? ['  Guarniciones:'] : []
  for (const { id, opcion, count } of counts.values()) {
    const sufijo = count > 1 ? ` x${count}` : ''
    const opcionMostrar = opcionParaMostrar(id, opcion)
    if (compacto && opcionMostrar) {
      lineas.push(`${indentPrincipal}${nombreGuarnicion(id)}${sufijo} * ${opcionMostrar}`)
      continue
    }
    lineas.push(`${indentPrincipal}${nombreGuarnicion(id)}${sufijo}`)
    if (opcionMostrar) lineas.push(`${indentOpcion}${opcionMostrar}`)
  }
  return lineas
}

/**
 * Nombre "canónico" en español del ítem, usado para imprimir tickets.
 * Se usa siempre item.nameEs (si existe) para garantizar que los tickets
 * de carnicería, restaurante y cliente permanezcan en español,
 * independientemente del idioma seleccionado en la interfaz.
 */
function nombreEsItem(item: OrderItem): string {
  return item.nameEs ?? item.name
}

function nombreConVariante(item: OrderItem): string {
  return item.variante ?? nombreEsItem(item)
}

/**
 * Texto de término(s) de cocción de un ítem, listo para imprimir. Los
 * tickets siempre se imprimen en español (ver comentario de archivo), así
 * que este helper no usa i18n: los valores de `termino`/`terminos` ya están
 * guardados como texto canónico en español. Para platos compartidos con un
 * término por comensal (ej. Parrillada Mixta para 2), devuelve los términos
 * numerados por comensal en un solo texto, para mantener el ítem en una
 * sola línea con la personalización listada debajo.
 */
function terminoTexto(item: OrderItem): string | null {
  if (item.terminos && item.terminos.length > 0) {
    return item.terminos.map((termino, i) => `Comensal ${i + 1}: ${termino}`).join(', ')
  }
  return item.termino ?? null
}

/**
 * Genera una o dos líneas donde el monto queda alineado a la derecha,
 * en la misma columna para todas las líneas del ticket (ancho fijo).
 * Si el texto es muy largo para compartir línea con el monto, el monto
 * baja a una línea propia, siempre alineado a la misma columna derecha.
 */
function lineaConMonto(texto: string, monto: string, ancho: number = ANCHO): string[] {
  const espaciosDisponibles = ancho - texto.length - monto.length
  if (espaciosDisponibles >= 1) {
    return [`${texto}${' '.repeat(espaciosDisponibles)}${monto}`]
  }
  const relleno = Math.max(0, ancho - monto.length)
  return [texto, `${' '.repeat(relleno)}${monto}`]
}

/** Divide un texto largo (ej. la clave de 50 dígitos) en líneas del ancho del ticket. */
function partirEnLineas(texto: string, ancho: number = ANCHO): string[] {
  const lineas: string[] = []
  for (let i = 0; i < texto.length; i += ancho) {
    lineas.push(texto.slice(i, i + ancho))
  }
  return lineas
}

/**
 * Texto del monto TOTAL listo para imprimir en el comprobante del cliente,
 * con la leyenda "I.V.I." (Impuesto de Ventas Incluido) pegada al monto,
 * para dejar explícito en el tiquete impreso que el impuesto de venta ya
 * está incluido (los precios del catálogo ya lo incluyen, ver `IVA_RATE` en
 * `PaymentScreen`; este helper sólo agrega la leyenda visible al imprimir).
 * Usado únicamente en la línea "TOTAL PAGADO:" — los montos de cada item
 * individual del comprobante no llevan esta leyenda (ver `ticketCliente`).
 */
function montoTotalConIvi(monto: number): string {
  return `${formatCRC(monto)} I.V.I.`
}

/**
 * Encabezado común de los tiquetes de una orden individual: consecutivo
 * (`venta.id`, ver `services/consecutivo.ts`) en negrita, en su propia línea
 * justo encima de la mesa (línea aparte para que no se corte en impresoras
 * térmicas angostas con nombres de mesa largos), seguido de la fecha/hora.
 */
function encabezado(venta: Venta): TicketLine[] {
  const fecha = new Date(venta.fechaHora)
  return [
    { text: `Orden: ${venta.id}`, bold: true },
    `Mesa: ${venta.mesa}`,
    fecha.toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' }),
    '',
  ]
}

/**
 * Items que en el ticket de carnicería se imprimen bajo un nombre distinto
 * al del menú, sin personalización ni guarnición (sólo el nombre y la
 * cantidad total). Ej.: "Gallo de Chorizo" y "Choripán" salen ambos como
 * "Chorizo", ya que en carnicería se preparan igual.
 */
const CARNICERIA_RENOMBRE: Record<string, string> = {
  'gallo-chorizo': 'Chorizo',
  choripan: 'Chorizo',
}

/**
 * Items que no son "a la parrilla" pero que la carnicería también debe
 * preparar, por lo que se incluyen en su ticket bajo su propio nombre (sin
 * renombrar). Ej.: los chicharrones, que son entradas pero se preparan en
 * carnicería.
 */
const CARNICERIA_INCLUIR_EXTRA = new Set(['chicharron-carne', 'chicharron-panza'])

/**
 * Nombre bajo el cual se agrupa un item en el ticket de carnicería: el de
 * `CARNICERIA_RENOMBRE` si aplica; si es un item "a la parrilla" o está en
 * `CARNICERIA_INCLUIR_EXTRA` (los que la carnicería debe preparar), su
 * nombre canónico en español. Cualquier otro item (guarniciones, bebidas,
 * sobremesa, etc.) no se imprime en este ticket (`null`).
 */
function nombreCarniceria(item: OrderItem): string | null {
  const renombrado = CARNICERIA_RENOMBRE[item.productId]
  if (renombrado) return renombrado
  if (categoriaDe(item) === 'parrilla' || CARNICERIA_INCLUIR_EXTRA.has(item.productId)) return nombreEsItem(item)
  return null
}

/**
 * Líneas del ticket de carnicería: una sola línea por nombre de item (ver
 * `nombreCarniceria`), con la cantidad total sumada de todos los items que
 * caen bajo ese nombre — sin importar si vienen de una sola orden o de
 * varias órdenes de una misma mesa, y sin personalización (término,
 * guarniciones, extras, opción) ni guarnición: la carnicería sólo necesita
 * saber cuánto preparar de cada corte, el detalle de preparación va en el
 * ticket de restaurante (`agruparParaCocina`).
 */
function lineasCarniceria(items: OrderItem[]): string[] {
  const totales = new Map<string, number>()
  for (const item of items) {
    const nombre = nombreCarniceria(item)
    if (!nombre) continue
    totales.set(nombre, (totales.get(nombre) ?? 0) + item.quantity)
  }
  return [...totales.entries()].map(([nombre, cantidad]) => `${cantidad}x ${nombre}`)
}

export function ticketCarniceria(venta: Venta): TicketLine[] {
  return [
    'CARNES DON FERNANDO',
    '*** CARNICERIA ***',
    ...encabezado(venta),
    ...lineasCarniceria(venta.items),
    SEPARADOR,
  ]
}

/** Envuelve un texto en un `TicketLine` de tamaño `medium` (un poco más grande de lo normal, sin exagerar). Usado en todo el ticket de parrilla (ver `lineasItemCocina`). */
function conTamano(texto: string): TicketLine {
  return { text: texto, medium: true }
}

/**
 * Líneas completas de un item para el ticket de parrilla/cocina: nombre +
 * cantidad (con su propia opción de personalización combinada en la misma
 * línea, ej. "1x Choripán * Sin Chimichurri" o "1x Ensalada Griega * Sin
 * Aderezo"), corte, término de cocción, guarniciones y extras.
 *
 * Para items de la categoría "parrilla" (cortes), el término de cocción y
 * las guarniciones se imprimen sin título/encabezado (ej. "  Medio"
 * y "  Papa Asada * Con Natilla" en vez de "  Termino: Medio" y
 * "  Guarniciones:" + "    Papa Asada" + "      Con Natilla"), ya que en la
 * estación de parrilla el orden fijo de las líneas (nombre / término /
 * guarnición) ya es suficiente para identificar cada dato sin necesidad de
 * etiquetas. El resto de items conserva las etiquetas ("Termino:",
 * "Guarniciones:") para no perder claridad fuera de ese contexto fijo.
 *
 * Todas las líneas se marcan como `medium` para aumentar ligeramente el
 * tamaño de letra en la impresión térmica en toda la sección de
 * parrilla/cocina.
 */
function lineasItemCocina(item: OrderItem): TicketLine[] {
  const lineas: TicketLine[] = []
  const esParrilla = categoriaDe(item) === 'parrilla'
  const opcionPropia = opcionParaMostrar(item.productId, item.opcion)
  const nombreLinea = `${item.quantity}x ${nombreConVariante(item)}${opcionPropia ? ` * ${opcionPropia}` : ''}`
  lineas.push(conTamano(nombreLinea))
  if (item.corte) lineas.push(conTamano(`  Corte: ${item.corte}`))
  const termino = terminoTexto(item)
  if (termino) lineas.push(conTamano(esParrilla ? `  ${termino}` : `  Termino: ${termino}`))
  const guarniciones = guarnicionesTexto(item, { compacto: true, conTitulo: !esParrilla })
  for (const linea of guarniciones) lineas.push(conTamano(linea))
  const extras = extrasTexto(item)
  if (extras) lineas.push(conTamano(extras))
  return lineas
}

/**
 * Agrupa los items de una o varias órdenes en las secciones del ticket de
 * parrilla/cocina, siempre en este orden fijo:
 *   a. ENTRADAS: todos los items del menú "Para comenzar".
 *   b. PARRILLA: cada corte con su término y guarnición, seguido — al final
 *      de la lista — de las guarniciones pedidas sueltas desde el tab
 *      "Guarniciones" (ej. una Papa Asada pedida aparte, no incluida en un
 *      corte), ya que también las prepara la estación de parrilla.
 *   c. BEBIDAS: todas las bebidas.
 *   d. El resto de items (ej. sobremesa), listados al final sin encabezado
 *      de sección.
 * Todas las líneas de items se imprimen en tamaño `medium` (ver
 * `lineasItemCocina`), un poco más grande de lo normal, para mejorar la
 * legibilidad en la estación de cocina/parrilla. Reutilizado tanto por el
 * ticket de una sola orden como por el consolidado de mesa compartida, para
 * no duplicar la lógica de agrupación.
 */
function agruparParaCocina(items: OrderItem[]): TicketLine[] {
  const lineas: TicketLine[] = []

  const entradas = items.filter((item) => categoriaDe(item) === 'comenzar')
  const parrilla = items.filter((item) => categoriaDe(item) === 'parrilla')
  const bebidas = items.filter((item) => categoriaDe(item) === 'bebidas')
  const guarnicionesSueltas = items.filter((item) => categoriaDe(item) === 'guarniciones')
  const yaAgrupados = new Set<OrderItem>([...entradas, ...parrilla, ...bebidas, ...guarnicionesSueltas])
  const resto = items.filter((item) => !yaAgrupados.has(item))

  const agregarSeccion = (titulo: string, grupo: OrderItem[]) => {
    if (grupo.length === 0) return
    lineas.push({ text: titulo, bold: true })
    for (const item of grupo) {
      lineas.push(...lineasItemCocina(item))
    }
    lineas.push('')
  }

  agregarSeccion('ENTRADAS', entradas)
  agregarSeccion('PARRILLA', [...parrilla, ...guarnicionesSueltas])
  agregarSeccion('BEBIDAS', bebidas)

  for (const item of resto) {
    lineas.push(...lineasItemCocina(item))
  }

  if (lineas[lineas.length - 1] === '') lineas.pop()
  return lineas
}

export function ticketRestaurante(venta: Venta): TicketLine[] {
  const lineas: TicketLine[] = [
    'CARNES DON FERNANDO',
    '*** PARRILLA / COCINA ***',
    ...encabezado(venta),
    ...agruparParaCocina(venta.items),
  ]
  lineas.push(SEPARADOR)
  return lineas
}

/**
 * Tiquete consolidado de carnicería para una mesa compartida: concatena los
 * cortes de todas las órdenes ya cobradas bajo esa mesa y se imprime una
 * sola vez, al cerrar la mesa. El nombre/ID de la mesa se destaca como el
 * elemento más grande y visible, en la parte superior.
 */
export function ticketConsolidadoCarniceria(mesaId: string, ordenes: Venta[]): TicketLine[] {
  const items = ordenes.flatMap((v) => v.items)
  return [
    'CARNES DON FERNANDO',
    '*** CARNICERIA (CONSOLIDADO) ***',
    { text: mesaId.toUpperCase(), big: true, bold: true },
    new Date().toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' }),
    '',
    ...lineasCarniceria(items),
    SEPARADOR,
  ]
}

/**
 * Tiquete consolidado de restaurante/cocina para una mesa compartida: mismo
 * criterio que `ticketConsolidadoCarniceria`, pero agrupado por sección de
 * cocina (igual que `ticketRestaurante`) y con el nombre de mesa destacado.
 */
export function ticketConsolidadoRestaurante(mesaId: string, ordenes: Venta[]): TicketLine[] {
  const items = ordenes.flatMap((v) => v.items)
  const lineas: TicketLine[] = [
    'CARNES DON FERNANDO',
    '*** PARRILLA / COCINA (CONSOLIDADO) ***',
    { text: mesaId.toUpperCase(), big: true, bold: true },
    new Date().toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' }),
    '',
    ...agruparParaCocina(items),
  ]
  lineas.push(SEPARADOR)
  return lineas
}

/**
 * Encabezado del comprobante del comensal (impresora "cliente"): el logo en
 * sí NO va acá — lo imprime print-bridge como paso de hardware previo (ver
 * `printers/print.ts` -> `LOGO_TERMICO_PATH`), ya que sólo ese servicio tiene
 * acceso al archivo local y al driver ESC/POS. Esta función arma el resto
 * del bloque, todo centrado (la impresora imprime en `alignCenter` para el
 * comprobante completo, ver `print.ts`): la referencia "Logo Resta" debajo
 * del logo, la leyenda fija del negocio, una línea en blanco de separación,
 * el consecutivo de la orden como "Factura de Caja#" (mismo valor que
 * `venta.id`, ver `services/consecutivo.ts`) y la fecha/hora de la venta.
 */
function encabezadoCliente(venta: Venta): TicketLine[] {
  const fecha = new Date(venta.fechaHora)
  return [
    'Logo Resta',
    'CARNES DON FERNANDO',
    'EL ESPECIALISTA EN CARNES',
    'Santa Ana, C.C Vistana Este',
    'santana@carnesdonfernado.com',
    'Tel: 2282-0182 / Ced. J: 3101017589',
    '',
    { text: `Factura de Caja#: ${venta.id}`, bold: true },
    `Fecha: ${fecha.toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' })}`,
    `Mesa: ${venta.mesa}`,
    SEPARADOR,
  ]
}

export function ticketCliente(venta: Venta): TicketLine[] {
  const lineas: TicketLine[] = [...encabezadoCliente(venta)]
  for (const item of venta.items) {
    lineas.push(
      ...lineaConMonto(`${item.quantity}x ${nombreConVariante(item)}`, formatCRC(item.price * item.quantity)),
    )
    if (item.corte) lineas.push(`  Corte: ${item.corte}`)
    const termino = terminoTexto(item)
    if (termino) lineas.push(`  Termino: ${termino}`)
    const guarniciones = guarnicionesTexto(item)
    if (guarniciones.length > 0) lineas.push(...guarniciones)
    const extras = extrasTexto(item)
    if (extras) lineas.push(extras)
    const opcion = opcionTexto(item)
    if (opcion) lineas.push(opcion)
  }
  lineas.push(SEPARADOR)
  lineas.push(...lineaConMonto('TOTAL PAGADO:', montoTotalConIvi(venta.total)))

  if (venta.claveFactura) {
    lineas.push('')
    lineas.push(SEPARADOR)
    lineas.push('COMPROBANTE ELECTRONICO')
    if (venta.cliente) {
      lineas.push(`Cliente: ${venta.cliente.nombre}`)
      lineas.push(`Cedula: ${venta.cliente.cedula}`)
    }
    lineas.push('Clave:')
    lineas.push(...partirEnLineas(venta.claveFactura, 20))
  }

  lineas.push('')
  lineas.push('¡Gracias por su visita!')
  return lineas
}

export function generarTickets(venta: Venta): Record<PrinterId, TicketLine[]> {
  return {
    carniceria: ticketCarniceria(venta),
    restaurante: ticketRestaurante(venta),
    cliente: ticketCliente(venta),
  }
}
