-- ==============================================================================
-- Migración: Creación y corrección de la función RPC public.persistir_calificaciones_lote
-- Archivo: supabase/migrations/20261015000200_create_persistir_calificaciones_lote.sql
-- Objetivo: Crear de forma atómica y segura la función de persistencia de calificaciones
--           generales de actividades en Supabase, corrigiendo el error de INTERSECT y
--           asegurando la compatibilidad estricta de tipos en el bloqueo transaccional.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.persistir_calificaciones_lote(
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

    IF p_guardar IS NULL THEN
        p_guardar := '[]'::jsonb;
    END IF;

    IF p_retirar IS NULL THEN
        p_retirar := '[]'::jsonb;
    END IF;

    v_total_operaciones := jsonb_array_length(p_guardar) + jsonb_array_length(p_retirar);
    IF v_total_operaciones = 0 THEN
        RAISE EXCEPTION 'No se han proporcionado operaciones para guardar o retirar calificaciones';
    END IF;

    IF v_total_operaciones > 500 THEN
        RAISE EXCEPTION 'Límite excedido: no se pueden procesar más de 500 operaciones en un solo lote';
    END IF;

    -- 3. Validación de estructura de los elementos (todos deben ser objetos con alumnoId y actividadId válidos)
    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_guardar) elem
        WHERE jsonb_typeof(elem) <> 'object'
           OR pg_catalog.btrim(COALESCE(elem->>'alumno_id', elem->>'alumnoId', '')) = ''
           OR pg_catalog.btrim(COALESCE(elem->>'actividad_id', elem->>'actividadId', '')) = ''
    ) THEN
        RAISE EXCEPTION 'Cada elemento de p_guardar debe ser un objeto con alumnoId y actividadId válidos';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_retirar) elem
        WHERE jsonb_typeof(elem) <> 'object'
           OR pg_catalog.btrim(COALESCE(elem->>'alumno_id', elem->>'alumnoId', '')) = ''
           OR pg_catalog.btrim(COALESCE(elem->>'actividad_id', elem->>'actividadId', '')) = ''
    ) THEN
        RAISE EXCEPTION 'Cada elemento de p_retirar debe ser un objeto con alumnoId y actividadId válidos';
    END IF;

    -- 4. Validación de duplicados y coherencia interna:
    -- 4.1. Rechazo explícito de pares (alumno_id, actividad_id) duplicados dentro de p_guardar
    IF EXISTS (
        SELECT 1
        FROM (
            SELECT pg_catalog.btrim(COALESCE(elem->>'alumno_id', elem->>'alumnoId')) AS al_id,
                   pg_catalog.btrim(COALESCE(elem->>'actividad_id', elem->>'actividadId')) AS act_id
            FROM jsonb_array_elements(p_guardar) elem
        ) g
        GROUP BY al_id, act_id
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Duplicado detectado en p_guardar: se encontraron múltiples entradas para el mismo par (alumno, actividad)';
    END IF;

    -- 4.2. Rechazo explícito de pares (alumno_id, actividad_id) duplicados dentro de p_retirar
    IF EXISTS (
        SELECT 1
        FROM (
            SELECT pg_catalog.btrim(COALESCE(elem->>'alumno_id', elem->>'alumnoId')) AS al_id,
                   pg_catalog.btrim(COALESCE(elem->>'actividad_id', elem->>'actividadId')) AS act_id
            FROM jsonb_array_elements(p_retirar) elem
        ) r
        GROUP BY al_id, act_id
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Duplicado detectado en p_retirar: se encontraron múltiples entradas para el mismo par (alumno, actividad)';
    END IF;

    -- 4.3. Validación de coherencia entre listas: ningún par (alumno, actividad) puede figurar simultáneamente en guardar y retirar.
    -- Se utiliza INNER JOIN dentro de EXISTS para evitar la discrepancia en el número de columnas de INTERSECT.
    IF EXISTS (
        SELECT 1
        FROM (
            SELECT pg_catalog.btrim(COALESCE(elem->>'alumno_id', elem->>'alumnoId')) AS al_id,
                   pg_catalog.btrim(COALESCE(elem->>'actividad_id', elem->>'actividadId')) AS act_id
            FROM jsonb_array_elements(p_guardar) elem
        ) g
        INNER JOIN (
            SELECT pg_catalog.btrim(COALESCE(elem->>'alumno_id', elem->>'alumnoId')) AS al_id,
                   pg_catalog.btrim(COALESCE(elem->>'actividad_id', elem->>'actividadId')) AS act_id
            FROM jsonb_array_elements(p_retirar) elem
        ) r ON g.al_id = r.al_id AND g.act_id = r.act_id
    ) THEN
        RAISE EXCEPTION 'Incoherencia en lote: una o más calificaciones figuran simultáneamente en p_guardar y p_retirar';
    END IF;

    -- 5. Validación de notas en p_guardar (formato numérico no nulo, finito y en rango 0 a 10)
    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_guardar) elem
        WHERE (elem->>'nota') IS NULL
           OR pg_catalog.btrim(elem->>'nota') !~ '^[0-9]+(\.[0-9]+)?$'
           OR (elem->>'nota')::numeric < 0
           OR (elem->>'nota')::numeric > 10
    ) THEN
        RAISE EXCEPTION 'Calificación fuera del rango permitido (0-10) o no numérica detectada en p_guardar';
    END IF;

    -- 6. Validación de pertenencia de alumnos al grupo
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

    -- 7. Validación de pertenencia de actividades al grupo
    IF EXISTS (
        SELECT 1
        FROM (
            SELECT pg_catalog.btrim(COALESCE(elem->>'actividad_id', elem->>'actividadId')) AS act_id
            FROM jsonb_array_elements(p_guardar) elem
            UNION
            SELECT pg_catalog.btrim(COALESCE(elem->>'actividad_id', elem->>'actividadId')) AS act_id
            FROM jsonb_array_elements(p_retirar) elem
        ) sub
        WHERE NOT EXISTS (
            SELECT 1 FROM public.actividades act WHERE act.id = sub.act_id AND act.grupo_id = pg_catalog.btrim(p_grupo_id)
        )
    ) THEN
        RAISE EXCEPTION 'Una o más actividades no pertenecen al grupo %', p_grupo_id;
    END IF;

    -- 8. Prevención de conflictos entre grupos y carreras concurrentes:
    -- 8.1. Adquisición de bloqueo transaccional determinista a nivel de transacción (advisory xact lock)
    -- Se construye una clave prefijada por longitud (longitud:grupo:longitud:al_id:longitud:act_id)
    -- que previene cualquier ambigüedad de delimitadores y colisiones entre grupos distintos.
    -- Se convierte explícitamente a ::bigint para coincidir estrictamente con la firma pg_advisory_xact_lock(bigint).
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
                pg_catalog.length(ops.act_id)::text,
                ':',
                ops.act_id
            )
        ))::bigint
    )
    FROM (
        SELECT pg_catalog.btrim(COALESCE(elem->>'alumno_id', elem->>'alumnoId')) AS al_id,
               pg_catalog.btrim(COALESCE(elem->>'actividad_id', elem->>'actividadId')) AS act_id
        FROM jsonb_array_elements(p_guardar) elem
        UNION
        SELECT pg_catalog.btrim(COALESCE(elem->>'alumno_id', elem->>'alumnoId')) AS al_id,
               pg_catalog.btrim(COALESCE(elem->>'actividad_id', elem->>'actividadId')) AS act_id
        FROM jsonb_array_elements(p_retirar) elem
    ) ops
    ORDER BY ops.al_id, ops.act_id;

    -- 8.2. Bloqueo determinista a nivel de fila (FOR UPDATE) para cualquier fila existente en public.calificaciones
    PERFORM 1
    FROM public.calificaciones c
    JOIN (
        SELECT pg_catalog.btrim(COALESCE(elem->>'alumno_id', elem->>'alumnoId')) AS al_id,
               pg_catalog.btrim(COALESCE(elem->>'actividad_id', elem->>'actividadId')) AS act_id
        FROM jsonb_array_elements(p_guardar) elem
        UNION
        SELECT pg_catalog.btrim(COALESCE(elem->>'alumno_id', elem->>'alumnoId')) AS al_id,
               pg_catalog.btrim(COALESCE(elem->>'actividad_id', elem->>'actividadId')) AS act_id
        FROM jsonb_array_elements(p_retirar) elem
    ) ops ON ops.al_id = c.alumno_id AND ops.act_id = c.actividad_id
    ORDER BY c.alumno_id, c.actividad_id
    FOR UPDATE;

    -- 8.3. Verificación inmediata tras bloqueo: comprobar que ninguna tupla pertenezca a un grupo distinto
    IF EXISTS (
        SELECT 1
        FROM public.calificaciones c
        JOIN (
            SELECT pg_catalog.btrim(COALESCE(elem->>'alumno_id', elem->>'alumnoId')) AS al_id,
                   pg_catalog.btrim(COALESCE(elem->>'actividad_id', elem->>'actividadId')) AS act_id
            FROM jsonb_array_elements(p_guardar) elem
            UNION
            SELECT pg_catalog.btrim(COALESCE(elem->>'alumno_id', elem->>'alumnoId')) AS al_id,
                   pg_catalog.btrim(COALESCE(elem->>'actividad_id', elem->>'actividadId')) AS act_id
            FROM jsonb_array_elements(p_retirar) elem
        ) ops ON ops.al_id = c.alumno_id AND ops.act_id = c.actividad_id
        WHERE c.grupo_id IS DISTINCT FROM pg_catalog.btrim(p_grupo_id)
    ) THEN
        RAISE EXCEPTION 'Conflicto de grupo: una o más calificaciones pertenecen a un grupo distinto de %', p_grupo_id;
    END IF;

    -- 9. Ejecución atómica de RETIRADAS (pasar a pendiente mediante ausencia de fila en public.calificaciones)
    IF jsonb_array_length(p_retirar) > 0 THEN
        DELETE FROM public.calificaciones c
        WHERE c.grupo_id = pg_catalog.btrim(p_grupo_id)
          AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(p_retirar) elem
              WHERE pg_catalog.btrim(COALESCE(elem->>'alumno_id', elem->>'alumnoId')) = c.alumno_id
                AND pg_catalog.btrim(COALESCE(elem->>'actividad_id', elem->>'actividadId')) = c.actividad_id
          );
        GET DIAGNOSTICS v_retiradas = ROW_COUNT;
    END IF;

    -- 10. Ejecución atómica de GUARDADOS (upsert con nota numeric NOT NULL)
    IF jsonb_array_length(p_guardar) > 0 THEN
        v_esperadas_guardar := jsonb_array_length(p_guardar);

        WITH parsed AS (
            SELECT
                pg_catalog.btrim(p_grupo_id) AS grupo_id,
                pg_catalog.btrim(COALESCE(elem->>'alumno_id', elem->>'alumnoId')) AS alumno_id,
                pg_catalog.btrim(COALESCE(elem->>'actividad_id', elem->>'actividadId')) AS actividad_id,
                (elem->>'nota')::numeric AS nota,
                pg_catalog.now() AS updated_at
            FROM jsonb_array_elements(p_guardar) elem
        )
        INSERT INTO public.calificaciones (grupo_id, alumno_id, actividad_id, nota, updated_at)
        SELECT grupo_id, alumno_id, actividad_id, nota, updated_at
        FROM parsed
        ON CONFLICT (alumno_id, actividad_id)
        DO UPDATE SET
            nota = EXCLUDED.nota,
            updated_at = EXCLUDED.updated_at
        WHERE calificaciones.grupo_id = pg_catalog.btrim(p_grupo_id);
            
        GET DIAGNOSTICS v_guardadas = ROW_COUNT;

        -- Si la cláusula WHERE del DO UPDATE filtró alguna fila existente debido a conflicto de grupo_id,
        -- el conteo de filas afectadas v_guardadas será estrictamente menor que v_esperadas_guardar.
        -- Esto garantiza la detección determinista de cualquier conflicto de grupo y revierte toda la transacción.
        IF v_guardadas < v_esperadas_guardar THEN
            RAISE EXCEPTION 'Conflicto de grupo concurrente: se intentó guardar calificaciones que pertenecen a otro grupo (% esperadas, % procesadas)', v_esperadas_guardar, v_guardadas;
        END IF;
    END IF;

    -- 11. Consulta del estado consolidado dentro de la misma transacción
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', c.id,
                'grupo_id', c.grupo_id,
                'alumno_id', c.alumno_id,
                'actividad_id', c.actividad_id,
                'nota', c.nota,
                'updated_at', c.updated_at
            ) ORDER BY c.id ASC
        ),
        '[]'::jsonb
    ) INTO v_calificaciones
    FROM public.calificaciones c
    WHERE c.grupo_id = pg_catalog.btrim(p_grupo_id);

    -- 12. Respuesta estructurada confirmando la transacción completada
    RETURN jsonb_build_object(
        'success', true,
        'guardadas', v_guardadas,
        'retiradas', v_retiradas,
        'actualizadas', (v_guardadas + v_retiradas),
        'calificaciones', v_calificaciones
    );
END;
$$;

-- Revocar explícitamente permisos a PUBLIC, anon y authenticated; conceder ejecución exclusivamente a service_role
REVOKE ALL ON FUNCTION public.persistir_calificaciones_lote(text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.persistir_calificaciones_lote(text, jsonb, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.persistir_calificaciones_lote(text, jsonb, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.persistir_calificaciones_lote(text, jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION public.persistir_calificaciones_lote(text, jsonb, jsonb) IS
'Persistencia atómica transaccional de calificaciones generales de actividades para Fernanditio en Supabase (corregida sin INTERSECT).';
