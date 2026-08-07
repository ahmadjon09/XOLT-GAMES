// Kirish nuqtasi
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './i18n/index.js';
import './styles/global.css';
import { AuthProvider } from './context/AuthContext.jsx';
import { SocketProvider } from './context/SocketContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
      <AuthProvider>
        <ToastProvider>
          <SocketProvider>
            <App />
          </SocketProvider>
        </ToastProvider>
      </AuthProvider>
  </React.StrictMode>
);
