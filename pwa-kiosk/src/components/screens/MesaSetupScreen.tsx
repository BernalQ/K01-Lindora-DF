import { useEffect, useState } from 'react'
import logoBlanco from '../../assets/logo/optimized/logo-blanco.png'
import piernaCerdoFlyer from '../../assets/publicidad/pierna-de-cerdo-flyer.jpg'
import { RAZAS_GANADO } from '../../data/razasGanado'
import { mesasBloqueadas } from '../../services/mesaLocks'
import { useLanguage } from '../../context/LanguageContext'

/** Cada cuánto se refresca el listado de identificadores bloqueados mientras
 * esta pantalla permanece abierta, para que un bloqueo que expira (30 min)
 * habilite la opción sin que el usuario tenga que recargar. */
const REFRESCO_BLOQUEOS_MS = 15_000

interface MesaSetupScreenProps {
  /** El nombre de raza elegido, usado siempre como ID de mesa (Sí y No por igual). */
  onContinuar: (mesaId: string, compartida: boolean) => void
  /** Botón "Cancelar": regresa de inmediato a la página de inicio (`WelcomeScreen`). */
  onCancelar: () => void
}

/**
 * Pantalla que sigue a la bienvenida: pregunta si la mesa tendrá más de una
 * orden pagada por separado (mesa compartida entre varios comensales).
 *
 * Tanto si la respuesta es "Sí" como "No", el cliente debe elegir un
 * identificador de mesa de un listado fijo de razas de ganado disponibles en
 * el kiosko; ese nombre se guarda como ID de mesa y se reutiliza en todas
 * las órdenes registradas bajo esa mesa hasta que se cierre. La única
 * diferencia entre "Sí" y "No" es si se activa el flujo de mesa compartida
 * (múltiples órdenes pagadas por separado bajo el mismo ID).
 */
