export type Point = readonly [number, number];

export type StreetSegment = {
  id: string;
  name: string | null;
  startM: number;
  endM: number;
  confidence: "high" | "medium" | "unknown";
  source: "step" | "manual" | "unknown";
  warning?: string;
};

export type Maneuver = {
  id: string;
  distanceM: number;
  kind: "right" | "left" | "continue" | "finish";
  targetStreet: string | null;
};

export type RouteProject = {
  title: string;
  points: Point[];
  matched: Point[];
  distancesM: number[];
  totalDistanceM: number;
  segments: StreetSegment[];
  maneuvers: Maneuver[];
  source: "fixture" | "gpx";
};

export type PlaybackFrame = {
  elapsedSeconds: number;
  progress: number;
  distanceM: number;
  point: Point;
  bearing: number;
  street: StreetSegment | null;
  nextManeuver: Maneuver | null;
  distanceToNextManeuver: number | null;
};

export type MatchedStep = {
  name: string | null;
  distanceM: number;
};

const DEMO_POINTS: Point[] = [
  [-43.9385, -19.9214], [-43.9375, -19.9202], [-43.9360, -19.9196],
  [-43.9348, -19.9201], [-43.9338, -19.9216], [-43.9335, -19.9235],
  [-43.9344, -19.9250], [-43.9360, -19.9258], [-43.9378, -19.9251],
  [-43.9392, -19.9238], [-43.9400, -19.9222], [-43.9418, -19.9212],
  [-43.9435, -19.9217], [-43.9448, -19.9231], [-43.9450, -19.9250],
  [-43.9440, -19.9265], [-43.9423, -19.9273], [-43.9405, -19.9278],
  [-43.9387, -19.9283], [-43.9372, -19.9295], [-43.9368, -19.9310],
  [-43.9379, -19.9323], [-43.9396, -19.9327], [-43.9410, -19.9319],
  [-43.9413, -19.9302], [-43.9404, -19.9287], [-43.9388, -19.9283],
];

const STREET_NAMES = ["Rua dos Timbiras", "Av. Álvares Cabral", "Rua da Bahia", "Via sem nome confirmado"];

export function demoProject(): RouteProject {
  return createProject(DEMO_POINTS, "Circuito Afonso Pena", "fixture", true);
}

