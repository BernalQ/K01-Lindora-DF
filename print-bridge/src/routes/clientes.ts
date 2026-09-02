import { Router } from 'express'
import { buscarClientePorCedula, guardarCliente } from '../data/clientesStore.js'
import type { Cliente } from '../types.js'

export const clientesRouter = Router()

/** Consulta un cliente por cédula en la base local (Excel). 404 si no existe. */
clientesRouter.get('/clientes/:cedula', async (req, res) => {
  try {
    const cliente = await buscarClientePorCedula(req.params.cedula)
    if (!cliente) {
      res.status(404).json({ ok: false, error: 'Cliente no encontrado' })
      return
    }
    res.status(200).json({ ok: true, cliente })
  } catch (err) {
    console.error('[print-bridge] Error buscando cliente:', err)
    res.status(500).json({ ok: false, error: (err as Error).message })
  }
})

/** Crea o actualiza (upsert) un cliente, usando la cédula como llave primaria. */
clientesRouter.post('/clientes', async (req, res) => {
  const body = req.body as Partial<Cliente>

  if (!body.cedula?.trim() || !body.nombre?.trim()) {
    res.status(400).json({ ok: false, error: 'cedula y nombre son obligatorios' })
    return
  }

  const cliente: Cliente = {
    cedula: body.cedula.trim(),
    nombre: body.nombre.trim(),
    correo: body.correo?.trim() ?? '',
    telefono: body.telefono?.trim() ?? '',
    direccion: body.direccion?.trim() ?? '',
  }

  try {
    await guardarCliente(cliente)
    res.status(200).json({ ok: true, cliente })
  } catch (err) {
    console.error('[print-bridge] Error guardando cliente:', err)
    res.status(500).json({ ok: false, error: (err as Error).message })
  }
})
