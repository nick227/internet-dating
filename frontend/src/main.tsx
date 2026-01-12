import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles/index.css'

const DEBUG = Boolean(import.meta.env?.DEV)

if (DEBUG) {
  console.log('[DEBUG] main.tsx: App starting', { timestamp: Date.now(), url: window.location.href })
}

// Only enable StrictMode in development - it's safe in production but adds unnecessary overhead
const AppRoot = import.meta.env.DEV ? (
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
) : (
  <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <App />
  </BrowserRouter>
)

ReactDOM.createRoot(document.getElementById('root')!).render(AppRoot)
