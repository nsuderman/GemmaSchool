import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { WebSocketProvider } from './contexts/WebSocketContext'
import { ProfileProvider } from './contexts/ProfileContext'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ProfileProvider>
        <WebSocketProvider>
          <App />
        </WebSocketProvider>
      </ProfileProvider>
    </BrowserRouter>
  </React.StrictMode>
)
