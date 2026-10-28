import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Ver comentario junto a `manifest: manifestKiosko` más abajo: se declara
// aparte, sin anotación de tipo explícita, a propósito.
const manifestKiosko = {
  name: 'Carnes Don Fernando - Kiosko',
  short_name: 'Don Fernando',
  description: 'Kiosko de autoservicio - Parrillada Orígenes',
  theme_color: '#2b1c10',
  background_color: '#faf4e7',
  display: 'fullscreen' as const,
  orientation: 'landscape' as const,
  start_url: '/',
  icons: [
    {
      src: '/icons/icon.svg',
      sizes: 'any',
      type: 'image/svg+xml',
      purpose: 'any' as const,
    },
    {
      src: '/icons/icon.svg',
      sizes: 'any',
      type: 'image/svg+xml',
      purpose: 'maskable' as const,
    },
  ],
}

// Mismo motivo que `manifestKiosko` arriba, pero ahora sobre el objeto
// COMPLETO que recibe `VitePWA(...)`: en la PC del kiosko, con la misma
// versión de `vite-plugin-pwa` fijada en `package-lock.json`, `tsc -b`
// rechazó primero `orientation` (dentro de `manifest`) y, tras resolver eso
// moviendo sólo `manifest` a `manifestKiosko`, rechazó también `registerType`
// — un campo básico/estándar del plugin — en el objeto exterior. Esto indica
// que el tipo `VitePWAOptions` resuelto en esa máquina está roto o
// desincronizado de alguna forma que no se reprodujo en esta Mac. En vez de
// seguir parchando campo por campo, se extrae TODO el argumento de
// `VitePWA(...)` a esta constante sin anotación de tipo explícita, para que
// TypeScript no aplique su chequeo de "propiedades excedentes" sobre
// ninguno de sus campos.
const pwaOptions = {
  registerType: 'autoUpdate' as const,
  includeAssets: ['icons/icon.svg'],
  manifest: manifestKiosko,
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA(pwaOptions)],
})
