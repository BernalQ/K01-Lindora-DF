import { GUARNICIONES, PRODUCTS, opcionParaMostrar } from '../data/catalog'
import { CAJA_ID } from './consecutivo'
import type { CategoryId } from '../types/catalog'
import type { OrderItem, Venta } from '../types/order'
import type { ResultadoDatafono } from '../types/datafono'

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
 * Línea(s) de item en 3 columnas para el comprobante del cliente: "Cant"
 * (estrecha, sin la letra "x", ver `COL_CANT`) + "Producto" en su propio
 * renglón (con todo el ancho disponible, sin tener que compartir línea con
 * el precio), y "Precio" siempre en el renglón siguiente, alineado a la
 * columna derecha (ver requerimiento "mover la columna de Precio más a la
 * derecha, dando más espacio a la columna de Producto"): antes el precio
 * podía compartir línea con el nombre del producto cuando éste era corto, lo
 * que limitaba el ancho útil de "Producto" a lo que quedara libre junto al
 * precio; ahora "Producto" siempre tiene las columnas 6-32 completas para sí
 * mismo y "Precio" queda consistentemente en su propio renglón, pegado al
 * borde derecho del papel.
 */
function lineaItemColumnas(cantidad: number, producto: string, precio: string): string[] {
  const prefijo = `${String(cantidad).padEnd(COL_CANT)}${producto}`
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
    formatFechaHoraAmPm(fecha),
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
 * renombrar).
 *
 * Antes incluía 'chicharron-carne' y 'chicharron-panza' ("Chicharrón de
 * Carne"/"Chicharrón de Panzada") — requerimiento vigente: removerlos
 * completamente del tiquete de Carnicería (NO del catálogo, de la venta, de
 * Codisa ni del tiquete de Cliente — sólo de este tiquete). Al no estar en
 * este set (y no ser categoría "parrilla"), `nombreCarniceria` los excluye de
 * este ticket sin tocar nada más: siguen apareciendo normalmente en el
 * catálogo, la orden, el tiquete de Cliente y el envío a Codisa.
 */
const CARNICERIA_INCLUIR_EXTRA = new Set<string>([])

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
 * Todas las líneas se marcan como `medium` (doble alto, sin doble ancho, ver
 * `agregarLinea` en `services/escpos.ts`) para que la carnicería pueda leer
 * cada corte a preparar de un vistazo, sin acercarse al tiquete. Antes se
 * marcaban `big` (doble ancho + doble alto, requerimiento anterior de "letra
 * más grande para carnicería"); requerimiento de negocio vigente pide una
 * letra "un poco más pequeña" que esa, de ahí el cambio a `medium` en vez de
 * volver a tamaño normal — sigue siendo notablemente más grande que el texto
 * normal del resto del tiquete, sólo más compacta que el `big` anterior.
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
    medium: true,
  }))
}

