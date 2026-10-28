import { useState } from 'react'
import { useLanguage } from '../../context/useLanguage'

export type VirtualKeyboardLayout = 'numeric' | 'phone' | 'text' | 'email'

interface VirtualKeyboardProps {
  /** Tipo de teclado: dígitos solos (cédula), teléfono (dígitos + "+"), texto libre (QWERTY) o texto con atajos de correo ("@"/"."). */
  layout: VirtualKeyboardLayout
  /** Valor actual del campo que este teclado está editando — componente controlado puro, igual que un `<input>`. */
  value: string
  onChange: (value: string) => void
  /** Se llama al presionar "Listo", después de cerrar el teclado (ej. dispara la búsqueda de cédula). Si no se pasa, "Listo" sólo cierra el teclado. */
  onEnter?: () => void
  /** Cierra/oculta el teclado — el padre vuelve a mostrar lo que haya tapado (ej. el botón de acción de la pantalla). En modo `panel` (ver `variante`) no hay nada que tapar, así que el padre puede reutilizar este callback para otra cosa (ej. avanzar al siguiente campo). */
  onClose: () => void
  maxLength?: number
  /**
   * 'flotante' (por defecto, comportamiento histórico): overlay `fixed`
   * pegado a la parte baja de TODA la pantalla, pensado para formularios de
   * un solo campo a la vez donde tapar el resto de la pantalla no estorba
   * (ej. `CedulaScreen`).
   *
   * 'panel': bloque estático (sin `fixed`/`inset-x-0`/`bottom-0`), pensado
   * para layouts de dos columnas donde el teclado queda siempre visible al
   * lado de los campos en vez de tapar la parte baja de la pantalla (ej.
   * `RegistroClienteScreen`, para que el operador vea los campos a la
   * izquierda actualizarse mientras escribe, sin que el teclado los oculte).
   */
  variante?: 'flotante' | 'panel'
}

/** Letras QWERTY en español (con Ñ) para los layouts `text`/`email`. */
const FILA_1 = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p']
const FILA_2 = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ñ']
const FILA_3 = ['z', 'x', 'c', 'v', 'b', 'n', 'm']

/**
 * Segunda "página" de los layouts `text`/`email`: dígitos, vocales
 * acentuadas y puntuación básica. Necesaria porque los nombres en español
 * suelen llevar tilde (ej. "José", "Andrés") y las direcciones suelen
 * llevar números (ej. "100m norte del Banco") — sin esto, el teclado
 * propio sería más limitado que el del sistema operativo que reemplaza.
 */
const FILA_SIMBOLOS_1 = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
const FILA_SIMBOLOS_2 = ['á', 'é', 'í', 'ó', 'ú', 'ü', '¿', '¡']
const FILA_SIMBOLOS_3 = ['.', ',', '-', "'", '#']

/**
 * Estilo "self-order kiosk" moderno (McDonald's/Starbucks/Apple-ish):
 * botones grandes, esquinas muy redondeadas, sombra suave en vez de borde
 * grueso, bastante espacio entre teclas y una animación breve al presionar
 * (`active:scale-*` + `duration-100`) — reemplaza el estilo anterior, más
 * plano/"Windows clásico" (bordes finos, radios pequeños, sin sombra). Es
 * un único componente para los 4 layouts, así que el cambio se refleja en
 * todos a la vez (cédula, registro de cliente, etc.).
 */
const TECLA =
  'flex h-16 min-w-[2.5rem] flex-1 items-center justify-center rounded-2xl bg-white text-xl font-semibold text-wood-900 shadow-md shadow-wood-900/10 transition-all duration-100 active:scale-90 active:shadow-sm active:bg-wood-50'
const TECLA_ESPECIAL =
  'flex h-16 min-w-[3.75rem] items-center justify-center rounded-2xl bg-wood-100 px-3 text-base font-semibold text-wood-900 shadow-md shadow-wood-900/10 transition-all duration-100 active:scale-90 active:bg-wood-200'
