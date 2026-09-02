import nodemailer from 'nodemailer'
import type { Cliente } from '../types.js'

/**
 * Envío del PDF de factura por correo al cliente.
 *
 * Si no hay credenciales SMTP configuradas (SMTP_HOST/SMTP_USER/SMTP_PASS
 * en `.env`), se simula el envío (queda registrado en consola) para no
 * bloquear el flujo del kiosko. En cuanto el negocio tenga una cuenta de
 * correo/SMTP definida, basta con completar esas variables para que el
 * envío sea real — no requiere cambios de código.
 */
export async function enviarCorreoFactura(
  cliente: Cliente,
  pdfPath: string,
  clave: string,
): Promise<{ ok: boolean; simulado: boolean; error?: string }> {
  const host = process.env.SMTP_HOST
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const from = process.env.SMTP_FROM ?? user

  if (!host || !user || !pass || !cliente.correo) {
    console.log(
      `[email:stub] Envío de factura simulado a "${cliente.correo || '(sin correo)'}" — ` +
        `configure SMTP_HOST/SMTP_USER/SMTP_PASS en .env para envíos reales. Clave: ${clave}`,
    )
    return { ok: true, simulado: true }
  }

  try {
    const puerto = Number(process.env.SMTP_PORT ?? 587)
    const transporter = nodemailer.createTransport({
      host,
      port: puerto,
      secure: puerto === 465,
      auth: { user, pass },
    })
    await transporter.sendMail({
      from,
      to: cliente.correo,
      subject: 'Su factura electrónica — Carnes Don Fernando',
      text: `Estimado(a) ${cliente.nombre}, adjuntamos su comprobante electrónico.\n\nClave: ${clave}`,
      attachments: [{ filename: 'factura.pdf', path: pdfPath }],
    })
    return { ok: true, simulado: false }
  } catch (err) {
    console.error('[email] Error enviando factura:', err)
    return { ok: false, simulado: false, error: (err as Error).message }
  }
}
