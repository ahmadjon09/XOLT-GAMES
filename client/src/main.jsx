// Kirish nuqtasi
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './i18n/index.js';
import './styles/global.css';
import { AuthProvider } from './context/AuthContext.jsx';
import { SocketProvider } from './context/SocketContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { ServerStatusProvider } from './context/ServerStatusContext.jsx';
import { captureOAuthTokenFromHash } from './api/authToken.js';

// OAuth returns the JWT in the URL fragment. Store it before AuthProvider's
// initial /auth/me request can run, then remove it from the address bar.
captureOAuthTokenFromHash();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
      <AuthProvider>
        <ToastProvider>
          <SocketProvider>
            {/* Server RAM/yuk holati — "server band" bo'lsa o'yinlar bloklanadi */}
            <ServerStatusProvider>
              <App />
            </ServerStatusProvider>
          </SocketProvider>
        </ToastProvider>
      </AuthProvider>
  </React.StrictMode>
);
