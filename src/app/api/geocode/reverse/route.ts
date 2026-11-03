import { NextResponse } from "next/server";
import { z } from "zod";

const requestSchema = z.object({
  lng: z.number().finite().min(-180).max(180),
  lat: z.number().finite().min(-90).max(90),
  language: z.string().max(12).default("pt-BR"),
  reason: z.literal("missing-street-name"),
});

export async function POST(request: Request) {
  const token = process.env.MAPBOX_SECRET_TOKEN;
  if (!token) return NextResponse.json({ code: "MAPBOX_TOKEN_MISSING", error: "Credencial server-side Mapbox não configurada." }, { status: 503 });
  let payload: z.infer<typeof requestSchema>;
  try {
    payload = requestSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json({ code: "INVALID_REQUEST", error: error instanceof z.ZodError ? error.issues : "Payload inválido." }, { status: 400 });
  }

  const params = new URLSearchParams({ access_token: token, types: "street", language: payload.language, limit: "1" });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`https://api.mapbox.com/search/geocode/v6/reverse/${payload.lng},${payload.lat}?${params.toString()}`, { signal: controller.signal, cache: "no-store" });
    const body = await response.json().catch(() => null) as { features?: Array<{ id?: string; properties?: { name?: string }; text?: string }> } | null;
    if (!response.ok || !body) return NextResponse.json({ code: "UPSTREAM_ERROR", error: "Falha no reverse geocoding." }, { status: response.status === 429 ? 429 : 502 });
    const feature = body.features?.[0];
    return NextResponse.json({ streetName: feature?.properties?.name ?? feature?.text ?? null, source: feature ? "geocoding" : "unknown", retention: "temporary-not-persisted" });
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError";
    return NextResponse.json({ code: aborted ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE", error: aborted ? "Reverse geocoding excedeu o timeout." : "Falha de conexão com reverse geocoding." }, { status: aborted ? 504 : 502 });
  } finally {
    clearTimeout(timeout);
  }
}
