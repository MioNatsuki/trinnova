// frontend/src/components/UnsavedChangesGuard.jsx
// Muestra un modal de confirmación si el usuario intenta navegar fuera
// de la página cuando hay cambios no guardados (isDirty = true).
// También intercepta el cierre/recarga de la pestaña del navegador.

import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation, UNSAFE_NavigationContext } from 'react-router-dom';

// Hook interno para escuchar intentos de navegación de React Router v6
function useBlocker(blocker, when = true) {
  const { navigator } = React.useContext(UNSAFE_NavigationContext);

  useEffect(() => {
    if (!when) return;

    const originalPush = navigator.push;
    const originalReplace = navigator.replace;

    navigator.push = (...args) => {
      blocker(() => originalPush(...args));
    };
    navigator.replace = (...args) => {
      blocker(() => originalReplace(...args));
    };

    return () => {
      navigator.push = originalPush;
      navigator.replace = originalReplace;
    };
  }, [navigator, blocker, when]);
}

// Importar React para el useContext del hook
import React from 'react';

export default function UnsavedChangesGuard({ isDirty }) {
  const [showModal, setShowModal] = useState(false);
  const [pendingNav, setPendingNav] = useState(null);

  // Bloquear cierre/recarga de pestaña
  useEffect(() => {
    const handler = (e) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Interceptar navegación de React Router
  const blocker = useCallback((proceed) => {
    if (!isDirty) {
      proceed();
      return;
    }
    setPendingNav(() => proceed);
    setShowModal(true);
  }, [isDirty]);

  useBlocker(blocker, isDirty);

  const handleConfirm = () => {
    setShowModal(false);
    if (pendingNav) {
      pendingNav();
      setPendingNav(null);
    }
  };

  const handleCancel = () => {
    setShowModal(false);
    setPendingNav(null);
  };

  if (!showModal) return null;

  return (
    <div className="modal-overlay" onClick={handleCancel}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">⚠️ Cambios no guardados</h2>
        <p className="modal-body">
          Tienes cambios pendientes que no se han guardado.
          Si continúas, <strong>todos los cambios se perderán</strong>.
          ¿Deseas continuar de todas formas?
        </p>
        <div className="modal-actions">
          <button
            className="btn-danger"
            onClick={handleConfirm}
          >
            Sí, descartar cambios
          </button>
          <button
            className="btn-secondary"
            onClick={handleCancel}
            style={{ order: -1 }}
          >
            Cancelar, volver
          </button>
        </div>
      </div>

      <style>{`
        .modal-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,.45);
          display: flex; align-items: center; justify-content: center;
          z-index: 2000;
        }
        .modal-box {
          background: var(--clr-white);
          border-radius: var(--radius);
          padding: 28px 32px;
          max-width: 440px; width: 90%;
          box-shadow: var(--shadow-md);
        }
        .modal-title {
          font-size: 17px; font-weight: 600;
          color: var(--clr-text); margin-bottom: 14px;
        }
        .modal-body {
          font-size: 13.5px; color: var(--clr-text);
          line-height: 1.6; margin-bottom: 22px;
        }
        .modal-actions {
          display: flex; gap: 10px; justify-content: flex-end;
        }
        .btn-danger {
          padding: 8px 18px;
          border: none;
          border-radius: 7px;
          background: var(--clr-red);
          color: #fff;
          font-size: 13px; font-weight: 500;
          font-family: 'Outfit', sans-serif;
          cursor: pointer;
          transition: background .15s;
        }
        .btn-danger:hover { background: #c53030; }
        .btn-secondary {
          padding: 8px 18px;
          border: 1px solid var(--clr-border);
          border-radius: 7px;
          background: var(--clr-white);
          font-size: 13px; font-weight: 500;
          font-family: 'Outfit', sans-serif;
          cursor: pointer;
          transition: background .15s;
        }
        .btn-secondary:hover { background: var(--clr-bg); }
      `}</style>
    </div>
  );
}