export function ticketCarniceria(venta: Venta): TicketLine[] {
  return [
    // 4 renglones en blanco totalmente en la parte superior del tiquete,
    // antes del header (ver requerimiento vigente: "deben estar totalmente
    // en la parte superior del tiquete, antes del header"). Antes iban
    // justo después de `FIN_ENCABEZADO`, pegados al inicio del listado de
    // productos; ahora el listado empieza inmediatamente después del
    // header, sin espacio extra entre ambos. El listado que sigue ya se
    // imprime alineado a la izquierda por el propio `FIN_ENCABEZADO`
    // (ESC a 0, ver `construirBufferTicket` en `services/escpos.ts`), así
    // que no hace falta ningún otro cambio para cumplir "alineación
    // completamente a la izquierda".
    '',
    '',
    '',
    '',
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
 * una sola línea) y marcándolo como `medium` (doble alto, sin doble ancho,
 * en la impresión térmica, ver `agregarLinea` en `services/escpos.ts`).
 * Usado en el ticket de parrilla/cocina (ver `lineasItemCocina`) para TODAS
 * las líneas de producto, sin importar la sección (Entradas, Parrilla,
 * Bebidas, Guarniciones sueltas, Sobremesa) — requerimiento de negocio
 * vigente: "usar el mismo tamaño de letra de Parrilla en el resto de
 * secciones". Antes sólo los cortes de la sección "Parrilla" se marcaban así
 * (`agrandar: boolean` condicionaba el tamaño); ese parámetro ya no hace
 * falta porque ahora el tamaño es el mismo para cualquier item del ticket.
 */
function conTamano(texto: string): TicketLine {
  return { text: agregarItem(texto)[0], medium: true }
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
 * Todos los items del ticket de cocina (entradas, parrilla, bebidas,
 * guarniciones sueltas, sobremesa) se marcan como `medium` (letra más
 * grande que la normal, sin llegar al tamaño `big`, ver `conTamano`) —
 * requerimiento vigente: "usar el mismo tamaño de letra de Parrilla en el
 * resto de secciones". `esParrilla` ya NO decide el tamaño de letra; se
 * sigue usando únicamente para decidir si el término/guarniciones se
 * imprimen con o sin título (ver comentario arriba).
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
    // 4 renglones en blanco totalmente en la parte superior del tiquete,
    // antes del header (mismo criterio que `ticketCarniceria`, ver
    // requerimiento vigente).
    '',
    '',
    '',
    '',
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
    // 4 renglones en blanco totalmente en la parte superior del tiquete,
    // antes del header (mismo criterio que `ticketCarniceria`, ver
    // requerimiento vigente).
    '',
    '',
    '',
    '',
    'CARNES DON FERNANDO',
    '*** CARNICERIA (CONSOLIDADO) ***',
    { text: mesaId.toUpperCase(), big: true, bold: true },
    formatFechaHoraAmPm(new Date()),
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
    // 4 renglones en blanco totalmente en la parte superior del tiquete,
    // antes del header (mismo criterio que `ticketRestaurante`, ver
    // requerimiento vigente).
    '',
    '',
    '',
    '',
    'CARNES DON FERNANDO',
    '*** PARRILLA / COCINA (CONSOLIDADO) ***',
    { text: mesaId.toUpperCase(), big: true, bold: true },
    formatFechaHoraAmPm(new Date()),
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
    `Fecha: ${formatFechaHoraAmPm(fecha)}`,
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

  // Número de Transacción/Autorización del Transaction Manager del BAC (ver
  // requerimiento): el TM no expone un campo separado llamado "número de
  // transacción" (ver `RespuestaDatafonoBody` en types/datafono.ts), así que
  // se usa `referenceNumber` para esa etiqueta y `authorizationNumber` para
  // "Número de Autorización" — ambos ya se capturan en `venta.referenciaDatafono`/
  // `venta.autorizacionDatafono` al cerrarse el pop-up de resultado del cobro
  // (ver PaymentScreen.tsx). Sólo se imprime el bloque si al menos uno de los
  // dos está presente (ventas antiguas en la cola offline, de antes de este
  // requerimiento, no lo tienen).
  if (venta.autorizacionDatafono || venta.referenciaDatafono) {
    lineas.push('')
    lineas.push('')
    if (venta.referenciaDatafono) lineas.push(`Número de Transacción: ${venta.referenciaDatafono}`)
    if (venta.autorizacionDatafono) lineas.push(`Número de Autorización: ${venta.autorizacionDatafono}`)
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
 * Formatea la hora de 12 horas con sufijo "am"/"pm" pegado (sin punto ni
 * espacio interno, ej. `3:12:27 pm` o, sin segundos, `3:12 pm`), a diferencia
 * de `toLocaleString('es-CR', ...)` que en este entorno devuelve "a. m."/
 * "p. m." (con puntos y espacio interno). Requerimiento de negocio vigente:
 * toda hora visible en la PWA (tiquetes impresos y pantallas del
 * kiosko/admin) debe usar este formato pegado, no sólo el tiquete de cierre
 * de caja donde se usó por primera vez — ver usos de `formatHoraAmPm`/
 * `formatFechaHoraAmPm` en `AdminScreen.tsx` y `WsDfPopup.tsx`.
 *
 * `incluirSegundos` (default `true`) permite omitir los segundos cuando el
 * lugar que llama a esta función no los necesita (ej. la lista de órdenes de
 * `AdminScreen`, que sólo mostraba HH:MM antes de este cambio).
 */
export function formatHoraAmPm(fecha: Date, incluirSegundos = true): string {
  const minutos = String(fecha.getMinutes()).padStart(2, '0')
  const sufijo = fecha.getHours() >= 12 ? 'pm' : 'am'
  const horas12 = fecha.getHours() % 12 || 12
  if (!incluirSegundos) return `${horas12}:${minutos} ${sufijo}`
  const segundos = String(fecha.getSeconds()).padStart(2, '0')
  return `${horas12}:${minutos}:${segundos} ${sufijo}`
}

/**
 * Combina fecha corta (`dateStyle: 'short'`, ej. "14/10/26") con
 * `formatHoraAmPm` (hora con am/pm pegado) — mismo resultado visual que antes
 * daba `toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' | 'medium' })`,
 * pero sin el "a. m."/"p. m." con punto y espacio. Usado en los encabezados
 * de los tiquetes de orden/consolidado/cliente (ver `encabezado`,
 * `ticketConsolidadoCarniceria`, `ticketConsolidadoRestaurante`,
 * `encabezadoCliente` abajo) y en el pop-up de verificación de Codisa (ver
 * `WsDfPopup.tsx`).
 */
export function formatFechaHoraAmPm(fecha: Date, incluirSegundos = false): string {
  return `${fecha.toLocaleDateString('es-CR', { dateStyle: 'short' })}, ${formatHoraAmPm(fecha, incluirSegundos)}`
}

/**
 * Línea de una orden del tiquete de cierre de caja: "Orden #<consecutivo>
 * <hora> <monto>", completamente alineada a la izquierda (ver requerimiento:
 * "el listado de órdenes debe quedar alineado totalmente a la izquierda"),
 * sin encabezado de columnas antes del listado (requerimiento previo: "Línea
 * 4 en adelante: listar todas las órdenes del día" directamente, ver
 * `ticketCierreCaja`). Antes el monto se alineaba a la columna derecha (igual
 * criterio que `lineaConMonto`/`lineaItemColumnas`); ese right-align se quitó
 * para este tiquete en particular — la suma total al pie (ver
 * `ticketCierreCaja`) no cambia. Si la línea completa excede el ancho del
 * papel (el consecutivo de 10 dígitos, ver `services/consecutivo.ts`, casi
 * siempre la deja muy cerca o por encima del límite de 32 columnas), la
 * impresora térmica la continúa automáticamente en el siguiente renglón
 * físico, sin perder la alineación izquierda.
 */
function lineaOrdenCierre(numeroOrden: string, hora: string, total: string): string[] {
  return [`Orden #${numeroOrden} ${hora} ${total}`]
}

/**
 * Tiquete de cierre de caja (simulado — no es un documento fiscal, sólo un
 * resumen impreso para el cajero): línea 1 "Cierre de datáfono - Carnes Don
 * Fernando", línea 2 "Kiosko <CAJA_ID>" (identifica el dispositivo físico
 * cuando hay más de un kiosko, ver `CAJA_ID` en `services/consecutivo.ts`),
 * línea 3 fecha/hora del cierre, línea 4 en blanco y desde la línea 5 el
 * listado de órdenes del día ("Orden #<consecutivo> <hora> <monto>",
 * completamente alineado a la izquierda, ver `lineaOrdenCierre`), sin
 * encabezado de columnas — generado
 * bajo demanda desde el panel de administración (botón "Cierre de Caja", ver
 * `AdminScreen.tsx` -> `PanelCierreCaja`). Se dispara junto con (pero sin
 * depender de) el envío de `BATCH_SETTLEMENT` al Transaction Manager del BAC
 * — ver `enviarTransaccionDatafono` en `services/datafono.ts` — el tiquete
 * se imprime igual sin importar el resultado de ese cierre de lote.
 *
 * La fecha/hora del encabezado es la del momento en que se solicita el
 * cierre (`new Date()` al generar el ticket), no la de cada orden
 * individual — es el dato que pide el requerimiento del kiosko para saber
 * cuándo se hizo el corte. La hora de cada línea de orden, en cambio, SÍ es
 * la de esa venta puntual (`venta.fechaHora`, en formato 24 horas, sin
 * am/pm, para que la línea sea lo más corta posible junto al consecutivo de
 * 10 dígitos), para poder ubicarla en el tiempo dentro del listado del día.
 *
 * El "Kiosko <ID>" toma `caja` de la primera orden del día (todas las
 * órdenes de un mismo cierre vienen del mismo dispositivo físico); si por
 * alguna razón no viene seteado (ventas antiguas en la cola offline, ver
 * `Venta.caja` en `types/order.ts`), cae a `CAJA_ID` como respaldo.
 *
 * Los montos (de cada orden y el total del día) usan `formatMontoFactura`
 * (prefijo "c " + dos decimales fijos, ver ese helper) en vez de `formatCRC`
 * — mismo criterio del comprobante del cliente (`ticketCliente`): este
 * tiquete también se imprime en la estación "Cliente", así que usa el mismo
 * formato de monto en texto plano, sin el símbolo ₡ (que en ESC/POS requiere
 * rasterizarse como imagen, ver `services/escpos.ts`).
 */
export function ticketCierreCaja(ordenes: Venta[]): TicketLine[] {
  const ahora = new Date()
  const caja = ordenes[0]?.caja ?? CAJA_ID
  const lineas: TicketLine[] = [
    'Cierre de datáfono - Carnes Don Fernando',
    `Kiosko ${caja}`,
    formatFechaHoraAmPm(ahora, true),
    '',
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
 * Tiquete de cancelación de orden: se imprime en la estación "Cliente"
 * cuando el admin anula una orden ya cobrada (botón "Cancelar" en
 * `AdminScreen.tsx` -> `PanelOrdenesDelDia`), después de que el Transaction
 * Manager del BAC procese el `VOID` correspondiente (ver
 * `enviarTransaccionDatafono` en `services/datafono.ts`).
 *
 * Reutiliza el mismo encabezado (logo/nombre/slogan/dirección/contacto) y el
 * mismo cierre ("Gracias por su compra"/"Los esperamos pronto") que el
 * comprobante del cliente (ver requerimiento: "usar el mismo formato de
 * logo/encabezado que el tiquete cliente"), con el título "Recibo de
 * Cancelación de Orden" en vez del encabezado de factura/columnas de items.
 *
 * El Número de Transacción/Autorización que se imprime es el que devolvió
 * el VOID (`resultadoVoid`, la respuesta más reciente del TM para esta
 * orden); si por alguna razón el VOID no trajo alguno de los dos (ej.
 * rechazado antes de llegar al banco), se cae al de la venta original
 * (`venta.referenciaDatafono`/`venta.autorizacionDatafono`, capturados en el
 * SALE que se está anulando) para no dejar el campo vacío. Mismo criterio de
 * etiquetas que `ticketCliente`: "Número de Transacción" para
 * `referenceNumber`, "Número de Autorización" para `authorizationNumber` —
 * el TM no expone un campo separado de "número de transacción" (ver
 * `RespuestaDatafonoBody` en types/datafono.ts).
 */
export function ticketCancelacionVoucher(venta: Venta, resultadoVoid: ResultadoDatafono): TicketLine[] {
  const numeroTransaccion = resultadoVoid.referenceNumber ?? venta.referenciaDatafono
  const numeroAutorizacion = resultadoVoid.authorizationNumber ?? venta.autorizacionDatafono

  const lineas: TicketLine[] = [
    ...encabezadoCliente(venta),
    { text: 'Recibo de Cancelación de Orden', bold: true },
    '',
  ]

  if (numeroTransaccion) lineas.push(`Número de Transacción: ${numeroTransaccion}`)
  if (numeroAutorizacion) lineas.push(`Número de Autorización: ${numeroAutorizacion}`)

  lineas.push('')
  lineas.push('Gracias por su compra')
  lineas.push('Los esperamos pronto')

  return lineas
}

export function generarTickets(venta: Venta): Record<PrinterId, TicketLine[]> {
  return {
    carniceria: ticketCarniceria(venta),
    restaurante: ticketRestaurante(venta),
    cliente: ticketCliente(venta),
  }
}
