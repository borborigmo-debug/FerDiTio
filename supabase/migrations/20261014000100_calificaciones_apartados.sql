-- Migración: Tabla y Función RPC transaccional para persistencia de calificaciones individuales por apartado de rúbrica
-- Archivo: supabase/migrations/20261014000100_calificaciones_apartados.sql
-- Objetivo: Almacenar la calificación granular de cada apartado (UUID persistente) por alumno, actividad y rúbrica,
--           preservando intactas las calificaciones históricas de public.calificaciones y garantizando atomicidad estricta.

-- 1. Creación de la tabla public.calificaciones_apartados si no existe
CREATE TABLE IF NOT EXISTS public.calificaciones_apartados (
    id bigserial PRIMARY KEY,
    grupo_id text NOT NULL REFERENCES public.grupos(id) ON DELETE CASCADE,
    alumno_id text NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
    actividad_id text REFERENCES public.actividades(id) ON DELETE CASCADE,
    rubrica_id text NOT NULL REFERENCES public.rubricas(id) ON DELETE CASCADE,
    apartado_id text NOT NULL,
    nota numeric(5, 2) NOT NULL CHECK (nota >= 0 AND nota <= 10),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Restricción e índice de unicidad determinista basado en COALESCE(actividad_id, '')
-- Se eliminan versiones previas para garantizar correspondencia unívoca
DROP INDEX IF EXISTS public.uq_calif_apartado_registro;

-- El índice único evalúa COALESCE(actividad_id, '') permitiendo que tanto las evaluaciones
-- de rúbrica a nivel de grupo (actividad_id NULL) como las asociadas a actividades específicas
-- tengan un único registro por alumno, rúbrica y apartado.
CREATE UNIQUE INDEX IF NOT EXISTS uq_calif_apartado_registro 
ON public.calificaciones_apartados (alumno_id, (COALESCE(actividad_id, '')), rubrica_id, apartado_id);

-- 3. Índices de rendimiento para consultas del cuaderno y agregaciones
CREATE INDEX IF NOT EXISTS idx_calif_apartados_grupo 
ON public.calificaciones_apartados (grupo_id);

CREATE INDEX IF NOT EXISTS idx_calif_apartados_rubrica 
ON public.calificaciones_apartados (rubrica_id);

CREATE INDEX IF NOT EXISTS idx_calif_apartados_actividad 
ON public.calificaciones_apartados (actividad_id);

-- 4. Habilitar RLS y revocar acceso directo a roles no autorizados
ALTER TABLE public.calificaciones_apartados ENABLE ROW LEVEL SECURITY;

-- Revocar acceso directo a la tabla y su secuencia para PUBLIC, anon y authenticated
REVOKE ALL ON TABLE public.calificaciones_apartados FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.calificaciones_apartados_id_seq FROM PUBLIC, anon, authenticated;

-- Conceder privilegios exclusivos necesarios para el rol de servicio (backend y Edge Functions)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.calificaciones_apartados TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.calificaciones_apartados_id_seq TO service_role;

-- Política de RLS exclusiva para service_role (Edge Functions con verificación docente)
DROP POLICY IF EXISTS "Acceso total service_role calificaciones_apartados" ON public.calificaciones_apartados;
CREATE POLICY "Acceso total service_role calificaciones_apartados"
ON public.calificaciones_apartados
TO service_role
USING (true)
WITH CHECK (true);

-- 5. Función RPC atómica para persistencia en lote de calificaciones por apartado
CREATE OR REPLACE FUNCTION public.persistir_calificaciones_apartados_lote(
    p_grupo_id text,
    p_guardar jsonb DEFAULT '[]'::jsonb,
    p_retirar jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_retiradas integer := 0;
    v_guardadas integer := 0;
    v_esperadas_guardar integer := 0;
    v_calificaciones jsonb;
    v_total_operaciones integer := 0;
BEGIN
    -- 1. Validaciones iniciales del identificador de grupo
    IF p_grupo_id IS NULL OR pg_catalog.btrim(p_grupo_id) = '' THEN
        RAISE EXCEPTION 'Parámetro p_grupo_id no puede ser nulo o vacío';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.grupos WHERE id = pg_catalog.btrim(p_grupo_id)) THEN
        RAISE EXCEPTION 'El grupo especificado (%) no existe en public.grupos', p_grupo_id;
    END IF;

    -- 2. Validación y normalización de parámetros JSONB
    IF p_guardar IS NOT NULL AND jsonb_typeof(p_guardar) <> 'array' THEN
        RAISE EXCEPTION 'El parámetro p_guardar debe ser un array JSONB';
    END IF;

    IF p_retirar IS NOT NULL AND jsonb_typeof(p_retirar) <> 'array' THEN
        RAISE EXCEPTION 'El parámetro p_retirar debe ser un array JSONB';
    END IF;

    IF p_guardar IS NULL THEN p_guardar := '[]'::jsonb; END IF;
    IF p_retirar IS NULL THEN p_retirar := '[]'::jsonb; END IF;

    v_total_operaciones := jsonb_array_length(p_guardar) + jsonb_array_length(p_retirar);
    IF v_total_operaciones = 0 THEN
        RAISE EXCEPTION 'No se han proporcionado operaciones de apartados para guardar o retirar';
    END IF;

    IF v_total_operaciones > 500 THEN
        RAISE EXCEPTION 'Límite excedido: no se pueden procesar más de 500 operaciones de apartados en un solo lote';
    END IF;

    -- 3. Validación de estructura de los elementos
    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_guardar) elem
        WHERE jsonb_typeof(elem) <> 'object'
           OR pg_catalog.btrim(COALESCE(elem->>'alumno_id', elem->>'alumnoId', '')) = ''
           OR pg_catalog.btrim(COALESCE(elem->>'rubrica_id', elem->>'rubricaId', '')) = ''
           OR pg_catalog.btrim(COALESCE(elem->>'apartado_id', elem->>'apartadoId', '')) = ''
    ) THEN
        RAISE EXCEPTION 'Cada elemento de p_guardar debe ser un objeto con alumnoId, rubricaId y apartadoId válidos';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_retirar) elem
        WHERE jsonb_typeof(elem) <> 'object'
           OR pg_catalog.btrim(COALESCE(elem->>'alumno_id', elem->>'alumnoId', '')) = ''
           OR pg_catalog.btrim(COALESCE(elem->>'rubrica_id', elem->>'rubricaId', '')) = ''
           OR pg_catalog.btrim(COALESCE(elem->>'apartado_id', elem->>'apartadoId', '')) = ''
    ) THEN
        RAISE EXCEPTION 'Cada elemento de p_retirar debe ser un objeto con alumnoId, rubricaId y apartadoId válidos';
    END IF;

    -- 4. Validación de notas en p_guardar (formato numérico finito y en rango 0 a 10)
    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_guardar) elem
        WHERE (elem->>'nota') IS NULL
           OR pg_catalog.btrim(elem->>'nota') !~ '^[0-9]+(\.[0-9]+)?$'
           OR (elem->>'nota')::numeric < 0
           OR (elem->>'nota')::numeric > 10
    ) THEN
        RAISE EXCEPTION 'Calificación de apartado fuera del rango permitido (0-10) o no numérica detectada en p_guardar';
    END IF;

    -- 5. Validación de duplicados y coherencia interna:
    -- 5.1. Rechazo de tuplas duplicadas dentro de p_guardar
    IF EXISTS (
        SELECT 1
        FROM (
            SELECT pg_catalog.btrim(COALESCE(elem->>'alumno_id', elem->>'alumnoId')) AS al_id,
                   pg_catalog.btrim(COALESCE(elem->>'rubrica_id', elem->>'rubricaId')) AS rub_id,
                   pg_catalog.btrim(COALESCE(elem->>'apartado_id', elem->>'apartadoId')) AS ap_id,
                   pg_catalog.btrim(COALESCE(elem->>'actividad_id', elem->>'actividadId', '')) AS act_id
            FROM jsonb_array_elements(p_guardar) elem
        ) g
        GROUP BY al_id, rub_id, ap_id, act_id
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Duplicado detectado en p_guardar: se encontraron múltiples entradas para el mismo apartado de alumno';
    END IF;

    -- 5.2. Rechazo de tuplas duplicadas dentro de p_retirar
    IF EXISTS (
        SELECT 1
        FROM (
            SELECT pg_catalog.btrim(COALESCE(elem->>'alumno_id', elem->>'alumnoId')) AS al_id,
                   pg_catalog.btrim(COALESCE(elem->>'rubrica_id', elem->>'rubricaId')) AS rub_id,
                   pg_catalog.btrim(COALESCE(elem->>'apartado_id', elem->>'apartadoId')) AS ap_id,
                   pg_catalog.btrim(COALESCE(elem->>'actividad_id', elem->>'actividadId', '')) AS act_id
            FROM jsonb_array_elements(p_retirar) elem
        ) r
        GROUP BY al_id, rub_id, ap_id, act_id
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Duplicado detectado en p_retirar: se encontraron múltiples entradas para el mismo apartado de alumno';
    END IF;

    -- 5.3. Rechazo de tuplas presentes simultáneamente en p_guardar y p_retirar
    IF EXISTS (
        SELECT 1
        FROM (
            SELECT pg_catalog.btrim(COALESCE(elem->>'alumno_id', elem->>'alumnoId')) AS al_id,
                   pg_catalog.btrim(COALESCE(elem->>'rubrica_id', elem->>'rubricaId')) AS rub_id,
                   pg_catalog.btrim(COALESCE(elem->>'apartado_id', elem->>'apartadoId')) AS ap_id,
                   pg_catalog.btrim(COALESCE(elem->>'actividad_id', elem->>'actividadId', '')) AS act_id
            FROM jsonb_array_elements(p_guardar) elem
        ) g
        INTERSECT
        SELECT pg_catalog.btrim(COALESCE(elem->>'alumno_id', elem->>'alumnoId')) AS al_id,
               pg_catalog.btrim(COALESCE(elem->>'rubrica_id', elem->>'rubricaId')) AS rub_id,
               pg_catalog.btrim(COALESCE(elem->>'apartado_id', elem->>'apartadoId')) AS ap_id,
               pg_catalog.btrim(COALESCE(elem->>'actividad_id', elem->>'actividadId', '')) AS act_id
        FROM jsonb_array_elements(p_retirar) elem
    ) THEN
        RAISE EXCEPTION 'Incoherencia en lote: una o más calificaciones de apartados figuran simultáneamente en p_guardar y p_retirar';
    END IF;

    -- 6. Validación de pertenencia de entidades al grupo
    -- 6.1. Alumnos
    IF EXISTS (
        SELECT 1
        FROM (
            SELECT pg_catalog.btrim(COALESCE(elem->>'alumno_id', elem->>'alumnoId')) AS al_id
            FROM jsonb_array_elements(p_guardar) elem
            UNION
            SELECT pg_catalog.btrim(COALESCE(elem->>'alumno_id', elem->>'alumnoId')) AS al_id
            FROM jsonb_array_elements(p_retirar) elem
        ) sub
        WHERE NOT EXISTS (
            SELECT 1 FROM public.alumnos a WHERE a.id = sub.al_id AND a.grupo_id = pg_catalog.btrim(p_grupo_id)
        )
    ) THEN
        RAISE EXCEPTION 'Uno o más alumnos no pertenecen al grupo %', p_grupo_id;
    END IF;

    -- 6.2. Rúbricas
    IF EXISTS (
        SELECT 1
        FROM (
            SELECT pg_catalog.btrim(COALESCE(elem->>'rubrica_id', elem->>'rubricaId')) AS rub_id
            FROM jsonb_array_elements(p_guardar) elem
            UNION
            SELECT pg_catalog.btrim(COALESCE(elem->>'rubrica_id', elem->>'rubricaId')) AS rub_id
            FROM jsonb_array_elements(p_retirar) elem
        ) sub
        WHERE NOT EXISTS (
            SELECT 1 FROM public.rubricas r WHERE r.id = sub.rub_id AND r.grupo_id = pg_catalog.btrim(p_grupo_id)
        )
    ) THEN
        RAISE EXCEPTION 'Una o más rúbricas no pertenecen al grupo %', p_grupo_id;
    END IF;

    -- 6.3. Actividades (para todas las actividades no nulas y no vacías especificadas)
    IF EXISTS (
        SELECT 1
        FROM (
            SELECT NULLIF(pg_catalog.btrim(COALESCE(elem->>'actividad_id', elem->>'actividadId', '')), '') AS act_id
            FROM jsonb_array_elements(p_guardar) elem
            UNION
            SELECT NULLIF(pg_catalog.btrim(COALESCE(elem->>'actividad_id', elem->>'actividadId', '')), '') AS act_id
            FROM jsonb_array_elements(p_retirar) elem
        ) sub
        WHERE sub.act_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM public.actividades act WHERE act.id = sub.act_id AND act.grupo_id = pg_catalog.btrim(p_grupo_id)
          )
    ) THEN
        RAISE EXCEPTION 'Una o más actividades no pertenecen al grupo %', p_grupo_id;
    END IF;

    -- 7. Adquisición de bloqueo transaccional determinista (advisory xact lock)
    -- COMPATIBILIDAD DE FIRMAS POSTGRESQL:
    -- En el catálogo de PostgreSQL (pg_proc), pg_advisory_xact_lock admite dos firmas:
    --   1) pg_advisory_xact_lock(bigint) -> clave de 64 bits (int8)
    --   2) pg_advisory_xact_lock(integer, integer) -> dos claves de 32 bits (int4, int4)
    -- pg_catalog.hashtext(text) retorna un entero de 32 bits con signo (int4).
    -- La invocación pg_advisory_xact_lock(hashtext(...)) sin conversión depende de
    -- la regla de coerción implícita de tipos (int4 -> int8).
    -- Para garantizar compatibilidad formal estricta con la firma de 1 argumento (bigint),
    -- se aplica un cast explícito a ::bigint.
    --
    -- DETERMINISMO Y PREVENCIÓN DE AMBIGÜEDAD:
    -- Se prefija cada componente con su longitud exacta en caracteres (longitud:valor)
    -- y se incluye p_grupo_id. Esto previene cualquier ambigüedad o colisión de delimitadores
    -- si los identificadores contienen dos puntos u otros caracteres especiales.
    -- Los bloqueos se adquieren en orden canónico (ORDER BY) para prevenir interbloqueos (deadlocks)
    -- y se liberan automáticamente al finalizar la transacción (COMMIT o ROLLBACK).
    PERFORM pg_catalog.pg_advisory_xact_lock(
        (pg_catalog.hashtext(
            pg_catalog.concat(
                pg_catalog.length(p_grupo_id)::text,
                ':',
                p_grupo_id,
                ':',
                pg_catalog.length(ops.al_id)::text,
                ':',
                ops.al_id,
                ':',
                pg_catalog.length(ops.rub_id)::text,
                ':',
                ops.rub_id,
                ':',
                pg_catalog.length(ops.ap_id)::text,
                ':',
                ops.ap_id,
                ':',
                pg_catalog.length(ops.act_id)::text,
                ':',
                ops.act_id
            )
        ))::bigint
    )
    FROM (
        SELECT pg_catalog.btrim(COALESCE(elem->>'alumno_id', elem->>'alumnoId')) AS al_id,
               pg_catalog.btrim(COALESCE(elem->>'rubrica_id', elem->>'rubricaId')) AS rub_id,
               pg_catalog.btrim(COALESCE(elem->>'apartado_id', elem->>'apartadoId')) AS ap_id,
               pg_catalog.btrim(COALESCE(elem->>'actividad_id', elem->>'actividadId', '')) AS act_id
        FROM jsonb_array_elements(p_guardar) elem
        UNION
        SELECT pg_catalog.btrim(COALESCE(elem->>'alumno_id', elem->>'alumnoId')) AS al_id,
               pg_catalog.btrim(COALESCE(elem->>'rubrica_id', elem->>'rubricaId')) AS rub_id,
               pg_catalog.btrim(COALESCE(elem->>'apartado_id', elem->>'apartadoId')) AS ap_id,
               pg_catalog.btrim(COALESCE(elem->>'actividad_id', elem->>'actividadId', '')) AS act_id
        FROM jsonb_array_elements(p_retirar) elem
    ) ops
    ORDER BY ops.al_id, ops.rub_id, ops.ap_id, ops.act_id;

    -- 8. Ejecución de RETIRADAS (pasar apartado a pendiente de evaluar mediante eliminación)
    IF jsonb_array_length(p_retirar) > 0 THEN
        DELETE FROM public.calificaciones_apartados ca
        WHERE ca.grupo_id = pg_catalog.btrim(p_grupo_id)
          AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(p_retirar) elem
              WHERE pg_catalog.btrim(COALESCE(elem->>'alumno_id', elem->>'alumnoId')) = ca.alumno_id
                AND pg_catalog.btrim(COALESCE(elem->>'apartado_id', elem->>'apartadoId')) = ca.apartado_id
                AND pg_catalog.btrim(COALESCE(elem->>'rubrica_id', elem->>'rubricaId')) = ca.rubrica_id
                AND NULLIF(pg_catalog.btrim(COALESCE(elem->>'actividad_id', elem->>'actividadId', '')), '') IS NOT DISTINCT FROM ca.actividad_id
          );
        GET DIAGNOSTICS v_retiradas = ROW_COUNT;
    END IF;

    -- 9. Ejecución de GUARDADOS (upsert con nota numeric y ON CONFLICT explícito)
    -- Se utiliza la sintaxis con paréntesis obligatorios (COALESCE(actividad_id, ''))
    -- para inferir de manera determinista el índice único uq_calif_apartado_registro.
    IF jsonb_array_length(p_guardar) > 0 THEN
        v_esperadas_guardar := jsonb_array_length(p_guardar);

        WITH parsed AS (
            SELECT
                pg_catalog.btrim(p_grupo_id) AS grupo_id,
                pg_catalog.btrim(COALESCE(elem->>'alumno_id', elem->>'alumnoId')) AS alumno_id,
                NULLIF(pg_catalog.btrim(COALESCE(elem->>'actividad_id', elem->>'actividadId', '')), '') AS actividad_id,
                pg_catalog.btrim(COALESCE(elem->>'rubrica_id', elem->>'rubricaId')) AS rubrica_id,
                pg_catalog.btrim(COALESCE(elem->>'apartado_id', elem->>'apartadoId')) AS apartado_id,
                (elem->>'nota')::numeric AS nota,
                pg_catalog.now() AS updated_at
            FROM jsonb_array_elements(p_guardar) elem
        )
        INSERT INTO public.calificaciones_apartados AS ca (
            grupo_id, alumno_id, actividad_id, rubrica_id, apartado_id, nota, updated_at
        )
        SELECT grupo_id, alumno_id, actividad_id, rubrica_id, apartado_id, nota, updated_at
        FROM parsed
        ON CONFLICT (alumno_id, (COALESCE(actividad_id, '')), rubrica_id, apartado_id)
        DO UPDATE SET
            nota = EXCLUDED.nota,
            updated_at = EXCLUDED.updated_at
        WHERE ca.grupo_id = pg_catalog.btrim(p_grupo_id);

        GET DIAGNOSTICS v_guardadas = ROW_COUNT;

        IF v_guardadas < v_esperadas_guardar THEN
            RAISE EXCEPTION 'Conflicto de grupo concurrente: se intentó guardar calificaciones de apartados pertenecientes a otro grupo (% esperadas, % procesadas)', v_esperadas_guardar, v_guardadas;
        END IF;
    END IF;

    -- 10. Consulta y retorno del estado consolidado de apartados para el grupo
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', ca.id,
                'grupo_id', ca.grupo_id,
                'alumno_id', ca.alumno_id,
                'actividad_id', ca.actividad_id,
                'rubrica_id', ca.rubrica_id,
                'apartado_id', ca.apartado_id,
                'nota', ca.nota,
                'updated_at', ca.updated_at
            ) ORDER BY ca.id ASC
        ),
        '[]'::jsonb
    ) INTO v_calificaciones
    FROM public.calificaciones_apartados ca
    WHERE ca.grupo_id = pg_catalog.btrim(p_grupo_id);

    RETURN jsonb_build_object(
        'success', true,
        'guardadas', v_guardadas,
        'retiradas', v_retiradas,
        'actualizadas', (v_guardadas + v_retiradas),
        'calificacionesApartados', v_calificaciones
    );
END;
$$;

-- Permisos estrictos: solo service_role puede ejecutar la RPC
REVOKE ALL ON FUNCTION public.persistir_calificaciones_apartados_lote(text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.persistir_calificaciones_apartados_lote(text, jsonb, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.persistir_calificaciones_apartados_lote(text, jsonb, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.persistir_calificaciones_apartados_lote(text, jsonb, jsonb) TO service_role;

COMMENT ON TABLE public.calificaciones_apartados IS 
'Calificaciones individuales y atómicas por apartado de rúbrica para Fernanditio.';

COMMENT ON FUNCTION public.persistir_calificaciones_apartados_lote(text, jsonb, jsonb) IS
'Persistencia atómica transaccional de calificaciones granulares por apartado de rúbrica en Supabase.';
