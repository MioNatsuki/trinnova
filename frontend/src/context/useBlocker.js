// frontend/src/context/useBlocker.js
import { useContext, useEffect, useCallback } from 'react';
import { UNSAFE_NavigationContext, useLocation } from 'react-router-dom';

export function useBlocker(blocker, when = true) {
  const { navigator } = useContext(UNSAFE_NavigationContext);
  const location = useLocation();

  useEffect(() => {
    if (!when) return;

    const unblock = navigator.block((tx) => {
      const autoUnblockingTx = {
        ...tx,
        retry() {
          unblock();
          tx.retry();
        },
      };

      blocker(autoUnblockingTx);
    });

    return unblock;
  }, [navigator, blocker, when, location.pathname]);
}