import { NextResponse } from "next/server";
import { z } from "zod";

const pointSchema = z.tuple([z.number().finite().min(-180).max(180), z.number().finite().min(-90).max(90)]);

const requestSchema = z.object({
  profile: z.enum(["walking", "cycling", "driving"]).default("walking"),
  points: z.array(pointSchema).min(2).max(100),
  originalIndices: z.array(z.number().int().nonnegative()).min(2).max(100),
  options: z.object({
    includeSteps: z.boolean().default(true),
    language: z.string().max(12).default("pt-BR"),
    radiusesM: z.array(z.number().min(0).max(50)).max(100).optional(),
    tidy: z.boolean().default(false),
  }).default({ includeSteps: true, language: "pt-BR", tidy: false }),
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
  if (payload.originalIndices.length !== payload.points.length) return NextResponse.json({ code: "INVALID_REQUEST", error: "originalIndices deve acompanhar points." }, { status: 400 });
  if (payload.options.radiusesM && payload.options.radiusesM.length !== payload.points.length) return NextResponse.json({ code: "INVALID_REQUEST", error: "radiusesM deve acompanhar points." }, { status: 400 });

  const coordinates = payload.points.map(([lng, lat]) => `${lng},${lat}`).join(";");
  const params = new URLSearchParams({
    access_token: token,
    geometries: "geojson",
    overview: "full",
    steps: String(payload.options.includeSteps),
    language: payload.options.language,
    tidy: String(payload.options.tidy),
    waypoints: `0;${payload.points.length - 1}`,
  });
  if (payload.options.radiusesM?.length) params.set("radiuses", payload.options.radiusesM.join(";"));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let response: Response;
  try {
    response = await fetch(`https://api.mapbox.com/matching/v5/mapbox/${payload.profile}/${coordinates}?${params.toString()}`, { signal: controller.signal, cache: "no-store" });
  } catch (error) {
    clearTimeout(timeout);
    const aborted = error instanceof DOMException && error.name === "AbortError";
    return NextResponse.json({ code: aborted ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE", error: aborted ? "Map Matching excedeu o timeout de 15 segundos." : "Falha de conexão com Map Matching." }, { status: aborted ? 504 : 502 });
  }
  clearTimeout(timeout);

  const body = await response.json().catch(() => null) as MapboxMatchingResponse | null;
  if (!response.ok || !body) {
    const status = response.status === 429 ? 429 : response.status >= 500 ? 502 : 400;
    return NextResponse.json({ code: response.status === 429 ? "UPSTREAM_RATE_LIMIT" : "UPSTREAM_ERROR", error: body?.message ?? "Resposta inválida do Map Matching." }, { status });
  }

  const matchings = (body.matchings ?? []).map((matching) => ({
    confidence: matching.confidence,
    distance: matching.distance,
    duration: matching.duration,
    geometry: matching.geometry,
    legs: matching.legs?.map((leg) => ({
      steps: leg.steps?.map((step) => ({ name: step.name ?? null, distance: step.distance ?? 0 })),
    })),
  }));
  const tracepoints = (body.tracepoints ?? []).map((tracepoint) => tracepoint ? ({ name: tracepoint.name, location: tracepoint.location, matchings_index: tracepoint.matchings_index }) : null);
  return NextResponse.json({
    matchings,
    tracepoints,
    diagnostics: {
      profile: payload.profile,
      sampleCount: payload.points.length,
      matchedCount: tracepoints.filter(Boolean).length,
      warnings: body.code === "NoMatch" ? ["Nenhum matching encontrado para este lote."] : [],
    },
  });
}

type MapboxMatchingResponse = {
  code?: string;
  message?: string;
  matchings?: Array<{
    confidence?: number;
    distance?: number;
    duration?: number;
    geometry?: unknown;
    legs?: Array<{ steps?: Array<{ name?: string; distance?: number }> }>;
  }>;
  tracepoints?: Array<{ name?: string; location?: [number, number]; matchings_index?: number } | null>;
};
