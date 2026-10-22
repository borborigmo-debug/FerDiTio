/**
 * Edge Function: fernanditio-data
 * Proyecto Supabase: https://bdtkdyzmpbijvwwsbxpa.supabase.co
 *
 * Módulo de lectura segura para Fernanditio (Fase 1: Grupos).
 * Valida criptográficamente el Firebase ID Token contra los JWKS oficiales de Google
 * para el proyecto Firebase 'eastern-deck-8pthm'. Resuelve el profesor por email verificado
 * y devuelve exclusivamente los grupos que le pertenecen.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import * as jose from "https://esm.sh/jose@4.14.4";

 // 1. Orígenes autorizados confirmados para esta aplicación
const ALLOWED_ORIGINS = [
  "https://ais-dev-xvmxpcqhfojwyhwcx3ymoc-404672769980.europe-west1.run.app",
  "https://ais-pre-xvmxpcqhfojwyhwcx3ymoc-404672769980.europe-west1.run.app",
  "https://ferditio.ai.studio",
  "https://fernanditio.ai.studio",
  "http://localhost:3000",
];

function getCorsHeaders(req: Request): { headers: Record<string, string>; isAllowed: boolean } {
  const origin = req.headers.get("origin") || "";
  const customOrigin = Deno.env.get("ALLOWED_ORIGIN");
  const isAllowed = ALLOWED_ORIGINS.includes(origin) || (Boolean(customOrigin) && origin === customOrigin);

  return {
    headers: {
      "Access-Control-Allow-Origin": isAllowed ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Vary": "Origin",
    },
    isAllowed: !origin || isAllowed, // Permite peticiones sin cabecera origin (curl/servidor) o orígenes validados
  };
}

// 2. Claves públicas oficiales de Google para verificación de Firebase ID Tokens
const FIREBASE_PROJECT_ID = "eastern-deck-8pthm";
const GOOGLE_JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const remoteJWKS = jose.createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));

serve(async (req: Request) => {
  const { headers: corsHeaders, isAllowed } = getCorsHeaders(req);

  // Manejo de preflight CORS (OPTIONS)
  if (req.method === "OPTIONS") {
    if (!isAllowed) {
      return new Response(
        JSON.stringify({ error: "Origen no autorizado por política CORS." }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response("ok", { headers: corsHeaders });
  }

  // Rechazo de orígenes no autorizados en peticiones estándar
  if (!isAllowed) {
    return new Response(
      JSON.stringify({ error: "Origen no autorizado por política CORS." }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // Se admiten métodos GET y POST
    if (req.method !== "GET" && req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Método no permitido. Solo se admiten GET y POST." }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Comprobar cabecera Authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Cabecera de autorización ausente o inválida. Se requiere token Bearer." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Token de autenticación vacío." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Validación criptográfica estricta del token de Firebase (algoritmo RS256, emisor y audiencia)
    let payload: jose.JWTPayload;
    try {
      const verifyResult = await jose.jwtVerify(token, remoteJWKS, {
        algorithms: ["RS256"],
        issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
        audience: FIREBASE_PROJECT_ID,
      });
      payload = verifyResult.payload;
    } catch {
      return new Response(
        JSON.stringify({ error: "Token de Firebase inválido, caducado o con firma no reconocida." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Verificación estricta de sub, email y email_verified
    const rawSub = payload.sub;
    if (typeof rawSub !== "string" || rawSub.trim() === "") {
      return new Response(
        JSON.stringify({ error: "El token no contiene un identificador de sujeto (sub) válido." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (payload.email_verified !== true) {
      return new Response(
        JSON.stringify({ error: "El correo electrónico asociado al token no ha sido verificado por Google." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawEmail = payload.email;
    if (typeof rawEmail !== "string" || rawEmail.trim() === "") {
      return new Response(
        JSON.stringify({ error: "El token no contiene una dirección de correo electrónico válida." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalización de email para comparación coherente sin alterar la base de datos
    const normalizedEmail = rawEmail.trim().toLowerCase();

    // 5. Inicializar cliente administrativo de Supabase exclusivamente desde secretos del servidor
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Error de configuración interna del servidor." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 6. Resolver identidad del profesor en public.profesores mediante coincidencia EXACTA
    // Se utiliza el operador .eq() para garantizar igualdad estricta ('email = $1') en SQL,
    // eliminando cualquier interpretación de comodines ('%' o '_') o coincidencias parciales.
    let { data: profesor, error: profError } = await supabase
      .from("profesores")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    // Si no se encuentra en minúsculas y el correo original contenía mayúsculas,
    // se realiza una comprobación estricta exacta con el valor recortado original.
    if (!profError && !profesor && rawEmail.trim() !== normalizedEmail) {
      const fallbackResult = await supabase
        .from("profesores")
        .select("id")
        .eq("email", rawEmail.trim())
        .maybeSingle();
      profesor = fallbackResult.data;
      profError = fallbackResult.error;
    }

    if (profError) {
      return new Response(
        JSON.stringify({ error: "Error al verificar el registro del docente." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!profesor) {
      if (req.method === "POST") {
        return new Response(
          JSON.stringify({ error: "Docente no registrado en la base de datos de Fernanditio." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // El correo es válido en Firebase pero no tiene ficha en public.profesores
      return new Response(
        JSON.stringify({ groups: [], error: null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);

    // =========================================================================
    // 7. RUTA C (POST): Registro y persistencia segura de calificaciones en Supabase
    // =========================================================================
    if (req.method === "POST") {
      const contentType = req.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        return new Response(
          JSON.stringify({ error: "El cuerpo de la petición debe ser de tipo application/json." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let body: any;
      try {
        body = await req.json();
      } catch {
        return new Response(
          JSON.stringify({ error: "Cuerpo JSON malformado." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // =========================================================================
      // GESTIÓN DE CURSOS (GRUPOS) A NIVEL DE PROFESOR
      // =========================================================================
      if (body?.tipo === 'crear_grupo') {
        const rawNombre = typeof body?.nombre === 'string' ? body.nombre.trim() : '';
        if (!rawNombre || rawNombre.length < 2) {
          return new Response(
            JSON.stringify({ error: "El nombre del curso es obligatorio (mínimo 2 caracteres)." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const nuevoGrupoId = crypto.randomUUID().toLowerCase();
        const { data: nuevoGrupo, error: insertError } = await supabase
          .from("grupos")
          .insert({
            id: nuevoGrupoId,
            profesor_id: profesor.id,
            nombre: rawNombre,
            oculto: false,
          })
          .select("id, profesor_id, nombre, oculto, created_at, updated_at")
          .single();

        if (insertError) {
          return new Response(
            JSON.stringify({ error: `Error al crear el curso en Supabase: ${insertError.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, grupo: nuevoGrupo }),
          { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (body?.tipo === 'eliminar_grupos') {
        const grupoIds = Array.isArray(body?.grupoIds)
          ? body.grupoIds.map((id: any) => String(id).trim()).filter(Boolean)
          : (typeof body?.grupoId === 'string' && body.grupoId.trim() ? [body.grupoId.trim()] : []);

        if (grupoIds.length === 0) {
          return new Response(
            JSON.stringify({ error: "Debe indicar al menos un curso a eliminar." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Verificar pertenencia al profesor autenticado
        const { data: gruposDocente, error: gError } = await supabase
          .from("grupos")
          .select("id, nombre")
          .eq("profesor_id", profesor.id)
          .in("id", grupoIds);

        if (gError) {
          return new Response(
            JSON.stringify({ error: `Error al consultar cursos: ${gError.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const validIds = (gruposDocente || []).map((g: any) => g.id);
        if (validIds.length === 0) {
          return new Response(
            JSON.stringify({ error: "Ninguno de los cursos seleccionados pertenece a este docente." }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Comprobación estricta de dependencias: alumnos, actividades, criterios, rubricas, calificaciones
        const dependenciasPorGrupo: Record<string, string[]> = {};
        for (const g of gruposDocente || []) {
          const deps: string[] = [];
          const [alumnosRes, actsRes, critsRes, rubsRes, califsRes] = await Promise.all([
            supabase.from("alumnos").select("id", { count: "exact", head: true }).eq("grupo_id", g.id),
            supabase.from("actividades").select("id", { count: "exact", head: true }).eq("grupo_id", g.id),
            supabase.from("criterios").select("id", { count: "exact", head: true }).eq("grupo_id", g.id),
            supabase.from("rubricas").select("id", { count: "exact", head: true }).eq("grupo_id", g.id),
            supabase.from("calificaciones").select("id", { count: "exact", head: true }).eq("grupo_id", g.id),
          ]);

          if ((alumnosRes.count ?? 0) > 0) deps.push(`${alumnosRes.count} alumno(s)`);
          if ((actsRes.count ?? 0) > 0) deps.push(`${actsRes.count} actividad(es)`);
          if ((critsRes.count ?? 0) > 0) deps.push(`${critsRes.count} criterio(s)`);
          if ((rubsRes.count ?? 0) > 0) deps.push(`${rubsRes.count} rúbrica(s)`);
          if ((califsRes.count ?? 0) > 0) deps.push(`${califsRes.count} calificación(es)`);

          if (deps.length > 0) {
            dependenciasPorGrupo[g.nombre] = deps;
          }
        }

        if (Object.keys(dependenciasPorGrupo).length > 0) {
          const detalles = Object.entries(dependenciasPorGrupo)
            .map(([nombre, deps]) => `«${nombre}» contiene ${deps.join(', ')}`)
            .join('; ');
          return new Response(
            JSON.stringify({
              error: `No se pueden eliminar los cursos porque contienen dependencias activas: ${detalles}. Debe eliminar primero los alumnos, actividades o rúbricas asociadas antes de borrar el curso de forma segura.`,
              dependencias: dependenciasPorGrupo,
            }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Si están limpios de dependencias, proceder a eliminar
        const { error: delError } = await supabase
          .from("grupos")
          .delete()
          .eq("profesor_id", profesor.id)
          .in("id", validIds);

        if (delError) {
          return new Response(
            JSON.stringify({ error: `Error al eliminar cursos en Supabase: ${delError.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, eliminados: validIds }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const targetGrupoId = typeof body?.grupoId === "string" ? body.grupoId.trim() : "";
      if (!targetGrupoId) {
        return new Response(
          JSON.stringify({ error: "Parámetro obligatorio 'grupoId' no proporcionado en el cuerpo de la petición." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verificación de propiedad del grupo por defecto para el resto de operaciones
      const { data: grupo, error: grupoError } = await supabase
        .from("grupos")
        .select("id, profesor_id, nombre")
        .eq("id", targetGrupoId)
        .eq("profesor_id", profesor.id)
        .maybeSingle();

      if (grupoError || !grupo) {
        return new Response(
          JSON.stringify({ error: "Grupo no encontrado o no pertenece al docente autenticado." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // =========================================================================
      // GESTIÓN DE DATOS: ALUMNOS
      // =========================================================================
      if (body?.tipo === 'crear_alumno') {
        const nombre = typeof body?.nombre === 'string' ? body.nombre.trim() : '';
        if (!nombre || nombre.length < 2) {
          return new Response(
            JSON.stringify({ error: "El nombre del alumno es obligatorio (mínimo 2 caracteres)." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        let orden = typeof body?.orden === 'number' && !isNaN(body.orden) ? body.orden : null;
        if (orden === null) {
          const { data: maxOrdenData } = await supabase
            .from("alumnos")
            .select("orden")
            .eq("grupo_id", grupo.id)
            .order("orden", { ascending: false })
            .limit(1)
            .maybeSingle();
          orden = (maxOrdenData?.orden ?? 0) + 1;
        }

        const nuevoAlumnoId = crypto.randomUUID().toLowerCase();
        const { data: nuevoAlumno, error: insError } = await supabase
          .from("alumnos")
          .insert({
            id: nuevoAlumnoId,
            grupo_id: grupo.id,
            nombre,
            orden,
          })
          .select("id, grupo_id, nombre, orden, created_at")
          .single();

        if (insError) {
          return new Response(
            JSON.stringify({ error: `Error al crear alumno en Supabase: ${insError.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, alumno: nuevoAlumno }),
          { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (body?.tipo === 'actualizar_alumno') {
        const alumnoId = typeof body?.alumnoId === 'string' ? body.alumnoId.trim() : '';
        const nombre = typeof body?.nombre === 'string' ? body.nombre.trim() : '';
        if (!alumnoId) {
          return new Response(
            JSON.stringify({ error: "ID de alumno no especificado." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (!nombre || nombre.length < 2) {
          return new Response(
            JSON.stringify({ error: "El nombre del alumno no puede estar vacío (mínimo 2 caracteres)." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const updateData: Record<string, any> = { nombre };
        if (typeof body?.orden === 'number' && !isNaN(body.orden)) {
          updateData.orden = body.orden;
        }

        const { data: alumnoAct, error: actError } = await supabase
          .from("alumnos")
          .update(updateData)
          .eq("id", alumnoId)
          .eq("grupo_id", grupo.id)
          .select("id, grupo_id, nombre, orden, created_at")
          .single();

        if (actError) {
          return new Response(
            JSON.stringify({ error: `Error al actualizar alumno: ${actError.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, alumno: alumnoAct }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (body?.tipo === 'eliminar_alumnos') {
        const alumnoIds = Array.isArray(body?.alumnoIds)
          ? body.alumnoIds.map((id: any) => String(id).trim()).filter(Boolean)
          : [];

        if (alumnoIds.length === 0) {
          return new Response(
            JSON.stringify({ error: "Debe indicar al menos un alumno a eliminar." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Comprobar pertenencia al grupo
        const { data: alumnosValidos, error: valError } = await supabase
          .from("alumnos")
          .select("id, nombre")
          .eq("grupo_id", grupo.id)
          .in("id", alumnoIds);

        if (valError) {
          return new Response(
            JSON.stringify({ error: `Error al comprobar alumnos: ${valError.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const validIds = (alumnosValidos || []).map((a: any) => a.id);
        if (validIds.length === 0) {
          return new Response(
            JSON.stringify({ error: "Ninguno de los alumnos seleccionados pertenece a este curso." }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Comprobación de dependencias: calificaciones estándar y calificaciones de apartados
        const [califsRes, califsApRes] = await Promise.all([
          supabase.from("calificaciones").select("alumno_id").eq("grupo_id", grupo.id).in("alumno_id", validIds),
          supabase.from("calificaciones_apartados").select("alumno_id").eq("grupo_id", grupo.id).in("alumno_id", validIds),
        ]);

        const idsConCalifs = new Set<string>();
        (califsRes.data || []).forEach((c: any) => idsConCalifs.add(c.alumno_id));
        (califsApRes.data || []).forEach((c: any) => idsConCalifs.add(c.alumno_id));

        if (idsConCalifs.size > 0) {
          const nombresConNota = (alumnosValidos || [])
            .filter((a: any) => idsConCalifs.has(a.id))
            .map((a: any) => a.nombre);
          return new Response(
            JSON.stringify({
              error: `No se pueden eliminar los siguientes alumnos porque tienen calificaciones y evidencias de evaluación registradas en el cuaderno: ${nombresConNota.join(', ')}. Para salvaguardar la integridad de las evaluaciones, no se permite eliminar alumnos calificados.`,
              bloqueados: Array.from(idsConCalifs),
            }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Si ninguno tiene calificaciones, eliminación segura
        const { error: delAlumnosError } = await supabase
          .from("alumnos")
          .delete()
          .eq("grupo_id", grupo.id)
          .in("id", validIds);

        if (delAlumnosError) {
          return new Response(
            JSON.stringify({ error: `Error al eliminar alumnos: ${delAlumnosError.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, eliminados: validIds }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (body?.tipo === 'importar_alumnos') {
        const alumnosList = Array.isArray(body?.alumnos) ? body.alumnos : [];
        if (alumnosList.length === 0) {
          return new Response(
            JSON.stringify({ error: "No se proporcionaron alumnos para importar." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: maxOrdenData } = await supabase
          .from("alumnos")
          .select("orden")
          .eq("grupo_id", grupo.id)
          .order("orden", { ascending: false })
          .limit(1)
          .maybeSingle();
        let currentOrden = maxOrdenData?.orden ?? 0;

        const filasParaInsertar = [];
        for (const item of alumnosList) {
          const nombre = typeof item?.nombre === 'string' ? item.nombre.trim() : '';
          if (!nombre) continue;
          currentOrden += 1;
          const orden = typeof item?.orden === 'number' && !isNaN(item.orden) ? item.orden : currentOrden;
          filasParaInsertar.push({
            id: crypto.randomUUID().toLowerCase(),
            grupo_id: grupo.id,
            nombre,
            orden,
          });
        }

        if (filasParaInsertar.length === 0) {
          return new Response(
            JSON.stringify({ error: "Ninguna de las filas proporcionadas contiene un nombre válido de alumno." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: insertados, error: insLoteError } = await supabase
          .from("alumnos")
          .insert(filasParaInsertar)
          .select("id, grupo_id, nombre, orden, created_at");

        if (insLoteError) {
          return new Response(
            JSON.stringify({ error: `Error al importar alumnos en Supabase: ${insLoteError.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, total: (insertados || []).length, alumnos: insertados || [] }),
          { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // =========================================================================
      // GESTIÓN DE DATOS: CRITERIOS DE EVALUACIÓN
      // =========================================================================
      if (body?.tipo === 'crear_criterio') {
        const codigo = typeof body?.codigo === 'string' ? body.codigo.trim() : '';
        const descripcion = typeof body?.descripcion === 'string' ? body.descripcion.trim() : '';
        if (!codigo) {
          return new Response(
            JSON.stringify({ error: "El código de criterio es obligatorio (ej. 1.1, 2.3)." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (!descripcion) {
          return new Response(
            JSON.stringify({ error: "La descripción del criterio es obligatoria." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        let ponderacion: number | null = null;
        if (body?.ponderacion !== null && body?.ponderacion !== undefined && body?.ponderacion !== '') {
          const numPond = Number(body.ponderacion);
          if (isNaN(numPond) || numPond < 0) {
            return new Response(
              JSON.stringify({ error: "La ponderación debe ser un número mayor o igual a 0." }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          ponderacion = numPond;
        }

        // Comprobar unicidad de código dentro del grupo
        const { data: existeCod } = await supabase
          .from("criterios")
          .select("id")
          .eq("grupo_id", grupo.id)
          .eq("codigo", codigo)
          .maybeSingle();

        if (existeCod) {
          return new Response(
            JSON.stringify({ error: `Ya existe un criterio con el código ${codigo} en este curso.` }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: nuevoCriterio, error: insCritError } = await supabase
          .from("criterios")
          .insert({
            grupo_id: grupo.id,
            codigo,
            descripcion,
            ponderacion,
          })
          .select("id, grupo_id, codigo, descripcion, ponderacion")
          .single();

        if (insCritError) {
          return new Response(
            JSON.stringify({ error: `Error al crear criterio: ${insCritError.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, criterio: nuevoCriterio }),
          { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (body?.tipo === 'actualizar_criterio') {
        const criterioId = Number(body?.criterioId);
        if (isNaN(criterioId) || !criterioId) {
          return new Response(
            JSON.stringify({ error: "ID de criterio inválido." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const codigo = typeof body?.codigo === 'string' ? body.codigo.trim() : '';
        const descripcion = typeof body?.descripcion === 'string' ? body.descripcion.trim() : '';
        if (!codigo || !descripcion) {
          return new Response(
            JSON.stringify({ error: "El código y la descripción del criterio son obligatorios." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        let ponderacion: number | null = null;
        if (body?.ponderacion !== null && body?.ponderacion !== undefined && body?.ponderacion !== '') {
          const numPond = Number(body.ponderacion);
          if (isNaN(numPond) || numPond < 0) {
            return new Response(
              JSON.stringify({ error: "La ponderación debe ser un número no negativo." }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          ponderacion = numPond;
        }

        const { data: criterioAct, error: actCritError } = await supabase
          .from("criterios")
          .update({
            codigo,
            descripcion,
            ponderacion,
          })
          .eq("id", criterioId)
          .eq("grupo_id", grupo.id)
          .select("id, grupo_id, codigo, descripcion, ponderacion")
          .single();

        if (actCritError) {
          return new Response(
            JSON.stringify({ error: `Error al actualizar criterio: ${actCritError.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, criterio: criterioAct }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (body?.tipo === 'actualizar_ponderacion_criterio') {
        const criterioId = Number(body?.criterioId);
        if (isNaN(criterioId) || !criterioId) {
          return new Response(
            JSON.stringify({ error: "ID de criterio inválido." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        let ponderacion: number | null = null;
        if (body?.ponderacion !== null && body?.ponderacion !== undefined && body?.ponderacion !== '') {
          const numPond = Number(body.ponderacion);
          if (isNaN(numPond) || numPond < 0) {
            return new Response(
              JSON.stringify({ error: "La ponderación no puede ser negativa ni contener caracteres no numéricos." }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          ponderacion = numPond;
        }

        const { data: criterioAct, error: actPondError } = await supabase
          .from("criterios")
          .update({ ponderacion })
          .eq("id", criterioId)
          .eq("grupo_id", grupo.id)
          .select("id, grupo_id, codigo, descripcion, ponderacion")
          .single();

        if (actPondError) {
          return new Response(
            JSON.stringify({ error: `Error al actualizar ponderación en Supabase: ${actPondError.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, criterio: criterioAct }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (body?.tipo === 'eliminar_criterios') {
        const criterioIds = Array.isArray(body?.criterioIds)
          ? body.criterioIds.map(Number).filter((n: number) => !isNaN(n) && n > 0)
          : [];

        if (criterioIds.length === 0) {
          return new Response(
            JSON.stringify({ error: "Debe indicar al menos un criterio a eliminar." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: critsValidos, error: valCritsError } = await supabase
          .from("criterios")
          .select("id, codigo")
          .eq("grupo_id", grupo.id)
          .in("id", criterioIds);

        if (valCritsError) {
          return new Response(
            JSON.stringify({ error: `Error al consultar criterios: ${valCritsError.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const validIds = (critsValidos || []).map((c: any) => c.id);
        const codigosAEliminar = new Set((critsValidos || []).map((c: any) => c.codigo.trim().toLowerCase()));

        if (validIds.length === 0) {
          return new Response(
            JSON.stringify({ error: "Ninguno de los criterios seleccionados pertenece a este curso." }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Comprobación de dependencias: revisar rúbricas del grupo
        const { data: rubsGrupo } = await supabase
          .from("rubricas")
          .select("id, titulo, items")
          .eq("grupo_id", grupo.id);

        const codigosEnUso: Record<string, string[]> = {};
        for (const rub of rubsGrupo || []) {
          const items = Array.isArray(rub.items) ? rub.items : [];
          for (const it of items) {
            const listCriterios = Array.isArray(it?.criterios)
              ? it.criterios
              : (typeof it?.criterio === 'string' ? [it.criterio] : []);
            for (const cod of listCriterios) {
              const codLower = String(cod || '').trim().toLowerCase();
              if (codigosAEliminar.has(codLower)) {
                if (!codigosEnUso[cod]) codigosEnUso[cod] = [];
                if (!codigosEnUso[cod].includes(rub.titulo)) {
                  codigosEnUso[cod].push(rub.titulo);
                }
              }
            }
          }
        }

        if (Object.keys(codigosEnUso).length > 0) {
          const detalles = Object.entries(codigosEnUso)
            .map(([cod, rubs]) => `Criterio ${cod} en ${rubs.join(', ')}`)
            .join('; ');
          return new Response(
            JSON.stringify({
              error: `No se pueden eliminar los criterios seleccionados porque están siendo evaluados en las siguientes rúbricas: ${detalles}. Desvincúlelos o elimine las rúbricas antes de borrar los criterios.`,
              bloqueados: Object.keys(codigosEnUso),
            }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { error: delCritsError } = await supabase
          .from("criterios")
          .delete()
          .eq("grupo_id", grupo.id)
          .in("id", validIds);

        if (delCritsError) {
          return new Response(
            JSON.stringify({ error: `Error al eliminar criterios: ${delCritsError.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, eliminados: validIds }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (body?.tipo === 'importar_criterios') {
        const criteriosList = Array.isArray(body?.criterios) ? body.criterios : [];
        if (criteriosList.length === 0) {
          return new Response(
            JSON.stringify({ error: "No se proporcionaron criterios para importar." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const filasParaInsertar = [];
        for (const item of criteriosList) {
          const codigo = typeof item?.codigo === 'string' ? item.codigo.trim() : '';
          const descripcion = typeof item?.descripcion === 'string' ? item.descripcion.trim() : '';
          if (!codigo || !descripcion) continue;

          let ponderacion: number | null = null;
          if (item?.ponderacion !== null && item?.ponderacion !== undefined && item?.ponderacion !== '') {
            const numPond = Number(item.ponderacion);
            if (!isNaN(numPond) && numPond >= 0) {
              ponderacion = numPond;
            }
          }

          filasParaInsertar.push({
            grupo_id: grupo.id,
            codigo,
            descripcion,
            ponderacion,
          });
        }

        if (filasParaInsertar.length === 0) {
          return new Response(
            JSON.stringify({ error: "Ninguna de las filas contiene código y descripción válidos." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: insertados, error: insLoteError } = await supabase
          .from("criterios")
          .insert(filasParaInsertar)
          .select("id, grupo_id, codigo, descripcion, ponderacion");

        if (insLoteError) {
          return new Response(
            JSON.stringify({ error: `Error al importar criterios en Supabase: ${insLoteError.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, total: (insertados || []).length, criterios: insertados || [] }),
          { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // =========================================================================
      // GESTIÓN DE DATOS: SECCIONES
      // =========================================================================
      if (body?.tipo === 'crear_seccion') {
        const nombre = typeof body?.nombre === 'string' ? body.nombre.trim() : '';
        if (!nombre || nombre.length < 2) {
          return new Response(
            JSON.stringify({ error: "El nombre de la sección es obligatorio (mínimo 2 caracteres)." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const color = typeof body?.color === 'string' && body.color.trim() ? body.color.trim() : null;
        const nuevaSeccionId = crypto.randomUUID().toLowerCase();

        const { data: nuevaSeccion, error: insSecError } = await supabase
          .from("secciones")
          .insert({
            id: nuevaSeccionId,
            grupo_id: grupo.id,
            nombre,
            color,
            ponderacion: null, // Las secciones son organizativas; no intervienen en el cálculo de notas
            oculto: false,
          })
          .select("id, grupo_id, nombre, color, ponderacion, oculto")
          .single();

        if (insSecError) {
          return new Response(
            JSON.stringify({ error: `Error al crear sección en Supabase: ${insSecError.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, seccion: nuevaSeccion }),
          { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (body?.tipo === 'actualizar_seccion') {
        const seccionId = typeof body?.seccionId === 'string' ? body.seccionId.trim() : '';
        const nombre = typeof body?.nombre === 'string' ? body.nombre.trim() : '';
        if (!seccionId) {
          return new Response(
            JSON.stringify({ error: "ID de sección no especificado." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (!nombre || nombre.length < 2) {
          return new Response(
            JSON.stringify({ error: "El nombre de la sección no puede estar vacío (mínimo 2 caracteres)." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const color = typeof body?.color === 'string' && body.color.trim() ? body.color.trim() : null;

        const { data: seccionAct, error: actSecError } = await supabase
          .from("secciones")
          .update({ nombre, color })
          .eq("id", seccionId)
          .eq("grupo_id", grupo.id)
          .select("id, grupo_id, nombre, color, ponderacion, oculto")
          .single();

        if (actSecError) {
          return new Response(
            JSON.stringify({ error: `Error al actualizar sección: ${actSecError.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, seccion: seccionAct }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (body?.tipo === 'eliminar_secciones') {
        const seccionIds = Array.isArray(body?.seccionIds)
          ? body.seccionIds.map((id: any) => String(id).trim()).filter(Boolean)
          : [];

        if (seccionIds.length === 0) {
          return new Response(
            JSON.stringify({ error: "Debe indicar al menos una sección a eliminar." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Comprobar pertenencia al grupo
        const { data: secsValidas, error: valSecsError } = await supabase
          .from("secciones")
          .select("id, nombre")
          .eq("grupo_id", grupo.id)
          .in("id", seccionIds);

        if (valSecsError) {
          return new Response(
            JSON.stringify({ error: `Error al comprobar secciones: ${valSecsError.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const validIds = (secsValidas || []).map((s: any) => s.id);
        if (validIds.length === 0) {
          return new Response(
            JSON.stringify({ error: "Ninguna de las secciones seleccionadas pertenece a este curso." }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Comprobación de dependencias: actividades asignadas a estas secciones
        const { data: actsVinculadas } = await supabase
          .from("actividades")
          .select("id, nombre, seccion_id")
          .eq("grupo_id", grupo.id)
          .in("seccion_id", validIds);

        if (actsVinculadas && actsVinculadas.length > 0) {
          const nombresActs = actsVinculadas.map((a: any) => `«${a.nombre}»`).slice(0, 5);
          const masTexto = actsVinculadas.length > 5 ? ` y ${actsVinculadas.length - 5} más` : '';
          return new Response(
            JSON.stringify({
              error: `No se pueden eliminar las secciones seleccionadas porque contienen ${actsVinculadas.length} actividad(es) vinculada(s) (${nombresActs.join(', ')}${masTexto}). Por seguridad y para no desorganizar las actividades existentes, reasigne o elimine primero las actividades asociadas.`,
              actividadesVinculadas: actsVinculadas.map((a: any) => a.id),
            }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Si no tienen actividades vinculadas, eliminación segura
        const { error: delSecsError } = await supabase
          .from("secciones")
          .delete()
          .eq("grupo_id", grupo.id)
          .in("id", validIds);

        if (delSecsError) {
          return new Response(
            JSON.stringify({ error: `Error al eliminar secciones: ${delSecsError.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, eliminadas: validIds }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Comprobación de si es petición para crear una nueva rúbrica y su actividad vinculada
      const isCrearRubrica = body?.tipo === 'crear_rubrica';
      if (isCrearRubrica) {

        // 2. Validación de título
        const rawTitulo = typeof body?.titulo === 'string' ? body.titulo.trim() : '';
        if (!rawTitulo || rawTitulo.length < 2) {
          return new Response(
            JSON.stringify({ error: "El título de la rúbrica es obligatorio (mínimo 2 caracteres)." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // 3. Validación y normalización de tipo ('ACTIVIDAD' | 'TRABAJO' | 'EXAMEN')
        const validTipos = ['ACTIVIDAD', 'TRABAJO', 'EXAMEN'];
        const inputTipo = typeof body?.tipoRubrica === 'string' 
          ? body.tipoRubrica.trim().toUpperCase() 
          : (typeof body?.rubricaTipo === 'string' ? body.rubricaTipo.trim().toUpperCase() : 'ACTIVIDAD');
        const tipoFinal = validTipos.includes(inputTipo) ? inputTipo : 'ACTIVIDAD';

        // 4. Validación de período de evaluación
        const validPeriodos = ['1.º Ev', '2.º Ev', '3.º Ev', 'Global'];
        const inputPeriodo = typeof body?.evaluacionPeriodo === 'string' ? body.evaluacionPeriodo.trim() : '1.º Ev';
        const periodoFinal = validPeriodos.includes(inputPeriodo) ? inputPeriodo : '1.º Ev';

        // 5. Descripción opcional
        const descripcionFinal = typeof body?.descripcion === 'string' && body.descripcion.trim()
          ? body.descripcion.trim()
          : null;

        // 6. Preparación y validación de apartados garantizando UUIDs válidos (RFC 4122)
        const rawItems = Array.isArray(body?.items) ? body.items : [];
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const itemsFinales = rawItems.map((it: any, idx: number) => {
          const itemId = typeof it?.id === 'string' && uuidRegex.test(it.id.trim())
            ? it.id.trim().toLowerCase()
            : crypto.randomUUID().toLowerCase();
          const itemNumero = it?.numero ? String(it.numero).trim() : String(idx + 1);
          const itemTitulo = typeof it?.titulo === 'string' && it.titulo.trim()
            ? it.titulo.trim()
            : `Apartado ${itemNumero}`;
          const itemPeso = typeof it?.peso === 'number' && !isNaN(it.peso)
            ? it.peso
            : (it?.peso !== null && it?.peso !== undefined && !isNaN(Number(it.peso)) ? Number(it.peso) : null);

          let itemCriterios: string[] = [];
          if (Array.isArray(it?.criterios)) {
            itemCriterios = it.criterios
              .filter((c: any) => typeof c === 'string' && c.trim())
              .map((c: string) => c.trim());
          } else if (typeof it?.criterio === 'string' && it.criterio.trim()) {
            itemCriterios = [it.criterio.trim()];
          }

          const itemDescriptores = it?.descriptores && typeof it.descriptores === 'object' && !Array.isArray(it.descriptores)
            ? it.descriptores
            : {
                "1": "Inicial / Insuficiente",
                "2": "En proceso / Suficiente",
                "3": "Conseguido / Notable",
                "4": "Avanzado / Sobresaliente",
              };

          return {
            id: itemId,
            numero: itemNumero,
            titulo: itemTitulo,
            peso: itemPeso,
            criterios: itemCriterios,
            descriptores: itemDescriptores,
          };
        });

        // 7. Generación de identificadores únicos para la rúbrica y la actividad
        const rubricaId = crypto.randomUUID().toLowerCase();
        const actividadId = crypto.randomUUID().toLowerCase();

        // 8. Inserción atómica transaccional de la rúbrica y la actividad asociada mediante RPC
        const { data: rpcData, error: rpcError } = await supabase.rpc(
          "crear_rubrica_con_actividad",
          {
            p_grupo_id: grupo.id,
            p_rubrica_id: rubricaId,
            p_titulo: rawTitulo,
            p_tipo: tipoFinal,
            p_descripcion: descripcionFinal,
            p_items: itemsFinales,
            p_actividad_id: actividadId,
            p_evaluacion_periodo: periodoFinal,
          }
        );

        if (rpcError || !rpcData || !rpcData.success) {
          console.error("[fernanditio-data] Error en RPC crear_rubrica_con_actividad:", rpcError);
          return new Response(
            JSON.stringify({
              error: `Error al persistir atómicamente la rúbrica y su actividad en Supabase: ${rpcError?.message || "Fallo en transacción RPC"}`,
              code: rpcError?.code,
            }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const nuevaRubrica = rpcData.rubrica;
        const nuevaActividad = rpcData.actividad;

        // 10. Construcción de actividadDetalle congruente con el contrato de la aplicación
        const codigosSet = new Set<string>();
        for (const it of itemsFinales) {
          for (const c of it.criterios) {
            codigosSet.add(c);
          }
        }

        const actividadDetalle = {
          ...nuevaActividad,
          criteriosCodigos: Array.from(codigosSet),
          estadoVinculacion: "rubrica_confirmada",
          advertenciaRubrica: null,
        };

        return new Response(
          JSON.stringify({
            success: true,
            rubrica: nuevaRubrica,
            actividad: actividadDetalle,
          }),
          { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // =========================================================================
      // Comprobación de si es petición para analizar una rúbrica con Gemini (Foto o Word)
      // =========================================================================
      const isAnalizarRubricaGemini = body?.tipo === 'analizar_rubrica_gemini';
      if (isAnalizarRubricaGemini) {
        // 1. Verificación de pertenencia del grupo al docente autenticado
        const { data: grupo, error: grupoError } = await supabase
          .from("grupos")
          .select("id, profesor_id, nombre")
          .eq("id", targetGrupoId)
          .eq("profesor_id", profesor.id)
          .maybeSingle();

        if (grupoError || !grupo) {
          return new Response(
            JSON.stringify({ error: "Grupo no encontrado o no pertenece al docente autenticado." }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // 2. Comprobación del secreto de servidor GEMINI_API_KEY
        const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
        if (!geminiApiKey) {
          return new Response(
            JSON.stringify({
              error: "El servicio de análisis con Gemini no está configurado (falta el secreto GEMINI_API_KEY en Supabase Edge Functions).",
              code: "GEMINI_API_KEY_MISSING",
            }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // 3. Recuperar exclusivamente los criterios autorizados del grupo desde la base de datos
        const { data: criteriosBd, error: critError } = await supabase
          .from("criterios")
          .select("id, codigo, descripcion, ponderacion")
          .eq("grupo_id", targetGrupoId);

        if (critError) {
          return new Response(
            JSON.stringify({ error: `Error al consultar los criterios del grupo: ${critError.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!criteriosBd || criteriosBd.length === 0) {
          return new Response(
            JSON.stringify({
              error: "El grupo activo no tiene criterios de evaluación registrados. Es imprescindible disponer de criterios oficiales en el grupo antes de analizar y relacionar la rúbrica.",
              code: "CRITERIOS_EMPTY",
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // 4. Parámetros de entrada según origen (fotografía o documento Word)
        const origen = body?.origen === "word" ? "word" : "foto";
        const imagenBase64 = typeof body?.imagenBase64 === "string" ? body.imagenBase64.trim() : "";
        const mimeType = typeof body?.mimeType === "string" && body.mimeType.trim() ? body.mimeType.trim() : "image/jpeg";
        const documentoTexto = typeof body?.documentoTexto === "string" ? body.documentoTexto.trim() : "";

        if (origen === "foto" && !imagenBase64) {
          return new Response(
            JSON.stringify({ error: "No se ha proporcionado la imagen en base64 para el análisis." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (origen === "word" && !documentoTexto) {
          return new Response(
            JSON.stringify({ error: "No se ha proporcionado el texto o tabla extraída del documento Word para el análisis." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        let rawBase64 = imagenBase64;
        if (rawBase64.includes(",")) {
          rawBase64 = rawBase64.split(",")[1];
        }

        // 5. Construcción del prompt estricto con la lista oficial de criterios
        const listaCriteriosTexto = criteriosBd
          .map((c: any) => `- Código: "${c.codigo}" | Descripción: "${c.descripcion}"`)
          .join("\n");

        const promptInstrucciones = `Eres un asistente docente experto en la materia de Lengua Castellana y Literatura para Educación Secundaria y Bachillerato (Castilla y León).
Tu misión es analizar la rúbrica proporcionada (mediante ${origen === "foto" ? "fotografía de la matriz de evaluación" : "contenido y tablas extraídas de un documento Word"}) y extraer una estructura normalizada de apartados e indicadores.

LISTA OFICIAL DE CRITERIOS DE EVALUACIÓN AUTORIZADOS PARA ESTE GRUPO:
${listaCriteriosTexto}

REGLAS OBLIGATORIAS:
1. SOLO puedes asociar a cada apartado códigos que pertenezcan ESTRICTAMENTE a la lista oficial anterior.
2. Está TERMINANTEMENTE PROHIBIDO inventar códigos, añadir sufijos, cambiar letras o utilizar criterios de otras materias o comunidades autónomas.
3. Si un apartado o indicador no menciona un criterio explícito o no se puede establecer una relación clara e inequívoca con la lista oficial, DEBES DEVOLVER una lista vacía de criterios para ese apartado: "criterios": []. El docente se encargará de asignarlo manualmente en la pantalla de revisión.
4. Identifica el título general de la rúbrica y sugiere el tipo evaluativo más apropiado: "ACTIVIDAD", "TRABAJO" o "EXAMEN".
5. Extrae los apartados o actividades evaluables identificados (mínimo 1). Para cada uno:
   - "numero": el número o identificador EXACTO que figura en el documento o fotografía (por ejemplo "5.a", "5.b", "2", "3.1"). NUNCA empieces obligatoriamente por el 1 si el examen o rúbrica original empieza por otra numeración.
   - "titulo": comienzo y enunciado claro del indicador o aspecto evaluado.
   - "peso": peso porcentual sugerido (1 a 100). Si la rúbrica original no especifica pesos, reparte equitativamente o sugiere un valor coherente.
   - "criterios": array de códigos oficiales coincidentes (o [] si no hay coincidencia exacta).
   - "descriptores": objeto con exactamente 4 niveles de desempeño numéricos del '1' al '4':
       "1": descriptor del nivel Inicial o Insuficiente (calificación 1-4)
       "2": descriptor del nivel En proceso o Suficiente (calificación 5-6)
       "3": descriptor del nivel Conseguido o Notable (calificación 7-8)
       "4": descriptor del nivel Avanzado o Sobresaliente (calificación 9-10)
   (Si la rúbrica original tiene 3 o 5 niveles, adáptala con criterio pedagógico a estos 4 niveles normalizados de Fernanditio respetando fielmente el texto original).`;

        const parts: any[] = [];
        if (origen === "foto") {
          parts.push({
            inlineData: {
              mimeType: mimeType,
              data: rawBase64,
            },
          });
        }
        parts.push({
          text: promptInstrucciones + (origen === "word" ? `\n\nCONTENIDO EXTRAÍDO DEL DOCUMENTO WORD:\n${documentoTexto}` : "\n\nAnaliza la fotografía de la rúbrica adjunta y devuelve el JSON estructurado respetando la numeración original de los apartados."),
        });

        const geminiRequestBody = {
          contents: [
            {
              role: "user",
              parts: parts,
            },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                titulo: { type: "STRING" },
                tipo: { type: "STRING", enum: ["ACTIVIDAD", "TRABAJO", "EXAMEN"] },
                descripcion: { type: "STRING" },
                items: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      numero: { type: "STRING" },
                      titulo: { type: "STRING" },
                      peso: { type: "NUMBER" },
                      criterios: {
                        type: "ARRAY",
                        items: { type: "STRING" },
                      },
                      descriptores: {
                        type: "OBJECT",
                        properties: {
                          "1": { type: "STRING" },
                          "2": { type: "STRING" },
                          "3": { type: "STRING" },
                          "4": { type: "STRING" },
                        },
                        required: ["1", "2", "3", "4"],
                      },
                    },
                    required: ["titulo", "criterios", "descriptores"],
                  },
                },
              },
              required: ["titulo", "tipo", "items"],
            },
          },
        };

        // 6. Invocación a Gemini REST API
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${encodeURIComponent(geminiApiKey)}`;

        let geminiRes: Response;
        try {
          geminiRes = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(geminiRequestBody),
          });
        } catch (fetchErr: any) {
          return new Response(
            JSON.stringify({ error: `Error de conexión al invocar la API de Gemini: ${fetchErr?.message || fetchErr}` }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!geminiRes.ok) {
          const errText = await geminiRes.text();
          console.error("[fernanditio-data] Error recibido de Gemini API:", geminiRes.status, errText);
          return new Response(
            JSON.stringify({ error: `La API de Gemini rechazó la petición (${geminiRes.status}): ${errText}` }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const geminiJson = await geminiRes.json();
        const rawContentText = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawContentText) {
          return new Response(
            JSON.stringify({ error: "La respuesta de Gemini no contuvo texto analizable." }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        let parsedGemini: any;
        try {
          parsedGemini = JSON.parse(rawContentText);
        } catch {
          return new Response(
            JSON.stringify({ error: "No se pudo interpretar la respuesta de Gemini como JSON válido." }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // 7. Post-validación estricta en el servidor: comprobación código a código contra la BD
        const codigosValidos = new Set(criteriosBd.map((c: any) => String(c.codigo).trim()));
        const rawItems = Array.isArray(parsedGemini?.items) ? parsedGemini.items : [];

        const itemsValidados = rawItems.map((it: any, idx: number) => {
          const itemCriterios = Array.isArray(it?.criterios) ? it.criterios : [];
          // FILTRO ESTRICTO: solo se conservan los códigos que existan exactamente en la base de datos
          const criteriosAprobados = itemCriterios
            .map((c: any) => String(c).trim())
            .filter((c: string) => codigosValidos.has(c));

          let itemNumero = typeof it?.numero === "string" && it.numero.trim() ? it.numero.trim() : "";
          let itemTitulo = typeof it?.titulo === "string" && it.titulo.trim() ? it.titulo.trim() : "";

          // Si no vino número explícito, intentar detectarlo del inicio del título
          if (!itemNumero && itemTitulo) {
            const m = itemTitulo.match(/^(?:actividad|ejercicio|pregunta|apartado)?\s*([0-9]+(?:\.[0-9a-zA-Z]+|\.[a-zA-Z]|[a-zA-Z])?|[a-zA-Z]\))(?:\s*[:.\-–)]\s*|\s+)(.*)$/i);
            if (m && m[1]) {
              itemNumero = m[1].replace(/[):.\-–]/g, '').trim();
              if (m[2] && m[2].trim()) itemTitulo = m[2].trim();
            }
          }

          if (!itemNumero) {
            itemNumero = String(idx + 1);
          }
          if (!itemTitulo) {
            itemTitulo = `Apartado ${itemNumero}`;
          }

          const itemPeso = typeof it?.peso === "number" && !isNaN(it.peso) && it.peso > 0
            ? Math.round(it.peso * 100) / 100
            : null;

          return {
            id: crypto.randomUUID().toLowerCase(),
            numero: itemNumero,
            titulo: itemTitulo,
            peso: itemPeso,
            criterios: criteriosAprobados,
            criteriosPendientes: criteriosAprobados.length === 0,
            descriptores: {
              "1": it?.descriptores?.["1"] || "Inicial / Insuficiente",
              "2": it?.descriptores?.["2"] || "En proceso / Suficiente",
              "3": it?.descriptores?.["3"] || "Conseguido / Notable",
              "4": it?.descriptores?.["4"] || "Avanzado / Sobresaliente",
            },
          };
        });

        const tipoSugerido = ["ACTIVIDAD", "TRABAJO", "EXAMEN"].includes(parsedGemini?.tipo)
          ? parsedGemini.tipo
          : "ACTIVIDAD";

        return new Response(
          JSON.stringify({
            success: true,
            borrador: {
              titulo: typeof parsedGemini?.titulo === "string" && parsedGemini.titulo.trim()
                ? parsedGemini.titulo.trim()
                : "Nueva Rúbrica",
              tipo: tipoSugerido,
              descripcion: typeof parsedGemini?.descripcion === "string" && parsedGemini.descripcion.trim()
                ? parsedGemini.descripcion.trim()
                : null,
              items: itemsValidados,
              totalCriteriosDisponibles: criteriosBd.length,
            },
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Comprobación de si es petición para actualizar apartados de una rúbrica
      const isActualizarRubrica = body?.tipo === 'actualizar_rubrica' 
        || body?.tipo === 'rubrica'
        || url.pathname.includes('/rubricas');

      if (isActualizarRubrica) {
        const rubricaId = typeof body?.rubricaId === 'string' ? body.rubricaId.trim() : '';
        if (!rubricaId) {
          return new Response(
            JSON.stringify({ error: "Parámetro obligatorio 'rubricaId' no proporcionado." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const rawItems = Array.isArray(body?.items) ? body.items : null;
        if (!rawItems) {
          return new Response(
            JSON.stringify({ error: "El parámetro 'items' debe ser un array de apartados." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Verificación de propiedad del grupo
        const { data: grupo, error: grupoError } = await supabase
          .from("grupos")
          .select("id, profesor_id")
          .eq("id", targetGrupoId)
          .eq("profesor_id", profesor.id)
          .maybeSingle();

        if (grupoError || !grupo) {
          return new Response(
            JSON.stringify({ error: "Grupo no encontrado o no pertenece al docente autenticado." }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Verificar que la rúbrica pertenece al grupo
        const { data: rubricaExistente, error: rubError } = await supabase
          .from("rubricas")
          .select("id, grupo_id")
          .eq("id", rubricaId)
          .eq("grupo_id", grupo.id)
          .maybeSingle();

        if (rubError || !rubricaExistente) {
          return new Response(
            JSON.stringify({ error: "La rúbrica no existe o no pertenece al grupo especificado." }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Actualizar los items de la rúbrica con los UUIDs persistentes
        const { data: rubricaActualizada, error: updateError } = await supabase
          .from("rubricas")
          .update({
            items: rawItems,
          })
          .eq("id", rubricaId)
          .eq("grupo_id", grupo.id)
          .select()
          .maybeSingle();

        if (updateError) {
          return new Response(
            JSON.stringify({ error: `Error al actualizar la rúbrica: ${updateError.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            rubrica: rubricaActualizada,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // =========================================================================
      // ELIMINACIÓN DE ACTIVIDADES EN LOTE
      // =========================================================================
      const isEliminarActividades = body?.tipo === 'eliminar_actividades';
      if (isEliminarActividades) {
        const actividadIds = Array.isArray(body?.actividadIds) 
          ? body.actividadIds.map((id: any) => String(id).trim()).filter(Boolean)
          : [];

        if (actividadIds.length === 0) {
          return new Response(
            JSON.stringify({ error: "Debe proporcionar al menos un ID de actividad a eliminar." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // 1. Verificación de propiedad del grupo
        const { data: grupo, error: grupoError } = await supabase
          .from("grupos")
          .select("id, profesor_id")
          .eq("id", targetGrupoId)
          .eq("profesor_id", profesor.id)
          .maybeSingle();

        if (grupoError || !grupo) {
          return new Response(
            JSON.stringify({ error: "Grupo no encontrado o no pertenece al docente autenticado." }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // 2. Filtrar solo actividades que efectivamente pertenezcan al grupo
        const { data: actsValidas, error: actsError } = await supabase
          .from("actividades")
          .select("id")
          .eq("grupo_id", grupo.id)
          .in("id", actividadIds);

        if (actsError) {
          return new Response(
            JSON.stringify({ error: `Error al comprobar actividades del grupo: ${actsError.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const idsABorrar = (actsValidas || []).map((a: any) => a.id);
        if (idsABorrar.length === 0) {
          return new Response(
            JSON.stringify({ error: "Ninguna de las actividades indicadas pertenece a este grupo." }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // 3. Eliminar calificaciones por apartado asociadas
        const { error: errDelCalifAp } = await supabase
          .from("calificaciones_apartados")
          .delete()
          .eq("grupo_id", grupo.id)
          .in("actividad_id", idsABorrar);

        if (errDelCalifAp) {
          return new Response(
            JSON.stringify({ error: `Error al eliminar calificaciones de apartados: ${errDelCalifAp.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // 4. Eliminar calificaciones estándar asociadas
        const { error: errDelCalif } = await supabase
          .from("calificaciones")
          .delete()
          .eq("grupo_id", grupo.id)
          .in("actividad_id", idsABorrar);

        if (errDelCalif) {
          return new Response(
            JSON.stringify({ error: `Error al eliminar calificaciones de actividades: ${errDelCalif.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // 5. Eliminar las actividades
        const { error: delActError } = await supabase
          .from("actividades")
          .delete()
          .eq("grupo_id", grupo.id)
          .in("id", idsABorrar);

        if (delActError) {
          return new Response(
            JSON.stringify({ error: `Error al eliminar actividades en Supabase: ${delActError.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // 6. Sincronizar y depurar cuadernos_sync si existe para el docente
        try {
          const { data: syncRow, error: syncQueryErr } = await supabase
            .from("cuadernos_sync")
            .select("id, data")
            .eq("profesor_id", profesor.id)
            .maybeSingle();

          if (!syncQueryErr && syncRow && syncRow.data) {
            const dataSync = { ...syncRow.data };
            let syncModificado = false;

            if (dataSync.grupos && dataSync.grupos[grupo.id]) {
              const gData = dataSync.grupos[grupo.id];
              if (Array.isArray(gData.actividades)) {
                const prevCount = gData.actividades.length;
                gData.actividades = gData.actividades.filter((a: any) => !idsABorrar.includes(a?.id));
                if (gData.actividades.length !== prevCount) syncModificado = true;
              }
              if (Array.isArray(gData.calificaciones)) {
                const prevCount = gData.calificaciones.length;
                gData.calificaciones = gData.calificaciones.filter((c: any) => !idsABorrar.includes(c?.actividad_id));
                if (gData.calificaciones.length !== prevCount) syncModificado = true;
              }
              if (Array.isArray(gData.calificacionesApartados)) {
                const prevCount = gData.calificacionesApartados.length;
                gData.calificacionesApartados = gData.calificacionesApartados.filter((ca: any) => !idsABorrar.includes(ca?.actividad_id));
                if (gData.calificacionesApartados.length !== prevCount) syncModificado = true;
              }
            }
            if (Array.isArray(dataSync.actividades)) {
              const prevCount = dataSync.actividades.length;
              dataSync.actividades = dataSync.actividades.filter((a: any) => !idsABorrar.includes(a?.id));
              if (dataSync.actividades.length !== prevCount) syncModificado = true;
            }

            if (syncModificado) {
              await supabase
                .from("cuadernos_sync")
                .update({ data: dataSync, updated_at: new Date().toISOString() })
                .eq("id", syncRow.id);
            }
          }
        } catch {
          // Si cuadernos_sync no existe en el esquema remoto, continuar sin bloquear la respuesta
        }

        return new Response(
          JSON.stringify({
            success: true,
            eliminadas: idsABorrar,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // =========================================================================
      // ELIMINACIÓN DE RÚBRICAS EN LOTE (CASCADA DE ACTIVIDADES ASOCIADAS)
      // =========================================================================
      const isEliminarRubricas = body?.tipo === 'eliminar_rubricas';
      if (isEliminarRubricas) {
        const rubricaIds = Array.isArray(body?.rubricaIds)
          ? body.rubricaIds.map((id: any) => String(id).trim()).filter(Boolean)
          : [];

        if (rubricaIds.length === 0) {
          return new Response(
            JSON.stringify({ error: "Debe proporcionar al menos un ID de rúbrica a eliminar." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // 1. Verificación de propiedad del grupo
        const { data: grupo, error: grupoError } = await supabase
          .from("grupos")
          .select("id, profesor_id")
          .eq("id", targetGrupoId)
          .eq("profesor_id", profesor.id)
          .maybeSingle();

        if (grupoError || !grupo) {
          return new Response(
            JSON.stringify({ error: "Grupo no encontrado o no pertenece al docente autenticado." }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // 2. Filtrar rúbricas que pertenecen al grupo
        const { data: rubsValidas, error: rubsError } = await supabase
          .from("rubricas")
          .select("id")
          .eq("grupo_id", grupo.id)
          .in("id", rubricaIds);

        if (rubsError) {
          return new Response(
            JSON.stringify({ error: `Error al comprobar rúbricas del grupo: ${rubsError.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const idsABorrar = (rubsValidas || []).map((r: any) => r.id);
        if (idsABorrar.length === 0) {
          return new Response(
            JSON.stringify({ error: "Ninguna de las rúbricas indicadas pertenece a este grupo." }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // 3. Obtener actividades asociadas a estas rúbricas para eliminarlas en cascada
        const { data: actsAsoc, error: actsAsocErr } = await supabase
          .from("actividades")
          .select("id")
          .eq("grupo_id", grupo.id)
          .in("rubrica_id", idsABorrar);

        if (actsAsocErr) {
          return new Response(
            JSON.stringify({ error: `Error al comprobar actividades vinculadas a las rúbricas: ${actsAsocErr.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const idsActsAsoc: string[] = (actsAsoc || []).map((a: any) => a.id);

        // 4. Eliminar calificaciones por apartado asociadas a las rúbricas
        const { error: errCalifApRub } = await supabase
          .from("calificaciones_apartados")
          .delete()
          .eq("grupo_id", grupo.id)
          .in("rubrica_id", idsABorrar);

        if (errCalifApRub) {
          return new Response(
            JSON.stringify({ error: `Error al eliminar calificaciones de apartados por rúbrica: ${errCalifApRub.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // 5. Si hay actividades asociadas, eliminar también sus calificaciones y apartados
        if (idsActsAsoc.length > 0) {
          const { error: errCalifApAct } = await supabase
            .from("calificaciones_apartados")
            .delete()
            .eq("grupo_id", grupo.id)
            .in("actividad_id", idsActsAsoc);

          if (errCalifApAct) {
            return new Response(
              JSON.stringify({ error: `Error al eliminar calificaciones de apartados de actividades vinculadas: ${errCalifApAct.message}` }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          const { error: errCalifActs } = await supabase
            .from("calificaciones")
            .delete()
            .eq("grupo_id", grupo.id)
            .in("actividad_id", idsActsAsoc);

          if (errCalifActs) {
            return new Response(
              JSON.stringify({ error: `Error al eliminar calificaciones de actividades vinculadas: ${errCalifActs.message}` }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          // Eliminar las actividades asociadas
          const { error: delActsErr } = await supabase
            .from("actividades")
            .delete()
            .eq("grupo_id", grupo.id)
            .in("id", idsActsAsoc);

          if (delActsErr) {
            return new Response(
              JSON.stringify({ error: `Error al eliminar actividades vinculadas en Supabase: ${delActsErr.message}` }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        // 6. Eliminar las rúbricas
        const { error: delRubError } = await supabase
          .from("rubricas")
          .delete()
          .eq("grupo_id", grupo.id)
          .in("id", idsABorrar);

        if (delRubError) {
          return new Response(
            JSON.stringify({ error: `Error al eliminar rúbricas en Supabase: ${delRubError.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // 7. Sincronizar y depurar cuadernos_sync si existe para el docente
        try {
          const { data: syncRow, error: syncQueryErr } = await supabase
            .from("cuadernos_sync")
            .select("id, data")
            .eq("profesor_id", profesor.id)
            .maybeSingle();

          if (!syncQueryErr && syncRow && syncRow.data) {
            const dataSync = { ...syncRow.data };
            let syncModificado = false;

            if (dataSync.grupos && dataSync.grupos[grupo.id]) {
              const gData = dataSync.grupos[grupo.id];
              if (Array.isArray(gData.rubricas)) {
                const prevCount = gData.rubricas.length;
                gData.rubricas = gData.rubricas.filter((r: any) => !idsABorrar.includes(r?.id));
                if (gData.rubricas.length !== prevCount) syncModificado = true;
              }
              if (idsActsAsoc.length > 0 && Array.isArray(gData.actividades)) {
                const prevCount = gData.actividades.length;
                gData.actividades = gData.actividades.filter((a: any) => !idsActsAsoc.includes(a?.id));
                if (gData.actividades.length !== prevCount) syncModificado = true;
              }
              if (idsActsAsoc.length > 0 && Array.isArray(gData.calificaciones)) {
                const prevCount = gData.calificaciones.length;
                gData.calificaciones = gData.calificaciones.filter((c: any) => !idsActsAsoc.includes(c?.actividad_id));
                if (gData.calificaciones.length !== prevCount) syncModificado = true;
              }
              if (Array.isArray(gData.calificacionesApartados)) {
                const prevCount = gData.calificacionesApartados.length;
                gData.calificacionesApartados = gData.calificacionesApartados.filter(
                  (ca: any) => !idsABorrar.includes(ca?.rubrica_id) && !idsActsAsoc.includes(ca?.actividad_id)
                );
                if (gData.calificacionesApartados.length !== prevCount) syncModificado = true;
              }
            }
            if (Array.isArray(dataSync.rubricas)) {
              const prevCount = dataSync.rubricas.length;
              dataSync.rubricas = dataSync.rubricas.filter((r: any) => !idsABorrar.includes(r?.id));
              if (dataSync.rubricas.length !== prevCount) syncModificado = true;
            }
            if (idsActsAsoc.length > 0 && Array.isArray(dataSync.actividades)) {
              const prevCount = dataSync.actividades.length;
              dataSync.actividades = dataSync.actividades.filter((a: any) => !idsActsAsoc.includes(a?.id));
              if (dataSync.actividades.length !== prevCount) syncModificado = true;
            }

            if (syncModificado) {
              await supabase
                .from("cuadernos_sync")
                .update({ data: dataSync, updated_at: new Date().toISOString() })
                .eq("id", syncRow.id);
            }
          }
        } catch {
          // Continuar si la tabla de respaldo no existe
        }

        return new Response(
          JSON.stringify({
            success: true,
            eliminadas: idsABorrar,
            actividadesEliminadas: idsActsAsoc,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Comprobación de si es petición para calificaciones de apartados
      const isApartados = body?.tipo === 'apartados' 
        || Boolean(body?.calificacionesApartados) 
        || url.pathname.includes('/calificaciones-apartados');

      if (isApartados) {
        const rawApartados = Array.isArray(body?.calificacionesApartados) 
          ? body.calificacionesApartados 
          : (Array.isArray(body?.calificaciones) ? body.calificaciones : []);
        const rawRetirarApartados = Array.isArray(body?.retirar) ? body.retirar : [];

        const itemsAGuardarApartados: Array<{
          alumnoId: string;
          apartadoId: string;
          rubricaId: string;
          actividadId?: string | null;
          nota: number;
        }> = [];
        const itemsARetirarApartados: Array<{
          alumnoId: string;
          apartadoId: string;
          rubricaId: string;
          actividadId?: string | null;
        }> = [];

        for (let i = 0; i < rawApartados.length; i++) {
          const item = rawApartados[i];
          if (!item || typeof item !== "object") continue;
          const alId = typeof item.alumnoId === "string" ? item.alumnoId.trim() : "";
          const apId = typeof item.apartadoId === "string" ? item.apartadoId.trim() : "";
          const rubId = typeof item.rubricaId === "string" ? item.rubricaId.trim() : "";
          const actId = typeof item.actividadId === "string" && item.actividadId.trim() ? item.actividadId.trim() : null;

          if (!alId || !apId || !rubId) continue;

          if (item.nota !== null && item.nota !== undefined) {
            const num = Number(item.nota);
            if (!isNaN(num) && isFinite(num) && num >= 0 && num <= 10) {
              itemsAGuardarApartados.push({
                alumnoId: alId,
                apartadoId: apId,
                rubricaId: rubId,
                actividadId: actId,
                nota: num,
              });
            }
          } else {
            itemsARetirarApartados.push({
              alumnoId: alId,
              apartadoId: apId,
              rubricaId: rubId,
              actividadId: actId,
            });
          }
        }

        for (let i = 0; i < rawRetirarApartados.length; i++) {
          const item = rawRetirarApartados[i];
          if (!item || typeof item !== "object") continue;
          const alId = typeof item.alumnoId === "string" ? item.alumnoId.trim() : "";
          const apId = typeof item.apartadoId === "string" ? item.apartadoId.trim() : "";
          const rubId = typeof item.rubricaId === "string" ? item.rubricaId.trim() : "";
          const actId = typeof item.actividadId === "string" && item.actividadId.trim() ? item.actividadId.trim() : null;
          if (alId && apId && rubId) {
            itemsARetirarApartados.push({ alumnoId: alId, apartadoId: apId, rubricaId: rubId, actividadId: actId });
          }
        }

        // Verificación de propiedad del grupo
        const { data: grupo, error: grupoError } = await supabase
          .from("grupos")
          .select("id, profesor_id")
          .eq("id", targetGrupoId)
          .eq("profesor_id", profesor.id)
          .maybeSingle();

        if (grupoError || !grupo) {
          return new Response(
            JSON.stringify({ error: "Grupo no encontrado o no pertenece al docente autenticado." }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Ejecución transaccional mediante RPC o tabla directa
        const payloadGuardar = itemsAGuardarApartados.map((it) => ({
          alumno_id: it.alumnoId,
          apartado_id: it.apartadoId,
          rubrica_id: it.rubricaId,
          actividad_id: it.actividadId,
          nota: it.nota,
        }));
        const payloadRetirar = itemsARetirarApartados.map((it) => ({
          alumno_id: it.alumnoId,
          apartado_id: it.apartadoId,
          rubrica_id: it.rubricaId,
          actividad_id: it.actividadId,
        }));

        let rpcResult: any = null;
        let rpcError: any = null;

        try {
          const res = await supabase.rpc("persistir_calificaciones_apartados_lote", {
            p_grupo_id: grupo.id,
            p_guardar: payloadGuardar,
            p_retirar: payloadRetirar,
          });
          rpcResult = res.data;
          rpcError = res.error;
        } catch (e) {
          rpcError = e;
        }

        // Solo activar fallback si se confirma formalmente que la función RPC no existe en Supabase
        const isMissingRpc = Boolean(
          rpcError && (
            rpcError.code === "42883" || // undefined_function
            rpcError.code === "PGRST202" || // PostgREST function not found in schema cache
            (typeof rpcError.message === "string" &&
              rpcError.message.toLowerCase().includes("persistir_calificaciones_apartados_lote") &&
              rpcError.message.toLowerCase().includes("does not exist"))
          )
        );

        if (isMissingRpc) {
          // Validar pertenencia estricta de todas las entidades antes de cualquier escritura directa
          const uniqueAlumnoIds = Array.from(new Set([
            ...payloadGuardar.map((p) => p.alumno_id),
            ...payloadRetirar.map((p) => p.alumno_id),
          ]));
          if (uniqueAlumnoIds.length > 0) {
            const { data: alumnosValidos, error: alErr } = await supabase
              .from("alumnos")
              .select("id")
              .eq("grupo_id", grupo.id)
              .in("id", uniqueAlumnoIds);
            if (alErr || !alumnosValidos || alumnosValidos.length !== uniqueAlumnoIds.length) {
              return new Response(
                JSON.stringify({ error: "Uno o más alumnos no pertenecen al grupo autorizado." }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          }

          const uniqueRubricaIds = Array.from(new Set([
            ...payloadGuardar.map((p) => p.rubrica_id),
            ...payloadRetirar.map((p) => p.rubrica_id),
          ]));
          if (uniqueRubricaIds.length > 0) {
            const { data: rubricasValidas, error: rubErr } = await supabase
              .from("rubricas")
              .select("id")
              .eq("grupo_id", grupo.id)
              .in("id", uniqueRubricaIds);
            if (rubErr || !rubricasValidas || rubricasValidas.length !== uniqueRubricaIds.length) {
              return new Response(
                JSON.stringify({ error: "Una o más rúbricas no pertenecen al grupo autorizado." }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          }

          const uniqueActividadIds = Array.from(new Set([
            ...payloadGuardar.map((p) => p.actividad_id).filter(Boolean),
            ...payloadRetirar.map((p) => p.actividad_id).filter(Boolean),
          ])) as string[];
          if (uniqueActividadIds.length > 0) {
            const { data: actividadesValidas, error: actErr } = await supabase
              .from("actividades")
              .select("id")
              .eq("grupo_id", grupo.id)
              .in("id", uniqueActividadIds);
            if (actErr || !actividadesValidas || actividadesValidas.length !== uniqueActividadIds.length) {
              return new Response(
                JSON.stringify({ error: "Una o más actividades no pertenecen al grupo autorizado." }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          }

          // Fallback directo sobre la tabla
          if (payloadRetirar.length > 0) {
            for (const ret of payloadRetirar) {
              let query = supabase
                .from("calificaciones_apartados")
                .delete()
                .eq("grupo_id", grupo.id)
                .eq("alumno_id", ret.alumno_id)
                .eq("rubrica_id", ret.rubrica_id)
                .eq("apartado_id", ret.apartado_id);
              if (ret.actividad_id) {
                query = query.eq("actividad_id", ret.actividad_id);
              } else {
                query = query.is("actividad_id", null);
              }
              await query;
            }
          }

          if (payloadGuardar.length > 0) {
            for (const g of payloadGuardar) {
              let findQuery = supabase
                .from("calificaciones_apartados")
                .select("id")
                .eq("grupo_id", grupo.id)
                .eq("alumno_id", g.alumno_id)
                .eq("rubrica_id", g.rubrica_id)
                .eq("apartado_id", g.apartado_id);
              if (g.actividad_id) {
                findQuery = findQuery.eq("actividad_id", g.actividad_id);
              } else {
                findQuery = findQuery.is("actividad_id", null);
              }
              const { data: existingRow } = await findQuery.maybeSingle();

              if (existingRow?.id) {
                await supabase
                  .from("calificaciones_apartados")
                  .update({
                    nota: g.nota,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", existingRow.id);
              } else {
                await supabase
                  .from("calificaciones_apartados")
                  .insert({
                    grupo_id: grupo.id,
                    alumno_id: g.alumno_id,
                    actividad_id: g.actividad_id || null,
                    rubrica_id: g.rubrica_id,
                    apartado_id: g.apartado_id,
                    nota: g.nota,
                    updated_at: new Date().toISOString(),
                  });
              }
            }
          }

          const { data: allApartados } = await supabase
            .from("calificaciones_apartados")
            .select("*")
            .eq("grupo_id", grupo.id);

          return new Response(
            JSON.stringify({
              success: true,
              guardadas: payloadGuardar.length,
              retiradas: payloadRetirar.length,
              actualizadas: payloadGuardar.length + payloadRetirar.length,
              calificacionesApartados: allApartados || [],
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } else if (rpcError) {
          return new Response(
            JSON.stringify({ error: `Error al persistir calificaciones de apartados: ${rpcError.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            guardadas: typeof rpcResult?.guardadas === "number" ? rpcResult.guardadas : itemsAGuardarApartados.length,
            retiradas: typeof rpcResult?.retiradas === "number" ? rpcResult.retiradas : itemsARetirarApartados.length,
            actualizadas: typeof rpcResult?.actualizadas === "number" ? rpcResult.actualizadas : (itemsAGuardarApartados.length + itemsARetirarApartados.length),
            calificacionesApartados: rpcResult?.calificacionesApartados || [],
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Clasificación explícita de operaciones: Guardar (nota numérica finita 0-10) vs Retirar (pendiente/ausencia de fila)
      if (body?.calificaciones !== undefined && !Array.isArray(body?.calificaciones)) {
        return new Response(
          JSON.stringify({ error: "El campo 'calificaciones' debe ser un array si se proporciona." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (body?.retirar !== undefined && !Array.isArray(body?.retirar)) {
        return new Response(
          JSON.stringify({ error: "El campo 'retirar' debe ser un array si se proporciona." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const rawCalificaciones = Array.isArray(body?.calificaciones) ? body.calificaciones : [];
      const rawRetirar = Array.isArray(body?.retirar) ? body.retirar : [];

      const itemsAGuardar: Array<{ alumnoId: string; actividadId: string; nota: number }> = [];
      const itemsARetirar: Array<{ alumnoId: string; actividadId: string }> = [];

      // 7.1. Validación y clasificación de 'calificaciones'
      for (let i = 0; i < rawCalificaciones.length; i++) {
        const item = rawCalificaciones[i];
        if (!item || typeof item !== "object") {
          return new Response(
            JSON.stringify({ error: `Elemento #${i + 1} del array de calificaciones tiene una estructura inválida.` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (typeof item.alumnoId !== "string" || item.alumnoId.trim() === "") {
          return new Response(
            JSON.stringify({ error: `Elemento #${i + 1} no incluye un 'alumnoId' válido.` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (typeof item.actividadId !== "string" || item.actividadId.trim() === "") {
          return new Response(
            JSON.stringify({ error: `Elemento #${i + 1} no incluye un 'actividadId' válido.` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (item.nota !== null && item.nota !== undefined) {
          const numNota = Number(item.nota);
          if (typeof item.nota !== "number" || isNaN(numNota) || !isFinite(numNota) || numNota < 0 || numNota > 10) {
            return new Response(
              JSON.stringify({ error: `La calificación de ${item.nota} en el elemento #${i + 1} está fuera del rango permitido (0-10) o no es numérica.` }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          itemsAGuardar.push({
            alumnoId: item.alumnoId.trim(),
            actividadId: item.actividadId.trim(),
            nota: numNota,
          });
        } else {
          // Nota null o desmarcada se clasifica como orden explícita de retirar (pendiente)
          itemsARetirar.push({
            alumnoId: item.alumnoId.trim(),
            actividadId: item.actividadId.trim(),
          });
        }
      }

      // 7.2. Validación de lista explícita 'retirar'
      for (let i = 0; i < rawRetirar.length; i++) {
        const item = rawRetirar[i];
        if (!item || typeof item !== "object") {
          return new Response(
            JSON.stringify({ error: `Elemento #${i + 1} del array 'retirar' tiene una estructura inválida.` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (typeof item.alumnoId !== "string" || item.alumnoId.trim() === "") {
          return new Response(
            JSON.stringify({ error: `Elemento #${i + 1} de 'retirar' no incluye un 'alumnoId' válido.` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (typeof item.actividadId !== "string" || item.actividadId.trim() === "") {
          return new Response(
            JSON.stringify({ error: `Elemento #${i + 1} de 'retirar' no incluye un 'actividadId' válido.` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        itemsARetirar.push({
          alumnoId: item.alumnoId.trim(),
          actividadId: item.actividadId.trim(),
        });
      }

      // 7.2.1. Verificación de coherencia del lote: ninguna tupla puede figurar a la vez en guardar y retirar
      const setGuardar = new Set(itemsAGuardar.map((i) => `${i.alumnoId}:::${i.actividadId}`));
      for (const ret of itemsARetirar) {
        if (setGuardar.has(`${ret.alumnoId}:::${ret.actividadId}`)) {
          return new Response(
            JSON.stringify({ error: `Incoherencia en lote: la tupla alumno '${ret.alumnoId}' y actividad '${ret.actividadId}' figura simultáneamente para guardar y retirar.` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      const totalOperaciones = itemsAGuardar.length + itemsARetirar.length;
      if (totalOperaciones === 0) {
        return new Response(
          JSON.stringify({ error: "Se requiere al menos una calificación para guardar o retirar." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (totalOperaciones > 500) {
        return new Response(
          JSON.stringify({ error: "Límite excedido: no se pueden procesar más de 500 operaciones por lote." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 7.3. Verificación estricta de propiedad: el grupo DEBE pertenecer al profesor resuelto
      const { data: grupo, error: grupoError } = await supabase
        .from("grupos")
        .select("id, profesor_id")
        .eq("id", targetGrupoId)
        .eq("profesor_id", profesor.id)
        .maybeSingle();

      if (grupoError) {
        return new Response(
          JSON.stringify({ error: "Error al verificar la propiedad del grupo." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!grupo) {
        return new Response(
          JSON.stringify({ error: "Grupo no encontrado o no pertenece al docente autenticado." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 7.4. Verificación de pertenencia de alumnos y actividades al grupo
      const allAlumnoIds = Array.from(new Set([
        ...itemsAGuardar.map((c) => c.alumnoId),
        ...itemsARetirar.map((c) => c.alumnoId),
      ]));
      const allActividadIds = Array.from(new Set([
        ...itemsAGuardar.map((c) => c.actividadId),
        ...itemsARetirar.map((c) => c.actividadId),
      ]));

      const [alumnosCheck, actividadesCheck] = await Promise.all([
        supabase
          .from("alumnos")
          .select("id")
          .eq("grupo_id", grupo.id)
          .in("id", allAlumnoIds),
        supabase
          .from("actividades")
          .select("id")
          .eq("grupo_id", grupo.id)
          .in("id", allActividadIds),
      ]);

      if (alumnosCheck.error || actividadesCheck.error) {
        return new Response(
          JSON.stringify({ error: "Error al validar la pertenencia de alumnos o actividades al grupo." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const alumnosEncontrados = new Set((alumnosCheck.data || []).map((a: any) => a.id));
      for (const alId of allAlumnoIds) {
        if (!alumnosEncontrados.has(alId)) {
          return new Response(
            JSON.stringify({ error: `El alumno con ID '${alId}' no pertenece al grupo especificado.` }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      const actividadesEncontradas = new Set((actividadesCheck.data || []).map((a: any) => a.id));
      for (const actId of allActividadIds) {
        if (!actividadesEncontradas.has(actId)) {
          return new Response(
            JSON.stringify({ error: `La actividad con ID '${actId}' no pertenece al grupo especificado.` }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // 7.5. Invocación atómica transaccional de persistencia mediante función RPC en PostgreSQL
      const payloadGuardar = itemsAGuardar.map((item) => ({
        alumno_id: item.alumnoId,
        actividad_id: item.actividadId,
        nota: item.nota,
      }));

      const payloadRetirar = itemsARetirar.map((item) => ({
        alumno_id: item.alumnoId,
        actividad_id: item.actividadId,
      }));

      let rpcResult: any = null;
      let rpcError: any = null;

      try {
        const res = await supabase.rpc(
          "persistir_calificaciones_lote",
          {
            p_grupo_id: grupo.id,
            p_guardar: payloadGuardar,
            p_retirar: payloadRetirar,
          }
        );
        rpcResult = res.data;
        rpcError = res.error;
      } catch (e) {
        rpcError = e;
      }

      // Solo activar fallback si se confirma formalmente que la función RPC no existe en Supabase
      const errCode = String(rpcError?.code || "").trim().toUpperCase();
      const errMsg = typeof rpcError?.message === "string" ? rpcError.message.toLowerCase() : "";
      const errDetails = typeof rpcError?.details === "string" ? rpcError.details.toLowerCase() : "";
      const errHint = typeof rpcError?.hint === "string" ? rpcError.hint.toLowerCase() : "";
      const rawErrStr = String(rpcError || "").toLowerCase();
      const combinedText = `${errMsg} ${errDetails} ${errHint} ${rawErrStr}`;

      const mentionsRpc = combinedText.includes("persistir_calificaciones_lote");
      const isSchemaCacheMissing =
        combinedText.includes("could not find the function") &&
        combinedText.includes("schema cache");
      const isExplicitMissingMsg =
        mentionsRpc &&
        (combinedText.includes("does not exist") ||
          combinedText.includes("no existe la función") ||
          combinedText.includes("undefined function") ||
          combinedText.includes("not found"));

      const isMissingRpc = Boolean(
        rpcError &&
          (errCode === "42883" || // PostgreSQL: undefined_function
            errCode === "PGRST202" || // PostgREST: function not found in schema cache
            isSchemaCacheMissing || // Mensaje estándar de PostgREST schema cache
            isExplicitMissingMsg) // Mensaje inequívoco de función persistir_calificaciones_lote inexistente
      );

      if (isMissingRpc) {
        // Fallback directo sobre public.calificaciones (con validación de pertenencia al grupo ya superada).
        // AVISO TÉCNICO: Este fallback realiza peticiones individuales directas y NO garantiza atomicidad de transacción.
        let retiradasContador = 0;
        let guardadasContador = 0;

        if (payloadRetirar.length > 0) {
          for (let i = 0; i < payloadRetirar.length; i++) {
            const ret = payloadRetirar[i];
            const { error: delError } = await supabase
              .from("calificaciones")
              .delete()
              .eq("grupo_id", grupo.id)
              .eq("alumno_id", ret.alumno_id)
              .eq("actividad_id", ret.actividad_id);

            if (delError) {
              console.error("[fernanditio-data] Fallback error al retirar calificación:", delError);
              return new Response(
                JSON.stringify({
                  error: `Error al retirar calificación en Supabase: ${delError.message || delError.code || "Fallo en operación de borrado"}`,
                  code: delError.code,
                  operacion: "delete",
                  indice: i,
                  completadasParciales: {
                    retiradas: retiradasContador,
                    guardadas: guardadasContador,
                  },
                  esAtomico: false,
                }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
            retiradasContador++;
          }
        }

        if (payloadGuardar.length > 0) {
          for (let i = 0; i < payloadGuardar.length; i++) {
            const g = payloadGuardar[i];
            const { data: existingRow, error: selectError } = await supabase
              .from("calificaciones")
              .select("id")
              .eq("grupo_id", grupo.id)
              .eq("alumno_id", g.alumno_id)
              .eq("actividad_id", g.actividad_id)
              .maybeSingle();

            if (selectError) {
              console.error("[fernanditio-data] Fallback error al consultar existencia previa de calificación:", selectError);
              return new Response(
                JSON.stringify({
                  error: `Error al verificar calificación previa en Supabase: ${selectError.message || selectError.code || "Fallo en verificación"}`,
                  code: selectError.code,
                  operacion: "select",
                  indice: i,
                  completadasParciales: {
                    retiradas: retiradasContador,
                    guardadas: guardadasContador,
                  },
                  esAtomico: false,
                }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }

            if (existingRow?.id) {
              const { error: updateError } = await supabase
                .from("calificaciones")
                .update({
                  nota: g.nota,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", existingRow.id);

              if (updateError) {
                console.error("[fernanditio-data] Fallback error al actualizar calificación:", updateError);
                return new Response(
                  JSON.stringify({
                    error: `Error al actualizar calificación en Supabase: ${updateError.message || updateError.code || "Fallo en operación de actualización"}`,
                    code: updateError.code,
                    operacion: "update",
                    indice: i,
                    completadasParciales: {
                      retiradas: retiradasContador,
                      guardadas: guardadasContador,
                    },
                    esAtomico: false,
                  }),
                  { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
              }
            } else {
              const { error: insertError } = await supabase
                .from("calificaciones")
                .insert({
                  grupo_id: grupo.id,
                  alumno_id: g.alumno_id,
                  actividad_id: g.actividad_id,
                  nota: g.nota,
                  updated_at: new Date().toISOString(),
                });

              if (insertError) {
                console.error("[fernanditio-data] Fallback error al insertar calificación:", insertError);
                return new Response(
                  JSON.stringify({
                    error: `Error al insertar calificación en Supabase: ${insertError.message || insertError.code || "Fallo en operación de inserción"}`,
                    code: insertError.code,
                    operacion: "insert",
                    indice: i,
                    completadasParciales: {
                      retiradas: retiradasContador,
                      guardadas: guardadasContador,
                    },
                    esAtomico: false,
                  }),
                  { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
              }
            }
            guardadasContador++;
          }
        }

        const { data: allCalificaciones, error: fetchError } = await supabase
          .from("calificaciones")
          .select("*")
          .eq("grupo_id", grupo.id);

        if (fetchError) {
          console.error("[fernanditio-data] Fallback error al recuperar calificaciones finales:", fetchError);
          return new Response(
            JSON.stringify({
              error: `Las operaciones individuales finalizaron pero falló la consulta final de calificaciones: ${fetchError.message || fetchError.code || "Fallo de consulta"}`,
              code: fetchError.code,
              operacion: "select_all",
              completadasParciales: {
                retiradas: retiradasContador,
                guardadas: guardadasContador,
              },
              esAtomico: false,
            }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            guardadas: payloadGuardar.length,
            retiradas: payloadRetirar.length,
            actualizadas: payloadGuardar.length + payloadRetirar.length,
            calificaciones: allCalificaciones || [],
            esAtomico: false,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else if (rpcError) {
        console.error("[fernanditio-data] Error en RPC persistir_calificaciones_lote:", rpcError);
        return new Response(
          JSON.stringify({ error: `Error atómico al persistir calificaciones en Supabase: ${rpcError.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!rpcResult || typeof rpcResult !== "object" || !Array.isArray(rpcResult.calificaciones)) {
        return new Response(
          JSON.stringify({ error: "Respuesta inesperada de la función transaccional de calificaciones en PostgreSQL." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          guardadas: typeof rpcResult.guardadas === "number" ? rpcResult.guardadas : itemsAGuardar.length,
          retiradas: typeof rpcResult.retiradas === "number" ? rpcResult.retiradas : itemsARetirar.length,
          actualizadas: typeof rpcResult.actualizadas === "number" ? rpcResult.actualizadas : (itemsAGuardar.length + itemsARetirar.length),
          calificaciones: rpcResult.calificaciones,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawGrupoId = url.searchParams.get("grupoId") || url.searchParams.get("id");
    const grupoId = rawGrupoId ? rawGrupoId.trim() : null;
    const isCuadernoPath = url.pathname.includes("/cuaderno");

    // 8. RUTA B: Lectura detallada del cuaderno de un grupo específico
    if (isCuadernoPath || Boolean(grupoId)) {
      if (!grupoId) {
        return new Response(
          JSON.stringify({ error: "Parámetro 'grupoId' requerido para consultar el cuaderno del grupo." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 7.1. Comprobación estricta de propiedad: el grupo DEBE pertenecer al profesor resuelto
      const { data: grupo, error: grupoError } = await supabase
        .from("grupos")
        .select("id, profesor_id, nombre, oculto, created_at, updated_at")
        .eq("id", grupoId)
        .eq("profesor_id", profesor.id)
        .maybeSingle();

      if (grupoError) {
        return new Response(
          JSON.stringify({ error: "Error al verificar la propiedad del grupo." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!grupo) {
        // Rechazo seguro: no se expone si el grupo existe para otro profesor
        return new Response(
          JSON.stringify({ error: "Grupo no encontrado o no pertenece al docente autenticado." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 7.2. Consultas en paralelo de las entidades secundarias del grupo verificado
      const [
        alumnosResult,
        criteriosResult,
        seccionesResult,
        rubricasResult,
        actividadesResult,
        calificacionesResult,
      ] = await Promise.all([
        supabase
          .from("alumnos")
          .select("id, grupo_id, nombre, orden, created_at")
          .eq("grupo_id", grupo.id)
          .order("orden", { ascending: true }),
        supabase
          .from("criterios")
          .select("id, grupo_id, codigo, descripcion, ponderacion")
          .eq("grupo_id", grupo.id)
          .order("codigo", { ascending: true }),
        supabase
          .from("secciones")
          .select("id, grupo_id, nombre, color, ponderacion, oculto")
          .eq("grupo_id", grupo.id)
          .order("nombre", { ascending: true }),
        supabase
          .from("rubricas")
          .select("id, grupo_id, titulo, tipo, descripcion, items")
          .eq("grupo_id", grupo.id)
          .order("titulo", { ascending: true }),
        supabase
          .from("actividades")
          .select("id, grupo_id, evaluacion_periodo, nombre, tipo, seccion_id, metodo, rubrica_id")
          .eq("grupo_id", grupo.id)
          .order("nombre", { ascending: true }),
        supabase
          .from("calificaciones")
          .select("id, grupo_id, alumno_id, actividad_id, nota, updated_at")
          .eq("grupo_id", grupo.id),
      ]);

      if (
        alumnosResult.error ||
        criteriosResult.error ||
        seccionesResult.error ||
        rubricasResult.error ||
        actividadesResult.error ||
        calificacionesResult.error
      ) {
        return new Response(
          JSON.stringify({ error: "Error al recuperar los registros del grupo en Supabase." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      interface RubricaRecord {
        id: string;
        grupo_id?: string;
        titulo?: string;
        tipo?: string;
        descripcion?: string | null;
        items?: unknown;
      }

      const rubricas: RubricaRecord[] = rubricasResult.data || [];
      const rubricasMap = new Map<string, RubricaRecord>(rubricas.map((r) => [r.id, r]));

      // 7.3. Diagnóstico no destructivo de relaciones actividades ↔ rúbricas ↔ criterios
      const actividadesDetalle = (actividadesResult.data || []).map((act: any) => {
        const codigosSet = new Set<string>();
        let estadoVinculacion: "rubrica_confirmada" | "pendiente_verificar" | "sin_rubrica" = "sin_rubrica";
        let advertenciaRubrica: string | null = null;

        if (act.rubrica_id) {
          const rubricaAsociada = rubricasMap.get(act.rubrica_id);
          if (rubricaAsociada) {
            estadoVinculacion = "rubrica_confirmada";
            // Inspeccionar rubrica.items sin alterar el JSONB original
            const items = Array.isArray(rubricaAsociada.items)
              ? rubricaAsociada.items
              : [];

            for (const item of items) {
              if (item && typeof item === "object") {
                const itemObj = item as Record<string, unknown>;
                // Reconocer propiedad singular 'criterio'
                if (typeof itemObj.criterio === "string" && itemObj.criterio.trim() !== "") {
                  codigosSet.add(itemObj.criterio.trim());
                }
                // Reconocer propiedad plural 'criterios' (array de códigos)
                if (Array.isArray(itemObj.criterios)) {
                  for (const cod of itemObj.criterios) {
                    if (typeof cod === "string" && cod.trim() !== "") {
                      codigosSet.add(cod.trim());
                    }
                  }
                }
              }
            }
          } else {
            estadoVinculacion = "pendiente_verificar";
            advertenciaRubrica = "La rúbrica referenciada no existe o no pertenece a este grupo.";
          }
        } else {
          estadoVinculacion = "sin_rubrica";
          advertenciaRubrica = "Vinculación con criterios pendiente de verificar (actividad sin rúbrica asociada).";
        }

        return {
          ...act,
          criteriosCodigos: Array.from(codigosSet),
          estadoVinculacion,
          advertenciaRubrica,
        };
      });

      // 7.4. Recuperar calificaciones individuales por apartado si la tabla existe
      let calificacionesApartados: any[] = [];
      try {
        const { data: capData, error: capError } = await supabase
          .from("calificaciones_apartados")
          .select("id, grupo_id, alumno_id, actividad_id, rubrica_id, apartado_id, nota, updated_at")
          .eq("grupo_id", grupo.id);
        if (!capError && Array.isArray(capData)) {
          calificacionesApartados = capData;
        }
      } catch (err) {
        console.warn("[fernanditio-data] calificaciones_apartados aún no disponible:", err);
      }

      const responsePayload = {
        grupo,
        alumnos: alumnosResult.data || [],
        criterios: criteriosResult.data || [],
        secciones: seccionesResult.data || [],
        rubricas,
        actividades: actividadesDetalle,
        calificaciones: calificacionesResult.data || [],
        calificacionesApartados,
        estadisticas: {
          totalAlumnos: (alumnosResult.data || []).length,
          totalCriterios: (criteriosResult.data || []).length,
          totalActividades: (actividadesResult.data || []).length,
          totalRubricas: rubricas.length,
          totalSecciones: (seccionesResult.data || []).length,
          totalCalificaciones: (calificacionesResult.data || []).length,
          totalCalificacionesApartados: calificacionesApartados.length,
        },
      };

      return new Response(
        JSON.stringify(responsePayload),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 9. RUTA A: Consultar exclusivamente la lista de grupos pertenecientes al profesor resuelto
    // Prohibición estricta de admitir profesor_id desde el cliente
    const { data: grupos, error: gruposError } = await supabase
      .from("grupos")
      .select("id, nombre, oculto, created_at, updated_at")
      .eq("profesor_id", profesor.id)
      .order("nombre", { ascending: true });

    if (gruposError) {
      return new Response(
        JSON.stringify({ error: "Error al recuperar los grupos del docente." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Respuesta segura: contiene únicamente la lista de grupos, sin información personal accesoria
    return new Response(
      JSON.stringify({ groups: grupos || [] }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("[fernanditio-data] Error no controlado en la ejecución:", err);
    return new Response(
      JSON.stringify({ error: "Error inesperado en el servidor." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