export default function MesaSetupScreen({ onContinuar, onCancelar }: MesaSetupScreenProps) {
  const { t } = useLanguage()
  const [compartida, setCompartida] = useState<boolean | null>(null)
  const [raza, setRaza] = useState('')
  const [bloqueadas, setBloqueadas] = useState<Set<string>>(() => mesasBloqueadas())

  // Refresca periódicamente cuáles identificadores siguen bloqueados, para
  // que uno que cumple sus 30 minutos vuelva a habilitarse sin recargar.
  useEffect(() => {
    const id = setInterval(() => setBloqueadas(mesasBloqueadas()), REFRESCO_BLOQUEOS_MS)
    return () => clearInterval(id)
  }, [])

  const puedeContinuar = compartida !== null && raza !== '' && !bloqueadas.has(raza)

  const handleContinuar = () => {
    if (!puedeContinuar) return
    onContinuar(raza, Boolean(compartida))
  }

  return (
    <div className="flex h-full min-h-screen w-full flex-col items-center bg-gradient-to-b from-wood-950 via-wood-900 to-wood-950 text-cream-50">
      {/* Logo: ocupa todo el ancho disponible de la parte superior. */}
      <div className="flex w-full justify-center px-6 pt-8 pb-2">
        <img src={logoBlanco} alt="Carnes Don Fernando" className="w-full max-w-2xl" />
      </div>

      {/*
        `flex-1` va en este envoltorio (no en el `grid` de abajo): así el
        grid sólo mide lo que su contenido real necesita (alto natural de la
        columna derecha, que es lo que dicta `items-stretch`), y es este
        `justify-between` el que empuja el botón "Continuar" hasta el fondo
        cuando sobra espacio. Antes el `flex-1` estaba en el `grid` mismo, lo
        que lo estiraba a TODO el alto restante de la pantalla (mucho más
        alto que el contenido real de la derecha) y, por `items-stretch`,
        la columna izquierda —y con ella la imagen— se estiraba igual de
        gigante para acompañarla.
      */}
      <div className="mt-6 flex w-full max-w-5xl flex-1 flex-col items-center justify-between gap-8 px-6 pb-10">
        {/* Debajo del logo: dos columnas. La derecha conserva la pregunta de
            flujo (mesa compartida sí/no) y, debajo, el selector de
            identificador de mesa. La izquierda es el espacio publicitario:
            al ser ambas columnas hijas del mismo `grid` (que por defecto
            estira los hijos de una fila al mismo alto), su alto queda
            proporcional al alto real del contenido de la derecha, ahora sin
            que ese "real" termine siendo el alto entero de la pantalla. */}
        <div className="grid w-full grid-cols-1 items-stretch gap-8 md:grid-cols-2">
          {/* Lado izquierdo: NO es una columna con layout/tarjeta propia,
              es simplemente espacio vacío de la página (mismo fondo, sin
              borde/tarjeta) donde se inserta la imagen publicitaria.
              - `md:grid-cols-2` (50/50): se probó ensanchar esta columna a
                `[1.3fr_1fr]` para hacer la imagen "más ancha", pero la foto
                es más alta que ancha (466x700px, relación ancho/alto ≈
                0.666) y con `object-contain` el alto (`max-h-[500px]` más
                abajo) es SIEMPRE la dimensión que primero topa contra el
                límite del bloque — la imagen ya usaba mucho menos ancho del
                disponible incluso en la columna angosta original, así que
                ensanchar sólo la columna no la hacía ver más ancha, sólo
                dejaba más espacio vacío a los lados. Ensancharla de verdad
                sin recortarla ni distorsionarla (`object-contain` conserva
                siempre la proporción real) exige subir también el alto, lo
                que sí se probó pero achicó demasiado el espacio hacia el
                botón "Continuar"/"Cancelar" de abajo; por eso se revirtió a
                50/50 y al alto original: no hay forma de ensancharla sin
                ese efecto secundario, así que se deja sin cambio.
              - `h-full` en vez de un alto fijo (antes `aspect-2/3` +
                `max-h-80`): en CSS Grid, cuando un ítem con alto porcentual
                no puede resolverlo en la pasada de medición intrínseca, el
                motor lo trata como "auto" para calcular el alto de la fila
                (que así queda dictado por el contenido real de la columna
                derecha gracias a `items-stretch` en el `grid` padre) y
                recién en la pasada final lo estira (`stretch`) a ese alto
                ya resuelto. Resultado: el bloque izquierdo SIEMPRE iguala
                el alto real de la columna derecha, incluso cuando ésta
                crece al aparecer el selector de identificador tras elegir
                Sí/No — sin depender de un `aspect-ratio` fijo que antes
                topaba la imagen a una proporción propia en vez de "ocupar
                la altura disponible".
              - `items-center justify-center` en este `<div>` centra la
                imagen vertical y horizontalmente dentro de ese alto ya
                igualado al de la columna derecha.
              - `max-h-[500px]`: se probó subir este tope a 650px (1.3x) para
                agrandar la imagen (ver comentario de la columna arriba, que
                explica por qué sólo cambiar el alto mueve la aguja y no el
                ancho de la columna), pero esa altura mayor achicaba
                demasiado el espacio hacia el botón "Continuar"/"Cancelar"
                de abajo, así que se revirtió a este valor original. El
                espacio restante dentro del bloque queda vacío y la imagen
                se mantiene centrada (vertical y horizontalmente)
                por `items-center justify-center` (no afecta la posición
                real de los botones, que sigue fija por el `justify-between`
                del envoltorio, es sólo un ajuste visual de proporción).
              - `object-contain` en el `<img>` (con `h-full w-full`) escala
                la imagen para ocupar el alto disponible sin distorsión:
                conserva su proporción real y dentro del propio elemento
                queda centrada.
              - `p-5` deja un margen alrededor de la imagen para que no
                quede pegada a los límites del bloque, sin necesidad de
                fondo ni borde propios: el fondo detrás de la imagen es el
                mismo degradado de la página. */}
          <div className="flex h-full max-h-[500px] w-full items-center justify-center p-5">
            <img
              src={piernaCerdoFlyer}
              alt={t('mesaSetup.espacioPublicidad')}
              className="h-full w-full rounded-xl object-contain"
            />
          </div>

          {/* Columna derecha: pregunta de flujo + botones + selector de identificador */}
          <div className="flex flex-col items-center gap-8">
            <h1 className="text-center text-xl font-bold text-cream-50 sm:text-2xl md:text-3xl">
              {t('mesaSetup.pregunta')}
            </h1>

            <div className="flex w-full gap-4">
              <button
                type="button"
                onClick={() => setCompartida(false)}
                className={`flex-1 rounded-2xl py-6 text-xl font-bold transition-transform active:scale-95 ${
                  compartida === false
                    ? 'bg-cream-50 text-wood-900'
                    : 'border-2 border-cream-50/30 bg-white/5 text-cream-50'
                }`}
              >
                {t('mesaSetup.no')}
              </button>
              <button
                type="button"
                onClick={() => setCompartida(true)}
                className={`flex-1 rounded-2xl py-6 text-xl font-bold transition-transform active:scale-95 ${
                  compartida === true
                    ? 'bg-brand-red text-white'
                    : 'border-2 border-cream-50/30 bg-white/5 text-cream-50'
                }`}
              >
                {t('mesaSetup.si')}
              </button>
            </div>

            {compartida !== null && (
              <div className="flex w-full flex-col gap-3 rounded-2xl bg-white/10 p-5 shadow-sm shadow-black/10">
                <label htmlFor="raza" className="block text-center text-xl font-bold text-cream-50 sm:text-2xl">
                  {t('mesaSetup.identificadorExplicacion')}
                </label>
                <select
                  id="raza"
                  value={raza}
                  onChange={(e) => setRaza(e.target.value)}
                  className="w-full rounded-xl border-2 border-cream-50/30 bg-wood-950 px-4 py-4 text-lg font-semibold text-cream-50 outline-none focus:border-brand-red"
                >
                  <option value="" disabled>
                    {t('mesaSetup.seleccionarPlaceholder')}
                  </option>
                  {RAZAS_GANADO.map((r) => (
                    <option key={r} value={r} disabled={bloqueadas.has(r)}>
                      {bloqueadas.has(r) ? t('mesaSetup.enUso', { r }) : r}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Botones "Cancelar" (izquierda) y "Continuar" (derecha): juntos
            ocupan un ancho más angosto que las dos columnas de arriba
            (max-w-xl en vez de todo el ancho), siempre centrados gracias a
            `justify-center`. "Cancelar" regresa de inmediato a la página de
            inicio (`onCancelar`), sin importar en qué paso de esta pantalla
            esté el cliente. "Continuar" conserva su mismo comportamiento de
            siempre (rojo/habilitado sólo cuando `puedeContinuar`). */}
        <div className="flex w-full max-w-xl justify-center gap-4">
          <button
            type="button"
            onClick={onCancelar}
            className="flex-1 rounded-2xl border-2 border-cream-50/30 bg-white/5 py-5 text-xl font-bold text-cream-50 transition-transform active:scale-95"
          >
            {t('mesaSetup.cancelar')}
          </button>
          <button
            type="button"
            onClick={handleContinuar}
            disabled={!puedeContinuar}
            className={`flex-1 rounded-2xl py-5 text-xl font-bold shadow-2xl shadow-black/20 transition-transform ${
              puedeContinuar ? 'bg-brand-red text-white active:scale-95' : 'bg-wood-800 text-wood-500'
            }`}
          >
            {t('mesaSetup.continuar')}
          </button>
        </div>
      </div>
    </div>
  )
}
