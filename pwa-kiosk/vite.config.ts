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

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      // `manifest` se arma en una constante separada (sin anotar su tipo
      // explícitamente) en vez de pasar el objeto literal directo a
      // `VitePWA({ manifest: {...} })` — así TypeScript NO aplica su chequeo
      // de "propiedades excedentes" sobre este literal. Se necesitó porque
      // en una PC del kiosko, con exactamente la misma versión de
      // `vite-plugin-pwa` fijada en `package-lock.json`, `tsc -b` rechazaba
      // `orientation` como "no existe en `Partial<ManifestOptions>`" (nunca
      // reproducido en esta máquina) — bloqueaba `npm run build` por
      // completo ahí (sin generar `dist/` nuevo) sin que el `.bat` de inicio
      // lo notara, dejando siempre servido el build viejo. Este patrón evita
      // quedar rehén de esa discrepancia de entorno sin perder el campo.
      manifest: manifestKiosko,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
      },
    }),
  ],
})
