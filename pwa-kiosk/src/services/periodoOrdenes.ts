import type { VentaEnCola } from '../types/order'
import { estaCancelada } from './offlineQueue'

/**
 * Período (año/mes) de una orden. Es una funcionalidad INTERNA de la PWA y de
 * AWS: sirve para agrupar el histórico en Admin y para que el backend/QuickSight
 * puedan filtrar y agregar por mes sin parsear fechas. NUNCA se envía a Codisa
 * (el JSON de Codisa no cambia, ver `construirCuerpoAwsVenta` en
 * `services/awsVentas.ts`).
 *
 * El mes se toma de la hora LOCAL del kiosko (igual que `esDeHoy` en
 * `AdminScreen` y que `fecha` en el pedido de Codisa, ver `formatFechaCodisa`
 * en `services/wsdf.ts`), de modo que una venta de las 11:50 pm del último día
 * del mes cuenta en ese mes y no en el siguiente (que sí pasaría usando UTC).
 */
export interface PeriodoOrden {
  year: number
  /** 1–12 */
  month: number
  /** Nombre del mes en español con la inicial en mayúscula (ej. "Noviembre"); es el valor que se manda a AWS. */
  monthName: string
  /** `YYYY-MM`, ordenable alfabéticamente (ej. "2026-11"). */
  yearMonth: string
}

export const NOMBRES_MES: Record<'es' | 'en', readonly string[]> = {
  es: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
}

export function periodoDesdeAnioMes(year: number, month: number): PeriodoOrden {
  return {
    year,
    month,
    monthName: NOMBRES_MES.es[month - 1] ?? '',
    yearMonth: `${year}-${String(month).padStart(2, '0')}`,
  }
}

/** Período de una fecha ISO (ej. `Venta.fechaHora`), en hora local. */
export function obtenerPeriodo(fechaIso: string): PeriodoOrden {
  const fecha = new Date(fechaIso)
  return periodoDesdeAnioMes(fecha.getFullYear(), fecha.getMonth() + 1)
}

/** Período de la fecha del pedido de Codisa (`YYYY-MM-DD HH:mm:ss`, ya en hora local). `null` si el formato no es el esperado. */
export function periodoDesdeFechaCodisa(fecha: string): PeriodoOrden | null {
  const m = /^(\d{4})-(\d{2})-\d{2}/.exec(fecha)
  if (!m) return null
  const month = Number(m[2])
  if (month < 1 || month > 12) return null
  return periodoDesdeAnioMes(Number(m[1]), month)
}

/** Campos de período tal como se envían a AWS (ver spec: year, month, monthName, yearMonth). */
export function camposPeriodoAws(periodo: PeriodoOrden): Pick<PeriodoOrden, 'year' | 'month' | 'monthName' | 'yearMonth'> {
  return { year: periodo.year, month: periodo.month, monthName: periodo.monthName, yearMonth: periodo.yearMonth }
}

/** Resumen de un mes. Las órdenes CANCELADA se cuentan aparte y NO suman al monto ni al total de órdenes. */
export interface ResumenMes {
  periodo: PeriodoOrden
  /** Todas las órdenes del mes (activas + canceladas), más recientes primero. Las canceladas se conservan para auditoría. */
  ordenes: VentaEnCola[]
  /** Órdenes activas (no canceladas). */
  totalOrdenes: number
  ordenesCanceladas: number
  /** Suma de `total` de las órdenes activas únicamente. */
  ventasTotales: number
  /** `ventasTotales / totalOrdenes` (0 si no hay órdenes activas). */
  ticketPromedio: number
}

export interface GrupoAnio {
  year: number
  /** Meses con órdenes, del más reciente al más antiguo. */
  meses: ResumenMes[]
  totalOrdenes: number
  ordenesCanceladas: number
  ventasTotales: number
}

/**
 * Agrupa el histórico en Año → Mes. Sólo aparecen los períodos que tienen
 * órdenes (no se inventan carpetas vacías). Orden: año y mes descendentes;
 * dentro de cada mes, la orden más reciente primero.
 */
export function agruparPorAnioMes(ventas: VentaEnCola[]): GrupoAnio[] {
  const meses = new Map<string, VentaEnCola[]>()
  for (const item of ventas) {
    const { yearMonth } = obtenerPeriodo(item.venta.fechaHora)
    const lista = meses.get(yearMonth)
    if (lista) lista.push(item)
    else meses.set(yearMonth, [item])
  }

  const anios = new Map<number, ResumenMes[]>()
  for (const [, ordenes] of meses) {
    ordenes.sort((a, b) => b.venta.fechaHora.localeCompare(a.venta.fechaHora))
    const periodo = obtenerPeriodo(ordenes[0].venta.fechaHora)
    const activas = ordenes.filter((o) => !estaCancelada(o.venta))
    const ventasTotales = activas.reduce((suma, o) => suma + o.venta.total, 0)
    const resumen: ResumenMes = {
      periodo,
      ordenes,
      totalOrdenes: activas.length,
      ordenesCanceladas: ordenes.length - activas.length,
      ventasTotales,
      ticketPromedio: activas.length > 0 ? ventasTotales / activas.length : 0,
    }
    const delAnio = anios.get(periodo.year)
    if (delAnio) delAnio.push(resumen)
    else anios.set(periodo.year, [resumen])
  }

  return [...anios.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, resumenes]) => {
      resumenes.sort((a, b) => b.periodo.month - a.periodo.month)
      return {
        year,
        meses: resumenes,
        totalOrdenes: resumenes.reduce((s, m) => s + m.totalOrdenes, 0),
        ordenesCanceladas: resumenes.reduce((s, m) => s + m.ordenesCanceladas, 0),
        ventasTotales: resumenes.reduce((s, m) => s + m.ventasTotales, 0),
      }
    })
}