const TECLA_ESPACIO =
  'flex h-16 flex-1 items-center justify-center rounded-2xl bg-white text-base font-semibold text-wood-500 shadow-md shadow-wood-900/10 transition-all duration-100 active:scale-95 active:bg-wood-50'
/** Celda invisible, mismas dimensiones que `TECLA` — mantiene alineada la cuadrícula de 3 columnas cuando una posición no tiene tecla (ver `renderGridNumerico`, layout `numeric` ya no tiene guion). */
const TECLA_VACIA = 'h-16 min-w-[2.5rem] flex-1'

/**
 * Mismas 4 clases de arriba, pero más grandes — usadas sólo en `variante="panel"`
 * (ver prop): como ahí el teclado ya no comparte el ancho de toda la
 * pantalla con nada (vive solo en su columna, siempre visible, ver
 * `RegistroClienteScreen`), tiene espacio de sobra para teclas más altas y
 * con texto más grande, mejorando la puntería táctil sin tener que tocar el
 * resto de los layouts/pantallas que siguen usando el teclado flotante.
 */
const TECLA_GRANDE =
  'flex h-20 min-w-[3rem] flex-1 items-center justify-center rounded-2xl bg-white text-2xl font-semibold text-wood-900 shadow-md shadow-wood-900/10 transition-all duration-100 active:scale-90 active:shadow-sm active:bg-wood-50'
const TECLA_ESPECIAL_GRANDE =
  'flex h-20 min-w-[4.5rem] items-center justify-center rounded-2xl bg-wood-100 px-4 text-lg font-semibold text-wood-900 shadow-md shadow-wood-900/10 transition-all duration-100 active:scale-90 active:bg-wood-200'
const TECLA_ESPACIO_GRANDE =
  'flex h-20 flex-1 items-center justify-center rounded-2xl bg-white text-lg font-semibold text-wood-500 shadow-md shadow-wood-900/10 transition-all duration-100 active:scale-95 active:bg-wood-50'
const TECLA_VACIA_GRANDE = 'h-20 min-w-[3rem] flex-1'

/**
 * Teclado táctil propio de la PWA — no depende de que el teclado en
 * pantalla del sistema operativo del kiosko se despliegue solo al enfocar
 * un `<input>` (ver hallazgo de auditoría: antes `CedulaScreen` y
 * `RegistroClienteScreen` dependían 100% de eso, sin forma de confirmar
 * que el OS/navegador del kiosko realmente lo hace).
 *
 * Los `<input>` que lo usan deben marcarse `readOnly` (ver esas dos
 * pantallas): un campo `readOnly` sigue recibiendo foco y mostrando el
 * cursor con `onFocus`/`onClick`, pero no dispara el teclado táctil nativo
 * del sistema — así este componente queda como la única fuente de
 * escritura, sin competir ni depender de la configuración de cada kiosko.
 */
