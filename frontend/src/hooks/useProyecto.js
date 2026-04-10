// frontend/src/hooks/useProyecto.js
// Hook compartido para selección de proyecto activo.
// Persiste la elección en localStorage para que sobreviva recargas.

import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const LS_KEY = 'trinnova_proyecto_slug';

export function useProyecto() {
  const { user } = useAuth();
  const proyectos = user?.proyectos || [];

  const [proyectoSlug, setProyectoSlugState] = useState(() => {
    // Intentar restaurar desde localStorage
    const saved = localStorage.getItem(LS_KEY);
    return saved || '';
  });

  // Cuando carga el usuario sincronizar
  useEffect(() => {
    if (!proyectos.length) return;

    const slugs = proyectos.map(p => p.slug);

    // Si hay solo uno → seleccionar automáticamente
    if (slugs.length === 1) {
      setProyectoSlugState(slugs[0]);
      localStorage.setItem(LS_KEY, slugs[0]);
      return;
    }

    // Si el guardado en LS ya no está en los proyectos del usuario, limpiar
    const saved = localStorage.getItem(LS_KEY);
    if (saved && !slugs.includes(saved)) {
      localStorage.removeItem(LS_KEY);
      setProyectoSlugState('');
    }
  }, [user]);

  const setProyectoSlug = (slug) => {
    setProyectoSlugState(slug);
    if (slug) {
      localStorage.setItem(LS_KEY, slug);
    } else {
      localStorage.removeItem(LS_KEY);
    }
  };

  // Objeto proyecto seleccionado completo
  const proyectoActual = proyectos.find(p => p.slug === proyectoSlug) || null;

  return { proyectoSlug, setProyectoSlug, proyectos, proyectoActual };
}
