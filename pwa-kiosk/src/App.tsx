import { useEffect, useState } from 'react'
import WelcomeScreen from './components/screens/WelcomeScreen'
import MesaSetupScreen from './components/screens/MesaSetupScreen'
import MenuScreen from './components/screens/MenuScreen'
import PaymentScreen from './components/screens/PaymentScreen'
import CedulaScreen from './components/screens/CedulaScreen'
import RegistroClienteScreen from './components/screens/RegistroClienteScreen'
import AdminScreen from './components/screens/AdminScreen'
import { useCartStore } from './store/cartStore'
import { useMesaStore } from './store/mesaStore'
import type { Cliente } from './types/factura'
import { useLanguage } from './context/useLanguage'
// Importado desde `kioskoSyncPolling.ts` (no directamente de `services/kioskoSync.ts`)
// para garantizar que, al cargar `App.tsx`, también se inicialicen los efectos
// de ese módulo (polling de mensajes pendientes + resincronización automática
// al recuperar contacto con el otro kiosko, ver doc ahí).
import { solicitarResincronizacion } from './services/kioskoSyncPolling'
// Arranca el revisor de reintentos automáticos hacia AWS (envíos fallidos
// de `services/awsVentas.ts` que esperan su próximo intento cada 30 min).
import { iniciarRevisionAwsVentas } from './services/awsVentas'

type Screen = 'welcome' | 'mesaSetup' | 'menu' | 'payment' | 'cedula' | 'registroCliente' | 'admin'

function App() {
  const { setLanguage } = useLanguage()
  const [screen, setScreen] = useState<Screen>('welcome')

  // Requerimiento "Resincronización automática": al arrancar la PWA, este
  // kiosko consulta el estado completo (catálogo + mesas) del otro kiosko
  // (ver `services/kioskoSync.ts`). Una sola vez por carga de la pestaña,
  // sin depender de en qué pantalla quede el usuario después.
  useEffect(() => {
    solicitarResincronizacion()
    iniciarRevisionAwsVentas()
  }, [])
  const [cedulaPendiente, setCedulaPendiente] = useState('')
  const clearCart = useCartStore((s) => s.clear)
  const setCliente = useCartStore((s) => s.setCliente)
  const setTipoPago = useCartStore((s) => s.setTipoPago)
  const iniciarMesa = useMesaStore((s) => s.iniciar)
  const cerrarMesa = useMesaStore((s) => s.cerrar)
  const cancelarMesa = useMesaStore((s) => s.cancelar)

  const handleContinuarAlPago = () => {
    setScreen('payment')
  }

  const handleSolicitarFactura = () => {
    setScreen('cedula')
  }

  const handleCedulaEncontrado = (cliente: Cliente) => {
    setCliente(cliente)
    setTipoPago('factura')
    setScreen('payment')
  }

  const handleCedulaNoEncontrado = (cedula: string) => {
    setCedulaPendiente(cedula)
    setScreen('registroCliente')
  }

  const handleRegistroGuardado = (cliente: Cliente) => {
    setCliente(cliente)
    setTipoPago('factura')
    setScreen('payment')
  }

  const handleVolverInicio = () => {
    // Salvaguarda: si por alguna razón se vuelve al inicio con una mesa
    // compartida aún activa (ej. salida manual fuera del flujo normal de
    // cierre), no debe quedar "abierta" aceptando más órdenes.
    cerrarMesa()
    clearCart()
    setLanguage('es')
    setScreen('welcome')
  }

  /** Mesa compartida, "Sí, otra orden": misma mesa, carrito limpio, de vuelta al menú. */
  const handleNuevaOrdenMismaMesa = () => {
    setScreen('menu')
  }

  /**
   * "Cancelar Orden" desde `MenuScreen` (antes de llegar a pago): libera de
   * inmediato el identificador de mesa (`mesaStore.cancelar`, en vez de
   * esperar los 30 minutos de bloqueo — mismo mecanismo que usa
   * `PaymentScreen` para su propio "Cancelar Orden") y descarta el carrito
   * en curso. A esta altura del flujo nunca se ha reservado un número de
   * orden/consecutivo real (`generarConsecutivo()` sólo se llama al llegar
   * a `PaymentScreen`), así que no hay nada más que "liberar" en ese sentido.
   */
  const handleCancelarOrdenDesdeMenu = () => {
    cancelarMesa()
    clearCart()
    setLanguage('es')
    setScreen('welcome')
  }

  const handleMesaSetupContinuar = (mesaId: string, compartida: boolean) => {
    iniciarMesa(mesaId, compartida)
    setScreen('menu')
  }

  let contenido
  if (screen === 'admin') {
    contenido = <AdminScreen onBack={() => setScreen('welcome')} />
  } else if (screen === 'registroCliente') {
    contenido = (
      <RegistroClienteScreen
        cedula={cedulaPendiente}
        onBack={() => setScreen('cedula')}
        onGuardado={handleRegistroGuardado}
      />
    )
  } else if (screen === 'cedula') {
    contenido = (
      <CedulaScreen
        onBack={() => setScreen('payment')}
        onEncontrado={handleCedulaEncontrado}
        onNoEncontrado={handleCedulaNoEncontrado}
      />
    )
  } else if (screen === 'payment') {
    contenido = (
      <PaymentScreen
        onBack={() => setScreen('menu')}
        onSolicitarFactura={handleSolicitarFactura}
        onNuevaOrdenMismaMesa={handleNuevaOrdenMismaMesa}
        onVolverInicio={handleVolverInicio}
      />
    )
  } else if (screen === 'menu') {
    contenido = <MenuScreen onContinuarAlPago={handleContinuarAlPago} onCancelarOrden={handleCancelarOrdenDesdeMenu} />
  } else if (screen === 'mesaSetup') {
    contenido = <MesaSetupScreen onContinuar={handleMesaSetupContinuar} onCancelar={handleVolverInicio} />
  } else {
    contenido = <WelcomeScreen onStart={() => setScreen('mesaSetup')} onOpenAdmin={() => setScreen('admin')} />
  }

  return contenido
}

export default App
