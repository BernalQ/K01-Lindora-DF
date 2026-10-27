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
  /** Cierra/oculta el teclado — el padre vuelve a mostrar lo que haya tapado (ej. el botón de acción de la pantalla). */
  onClose: () => void
  maxLength?: number
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

const TECLA =
  'flex h-14 min-w-[2.25rem] flex-1 items-center justify-center rounded-xl bg-white text-xl font-semibold text-wood-900 shadow-sm transition-transform active:scale-90 active:bg-wood-100'
const TECLA_ESPECIAL =
  'flex h-14 min-w-[3.5rem] items-center justify-center rounded-xl bg-wood-200 px-3 text-base font-semibold text-wood-900 shadow-sm transition-transform active:scale-90 active:bg-wood-300'
const TECLA_ESPACIO =
  'flex h-14 flex-1 items-center justify-center rounded-xl bg-white text-base font-semibold text-wood-500 shadow-sm transition-transform active:scale-95 active:bg-wood-100'

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
export default function VirtualKeyboard({ layout, value, onChange, onEnter, onClose, maxLength }: VirtualKeyboardProps) {
  const { t } = useLanguage()
  const [mayusculas, setMayusculas] = useState(false)
  const [pagina, setPagina] = useState<'letras' | 'simbolos'>('letras')

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
  const renderTecla = (caracter: string, className = TECLA) => {
    const mostrado = mayusculas ? caracter.toUpperCase() : caracter
    return (
      <button key={caracter} type="button" onClick={() => agregar(mostrado)} className={className}>
        {mostrado}
      </button>
    )
  }

  const renderGridNumerico = (teclaExtra: string) => (
    <div className="mx-auto grid w-full max-w-sm grid-cols-3 gap-2">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((c) => renderTecla(c))}
      {renderTecla(teclaExtra)}
      {renderTecla('0')}
      <button type="button" onClick={borrar} className={TECLA} aria-label={t('teclado.borrar')}>
        ⌫
      </button>
    </div>
  )

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-wood-200 bg-cream-100 p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.1)]">
      <div className="mx-auto flex max-w-xl flex-col gap-2">
        {layout === 'numeric' && renderGridNumerico('-')}
        {layout === 'phone' && renderGridNumerico('+')}

        {(layout === 'text' || layout === 'email') && (
          <>
            {pagina === 'letras' ? (
              <>
                <div className="flex justify-center gap-1.5">{FILA_1.map((c) => renderTecla(c))}</div>
                <div className="flex justify-center gap-1.5">{FILA_2.map((c) => renderTecla(c))}</div>
                <div className="flex justify-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setMayusculas((m) => !m)}
                    className={`${TECLA_ESPECIAL} ${mayusculas ? 'bg-brand-red text-white' : ''}`}
                    aria-label={t('teclado.mayusculas')}
                  >
                    ⇧
                  </button>
                  {FILA_3.map((c) => renderTecla(c))}
                  <button type="button" onClick={borrar} className={TECLA_ESPECIAL} aria-label={t('teclado.borrar')}>
                    ⌫
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-center gap-1.5">{FILA_SIMBOLOS_1.map((c) => renderTecla(c))}</div>
                <div className="flex justify-center gap-1.5">{FILA_SIMBOLOS_2.map((c) => renderTecla(c))}</div>
                <div className="flex justify-center gap-1.5">
                  {FILA_SIMBOLOS_3.map((c) => renderTecla(c))}
                  <button type="button" onClick={borrar} className={TECLA_ESPECIAL} aria-label={t('teclado.borrar')}>
                    ⌫
                  </button>
                </div>
              </>
            )}

            <div className="flex justify-center gap-1.5">
              <button
                type="button"
                onClick={() => setPagina((p) => (p === 'letras' ? 'simbolos' : 'letras'))}
                className={TECLA_ESPECIAL}
              >
                {pagina === 'letras' ? '123' : 'ABC'}
              </button>
              {layout === 'email' && renderTecla('@', TECLA_ESPECIAL)}
              <button type="button" onClick={() => agregar(' ')} className={TECLA_ESPACIO}>
                {t('teclado.espacio')}
              </button>
              {layout === 'email' && renderTecla('.', TECLA_ESPECIAL)}
            </div>
          </>
        )}

        {layout === 'phone' && (
          <div className="flex justify-center gap-1.5">
            <button type="button" onClick={() => agregar(' ')} className={TECLA_ESPACIO}>
              {t('teclado.espacio')}
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={confirmar}
          className="mt-1 w-full rounded-xl bg-brand-red py-3 text-lg font-bold text-white transition-transform active:scale-98"
        >
          {t('teclado.listo')}
        </button>
      </div>
    </div>
  )
}
