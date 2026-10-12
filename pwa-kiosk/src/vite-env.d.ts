/// <reference types="vite/client" />

/**
 * Variables de entorno operativas del kiosko (ver `.env.example` en la raíz
 * de `pwa-kiosk/`), consumidas en `services/redConfig.ts`,
 * `services/datafono.ts` y `services/wsdf.ts` para permitir reutilizar el
 * mismo build en kioskos con direccionamiento de red/terminal/tienda
 * distinto, sin tocar código ni recompilar con valores distintos
 * hardcodeados por kiosko (ver hallazgo de auditoría). Todas son opcionales:
 * si no están definidas, cada archivo cae a su valor por defecto documentado.
 */
interface ImportMetaEnv {
  readonly VITE_IP_IMPRESORA_CLIENTE?: string
  readonly VITE_IP_IMPRESORA_CARNICERIA?: string
  readonly VITE_IP_IMPRESORA_PARRILLA?: string
  readonly VITE_IP_GATEWAY?: string
  readonly VITE_DATAFONO_TERMINAL_ID?: string
  readonly VITE_CODISA_ID_TIENDA?: string
  /** Token compartido para autenticarse contra print-bridge (ver `services/kioskToken.ts` y `KIOSK_TOKEN` en `print-bridge/.env.example`). */
  readonly VITE_KIOSK_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
