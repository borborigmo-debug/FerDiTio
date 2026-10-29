-- ==============================================================================
-- Migración: Actualización de public.crear_rubrica_con_actividad con fecha_creacion (DATE Europe/Madrid)
-- Archivo: supabase/migrations/20261027000100_actualizar_crear_rubrica_con_actividad_fecha.sql
-- Objetivo: Añadir soporte para p_fecha_creacion timestamptz DEFAULT now() en la RPC
--           transaccional de rúbricas y actividades, convirtiendo explícitamente a DATE
--           en la zona horaria local de España ('Europe/Madrid') para preservar la fecha
--           local real de creación sin alterar el esquema existente de las tablas.
-- ==============================================================================

BEGIN;

-- 1. Eliminar versión anterior de 8 parámetros para prevenir sobrecargas ambiguas en PostgreSQL (sin CASCADE)
DROP FUNCTION IF EXISTS public.crear_rubrica_con_actividad(text, text, text, text, text, jsonb, text, text);

-- 2. Crear o reemplazar la función con la nueva firma de 9 parámetros
CREATE OR REPLACE FUNCTION public.crear_rubrica_con_actividad(
    p_grupo_id text,
    p_rubrica_id text,
    p_titulo text,
    p_tipo text,
    p_descripcion text DEFAULT NULL,
    p_items jsonb DEFAULT '[]'::jsonb,
    p_actividad_id text DEFAULT NULL,
    p_evaluacion_periodo text DEFAULT '1.º Ev',
    p_fecha_creacion timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_grupo_id text;
    v_rubrica_id text;
    v_actividad_id text;
    v_titulo text;
    v_tipo text;
    v_evaluacion_periodo text;
    v_descripcion text;
    v_fecha_creacion date;
    v_rubrica_creada jsonb;
    v_actividad_creada jsonb;
BEGIN
    -- 1. Validación de identificador de grupo y existencia real
    IF p_grupo_id IS NULL OR pg_catalog.btrim(p_grupo_id) = '' THEN
        RAISE EXCEPTION 'Parámetro p_grupo_id no puede ser nulo o vacío';
    END IF;
    v_grupo_id := pg_catalog.btrim(p_grupo_id);

    IF NOT EXISTS (SELECT 1 FROM public.grupos WHERE id = v_grupo_id) THEN
        RAISE EXCEPTION 'El grupo especificado (%) no existe en public.grupos', v_grupo_id;
    END IF;

    -- 2. Validación de identificador de rúbrica
    IF p_rubrica_id IS NULL OR pg_catalog.btrim(p_rubrica_id) = '' THEN
        RAISE EXCEPTION 'Parámetro p_rubrica_id no puede ser nulo o vacío';
    END IF;
    v_rubrica_id := pg_catalog.btrim(p_rubrica_id);

    IF EXISTS (SELECT 1 FROM public.rubricas WHERE id = v_rubrica_id) THEN
        RAISE EXCEPTION 'La rúbrica con ID % ya existe en public.rubricas', v_rubrica_id;
    END IF;

    -- 3. Identificador de actividad vinculada
    IF p_actividad_id IS NOT NULL AND pg_catalog.btrim(p_actividad_id) <> '' THEN
        v_actividad_id := pg_catalog.btrim(p_actividad_id);
    ELSE
        v_actividad_id := v_rubrica_id;
    END IF;

    IF EXISTS (SELECT 1 FROM public.actividades WHERE id = v_actividad_id) THEN
        RAISE EXCEPTION 'La actividad con ID % ya existe en public.actividades', v_actividad_id;
    END IF;

    -- 4. Validación de título
    IF p_titulo IS NULL OR pg_catalog.length(pg_catalog.btrim(p_titulo)) < 2 THEN
        RAISE EXCEPTION 'El título de la rúbrica y actividad es obligatorio (mínimo 2 caracteres)';
    END IF;
    v_titulo := pg_catalog.btrim(p_titulo);

    -- 5. Validación y normalización de tipo ('ACTIVIDAD', 'TRABAJO', 'EXAMEN')
    v_tipo := pg_catalog.upper(pg_catalog.btrim(COALESCE(p_tipo, 'ACTIVIDAD')));
    IF v_tipo NOT IN ('ACTIVIDAD', 'TRABAJO', 'EXAMEN') THEN
        v_tipo := 'ACTIVIDAD';
    END IF;

    -- 6. Validación de período de evaluación
    v_evaluacion_periodo := pg_catalog.btrim(COALESCE(p_evaluacion_periodo, '1.º Ev'));
    IF v_evaluacion_periodo NOT IN ('1.º Ev', '2.º Ev', '3.º Ev', 'Global') THEN
        v_evaluacion_periodo := '1.º Ev';
    END IF;

    -- 7. Descripción opcional
    v_descripcion := NULLIF(pg_catalog.btrim(p_descripcion), '');

    -- 8. Conversión explícita de timestamptz a DATE en la zona horaria local de España ('Europe/Madrid')
    IF p_fecha_creacion IS NOT NULL THEN
        v_fecha_creacion := (p_fecha_creacion AT TIME ZONE 'Europe/Madrid')::date;
    ELSE
        v_fecha_creacion := (pg_catalog.clock_timestamp() AT TIME ZONE 'Europe/Madrid')::date;
    END IF;

    -- 9. Validación de array de items (apartados)
    IF p_items IS NOT NULL AND jsonb_typeof(p_items) <> 'array' THEN
        RAISE EXCEPTION 'El parámetro p_items debe ser un array JSONB';
    END IF;
    IF p_items IS NULL THEN
        p_items := '[]'::jsonb;
    END IF;

    -- 10. Inserción atómica 1: Registro en public.rubricas (columna fecha_creacion DATE)
    INSERT INTO public.rubricas (
        id,
        grupo_id,
        titulo,
        tipo,
        descripcion,
        items,
        fecha_creacion
    ) VALUES (
        v_rubrica_id,
        v_grupo_id,
        v_titulo,
        v_tipo,
        v_descripcion,
        p_items,
        v_fecha_creacion
    )
    RETURNING jsonb_build_object(
        'id', id,
        'grupo_id', grupo_id,
        'titulo', titulo,
        'tipo', tipo,
        'descripcion', descripcion,
        'items', items,
        'fecha_creacion', fecha_creacion
    ) INTO v_rubrica_creada;

    -- 11. Inserción atómica 2: Registro en public.actividades (columna fecha_creacion DATE)
    INSERT INTO public.actividades (
        id,
        grupo_id,
        evaluacion_periodo,
        nombre,
        tipo,
        metodo,
        rubrica_id,
        fecha_creacion
    ) VALUES (
        v_actividad_id,
        v_grupo_id,
        v_evaluacion_periodo,
        v_titulo,
        v_tipo,
        'Rúbrica',
        v_rubrica_id,
        v_fecha_creacion
    )
    RETURNING jsonb_build_object(
        'id', id,
        'grupo_id', grupo_id,
        'evaluacion_periodo', evaluacion_periodo,
        'nombre', nombre,
        'tipo', tipo,
        'metodo', metodo,
        'rubrica_id', rubrica_id,
        'seccion_id', seccion_id,
        'fecha_creacion', fecha_creacion
    ) INTO v_actividad_creada;

    -- 12. Respuesta consolidada confirmando la transacción atómica
    RETURN jsonb_build_object(
        'success', true,
        'rubrica', v_rubrica_creada,
        'actividad', v_actividad_creada
    );
END;
$$;

-- Restricción de privilegios: función exclusiva de backend (service_role y postgres)
REVOKE ALL ON FUNCTION public.crear_rubrica_con_actividad(text, text, text, text, text, jsonb, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crear_rubrica_con_actividad(text, text, text, text, text, jsonb, text, text, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.crear_rubrica_con_actividad(text, text, text, text, text, jsonb, text, text, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.crear_rubrica_con_actividad(text, text, text, text, text, jsonb, text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.crear_rubrica_con_actividad(text, text, text, text, text, jsonb, text, text, timestamptz) TO postgres;

COMMENT ON FUNCTION public.crear_rubrica_con_actividad(text, text, text, text, text, jsonb, text, text, timestamptz) IS
'Creación atómica transaccional de rúbrica y actividad vinculada con fecha_creacion (DATE Europe/Madrid) en Supabase para Fernanditio.';

COMMIT;

