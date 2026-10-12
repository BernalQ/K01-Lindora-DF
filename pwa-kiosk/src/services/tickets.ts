import { GUARNICIONES, PRODUCTS, opcionParaMostrar } from '../data/catalog'
import { CAJA_ID } from './consecutivo'
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

/**
 * Margen mínimo entre el borde izquierdo del papel y el texto de cada línea
 * de item, en los 3 tickets (ver `agregarItem`). Necesario porque el área de
 * items/detalle de los 3 tickets ahora se imprime alineada a la izquierda
 * (`ESC a 0`, ver `FIN_ENCABEZADO` abajo y `construirBufferTicket` en
 * `services/escpos.ts`) en vez de centrada — sin este margen explícito el
 * texto quedaría pegado al borde del papel.
 */
const MARGEN_IZQUIERDO_ITEM = '     ' // 5 espacios

/**
 * Línea de control (no se imprime): marca, en cualquiera de los 3 tickets,
 * el límite entre el encabezado (impreso centrado) y el área de
 * items/detalle que sigue (impresa alineada a la izquierda). Reconocida por
 * el mismo literal en `construirBufferTicket` (`services/escpos.ts`), que la
 * omite del texto y en su lugar emite `ESC a 0`.
 */
const FIN_ENCABEZADO: TicketLine = 'Fin Encabezado'

/**
 * Formatea una línea de item para los 3 tickets: nombre a la izquierda con
 * el margen mínimo `MARGEN_IZQUIERDO_ITEM`, y `precio` (si se indica)
 * alineado a la derecha en la misma línea, dentro del mismo ancho fijo que
 * el resto del ticket (`ANCHO`, igual que `lineaConMonto`, que es quien
 * hace la alineación real). Sin `precio` (tickets de carnicería/restaurante,
 * que no llevan monto, o líneas secundarias de detalle como "Corte:"), sólo
 * aplica el margen izquierdo. Si no hay espacio para nombre + precio en una
 * sola línea, el precio baja a una línea propia (ver `lineaConMonto`),
 * manteniendo el mismo margen.
 */
function agregarItem(linea: string, precio?: string): string[] {
  const textoConMargen = `${MARGEN_IZQUIERDO_ITEM}${linea}`
  if (precio === undefined) return [textoConMargen]
  return lineaConMonto(textoConMargen, precio, ANCHO)
}

/**
 * Quita del nombre de un producto cualquier descripción de peso/corte entre
 * paréntesis al final (ej. "Ribeye (250g)" -> "Ribeye", "Churrasco (400g,
 * corte mariposa)" -> "Churrasco", "Pechuga de Pollo (250g, marinada)" ->
 * "Pechuga de Pollo", ver nombres reales en `data/catalog.ts`) — ese dato es
 * útil en el menú de la PWA pero no se necesita en el tiquete impreso, que
 * sólo debe mostrar el nombre principal del producto. Sólo quita paréntesis
 * al final del texto, para no afectar nombres que legítimamente llevan
 * paréntesis en otra posición (no hay casos así en el catálogo actual, pero
 * por si acaso).
 */
function limpiarNombreProducto(nombre: string): string {
  return nombre.replace(/\s*\([^)]*\)\s*$/, '').trim()
}

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
  return limpiarNombreProducto(item.nameEs ?? item.name)
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
 * Tasa de IVA usada únicamente para desglosar el monto de cada ítem del
 * comprobante del cliente (`ticketCliente`) en su parte sin impuesto y su
 * parte de IVA. No es la tasa canónica de facturación electrónica (ver
 * `IVA_RATE`/cálculos de `PaymentScreen.tsx` y `services/facturacion.ts`);
 * es un desglose informativo propio de este tiquete.
 */
const TASA_IVA = 0.13

/**
 * Formatea un monto para el comprobante del cliente con el prefijo "c" (en
 * vez del símbolo ₡, que en ESC/POS requiere rasterizarse como imagen, ver
 * `services/escpos.ts`) seguido de un espacio y el número con dos decimales
 * fijos (ej. `c 12500.00`). Usado en todas las líneas con monto del ticket
 * de cliente (items y totales).
 */
function formatMontoFactura(monto: number): string {
  return `c ${monto.toFixed(2)}`
}

/**
 * Desglosa un monto que ya incluye impuesto (el precio listado, como se
 * cobra) en su parte sin impuesto y su parte de IVA, de forma que
 * `sinImpuesto + iva` sea exactamente igual a `montoConImpuesto` (sin
 * arrastre de redondeo): `iva = monto * 13%`, `sinImpuesto = monto - iva`.
 * Usado para mostrar en el comprobante del cliente el precio de cada ítem
 * sin impuestos, y para acumular el Sub-Total/IVA del ticket (ver
 * `ticketCliente`).
 */
