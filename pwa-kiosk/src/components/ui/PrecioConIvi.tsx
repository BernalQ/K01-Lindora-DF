import { formatCRC } from '../../data/catalog'
import { useLanguage } from '../../context/useLanguage'

interface PrecioConIviProps {
  /** Monto en colones (ya incluye impuesto de venta, ver `formatCRC`). */
  monto: number
  /** Clases del contenedor completo (monto + leyenda), como se aplicarían directamente sobre `{formatCRC(monto)}` en el código que este componente reemplaza. */
  className?: string
}

/**
 * Muestra un monto en colones junto a la leyenda "I.V.I." (Impuesto de
 * Ventas Incluido) en letra pequeña, para dejar explícito en toda la PWA que
 * el impuesto de venta ya está incluido en el precio mostrado — nunca se
 * suma aparte. Reemplaza a `formatCRC(monto)` en todos los precios/totales
 * visibles al usuario (catálogo, carrito, pago, popups); no se usa en
 * `services/tickets.ts`, que arma el texto de los tickets térmicos por su
 * cuenta.
 */
export default function PrecioConIvi({ monto, className }: PrecioConIviProps) {
  const { t } = useLanguage()
  return (
    <span className={className}>
      {formatCRC(monto)}
      <span className="ml-1 text-[0.55em] font-normal opacity-60">{t('common.ivi')}</span>
    </span>
  )
}