export default function VirtualKeyboard({
  layout,
  value,
  onChange,
  onEnter,
  onClose,
  maxLength,
  variante = 'flotante',
}: VirtualKeyboardProps) {
  const { t } = useLanguage()
  const [mayusculas, setMayusculas] = useState(false)
  const [pagina, setPagina] = useState<'letras' | 'simbolos'>('letras')

  // En modo `panel` se usan las variantes "grande" de las 4 clases de tecla
  // (ver su doc arriba) — el modo flotante conserva el tamaño histórico.
  const grande = variante === 'panel'
  const claseTecla = grande ? TECLA_GRANDE : TECLA
  const claseTeclaEspecial = grande ? TECLA_ESPECIAL_GRANDE : TECLA_ESPECIAL
  const claseTeclaEspacio = grande ? TECLA_ESPACIO_GRANDE : TECLA_ESPACIO
  const claseTeclaVacia = grande ? TECLA_VACIA_GRANDE : TECLA_VACIA

  const agregar = (caracter: string) => {
    if (maxLength && value.length >= maxLength) return
    onChange(value + caracter)
  }

  const borrar = () => onChange(value.slice(0, -1))

  const confirmar = () => {
    onClose()
    onEnter?.()
  }

  // Única función de render de tecla para todos los layouts: aplica
  // mayúsculas si corresponde (no-op en dígitos/puntuación, así que es
  // seguro usarla también en la cuadrícula numérica y en la página de
  // símbolos, sin tener que distinguir "letra" de "símbolo").
  const renderTecla = (caracter: string, className = claseTecla) => {
    const mostrado = mayusculas ? caracter.toUpperCase() : caracter
    return (
      <button key={caracter} type="button" onClick={() => agregar(mostrado)} className={className}>
        {mostrado}
      </button>
    )
  }

  const renderGridNumerico = (teclaExtra: string | null) => (
    <div className={`mx-auto grid w-full ${grande ? 'max-w-md' : 'max-w-sm'} grid-cols-3 gap-3`}>
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((c) => renderTecla(c))}
      {teclaExtra ? renderTecla(teclaExtra) : <div className={claseTeclaVacia} />}
      {renderTecla('0')}
      <button type="button" onClick={borrar} className={claseTecla} aria-label={t('teclado.borrar')}>
        ⌫
      </button>
    </div>
  )

  const claseContenedor = grande
    ? 'w-full max-w-2xl rounded-3xl bg-cream-100 p-5 shadow-md shadow-wood-900/10'
    : 'fixed inset-x-0 bottom-0 z-40 rounded-t-3xl bg-cream-100 p-4 shadow-[0_-8px_24px_rgba(0,0,0,0.12)]'

  return (
    <div className={claseContenedor}>
      <div className={`mx-auto flex ${grande ? 'max-w-2xl gap-4' : 'max-w-xl gap-3'} flex-col`}>
        {layout === 'numeric' && renderGridNumerico(null)}
        {layout === 'phone' && renderGridNumerico('+')}

        {(layout === 'text' || layout === 'email') && (
          <>
            {pagina === 'letras' ? (
              <>
                <div className="flex justify-center gap-2">{FILA_1.map((c) => renderTecla(c))}</div>
                <div className="flex justify-center gap-2">{FILA_2.map((c) => renderTecla(c))}</div>
                <div className="flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMayusculas((m) => !m)}
                    className={`${claseTeclaEspecial} ${mayusculas ? 'bg-brand-red text-white' : ''}`}
                    aria-label={t('teclado.mayusculas')}
                  >
                    ⇧
                  </button>
                  {FILA_3.map((c) => renderTecla(c))}
                  <button type="button" onClick={borrar} className={claseTeclaEspecial} aria-label={t('teclado.borrar')}>
                    ⌫
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-center gap-2">{FILA_SIMBOLOS_1.map((c) => renderTecla(c))}</div>
                <div className="flex justify-center gap-2">{FILA_SIMBOLOS_2.map((c) => renderTecla(c))}</div>
                <div className="flex justify-center gap-2">
                  {FILA_SIMBOLOS_3.map((c) => renderTecla(c))}
                  <button type="button" onClick={borrar} className={claseTeclaEspecial} aria-label={t('teclado.borrar')}>
                    ⌫
                  </button>
                </div>
              </>
            )}

            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={() => setPagina((p) => (p === 'letras' ? 'simbolos' : 'letras'))}
                className={claseTeclaEspecial}
              >
                {pagina === 'letras' ? '123' : 'ABC'}
              </button>
              {layout === 'email' && renderTecla('@', claseTeclaEspecial)}
              <button type="button" onClick={() => agregar(' ')} className={claseTeclaEspacio}>
                {t('teclado.espacio')}
              </button>
              {layout === 'email' && renderTecla('.', claseTeclaEspecial)}
            </div>
          </>
        )}

        {layout === 'phone' && (
          <div className="flex justify-center gap-2">
            <button type="button" onClick={() => agregar(' ')} className={claseTeclaEspacio}>
              {t('teclado.espacio')}
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={confirmar}
          className={`mt-1 w-full rounded-2xl bg-brand-red font-bold text-white shadow-md shadow-brand-red/30 transition-all duration-100 active:scale-98 active:shadow-sm ${
            grande ? 'py-5 text-xl' : 'py-4 text-lg'
          }`}
        >
          {t('teclado.listo')}
        </button>
      </div>
    </div>
  )
}
