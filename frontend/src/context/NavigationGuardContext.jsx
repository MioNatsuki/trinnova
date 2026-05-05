// frontend/src/context/NavigationGuardContext.jsx
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation, UNSAFE_NavigationContext } from 'react-router-dom';
import { useBlocker } from './useBlocker';

const NavigationGuardContext = createContext({
  isDirty: false,
  setDirty: () => {},
  dirtyReason: '',
});

export function NavigationGuardProvider({ children }) {
  const [isDirty, setIsDirtyState] = useState(false);
  const [dirtyReason, setDirtyReasonState] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  const setDirty = useCallback((dirty, reason = '') => {
    setIsDirtyState(dirty);
    setDirtyReasonState(reason);
  }, []);

  // Bloquear cierre/recarga de pestaña
  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const confirmNavigation = useCallback((action) => {
    setPendingAction(() => action);
    setShowConfirm(true);
  }, []);

  const handleConfirm = () => {
    setShowConfirm(false);
    setIsDirtyState(false);
    setDirtyReasonState('');
    if (pendingAction) {
      const action = pendingAction;
      setPendingAction(null);
      action();
    }
  };

  const handleCancel = () => {
    setShowConfirm(false);
    setPendingAction(null);
  };

  return (
    <NavigationGuardContext.Provider value={{ isDirty, setDirty, dirtyReason, confirmNavigation }}>
      {children}

      {showConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999,
        }}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: '28px 32px',
            maxWidth: 420, width: '90%',
            boxShadow: '0 20px 60px rgba(0,0,0,.2)',
            fontFamily: "'Outfit', sans-serif",
          }}>
            <h3 style={{
              fontSize: 17, fontWeight: 600, color: '#2d3748',
              margin: '0 0 10px',
            }}>
              Cambios sin guardar
            </h3>
            <p style={{
              fontSize: 13, color: '#718096', lineHeight: 1.6,
              margin: '0 0 20px',
            }}>
              {dirtyReason || 'Tienes cambios pendientes que se perderán si navegas a otra sección.'}<br />
              ¿Deseas salir de todas formas?
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={handleCancel}
                style={{
                  padding: '9px 18px', border: '1px solid #e2e8f0',
                  borderRadius: 7, background: '#fff', color: '#4a5568',
                  fontSize: 13, cursor: 'pointer',
                  fontFamily: "'Outfit', sans-serif",
                }}>
                Quedarme aquí
              </button>
              <button
                onClick={handleConfirm}
                style={{
                  padding: '9px 18px', border: 'none', borderRadius: 7,
                  background: '#e53e3e', color: '#fff', fontSize: 13,
                  fontWeight: 600, cursor: 'pointer',
                  fontFamily: "'Outfit', sans-serif",
                }}>
                Salir sin guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </NavigationGuardContext.Provider>
  );
}

export function useNavigationGuard() {
  return useContext(NavigationGuardContext);
}