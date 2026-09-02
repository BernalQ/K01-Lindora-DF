/**
 * Serializa operaciones de lectura/escritura sobre un mismo archivo Excel,
 * para evitar condiciones de carrera si llegan dos requests casi al mismo
 * tiempo (poco probable en un kiosko de un solo punto de venta, pero barato
 * de prevenir: sin esto, dos escrituras concurrentes podrían pisarse o
 * corromper el archivo .xlsx).
 */
export function crearCola() {
  let ultima: Promise<unknown> = Promise.resolve()
  return function encolar<T>(tarea: () => Promise<T>): Promise<T> {
    const resultado = ultima.then(tarea, tarea)
    ultima = resultado.then(
      () => undefined,
      () => undefined,
    )
    return resultado
  }
}
