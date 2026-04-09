// Crear un hook personalizado para el proyecto seleccionado
// frontend/src/hooks/useProyecto.js
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export function useProyecto() {
  const { user } = useAuth();
  const [proyectoSlug, setProyectoSlug] = useState('');
  const [proyectos, setProyectos] = useState([]);

  useEffect(() => {
    if (user?.proyectos && user.proyectos.length > 0) {
      setProyectos(user.proyectos);
      if (user.proyectos.length === 1) {
        setProyectoSlug(user.proyectos[0].slug);
      }
    }
  }, [user]);

  return { proyectoSlug, setProyectoSlug, proyectos };
}