function desglosarImpuesto(montoConImpuesto: number): { sinImpuesto: number; iva: number } {
  const iva = montoConImpuesto * TASA_IVA
  return { sinImpuesto: montoConImpuesto - iva, iva }
}

/**
 * Ancho de la columna "Cant" del área de items del comprobante del cliente
 * (ver `ticketCliente`): igual a `MARGEN_IZQUIERDO_ITEM`, para que las líneas
 * de detalle sin cantidad (Corte, Termino, guarniciones, extras, opción)
 * queden alineadas bajo la columna "Producto", igual que ya ocurría antes de
 * este formato de columnas.
 */
const COL_CANT = MARGEN_IZQUIERDO_ITEM.length

/**
 * Arma el encabezado de 3 columnas ("Cant", "Producto", "Precio") del área
 * de items del comprobante del cliente, seguido de la línea punteada
 * separadora (`SEPARADOR`). "Precio" queda alineado a la misma columna
 * derecha que los montos de `lineaItemColumnas`.
 */
function encabezadoColumnasItems(): TicketLine[] {
  const prefijo = `${'Cant'.padEnd(COL_CANT)}Producto`
  const espacios = Math.max(1, ANCHO - prefijo.length - 'Precio'.length)
  return [`${prefijo}${' '.repeat(espacios)}Precio`, SEPARADOR]
}

/**
 * Línea de item en 3 columnas para el comprobante del cliente: "Cant"
 * (estrecha, sin la letra "x", ver `COL_CANT`), "Producto" (la columna más
 * ancha) y "Precio" (alineado a la derecha). Si el nombre del producto es
 * muy largo para compartir línea con el precio, el precio baja a su propia
 * línea, siempre alineado a la misma columna derecha (igual criterio que
 * `lineaConMonto`, usado por el resto de los tickets).
 */
function lineaItemColumnas(cantidad: number, producto: string, precio: string): string[] {
  const prefijo = `${String(cantidad).padEnd(COL_CANT)}${producto}`
  const espaciosDisponibles = ANCHO - prefijo.length - precio.length
  if (espaciosDisponibles >= 1) {
    return [`${prefijo}${' '.repeat(espaciosDisponibles)}${precio}`]
  }
  const relleno = Math.max(0, ANCHO - precio.length)
  return [prefijo, `${' '.repeat(relleno)}${precio}`]
}

/**
 * Línea de detalle de un item (Corte, Termino, guarniciones, extras,
 * opción) en el área de 3 columnas del comprobante del cliente: sin
 * cantidad ni precio, indentada bajo la columna "Producto" (mismo ancho que
 * `COL_CANT`, ver `lineaItemColumnas`).
 */
