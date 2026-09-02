import { useState } from 'react'
import logoBlanco from '../../assets/logo/optimized/logo-blanco.png'
import { useLanguage } from '../../context/LanguageContext'
import SalirKioskoModal from '../ui/SalirKioskoModal'

interface WelcomeScreenProps {
  onStart: () => void
  /** Abre el flujo de acceso al panel de administración (ver `AdminScreen`), gatillado por el botón "ADMIN" de la esquina superior izquierda. */
  onOpenAdmin: () => void
}

export default function WelcomeScreen({ onStart, onOpenAdmin }: WelcomeScreenProps) {
  const { language, setLanguage, t } = useLanguage()
  const [mostrarSalirKiosko, setMostrarSalirKiosko] = useState(false)

  return (
    <div className="relative flex h-full min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-wood-950 via-wood-900 to-wood-950 text-cream-50">
      {/* Resplandor decorativo detrás del logo */}
      <div className="pointer-events-none absolute top-1/3 h-[36rem] w-[36rem] -translate-y-1/2 rounded-full bg-brand-red/20 blur-[120px]" />

      {/* Botón ADMIN: esquina superior izquierda (la derecha ya la ocupa el
          selector de idioma), pequeño para no competir visualmente con el
          CTA principal "Toca para comenzar". Sólo abre el flujo de PIN de
          `AdminScreen`; el acceso real queda protegido dentro de ese
          componente. */}
      <div className="absolute top-5 left-5 z-20 flex flex-col items-start gap-2 sm:top-7 sm:left-7">
        <button
          type="button"
          onClick={onOpenAdmin}
          className="rounded-full border-2 border-cream-50/20 bg-transparent px-4 py-2 text-xs font-semibold tracking-wide text-cream-50/50 uppercase transition-colors active:bg-white/10 sm:px-5 sm:py-2.5 sm:text-sm"
        >
          {t('welcome.admin')}
        </button>
      </div>

      {/* Botón "Salir de kiosko": esquina inferior derecha, lejos del CTA
          principal y de los demás controles (ADMIN arriba-izquierda,
          idioma arriba-derecha) para evitar toques accidentales. Sólo abre
          el pop-up de PIN (`SalirKioskoModal`); el acceso real queda
          protegido dentro de ese componente. */}
      <button
        type="button"
        onClick={() => setMostrarSalirKiosko(true)}
        className="absolute right-5 bottom-5 z-20 rounded-full border-2 border-cream-50/20 bg-transparent px-4 py-2 text-xs font-semibold tracking-wide text-cream-50/50 uppercase transition-colors active:bg-white/10 sm:right-7 sm:bottom-7 sm:px-5 sm:py-2.5 sm:text-sm"
      >
        {t('welcome.salirKiosko')}
      </button>

      {mostrarSalirKiosko && <SalirKioskoModal onClose={() => setMostrarSalirKiosko(false)} />}

      {/* Selector de idioma: esquina superior derecha */}
      <div className="absolute top-5 right-5 z-20 flex items-center gap-3 sm:top-7 sm:right-7 sm:gap-4">
        <button
          type="button"
          onClick={() => setLanguage('en')}
          aria-pressed={language === 'en'}
          className={`rounded-full border-2 px-6 py-3 text-base font-semibold transition-colors sm:px-7 sm:py-3.5 sm:text-lg lg:px-8 lg:py-4 lg:text-xl ${
            language === 'en'
              ? 'border-brand-red bg-brand-red text-cream-50'
              : 'border-cream-50/40 bg-transparent text-cream-50/80'
          }`}
        >
          {t('welcome.english')}
        </button>
        <button
          type="button"
          onClick={() => setLanguage('es')}
          aria-pressed={language === 'es'}
          className={`rounded-full border-2 px-6 py-3 text-base font-semibold transition-colors sm:px-7 sm:py-3.5 sm:text-lg lg:px-8 lg:py-4 lg:text-xl ${
            language === 'es'
              ? 'border-brand-red bg-brand-red text-cream-50'
              : 'border-cream-50/40 bg-transparent text-cream-50/80'
          }`}
        >
          {t('welcome.spanish')}
        </button>
      </div>

      {/* Grupo centrado verticalmente: logo y CTA */}
      <div className="relative z-10 flex w-full flex-col items-center gap-14 px-6 text-center sm:gap-16">
        {/* Logo: lo más grande posible sin distorsión */}
        <img
          src={logoBlanco}
          alt="Carnes Don Fernando - Los especialistas en carnes"
          className="h-auto w-[90vw] max-w-[28rem] object-contain sm:max-w-[36rem] md:max-w-[44rem] lg:max-w-[50rem]"
        />

        {/* Llamado a la acción */}
        <button
          type="button"
          onClick={onStart}
          className="group relative flex items-center justify-center rounded-full bg-brand-red px-20 py-9 text-3xl font-bold text-cream-50 shadow-2xl shadow-black/50 transition-transform duration-150 ease-out active:scale-95 active:bg-brand-red-dark sm:text-4xl"
        >
          <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-brand-red/40" />
          {t('welcome.tapToStart')}
        </button>
      </div>

      {/* Slogan */}
      <p className="absolute bottom-8 z-10 text-sm tracking-[0.3em] text-cream-200/50 uppercase sm:text-base">
        {t('welcome.slogan')}
      </p>
    </div>
  )
}
