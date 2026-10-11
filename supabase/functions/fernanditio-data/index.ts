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
      "Access-Control-Allow-Methods": "GET, OPTIONS",
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
    // Solo se admite método GET en esta fase de lectura
    if (req.method !== "GET") {
      return new Response(
        JSON.stringify({ error: "Método no permitido. Solo se admite GET." }),
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
      // El correo es válido en Firebase pero no tiene ficha en public.profesores
      return new Response(
        JSON.stringify({ groups: [], error: null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const rawGrupoId = url.searchParams.get("grupoId") || url.searchParams.get("id");
    const grupoId = rawGrupoId ? rawGrupoId.trim() : null;
    const isCuadernoPath = url.pathname.includes("/cuaderno");

    // 7. RUTA B: Lectura detallada del cuaderno de un grupo específico
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

    // 8. RUTA A: Consultar exclusivamente la lista de grupos pertenecientes al profesor resuelto
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
