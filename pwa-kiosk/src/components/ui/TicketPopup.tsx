import type { TicketLine } from '../../services/tickets'

export interface TicketPopupSeccion {
  /** Título de la sub-sección (ej. nombre de la impresora destino). */
  titulo: string
  lineas: TicketLine[]
}

interface TicketPopupProps {
  titulo: string
  secciones: TicketPopupSeccion[]
  textoBoton: string
  onCerrar: () => void
}

function claseLinea(linea: TicketLine): string {
  if (typeof linea === 'string') return ''
  const partes: string[] = []
  if (linea.big) partes.push('text-lg')
  else if (linea.medium) partes.push('text-sm')
  if (linea.bold) partes.push('font-extrabold')
  return partes.join(' ')
}

function textoLinea(linea: TicketLine): string {
  return typeof linea === 'string' ? linea : linea.text
}

/**
 * Popup de "prueba de concepto": muestra, con el mismo estilo visual que se
 * enviaría a la impresora térmica (incluyendo líneas resaltadas vía
 * `TicketLine.big`/`bold`), el contenido de uno o más tiquetes. Se usa tanto
 * para el comprobante del comensal como para el tiquete de
 * carnicería/restaurante (por orden individual o consolidado de mesa).
 */
export default function TicketPopup({ titulo, secciones, textoBoton, onCerrar }: TicketPopupProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="shrink-0 bg-wood-950 px-5 py-4">
          <h2 className="text-lg font-bold text-cream-50">{titulo}</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex flex-col gap-4">
            {secciones.map((seccion, i) => (
              <div key={i} className="rounded-xl border-2 border-dashed border-wood-200 p-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-wood-500">
                  {seccion.titulo}
                </p>
                <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-5 text-wood-900">
                  {seccion.lineas.map((linea, j) => (
                    <div key={j} className={claseLinea(linea)}>
                      {textoLinea(linea)}
                    </div>
                  ))}
                </pre>
              </div>
            ))}
          </div>
        </div>
        <div className="shrink-0 border-t border-wood-100 p-5">
          <button
            type="button"
            onClick={onCerrar}
            className="w-full rounded-2xl bg-brand-red py-4 text-lg font-bold text-white transition-transform active:scale-98"
          >
            {textoBoton}
          </button>
        </div>
      </div>
    </div>
  )
}
