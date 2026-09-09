// frontend/src/hooks/useProyecto.js
// ============================================================
// HOOK COMPARTIDO PARA SELECCIÓN DE PROYECTO ACTIVO
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const LS_KEY = 'trinnova_proyecto_slug';

export function useProyecto() {
    const { user } = useAuth();
    const proyectos = user?.proyectos || [];

    // ============================================================
    // ESTADO INICIAL - CARGAR DESDE LOCALSTORAGE
    // ============================================================
    const [proyectoSlug, setProyectoSlugState] = useState(() => {
        // Intentar restaurar desde localStorage
        const saved = localStorage.getItem(LS_KEY);
        return saved || '';
    });

    // ============================================================
    // SINCRONIZAR CON EL USUARIO CUANDO CARGA
    // ============================================================
    useEffect(() => {
        if (!proyectos.length) {
            // Si no hay proyectos, limpiar selección
            if (proyectoSlug) {
                localStorage.removeItem(LS_KEY);
                setProyectoSlugState('');
            }
            return;
        }

        const slugs = proyectos.map(p => p.slug);

        // Si hay solo uno → seleccionar automáticamente
        if (slugs.length === 1) {
            if (proyectoSlug !== slugs[0]) {
                setProyectoSlugState(slugs[0]);
                localStorage.setItem(LS_KEY, slugs[0]);
            }
            return;
        }

        // Si el guardado en LS ya no está en los proyectos del usuario, limpiar
        const saved = localStorage.getItem(LS_KEY);
        if (saved && !slugs.includes(saved)) {
            localStorage.removeItem(LS_KEY);
            setProyectoSlugState('');
        }
    }, [user, proyectos]);

    // ============================================================
    // FUNCIÓN PARA ESTABLECER PROYECTO
    // ============================================================
    const setProyectoSlug = useCallback((slug) => {
        // Validar que el slug existe en los proyectos del usuario
        if (slug && !proyectos.some(p => p.slug === slug)) {
            console.warn(`Proyecto "${slug}" no está asignado al usuario`);
            return;
        }

        setProyectoSlugState(slug);
        if (slug) {
            localStorage.setItem(LS_KEY, slug);
        } else {
            localStorage.removeItem(LS_KEY);
        }
    }, [proyectos]);

    // ============================================================
    // FUNCIÓN PARA NAVEGAR CON PROYECTO
    // ============================================================
    const navigateToWithProject = useCallback((slug, navigate, path) => {
        // Primero establecer el proyecto en localStorage y estado
        if (slug) {
            localStorage.setItem(LS_KEY, slug);
            setProyectoSlugState(slug);
        }
        
        // Luego navegar con estado
        navigate(path, { 
            state: { 
                proyectoSlug: slug,
                fromProyectos: true 
            } 
        });
    }, []);

    // ============================================================
    // OBJETO PROYECTO SELECCIONADO
    // ============================================================
    const proyectoActual = proyectos.find(p => p.slug === proyectoSlug) || null;

    return { 
        proyectoSlug, 
        setProyectoSlug, 
        navigateToWithProject,
        proyectos, 
        proyectoActual 
    };
}