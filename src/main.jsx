import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/common/ErrorBoundary'
import { APP_LOGO_URL } from './utils/constants'
import './index.css'

if (APP_LOGO_URL && typeof document !== 'undefined') {
  const ensureLink = (rel) => {
    let el = document.querySelector(`link[rel="${rel}"]`)
    if (!el) {
      el = document.createElement('link')
      el.rel = rel
      document.head.appendChild(el)
    }
    el.href = APP_LOGO_URL
  }
  ensureLink('icon')
  ensureLink('apple-touch-icon')
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
