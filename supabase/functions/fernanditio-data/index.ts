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

      const targetGrupoId = typeof body?.grupoId === "string" ? body.grupoId.trim() : "";
      if (!targetGrupoId) {
        return new Response(
          JSON.stringify({ error: "Parámetro obligatorio 'grupoId' no proporcionado en el cuerpo de la petición." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        "persistir_calificaciones_lote",
        {
          p_grupo_id: grupo.id,
          p_guardar: payloadGuardar,
          p_retirar: payloadRetirar,
        }
      );

      if (rpcError) {
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

      const responsePayload = {
        grupo,
        alumnos: alumnosResult.data || [],
        criterios: criteriosResult.data || [],
        secciones: seccionesResult.data || [],
        rubricas,
        actividades: actividadesDetalle,
        calificaciones: calificacionesResult.data || [],
        estadisticas: {
          totalAlumnos: (alumnosResult.data || []).length,
          totalCriterios: (criteriosResult.data || []).length,
          totalActividades: (actividadesResult.data || []).length,
          totalRubricas: rubricas.length,
          totalSecciones: (seccionesResult.data || []).length,
          totalCalificaciones: (calificacionesResult.data || []).length,
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
