import { useState } from 'react'
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
import { useLanguage } from './context/LanguageContext'

type Screen = 'welcome' | 'mesaSetup' | 'menu' | 'payment' | 'cedula' | 'registroCliente' | 'admin'

function App() {
  const { setLanguage } = useLanguage()
  const [screen, setScreen] = useState<Screen>('welcome')
  const [cedulaPendiente, setCedulaPendiente] = useState('')
  const clearCart = useCartStore((s) => s.clear)
  const setCliente = useCartStore((s) => s.setCliente)
  const setTipoPago = useCartStore((s) => s.setTipoPago)
  const iniciarMesa = useMesaStore((s) => s.iniciar)
  const cerrarMesa = useMesaStore((s) => s.cerrar)

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

  const handleMesaSetupContinuar = (mesaId: string, compartida: boolean) => {
    iniciarMesa(mesaId, compartida)
    setScreen('menu')
  }

  if (screen === 'admin') {
    return <AdminScreen onBack={() => setScreen('welcome')} />
  }

  if (screen === 'registroCliente') {
    return (
      <RegistroClienteScreen
        cedula={cedulaPendiente}
        onBack={() => setScreen('cedula')}
        onGuardado={handleRegistroGuardado}
      />
    )
  }

  if (screen === 'cedula') {
    return (
      <CedulaScreen
        onBack={() => setScreen('payment')}
        onEncontrado={handleCedulaEncontrado}
        onNoEncontrado={handleCedulaNoEncontrado}
      />
    )
  }

  if (screen === 'payment') {
    return (
      <PaymentScreen
        onBack={() => setScreen('menu')}
        onSolicitarFactura={handleSolicitarFactura}
        onNuevaOrdenMismaMesa={handleNuevaOrdenMismaMesa}
        onVolverInicio={handleVolverInicio}
      />
    )
  }

  if (screen === 'menu') {
    return <MenuScreen onContinuarAlPago={handleContinuarAlPago} />
  }

  if (screen === 'mesaSetup') {
    return <MesaSetupScreen onContinuar={handleMesaSetupContinuar} onCancelar={handleVolverInicio} />
  }

  return <WelcomeScreen onStart={() => setScreen('mesaSetup')} onOpenAdmin={() => setScreen('admin')} />
}

export default App
