/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { GrupoDocente, fetchGruposDocente, fetchCuadernoGrupo, eliminarActividadesLote } from '../services/gruposService';
import { eliminarRubricasLote } from '../services/rubricasService';
import { CuadernoGrupoData, Calificacion, CalificacionApartado, Rubrica, ActividadDetalle, Criterio } from '../types';
import {
  getHorarioCalendario,
  obtenerEvaluacionActual,
  obtenerSesionActual,
} from '../services/horarioCalendarioService';
import { getCursoColorTheme, CursoColorTheme } from '../utils/cursoColorUtils';

export type EvaluacionPeriodo = '1.º Ev' | '2.º Ev' | '3.º Ev' | 'Global';
export type NavTab = 'actividades' | 'rubricas' | 'filtro' | 'resultados' | 'configuracion';
export type ConnectionStatus = 'checking' | 'connected' | 'firebase_only' | 'error' | 'offline';

export interface ConnectionInfo {
  status: ConnectionStatus;
  label: string;
  details: string;
  lastChecked?: Date;
}

interface CuadernoContextValue {
  // Grupos y selección
  grupos: GrupoDocente[];
  selectedGrupoId: string | null;
  selectedGrupo: GrupoDocente | null;
  selectGrupo: (grupoId: string, skipConfirm?: boolean, forceReload?: boolean) => Promise<boolean>;
  isLoadingGrupos: boolean;
  gruposError: string | null;
  refreshGrupos: () => Promise<void>;

  // Evaluación y Navegación
  selectedEvaluacion: EvaluacionPeriodo;
  setSelectedEvaluacion: (evaluacion: EvaluacionPeriodo) => void;
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;

  // Cuaderno del grupo activo
  cuadernoData: CuadernoGrupoData | null;
  isLoadingCuaderno: boolean;
  cuadernoError: string | null;
  refreshCuaderno: (forceReload?: boolean) => Promise<void>;
  updateCuadernoData: (newData: CuadernoGrupoData) => void;
  updateCalificaciones: (calificaciones: Calificacion[]) => void;
  updateCalificacionesApartados: (apartados: CalificacionApartado[]) => void;
  updateRubrica: (rubrica: Rubrica) => void;
  addRubricaYActividad: (rubrica: Rubrica, actividad: ActividadDetalle) => void;
  updateCriterioPonderacion: (criterioId: number, ponderacion: number | null) => void;
  updateCriteriosLote: (criterios: Criterio[]) => void;
  eliminarActividades: (actividadIds: string[]) => Promise<{ success: boolean; eliminadas: string[] }>;
  eliminarRubricas: (rubricaIds: string[]) => Promise<{ success: boolean; eliminadas: string[]; actividadesEliminadas: string[] }>;

  // Control de cambios no guardados
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (hasChanges: boolean) => void;

  // Estado de conexión
  connectionInfo: ConnectionInfo;
  checkServerConnection: () => Promise<void>;

  // Tema visual dependiente del curso activo
  cursoTheme: CursoColorTheme;
}

const CuadernoContext = createContext<CuadernoContextValue | null>(null);

