import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Debe importarse ANTES que cualquier otro código que dependa de `CAJA_ID`
// (ver `services/consecutivo.ts`): dispara la detección automática de
// CAJA_ID por IP (ver `services/cajaIdDetect.ts`) lo más temprano posible en
// el arranque de la pestaña.
import './services/cajaIdDetect'
import '@fontsource/playfair-display/latin-600.css'
import '@fontsource/playfair-display/latin-700.css'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import '@fontsource/inter/latin-800.css'
import './index.css'
import App from './App.tsx'
import { LanguageProvider } from './context/LanguageContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </StrictMode>,
)
