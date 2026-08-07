// Toast bildirishnomalari
import { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

const ToastData = createContext(null);

let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((type, message, timeout = 3000) => {
    const id = ++idCounter;
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => remove(id), timeout);
  }, [remove]);

  const toast = {
    success: (m) => push('success', m),
    error: (m) => push('error', m, 4200),
    info: (m) => push('info', m),
  };

  return (
    <ToastData.Provider value={toast}>
      {children}
      <div style={{ position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 100, width: 'min(92vw, 420px)', display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: '#fff',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: '11px 14px',
              boxShadow: 'var(--shadow-lg)',
              animation: 'slideUp .2s ease',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {t.type === 'success' && <CheckCircle2 size={19} color="var(--success)" />}
            {t.type === 'error' && <AlertCircle size={19} color="var(--danger)" />}
            {t.type === 'info' && <Info size={19} color="var(--info)" />}
            <span style={{ flex: 1 }}>{t.message}</span>
            <button onClick={() => remove(t.id)} style={{ color: 'var(--muted)', display: 'flex', padding: 2 }}>
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastData.Provider>
  );
}

export const useToast = () => useContext(ToastData);
