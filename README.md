# Kiosko Carnes Don Fernando

Piloto de kiosko táctil de autoservicio para Parrillada Orígenes (Carnes Don Fernando), 1 terminal M8W con Windows 11.

## Estructura

- `pwa-kiosk/` — PWA (React + Vite + Tailwind). Interfaz táctil del kiosko.
- `print-bridge/` — Servicio Node.js/Express que corre en el mismo M8W y traduce pedidos a ESC/POS para las 3 impresoras Vretti 80mm en red (carnicería, restaurante, cliente).

## Desarrollo local

```bash
# Frontend
cd pwa-kiosk
npm install
npm run dev        # http://localhost:5173

# Print bridge
cd print-bridge
npm install
cp .env.example .env   # editar con las IPs reales de las 3 impresoras
npm run dev             # http://localhost:4000
```

## Estado actual

- [x] Scaffolding PWA (Vite + Tailwind v4 + vite-plugin-pwa)
- [x] Pantalla de bienvenida (idle)
- [x] Catálogo de productos cargado (`pwa-kiosk/src/data/catalog.ts`)
- [x] Cola offline en IndexedDB (`pwa-kiosk/src/services/offlineQueue.ts`)
- [x] Stub `enviarVentaACodisa()` (`pwa-kiosk/src/services/codisa.ts`) — sin conectar, ver "Fuera de alcance"
- [x] Print bridge: servidor Express + `POST /print` + conexión ESC/POS por IP (`print-bridge/`)
- [x] "Salir de kiosko" con PIN: `POST /system/exit-kiosk` en `print-bridge/` cierra el navegador (`taskkill`) y revela el escritorio de Windows
- [ ] Catálogo por categoría (pantalla)
- [ ] Personalización de pedido (corte, término, acompañamientos)
- [ ] Carrito / resumen
- [ ] Cobro (mock del datáfono)
- [ ] Confirmación + generación e impresión de los 3 tickets
- [ ] Plantillas de ticket por impresora (carnicería / restaurante / cliente)

## Fuera de alcance (piloto)

- Dashboard Power BI
- Despliegue multi-tienda
- Integración certificada de pagos (se simula la respuesta del datáfono)
- Envío real a Codisa POS (queda el stub `enviarVentaACodisa()` preparado)
