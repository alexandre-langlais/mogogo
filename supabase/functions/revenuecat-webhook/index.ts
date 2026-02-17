import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const WEBHOOK_SECRET = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");

// Events that carry a meaningful app_user_id → original_app_user_id mapping
const MAPPED_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "PRODUCT_CHANGE",
  "CANCELLATION",
  "EXPIRATION",
  "SUBSCRIBER_ALIAS",
]);

const TAG = "[RC-WH]";

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status });
}

Deno.serve(async (req: Request) => {
  const t0 = Date.now();
  const reqId = crypto.randomUUID().slice(0, 8);
  const log = (msg: string) => console.log(`${TAG} [${reqId}] ${msg} (${Date.now() - t0}ms)`);
  const warn = (msg: string) => console.warn(`${TAG} [${reqId}] ⚠️  ${msg} (${Date.now() - t0}ms)`);
  const err = (msg: string, e?: unknown) => console.error(`${TAG} [${reqId}] ❌ ${msg} (${Date.now() - t0}ms)`, e ?? "");

  // Pas de CORS : serveur-à-serveur uniquement
  if (req.method !== "POST") {
    warn(`405 Method ${req.method}`);
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ── Auth : vérifier le secret partagé ──
  const authHeader = req.headers.get("authorization");
  if (!WEBHOOK_SECRET || !authHeader) {
    warn("401 Missing secret or auth header");
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.replace("Bearer ", "");
  if (token !== WEBHOOK_SECRET) {
    warn("401 Invalid secret");
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // ── Parse le payload ──
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    warn("400 Invalid JSON");
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const event = body.event as Record<string, unknown> | undefined;
  if (!event || typeof event.type !== "string") {
    warn("400 Missing event.type");
    return jsonResponse({ error: "Missing event.type" }, 400);
  }

  const eventType = event.type as string;
  const appUserId = event.app_user_id as string | undefined;
  const originalAppUserId = event.original_app_user_id as string | undefined;

  log(`📩 ${eventType} | app=${appUserId?.slice(0, 12) ?? "?"} | orig=${originalAppUserId?.slice(0, 16) ?? "?"}`);

  // Events non mappés → 200 silencieux (ne pas bloquer RC)
  if (!MAPPED_EVENTS.has(eventType)) {
    log(`⏭️  Skipped (unmapped event)`);
    return jsonResponse({ ok: true, skipped: true });
  }

  if (!appUserId || !originalAppUserId) {
    warn("400 Missing app_user_id or original_app_user_id");
    return jsonResponse({ error: "Missing app_user_id or original_app_user_id" }, 400);
  }

  // ── Upsert le mapping en base ──
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error: rpcError } = await supabase.rpc("upsert_revenuecat_mapping", {
      p_app_user_id: appUserId,
      p_original_app_user_id: originalAppUserId,
    });

    if (rpcError) {
      err("500 RPC upsert_revenuecat_mapping failed", rpcError);
      return jsonResponse({ error: "Database error" }, 500);
    }

    log(`✅ Upserted ${appUserId.slice(0, 12)} → ${originalAppUserId.slice(0, 16)}`);
    return jsonResponse({ ok: true });
  } catch (e) {
    err("500 Uncaught", e);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