export const CuadernoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, status: authStatus, getIdToken } = useAuth();

  // Estados de grupos
  const [grupos, setGrupos] = useState<GrupoDocente[]>([]);
  const [selectedGrupoId, setSelectedGrupoId] = useState<string | null>(null);
  const [isLoadingGrupos, setIsLoadingGrupos] = useState(false);
  const [gruposError, setGruposError] = useState<string | null>(null);

  // Estados de evaluación y pestañas
  const [selectedEvaluacion, setSelectedEvaluacion] = useState<EvaluacionPeriodo>('1.º Ev');
  const [activeTab, setActiveTab] = useState<NavTab>('actividades');

  // Estados del cuaderno
  const [cuadernoData, setCuadernoData] = useState<CuadernoGrupoData | null>(null);
  const [isLoadingCuaderno, setIsLoadingCuaderno] = useState(false);
  const [cuadernoError, setCuadernoError] = useState<string | null>(null);

  // Protección de cambios no guardados
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Estado de conexión
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo>({
    status: 'checking',
    label: 'Comprobando conexión...',
    details: 'Verificando sesión y comunicación con Supabase.',
  });

  // Referencias para control de condiciones de carrera en peticiones asíncronas
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRequestGrupoIdRef = useRef<string | null>(null);

  // Helper para verificar conexión con Supabase
  const checkServerConnection = useCallback(async () => {
    if (!navigator.onLine) {
      setConnectionInfo({
        status: 'offline',
        label: 'Sin conexión a Internet',
        details: 'El navegador no dispone de conexión a la red.',
        lastChecked: new Date(),
      });
      return;
    }

    if (authStatus !== 'authenticated' || !user) {
      setConnectionInfo({
        status: 'firebase_only',
        label: 'Sesión no iniciada',
        details: 'Accede con Google para conectar con el servidor.',
        lastChecked: new Date(),
      });
      return;
    }

    setConnectionInfo((prev) => ({
      ...prev,
      status: 'checking',
      label: 'Comprobando servidor...',
    }));

    try {
      const token = await getIdToken(false);
      if (!token) {
        setConnectionInfo({
          status: 'firebase_only',
          label: 'Sesión Google activa (sin token)',
          details: 'Autenticado en Firebase pero no se obtuvo token para Supabase.',
          lastChecked: new Date(),
        });
        return;
      }

      // Probar petición ligera al endpoint de groups en Supabase
      const endpoint = 'https://bdtkdyzmpbijvwwsbxpa.supabase.co/functions/v1/fernanditio-data/groups';
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (res.ok) {
        setConnectionInfo({
          status: 'connected',
          label: 'Conectado a Supabase',
          details: 'Sesión Google activa y servidor Supabase sincronizado.',
          lastChecked: new Date(),
        });
      } else {
        setConnectionInfo({
          status: 'firebase_only',
          label: `Sesión Google activa (Supabase: HTTP ${res.status})`,
          details: `El servidor Supabase respondió con código ${res.status}.`,
          lastChecked: new Date(),
        });
      }
    } catch (err: any) {
      setConnectionInfo({
        status: 'error',
        label: 'Error de conexión con Supabase',
        details: err?.message || 'Fallo de red al comunicar con la Edge Function.',
        lastChecked: new Date(),
      });
    }
  }, [authStatus, user, getIdToken]);

  // Escuchar eventos online/offline de la ventana
  useEffect(() => {
    const handleOnline = () => checkServerConnection();
    const handleOffline = () => {
      setConnectionInfo({
        status: 'offline',
        label: 'Sin conexión de red',
        details: 'El dispositivo se encuentra sin acceso a Internet.',
        lastChecked: new Date(),
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [checkServerConnection]);

  // Carga de grupos
  const refreshGrupos = useCallback(async () => {
    if (authStatus !== 'authenticated' || !user) return;

    setIsLoadingGrupos(true);
    setGruposError(null);

    try {
      const resp = await fetchGruposDocente();
      const listado = resp.groups || [];
      setGrupos(listado);

      // Determinar selección automática según Horario y Calendario lectivo si está configurado
      let autoGrupoId: string | null = null;
      try {
        const configHorario = getHorarioCalendario(user.uid);
        if (configHorario.aperturaAutomaticaHabilitada) {
          const evalActual = obtenerEvaluacionActual(configHorario.calendario);
          if (evalActual) {
            setSelectedEvaluacion(evalActual as EvaluacionPeriodo);
          }
          const sesionActual = obtenerSesionActual(configHorario, listado);
          if (sesionActual && sesionActual.grupoId && listado.some((g) => g.id === sesionActual.grupoId)) {
            autoGrupoId = sesionActual.grupoId;
          }
        }
      } catch (e) {
        console.warn('[CuadernoContext] Error evaluando apertura automática por horario:', e);
      }

      // Si coincide con la sesión lectiva activa, priorizar dicho grupo; de lo contrario seleccionar el primero
      setSelectedGrupoId((prevId) => {
        if (autoGrupoId) {
          return autoGrupoId;
        }
        if (!prevId && listado.length > 0) {
          return listado[0].id;
        }
        if (prevId && !listado.some((g) => g.id === prevId)) {
          return listado.length > 0 ? listado[0].id : null;
        }
        return prevId;
      });

      setConnectionInfo({
        status: 'connected',
        label: 'Conectado a Supabase',
        details: 'Sesión Google y datos de Supabase sincronizados.',
        lastChecked: new Date(),
      });
    } catch (err: any) {
      console.error('[CuadernoContext] Error cargando grupos:', err);
      setGruposError(err?.message || 'Error al recuperar grupos de Supabase.');
      setConnectionInfo({
        status: 'firebase_only',
        label: 'Sesión Google activa (error en Supabase)',
        details: err?.message || 'No se pudo comunicar con el servidor.',
        lastChecked: new Date(),
      });
    } finally {
      setIsLoadingGrupos(false);
    }
  }, [authStatus, user]);

  // Disparar carga de grupos al autenticar
  useEffect(() => {
    if (authStatus === 'authenticated' && user) {
      refreshGrupos();
    } else {
      setGrupos([]);
      setSelectedGrupoId(null);
      setCuadernoData(null);
    }
  }, [authStatus, user, refreshGrupos]);

  // Protección ante recarga o cierre de pestaña con cambios sin guardar
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  // Selección de grupo con protección de cambios y cancelación de peticiones previas
  const selectGrupo = useCallback(
    async (grupoId: string, skipConfirm = false, forceReload = false): Promise<boolean> => {
      if (!grupoId) return false;

      // 1. Verificación de cambios sin guardar
      if (hasUnsavedChanges && !skipConfirm) {
        const confirmar = window.confirm(
          'Tienes calificaciones o modificaciones sin guardar en la rúbrica. Si continúas, se descartarán los cambios pendientes. ¿Deseas cambiar de curso y salir sin guardar?'
        );
        if (!confirmar) {
          return false;
        }
        setHasUnsavedChanges(false);
      }

      // 2. Si ya es el grupo seleccionado y tenemos datos, no recargar forzosamente salvo que se indique forceReload
      if (grupoId === selectedGrupoId && cuadernoData && !forceReload) {
        return true;
      }

      // 3. Cancelar petición anterior en curso
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // 4. Actualizar estado y preparar nueva petición
      // Si cambiamos de curso, limpiamos los datos previos para evitar mezclar información.
      // Si es una recarga forzada del MISMO curso, conservamos los datos en memoria para no desmontar
      // las tablas ni hacer perder el foco o los valores de los inputs al usuario.
      if (grupoId !== selectedGrupoId) {
        setCuadernoData(null);
      }
      setSelectedGrupoId(grupoId);
      setCuadernoError(null);
      setIsLoadingCuaderno(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;
      activeRequestGrupoIdRef.current = grupoId;

      try {
        const data = await fetchCuadernoGrupo(grupoId, controller.signal);

        // Seguridad de concurrencia: aplicar solo si sigue siendo el grupo objetivo
        if (activeRequestGrupoIdRef.current === grupoId) {
          setCuadernoData(data);
          setConnectionInfo({
            status: 'connected',
            label: 'Conectado a Supabase',
            details: 'Datos del grupo recuperados con éxito.',
            lastChecked: new Date(),
          });
        }
        return true;
      } catch (err: any) {
        if (err.name === 'AbortError') {
          return false;
        }

        if (activeRequestGrupoIdRef.current === grupoId) {
          console.error('[CuadernoContext] Error cargando cuaderno:', err);
          setCuadernoError(err?.message || 'No se pudieron recuperar los datos del grupo seleccionado.');
        }
        return false;
      } finally {
        if (activeRequestGrupoIdRef.current === grupoId) {
          setIsLoadingCuaderno(false);
        }
      }
    },
    [hasUnsavedChanges, selectedGrupoId, cuadernoData]
  );

  // Cargar cuaderno cuando cambia selectedGrupoId si aún no está cargado
  useEffect(() => {
    if (selectedGrupoId && (!cuadernoData || cuadernoData.grupo?.id !== selectedGrupoId) && !isLoadingCuaderno) {
      selectGrupo(selectedGrupoId);
    }
  }, [selectedGrupoId]);

  // Recargar cuaderno del grupo activo forzando actualización desde Supabase
  const refreshCuaderno = useCallback(async (forceReload = true) => {
    if (!selectedGrupoId) return;
    await selectGrupo(selectedGrupoId, true, forceReload);
  }, [selectedGrupoId, selectGrupo]);

  // Actualización de datos del cuaderno
  const updateCuadernoData = useCallback((newData: CuadernoGrupoData) => {
    setCuadernoData(newData);
  }, []);

  const updateCalificaciones = useCallback(
    (nuevasCalifs: Calificacion[]) => {
      setCuadernoData((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          calificaciones: nuevasCalifs,
          estadisticas: {
            ...prev.estadisticas,
            totalCalificaciones: nuevasCalifs.length,
          },
        };
      });
    },
    []
  );

  const updateCalificacionesApartados = useCallback(
    (nuevasApartados: CalificacionApartado[]) => {
      setCuadernoData((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          calificacionesApartados: nuevasApartados,
          estadisticas: {
            ...prev.estadisticas,
            totalCalificacionesApartados: nuevasApartados.length,
          },
        };
      });
    },
    []
  );

  const updateRubrica = useCallback(
    (rubricaActualizada: Rubrica) => {
      setCuadernoData((prev) => {
        if (!prev) return null;
        const rubricasActualizadas = (prev.rubricas || []).map((r) =>
          r.id === rubricaActualizada.id ? rubricaActualizada : r
        );
        const actividadesActualizadas = (prev.actividades || []).map((a) =>
          a.rubrica_id === rubricaActualizada.id ? { ...a, nombre: rubricaActualizada.titulo } : a
        );
        return {
          ...prev,
          rubricas: rubricasActualizadas,
          actividades: actividadesActualizadas,
        };
      });
    },
    []
  );

  const addRubricaYActividad = useCallback(
    (nuevaRubrica: Rubrica, nuevaActividad: ActividadDetalle) => {
      setCuadernoData((prev) => {
        if (!prev) return null;
        const rubricasPrevias = prev.rubricas || [];
        const existsRubrica = rubricasPrevias.some((r) => r.id === nuevaRubrica.id);
        const rubricasActualizadas = existsRubrica
          ? rubricasPrevias.map((r) => (r.id === nuevaRubrica.id ? nuevaRubrica : r))
          : [nuevaRubrica, ...rubricasPrevias];

        const actividadesPrevias = prev.actividades || [];
        const existsActividad = actividadesPrevias.some((a) => a.id === nuevaActividad.id);
        const actividadesActualizadas = existsActividad
          ? actividadesPrevias.map((a) => (a.id === nuevaActividad.id ? nuevaActividad : a))
          : [nuevaActividad, ...actividadesPrevias];

        return {
          ...prev,
          rubricas: rubricasActualizadas,
          actividades: actividadesActualizadas,
          estadisticas: {
            ...prev.estadisticas,
            totalRubricas: rubricasActualizadas.length,
            totalActividades: actividadesActualizadas.length,
          },
        };
      });
    },
    []
  );

  const updateCriterioPonderacion = useCallback(
    (criterioId: number, ponderacion: number | null) => {
      setCuadernoData((prev) => {
        if (!prev) return null;
        const criteriosActualizados = (prev.criterios || []).map((c) =>
          c.id === criterioId ? { ...c, ponderacion } : c
        );
        return {
          ...prev,
          criterios: criteriosActualizados,
        };
      });
    },
    []
  );

  const updateCriteriosLote = useCallback(
    (nuevosCriterios: Criterio[]) => {
      setCuadernoData((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          criterios: nuevosCriterios,
        };
      });
    },
    []
  );

  const eliminarActividades = useCallback(
    async (actividadIds: string[]) => {
      if (!selectedGrupoId) {
        throw new Error('No hay ningún grupo seleccionado.');
      }
      const res = await eliminarActividadesLote(selectedGrupoId, actividadIds);
      const eliminadasSet = new Set(res.eliminadas);

      setCuadernoData((prev) => {
        if (!prev) return null;
        const actsRestantes = (prev.actividades || []).filter((a) => !eliminadasSet.has(a.id));
        const califsRestantes = (prev.calificaciones || []).filter((c) => !eliminadasSet.has(c.actividad_id));
        const apartadosRestantes = (prev.calificacionesApartados || []).filter(
          (ca) => !ca.actividad_id || !eliminadasSet.has(ca.actividad_id)
        );

        return {
          ...prev,
          actividades: actsRestantes,
          calificaciones: califsRestantes,
          calificacionesApartados: apartadosRestantes,
          estadisticas: {
            ...prev.estadisticas,
            totalActividades: actsRestantes.length,
          },
        };
      });

      return res;
    },
    [selectedGrupoId]
  );

  const eliminarRubricas = useCallback(
    async (rubricaIds: string[]) => {
      if (!selectedGrupoId) {
        throw new Error('No hay ningún grupo seleccionado.');
      }
      const res = await eliminarRubricasLote(selectedGrupoId, rubricaIds);
      const eliminadasSet = new Set(res.eliminadas);

      setCuadernoData((prev) => {
        if (!prev) return null;
        const rubsRestantes = (prev.rubricas || []).filter((r) => !eliminadasSet.has(r.id));

        // Identificar todas las actividades asociadas a las rúbricas eliminadas
        const actsAsociadasIds = new Set<string>(res.actividadesEliminadas || []);
        (prev.actividades || []).forEach((a) => {
          if (a.rubrica_id && eliminadasSet.has(a.rubrica_id)) {
            actsAsociadasIds.add(a.id);
          }
        });

        const actsRestantes = (prev.actividades || []).filter(
          (a) => (!a.rubrica_id || !eliminadasSet.has(a.rubrica_id)) && !actsAsociadasIds.has(a.id)
        );
        const califsRestantes = (prev.calificaciones || []).filter(
          (c) => !actsAsociadasIds.has(c.actividad_id)
        );
        const apartadosRestantes = (prev.calificacionesApartados || []).filter(
          (ca) => !eliminadasSet.has(ca.rubrica_id) && (!ca.actividad_id || !actsAsociadasIds.has(ca.actividad_id))
        );

        return {
          ...prev,
          rubricas: rubsRestantes,
          actividades: actsRestantes,
          calificaciones: califsRestantes,
          calificacionesApartados: apartadosRestantes,
          estadisticas: {
            ...prev.estadisticas,
            totalRubricas: rubsRestantes.length,
            totalActividades: actsRestantes.length,
          },
        };
      });

      return res;
    },
    [selectedGrupoId]
  );

  const selectedGrupo = grupos.find((g) => g.id === selectedGrupoId) || null;

  const cursoTheme = useMemo(() => {
    return getCursoColorTheme(selectedGrupo?.nombre || null);
  }, [selectedGrupo?.nombre]);

  return (
    <CuadernoContext.Provider
      value={{
        grupos,
        selectedGrupoId,
        selectedGrupo,
        selectGrupo,
        isLoadingGrupos,
        gruposError,
        refreshGrupos,

        selectedEvaluacion,
        setSelectedEvaluacion,
        activeTab,
        setActiveTab,

        cuadernoData,
        isLoadingCuaderno,
        cuadernoError,
        refreshCuaderno,
        updateCuadernoData,
        updateCalificaciones,
        updateCalificacionesApartados,
        updateRubrica,
        addRubricaYActividad,
        updateCriterioPonderacion,
        updateCriteriosLote,
        eliminarActividades,
        eliminarRubricas,

        hasUnsavedChanges,
        setHasUnsavedChanges,

        connectionInfo,
        checkServerConnection,

        cursoTheme,
      }}
    >
      {children}
    </CuadernoContext.Provider>
  );
};

export function useCuaderno(): CuadernoContextValue {
  const context = useContext(CuadernoContext);
  if (!context) {
    return {
      grupos: [],
      selectedGrupoId: null,
      selectedGrupo: null,
      selectGrupo: async () => false,
      isLoadingGrupos: false,
      gruposError: null,
      refreshGrupos: async () => {},
      selectedEvaluacion: '1.º Ev',
      setSelectedEvaluacion: () => {},
      activeTab: 'actividades',
      setActiveTab: () => {},
      cuadernoData: null,
      isLoadingCuaderno: false,
      cuadernoError: null,
      refreshCuaderno: async () => {},
      updateCuadernoData: () => {},
      updateCalificaciones: () => {},
      updateCalificacionesApartados: () => {},
      updateRubrica: () => {},
      addRubricaYActividad: () => {},
      updateCriterioPonderacion: () => {},
      updateCriteriosLote: () => {},
      eliminarActividades: async () => ({ success: false, eliminadas: [] }),
      eliminarRubricas: async () => ({ success: false, eliminadas: [], actividadesEliminadas: [] }),
      hasUnsavedChanges: false,
      setHasUnsavedChanges: () => {},
      connectionInfo: {
        status: 'firebase_only',
        label: 'Sesión no iniciada',
        details: 'Inicia sesión con Google para conectar con el servidor.',
      },
      checkServerConnection: async () => {},
      cursoTheme: getCursoColorTheme(null),
    };
  }
  return context;
}