function lineaDetalleColumnas(texto: string): string {
  return `${' '.repeat(COL_CANT)}${texto}`
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
 *
 * Todas las líneas se marcan como `big` (doble ancho/doble alto en la
 * impresión térmica, ver `agregarLinea` en `services/escpos.ts`) para que la
 * carnicería pueda leer cada corte a preparar de un vistazo, sin acercarse al
 * tiquete (requerimiento de letra más grande para carnicería).
 */
function lineasCarniceria(items: OrderItem[]): TicketLine[] {
  const totales = new Map<string, number>()
  for (const item of items) {
    const nombre = nombreCarniceria(item)
    if (!nombre) continue
    totales.set(nombre, (totales.get(nombre) ?? 0) + item.quantity)
  }
  return [...totales.entries()].map(([nombre, cantidad]) => ({
    text: agregarItem(`${cantidad}x ${nombre}`)[0],
    big: true,
  }))
}

export function ticketCarniceria(venta: Venta): TicketLine[] {
  return [
    'CARNES DON FERNANDO',
    '*** CARNICERIA ***',
    ...encabezado(venta),
    FIN_ENCABEZADO,
    ...lineasCarniceria(venta.items),
    SEPARADOR,
  ]
}

/**
 * Envuelve un texto en un `TicketLine`, aplicando primero el margen
 * izquierdo mínimo de `agregarItem` (sin monto, por lo que siempre devuelve
 * una sola línea). Si `agrandar` es `true` se marca como `big` (doble
 * ancho/doble alto en la impresión térmica, ver `agregarLinea` en
 * `services/escpos.ts`); si no, se devuelve el texto plano (tamaño normal).
 * Usado en el ticket de parrilla/cocina (ver `lineasItemCocina`).
 */
function conTamano(texto: string, agrandar: boolean): TicketLine {
  const linea = agregarItem(texto)[0]
  return agrandar ? { text: linea, big: true } : linea
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
 * Sólo los items de la categoría "parrilla" (nombre/cantidad, corte, término
 * y guarniciones) se marcan como `big` (letra más grande, ver `conTamano`),
 * según el requerimiento de aumentar la letra de "todos los cortes de
 * parrilla con su término y guarnición". El resto de items del ticket de
 * cocina (entradas, bebidas) se imprime a tamaño normal.
 */
function lineasItemCocina(item: OrderItem): TicketLine[] {
  const lineas: TicketLine[] = []
  const esParrilla = categoriaDe(item) === 'parrilla'
  const opcionPropia = opcionParaMostrar(item.productId, item.opcion)
  const nombreLinea = `${item.quantity}x ${nombreConVariante(item)}${opcionPropia ? ` * ${opcionPropia}` : ''}`
  lineas.push(conTamano(nombreLinea, esParrilla))
  if (item.corte) lineas.push(conTamano(`  Corte: ${item.corte}`, esParrilla))
  const termino = terminoTexto(item)
  if (termino) lineas.push(conTamano(esParrilla ? `  ${termino}` : `  Termino: ${termino}`, esParrilla))
  const guarniciones = guarnicionesTexto(item, { compacto: true, conTitulo: !esParrilla })
  for (const linea of guarniciones) lineas.push(conTamano(linea, esParrilla))
  const extras = extrasTexto(item)
  if (extras) lineas.push(conTamano(extras, esParrilla))
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
    lineas.push({ text: agregarItem(titulo)[0], bold: true })
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
    FIN_ENCABEZADO,
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
    FIN_ENCABEZADO,
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
    FIN_ENCABEZADO,
    ...agruparParaCocina(items),
  ]
  lineas.push(SEPARADOR)
  return lineas
}

/**
 * Encabezado del comprobante del comensal (impresora "cliente"): el texto
 * "Logo Resta" es un marcador reconocido por `construirBufferTicket` (ver
 * `services/escpos.ts`) que se reemplaza por el logo real embebido en
 * ESC/POS (comando `GS v 0`, ver `generarRasterLogo`) — ya no depende de
 * print-bridge para imprimir el logo, la PWA genera el bitmap ella misma en
 * el navegador. Este bloque completo (logo, nombre, slogan, contacto) se
 * imprime centrado (`ESC a 1`); la última línea, "Fin Encabezado", es otro
 * marcador reconocido por `construirBufferTicket` que cambia la alineación a
 * la izquierda (`ESC a 0`) para el detalle de productos que sigue — así el
 * encabezado queda centrado pero el detalle (precios, guarniciones, etc.)
 * queda alineado a la izquierda, más legible en una impresora térmica.
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
    { text: `Factura de caja ${venta.id}`, bold: true },
    `Caja: ${venta.caja ?? CAJA_ID}`,
    `Fecha: ${fecha.toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' })}`,
    `Mesa: ${venta.mesa}`,
    SEPARADOR,
    FIN_ENCABEZADO,
  ]
}

export function ticketCliente(venta: Venta): TicketLine[] {
  const lineas: TicketLine[] = [...encabezadoCliente(venta), ...encabezadoColumnasItems()]
  let subtotal = 0
  let iva = 0
  const itemsLog: { cantidad: number; producto: string; precio: string }[] = []
  for (const item of venta.items) {
    const montoItem = item.price * item.quantity
    const desglose = desglosarImpuesto(montoItem)
    subtotal += desglose.sinImpuesto
    iva += desglose.iva
    const producto = nombreConVariante(item)
    const precio = formatMontoFactura(desglose.sinImpuesto)
    itemsLog.push({ cantidad: item.quantity, producto, precio })
    lineas.push(...lineaItemColumnas(item.quantity, producto, precio))
    if (item.corte) lineas.push(lineaDetalleColumnas(`Corte: ${item.corte}`))
    const termino = terminoTexto(item)
    if (termino) lineas.push(lineaDetalleColumnas(`Termino: ${termino}`))
    const guarniciones = guarnicionesTexto(item)
    for (const linea of guarniciones) lineas.push(lineaDetalleColumnas(linea.trim()))
    const extras = extrasTexto(item)
    if (extras) lineas.push(lineaDetalleColumnas(extras.trim()))
    const opcion = opcionTexto(item)
    if (opcion) lineas.push(lineaDetalleColumnas(opcion.trim()))
  }
  const total = subtotal + iva

  lineas.push(SEPARADOR)
  lineas.push(...agregarItem('Sub-Total', formatMontoFactura(subtotal)))
  lineas.push(...agregarItem('IVA', formatMontoFactura(iva)))
  lineas.push(...agregarItem('Total a pagar', formatMontoFactura(total)))

  if (venta.claveFactura) {
    lineas.push('')
    lineas.push(SEPARADOR)
    lineas.push('COMPROBANTE ELECTRONICO')
    if (venta.cliente) {
      // `partirEnLineas` (mismo helper usado abajo para la clave de 50
      // dígitos) en vez de empujar el texto tal cual: el nombre puede venir
      // de Codisa (razón social de persona jurídica) o del campo libre de
      // `RegistroClienteScreen.tsx` (sin límite de longitud), y sin envolver
      // podía desbordar las 32 columnas fijas del papel — a diferencia del
      // resto del archivo, que siempre respeta ese ancho (ver hallazgo de
      // auditoría).
      lineas.push(...partirEnLineas(`Cliente: ${venta.cliente.nombre}`))
      lineas.push(...partirEnLineas(`Cedula: ${venta.cliente.cedula}`))
    }
    lineas.push('Clave:')
    lineas.push(...partirEnLineas(venta.claveFactura, 20))
  }

  lineas.push('')
  lineas.push('Gracias por su compra')
  lineas.push('Los esperamos pronto')

  console.log('[tickets:cliente] Factura de caja generada:', {
    consecutivo: venta.id,
    caja: venta.caja ?? CAJA_ID,
    items: itemsLog,
    subtotal: subtotal.toFixed(2),
    iva: iva.toFixed(2),
    total: total.toFixed(2),
  })

  return lineas
}

/**
 * Ancho de la columna "# Orden" del área de órdenes del tiquete de cierre de
 * caja (ver `ticketCierreCaja`): suficiente para "#" + el consecutivo de 9
 * dígitos (ver `services/consecutivo.ts`) más un espacio de separación.
 */
const COL_ORDEN_CIERRE = 11

/** Ancho de la columna "Hora" del tiquete de cierre de caja: "HH:MM" (formato 24 horas, ver `lineaOrdenCierre`) más un espacio. */
const COL_HORA_CIERRE = 7

/**
 * Arma el encabezado de 3 columnas ("# Orden", "Hora", "Total") del área de
 * órdenes del tiquete de cierre de caja, seguido de la línea punteada
 * separadora (`SEPARADOR`). "Total" queda alineado a la misma columna
 * derecha que los montos de `lineaOrdenCierre`.
 */
function encabezadoColumnasCierre(): TicketLine[] {
  const prefijo = `${'# Orden'.padEnd(COL_ORDEN_CIERRE)}${'Hora'.padEnd(COL_HORA_CIERRE)}`
  const espacios = Math.max(1, ANCHO - prefijo.length - 'Total'.length)
  return [`${prefijo}${' '.repeat(espacios)}Total`, SEPARADOR]
}

/**
 * Formatea la hora de 12 horas con sufijo "am"/"pm" pegado (sin punto ni
 * espacio interno, ej. `3:12:27 pm`), a diferencia de `toLocaleString('es-CR', ...)`
 * que en este entorno devuelve "a. m."/"p. m." (con puntos y espacio
 * interno) — formato pedido explícitamente para la línea de fecha/hora del
 * encabezado del tiquete de cierre de caja (ver `ticketCierreCaja`).
 */
function formatHoraAmPm(fecha: Date): string {
  const minutos = String(fecha.getMinutes()).padStart(2, '0')
  const segundos = String(fecha.getSeconds()).padStart(2, '0')
  const sufijo = fecha.getHours() >= 12 ? 'pm' : 'am'
  const horas12 = fecha.getHours() % 12 || 12
  return `${horas12}:${minutos}:${segundos} ${sufijo}`
}

/**
 * Línea de una orden en 3 columnas para el tiquete de cierre de caja:
 * "# Orden" (`#<consecutivo>`), "Hora" y "Total" (alineado a la derecha). Si
 * no hay espacio para las 3 columnas en una sola línea (ej. un monto muy
 * grande), el total baja a su propia línea, siempre alineado a la misma
 * columna derecha (igual criterio que `lineaConMonto`/`lineaItemColumnas`).
 */
function lineaOrdenCierre(numeroOrden: string, hora: string, total: string): string[] {
  const prefijo = `${`#${numeroOrden}`.padEnd(COL_ORDEN_CIERRE)}${hora.padEnd(COL_HORA_CIERRE)}`
  const espaciosDisponibles = ANCHO - prefijo.length - total.length
  if (espaciosDisponibles >= 1) {
    return [`${prefijo}${' '.repeat(espaciosDisponibles)}${total}`]
  }
  const relleno = Math.max(0, ANCHO - total.length)
  return [prefijo, `${' '.repeat(relleno)}${total}`]
}

/**
 * Tiquete de cierre de caja (simulado — no es un documento fiscal, sólo un
 * resumen impreso para el cajero): encabezado fijo (nombre comercial,
 * "Kiosko <CAJA_ID>" y fecha/hora del cierre), seguido del área de órdenes
 * del día en 3 columnas ("# Orden", "Hora", "Total"), generado bajo demanda
 * desde el panel de administración (botón "Cierre de Caja", ver
 * `AdminScreen.tsx` -> `PanelCierreCaja`). Se dispara junto con (pero sin
 * depender de) el envío de `BATCH_SETTLEMENT` al Transaction Manager del BAC
 * — ver `enviarTransaccionDatafono` en `services/datafono.ts` — el tiquete
 * se imprime igual sin importar el resultado de ese cierre de lote.
 *
 * La fecha/hora del encabezado es la del momento en que se solicita el
 * cierre (`new Date()` al generar el ticket), no la de cada orden
 * individual — es el dato que pide el requerimiento del kiosko para saber
 * cuándo se hizo el corte. La hora de cada línea de orden, en cambio, SÍ es
 * la de esa venta puntual (`venta.fechaHora`, en formato 24 horas para que
 * quepa en `COL_HORA_CIERRE`), para poder ubicarla en el tiempo dentro del
 * listado del día.
 *
 * El "Kiosko <ID>" del encabezado toma `caja` de la primera orden del día
 * (todas las órdenes de un mismo cierre vienen del mismo dispositivo físico,
 * ver `CAJA_ID` en `services/consecutivo.ts`); si por alguna razón no viene
 * seteado (ventas antiguas en la cola offline, ver `Venta.caja` en
 * `types/order.ts`), cae a `CAJA_ID` como respaldo.
 *
 * Los montos (de cada orden y el total del día) usan `formatMontoFactura`
 * (prefijo "c " + dos decimales fijos, ver ese helper) en vez de `formatCRC`
 * — mismo criterio del comprobante del cliente (`ticketCliente`): este
 * tiquete también se imprime en la estación "Cliente", así que usa el mismo
 * formato de monto en texto plano, sin el símbolo ₡.
 */
export function ticketCierreCaja(ordenes: Venta[]): TicketLine[] {
  const ahora = new Date()
  const caja = ordenes[0]?.caja ?? CAJA_ID
  const lineas: TicketLine[] = [
    'Carnes Don Fernando',
    `Kiosko ${caja}`,
    `${ahora.toLocaleDateString('es-CR', { dateStyle: 'short' })}, ${formatHoraAmPm(ahora)}`,
    '',
    ...encabezadoColumnasCierre(),
  ]

  let total = 0
  for (const venta of ordenes) {
    total += venta.total
    const hora = new Date(venta.fechaHora).toLocaleTimeString('es-CR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    lineas.push(...lineaOrdenCierre(venta.id, hora, formatMontoFactura(venta.total)))
  }

  lineas.push(SEPARADOR)
  lineas.push(`Monto total del día: ${formatMontoFactura(total)}`)
  return lineas
}

/**
 * Tiquete de cancelación de voucher: se imprime en la estación "Cliente"
 * cuando el admin anula una orden ya cobrada (botón "Cancelar" en
 * `AdminScreen.tsx` -> `PanelOrdenesDelDia`), después de que el Transaction
 * Manager del BAC procese el `VOID` correspondiente (ver
 * `enviarTransaccionDatafono` en `services/datafono.ts`). Formato fijo de 3
 * líneas pedido por el requerimiento del kiosko.
 */
export function ticketCancelacionVoucher(referenceNumber: string): TicketLine[] {
  return ['Carnes Don Fernando', 'Cancelación de Voucher', `Referencia: ${referenceNumber}`]
}

export function generarTickets(venta: Venta): Record<PrinterId, TicketLine[]> {
  return {
    carniceria: ticketCarniceria(venta),
    restaurante: ticketRestaurante(venta),
    cliente: ticketCliente(venta),
  }
}
