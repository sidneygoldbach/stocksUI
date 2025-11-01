import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n/i18n.js'
import AeroControlApp from './components/AeroControlApp.jsx'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AeroControlApp />
  </React.StrictMode>
)