export function parseGpx(xml: string, fileName: string): RouteProject {
  if (xml.length > 10 * 1024 * 1024) throw new Error("O arquivo excede o limite de 10 MB.");
  if (/<!(?:DOCTYPE|ENTITY)/i.test(xml)) throw new Error("GPX com DTD ou entidades externas não é aceito.");
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("Não foi possível ler o XML do GPX.");
  const points = Array.from(document.getElementsByTagName("trkpt")).map((node) => [Number(node.getAttribute("lon")), Number(node.getAttribute("lat"))] as Point);
  const routePoints = points.length > 1 ? points : Array.from(document.getElementsByTagName("rtept")).map((node) => [Number(node.getAttribute("lon")), Number(node.getAttribute("lat"))] as Point);
  if (routePoints.length < 2) throw new Error("O GPX precisa conter pelo menos dois pontos de rota.");
  if (routePoints.length > 50_000) throw new Error("O GPX excede o limite de 50.000 pontos.");
  if (routePoints.some(([lng, lat]) => !Number.isFinite(lng) || !Number.isFinite(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90)) throw new Error("O GPX contém coordenadas inválidas.");
  const title = document.querySelector("metadata > name, trk > name, rte > name")?.textContent?.trim() || fileName.replace(/\.gpx$/i, "");
  return createProject(routePoints, title, "gpx", false);
}

function createProject(points: Point[], title: string, source: RouteProject["source"], named: boolean): RouteProject {
  const matched = points.map(([lng, lat], index) => [lng + Math.sin(index * 0.7) * 0.00008, lat + 0.00005] as Point);
  const distancesM = distancesFor(named ? matched : points);
  const totalDistanceM = distancesM.at(-1) ?? 0;
  const segmentCount = Math.min(4, Math.max(1, Math.ceil(points.length / 7)));
  const segments = Array.from({ length: segmentCount }, (_, index) => {
    const startM = totalDistanceM * index / segmentCount;
    const endM = totalDistanceM * (index + 1) / segmentCount;
    return {
      id: `segment-${index + 1}`, name: named ? STREET_NAMES[index] ?? STREET_NAMES.at(-1)! : null,
      startM, endM, confidence: named ? (index === 3 ? "unknown" : "high") : "unknown", source: named ? "step" : "unknown",
      ...(index === 3 ? { warning: "Nome não confirmado; revisar antes de publicar." } : {}),
    } satisfies StreetSegment;
  });
  const maneuverDistances = [totalDistanceM * 0.28, totalDistanceM * 0.55, totalDistanceM * 0.77];
  const maneuvers: Maneuver[] = maneuverDistances.map((distanceM, index) => ({ id: `maneuver-${index + 1}`, distanceM, kind: index === 0 ? "right" : index === 1 ? "left" : "continue", targetStreet: segments[index + 1]?.name ?? null }));
  maneuvers.push({ id: "finish", distanceM: totalDistanceM, kind: "finish", targetStreet: null });
  return { title, points, matched, distancesM, totalDistanceM, segments, maneuvers, source };
}

export function applyMatching(project: RouteProject, matched: Point[], steps: MatchedStep[]): RouteProject {
  if (matched.length < 2) return project;
  const distancesM = distancesFor(matched);
  const totalDistanceM = distancesM.at(-1) ?? 0;
  const segments = segmentsFromSteps(steps, totalDistanceM);
  const maneuvers: Maneuver[] = segments.slice(0, -1).map((segment, index) => ({ id: `maneuver-${index + 1}`, distanceM: segment.endM, kind: "continue", targetStreet: segments[index + 1]?.name ?? null }));
  maneuvers.push({ id: "finish", distanceM: totalDistanceM, kind: "finish", targetStreet: null });
  return { ...project, matched, distancesM, totalDistanceM, segments, maneuvers };
}

export function playbackPoints(project: RouteProject): readonly Point[] {
  return project.matched.length > 1 ? project.matched : project.points;
}

export function getFrameAtTime(project: RouteProject, elapsedSeconds: number, durationSeconds: number): PlaybackFrame {
  const progress = Math.min(1, Math.max(0, elapsedSeconds / durationSeconds));
  const distanceM = project.totalDistanceM * progress;
  let high = project.distancesM.length - 1; let low = 0;
  while (low < high) { const middle = Math.floor((low + high) / 2); if (project.distancesM[middle] < distanceM) low = middle + 1; else high = middle; }
  const nextIndex = Math.max(1, low); const previousDistance = project.distancesM[nextIndex - 1] ?? 0;
  const sectionLength = project.distancesM[nextIndex] - previousDistance || 1;
  const sectionProgress = Math.min(1, Math.max(0, (distanceM - previousDistance) / sectionLength));
  const points = playbackPoints(project);
  const point = points[nextIndex - 1].map((value, axis) => value + (points[nextIndex][axis] - value) * sectionProgress) as unknown as Point;
  const nextPoint = points[Math.min(nextIndex + 1, points.length - 1)];
  const bearing = bearingDeg(point, nextPoint);
  const street = project.segments.find((segment) => distanceM <= segment.endM && distanceM >= segment.startM) ?? project.segments.at(-1) ?? null;
  const nextManeuver = project.maneuvers.find((maneuver) => maneuver.distanceM > distanceM + 3) ?? null;
  return { elapsedSeconds, progress, distanceM, point, bearing, street, nextManeuver, distanceToNextManeuver: nextManeuver ? Math.max(0, nextManeuver.distanceM - distanceM) : null };
}

function distancesFor(points: readonly Point[]): number[] {
  const distances = [0];
  for (let index = 1; index < points.length; index += 1) distances.push(distances[index - 1] + haversineM(points[index - 1], points[index]));
  return distances;
}

function segmentsFromSteps(steps: MatchedStep[], totalDistanceM: number): StreetSegment[] {
  const normalized = steps.filter((step) => step.distanceM > 0);
  if (!normalized.length) return [{ id: "segment-1", name: null, startM: 0, endM: totalDistanceM, confidence: "unknown", source: "unknown", warning: "Nome não confirmado; revisar antes de publicar." }];
  const totalStepDistance = normalized.reduce((sum, step) => sum + step.distanceM, 0) || 1;
  const segments: StreetSegment[] = [];
  let coveredM = 0;
  for (const step of normalized) {
    const lengthM = totalDistanceM * step.distanceM / totalStepDistance;
    const previous = segments.at(-1);
    if (previous && previous.name === step.name) previous.endM += lengthM;
    else segments.push({ id: `segment-${segments.length + 1}`, name: step.name, startM: coveredM, endM: coveredM + lengthM, confidence: step.name ? "high" : "unknown", source: step.name ? "step" : "unknown", ...(step.name ? {} : { warning: "Nome não confirmado; revisar antes de publicar." }) });
    coveredM += lengthM;
  }
  segments.at(-1)!.endM = totalDistanceM;
  return segments;
}

export function haversineM(a: Point, b: Point): number {
  const earthRadius = 6_371_000; const lat1 = a[1] * Math.PI / 180; const lat2 = b[1] * Math.PI / 180; const deltaLat = (b[1] - a[1]) * Math.PI / 180; const deltaLng = (b[0] - a[0]) * Math.PI / 180;
  const factor = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(factor), Math.sqrt(1 - factor));
}

function bearingDeg(a: Point, b: Point): number {
  const lat1 = a[1] * Math.PI / 180; const lat2 = b[1] * Math.PI / 180; const deltaLng = (b[0] - a[0]) * Math.PI / 180;
  return (Math.atan2(Math.sin(deltaLng) * Math.cos(lat2), Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng)) * 180 / Math.PI + 360) % 360;
}

export function formatDistance(distanceM: number | null): string {
  if (distanceM === null) return "—";
  if (distanceM < 1000) return `${Math.max(0, Math.round(distanceM / 5) * 5)} m`;
  return `${(distanceM / 1000).toFixed(2).replace(".", ",")} km`;
}

export function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(safeSeconds / 60)).padStart(2, "0")}:${String(safeSeconds % 60).padStart(2, "0")}`;
}
