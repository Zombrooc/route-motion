"use client";

import { ChangeEvent, CSSProperties, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { applyMatching, demoProject, formatDistance, formatTime, getFrameAtTime, parseGpx, playbackPoints, type MatchedStep, type Point, type RouteProject } from "@/domain/route";

const MapboxMap = dynamic(() => import("@/components/map/MapboxMap").then((module) => module.MapboxMap), { ssr: false });

type IconName = "route" | "upload" | "play" | "pause" | "back" | "forward" | "search" | "settings" | "layers" | "map" | "check" | "alert" | "chevron" | "compass" | "expand" | "save";

function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    route: <><path d="M4 18c5-1 5-8 10-9 2-.4 3.1.2 4 1"/><circle cx="4" cy="18" r="2"/><circle cx="19" cy="10" r="2"/></>,
    upload: <><path d="M12 16V4m0 0-4 4m4-4 4 4"/><path d="M5 14v5h14v-5"/></>,
    play: <path d="m8 5 11 7-11 7V5Z" fill="currentColor" stroke="none"/>,
    pause: <><path d="M8 5v14M16 5v14"/></>,
    back: <><path d="m11 6-6 6 6 6"/><path d="M5 12h14"/></>,
    forward: <><path d="m13 6 6 6-6 6"/><path d="M19 12H5"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6"/><path d="m16 16 4 4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.1h-2.5V20a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H5.4v-2.5H6a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1L9 6.7l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.1h2.5V6a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1v2.5H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
    layers: <><path d="m12 4 8 4-8 4-8-4 8-4Z"/><path d="m4 12 8 4 8-4M4 16l8 4 8-4"/></>,
    map: <><path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2V6Z"/><path d="M9 4v14M15 6v14"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    alert: <><path d="M12 4 3 20h18L12 4Z"/><path d="M12 10v4m0 3h.01"/></>,
    chevron: <path d="m7 10 5 5 5-5"/>,
    compass: <><circle cx="12" cy="12" r="8"/><path d="m15 9-2 4-4 2 2-4 4-2Z"/></>,
    expand: <><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/></>,
    save: <><path d="M5 3h12l2 2v16H5V3Z"/><path d="M8 3v6h8V3M8 21v-6h8v6"/></>,
  };
  return <svg aria-hidden="true" className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function StudioApp() {
  const [project, setProject] = useState<RouteProject>(() => demoProject());
  const [duration] = useState(120);
  const [elapsed, setElapsed] = useState(42);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [viewMode, setViewMode] = useState<"3D" | "2D">("3D");
  const [preset, setPreset] = useState("Navegação 3D");
  const [activePanel, setActivePanel] = useState<"route" | "review">("route");
  const [activeSegment, setActiveSegment] = useState("segment-1");
  const [fileName, setFileName] = useState("Fixture de demonstração");
  const [toast, setToast] = useState("");
  const [showMatched, setShowMatched] = useState(true);
  const [showRaw, setShowRaw] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const mapboxEnabled = Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);
  const frame = useMemo(() => getFrameAtTime(project, elapsed, duration), [project, elapsed, duration]);
  const activePoints = useMemo(() => playbackPoints(project), [project]);
  const screenPoints = useMemo(() => projectPoints(activePoints), [activePoints]);
  const matchedScreenPoints = useMemo(() => projectPoints(project.matched), [project.matched]);
  const completedPointCount = Math.max(2, screenPoints.findIndex((_, index) => project.distancesM[index] >= frame.distanceM) + 1);

  useEffect(() => {
    if (!playing || mapboxEnabled) return;
    const startedAt = performance.now(); const initialElapsed = elapsed;
    const timer = window.setInterval(() => {
      const nextElapsed = Math.min(duration, initialElapsed + (performance.now() - startedAt) / 1000 * speed);
      setElapsed(nextElapsed);
      if (nextElapsed >= duration) setPlaying(false);
    }, 100);
    return () => window.clearInterval(timer);
  // elapsed is intentionally captured only when playback starts or speed changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed, duration, mapboxEnabled]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      if (event.code === "Space") { event.preventDefault(); setPlaying((value) => !value); }
      if (event.key === "ArrowLeft") setElapsed((value) => Math.max(0, value - 5));
      if (event.key === "ArrowRight") setElapsed((value) => Math.min(duration, value + 5));
      if (event.key === "Home") setElapsed(0);
      if (event.key === "End") setElapsed(duration);
    };
    window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown);
  }, [duration]);

  function notify(message: string) { setToast(message); window.setTimeout(() => setToast(""), 2400); }
  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    file.text().then((xml) => { try { const imported = parseGpx(xml, file.name); setProject(imported); setFileName(file.name); setElapsed(0); notify("GPX importado. Associando vias…"); void analyzeRoute(imported); } catch (error) { notify(error instanceof Error ? error.message : "Falha ao importar GPX."); } });
  }
  function saveDraft() { window.localStorage.setItem("route-motion-draft", JSON.stringify({ title: project.title, source: project.source, savedAt: new Date().toISOString() })); notify("Rascunho salvo neste navegador."); }
  async function analyzeRoute(route = project) {
    if (route.points.length < 2) return;
    setAnalyzing(true);
    try {
      const matched: Point[] = [];
      const steps: MatchedStep[] = [];
      for (let start = 0; start < route.points.length - 1; start += 99) {
        const points = route.points.slice(start, Math.min(start + 100, route.points.length));
        const response = await fetch("/api/matching", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profile: "walking", points, originalIndices: points.map((_, index) => start + index), options: { includeSteps: true, language: "pt-BR", tidy: false } }) });
        const result = await response.json() as MatchingResponse;
        if (!response.ok) throw new Error(result.error ?? "Falha ao analisar vias.");
        const matching = result.matchings?.[0];
        const coordinates = matching?.geometry?.coordinates?.filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat)).map(([lng, lat]) => [lng, lat] as const) ?? [];
        if (matched.length && coordinates.length && samePoint(matched.at(-1)!, coordinates[0])) coordinates.shift();
        matched.push(...coordinates);
        steps.push(...(matching?.legs?.flatMap((leg) => leg.steps ?? []).map((step) => ({ name: step.name ?? null, distanceM: step.distance ?? 0 })) ?? []));
      }
      if (matched.length < 2) throw new Error("Map Matching não retornou geometria utilizável.");
      setProject((current) => current.title === route.title ? applyMatching(current, matched, steps) : current);
      notify("Map Matching concluído. Revise os trechos antes de aprovar.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Falha ao analisar vias.");
    } finally {
      setAnalyzing(false);
    }
  }
  function seekTo(distanceM: number, segmentId?: string) { if (segmentId) setActiveSegment(segmentId); setElapsed(Math.max(0, Math.min(duration, distanceM / project.totalDistanceM * duration))); }
  const activeStreet = project.segments.find((segment) => segment.id === activeSegment) ?? project.segments[0];

  return <main className="studio-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark"><Icon name="route" size={19} /></span><span>ROUTE<span className="brand-light">MOTION</span></span><span className="beta-tag">STUDIO / POC</span></div><div className="topbar-center"><span className="status-dot" /> {mapboxEnabled ? "Mapbox ativo" : "Fixture local ativo"} <span className="slash">/</span> {mapboxEnabled ? "renderer GL JS + Three" : "sem token Mapbox"}</div><div className="topbar-actions"><button className="icon-button" aria-label="Pesquisar"><Icon name="search" /></button><button className="icon-button" aria-label="Configurações"><Icon name="settings" /></button><button className="avatar">AS</button></div></header>
    <div className="workspace">
      <aside className="left-panel"><div className="panel-heading"><div><span className="eyebrow">PROJETO ATUAL</span><h1>{project.title}</h1></div><button className="icon-button small" aria-label="Mais opções"><span className="dots">•••</span></button></div><label className="upload-card"><input type="file" accept=".gpx,application/gpx+xml" onChange={handleUpload} /><span className="upload-icon"><Icon name="upload" size={18} /></span><span><strong>Importar GPX</strong><small>Arraste ou selecione um arquivo</small></span></label><button className="demo-link" onClick={() => { setProject(demoProject()); setFileName("Fixture de demonstração"); setElapsed(0); notify("Fixture de demonstração carregado."); }}><span className="demo-glyph">✦</span> Abrir exemplo de demonstração</button><button className="analyze-button" disabled={analyzing} onClick={() => void analyzeRoute()}><Icon name="route" size={14} /> {analyzing ? "Analisando vias…" : "Analisar vias"}</button>
        <div className="panel-tabs"><button className={activePanel === "route" ? "active" : ""} onClick={() => setActivePanel("route")}>Percurso <span>{project.segments.length}</span></button><button className={activePanel === "review" ? "active" : ""} onClick={() => setActivePanel("review")}>Revisão <span className="warning-count">1</span></button></div>
        {activePanel === "route" ? <div className="route-list"><div className="list-label"><span>VIAS E MANOBRAS</span><button aria-label="Camadas"><Icon name="layers" size={14} /></button></div>{project.segments.map((segment, index) => <button key={segment.id} className={`route-item ${activeSegment === segment.id ? "selected" : ""}`} onClick={() => seekTo(segment.startM, segment.id)}><span className="route-index">{String(index + 1).padStart(2, "0")}</span><span className="route-item-main"><strong>{segment.name ?? "Via sem nome confirmado"}</strong><small>{formatDistance(segment.endM - segment.startM)} de trecho <i className={segment.confidence === "unknown" ? "unknown" : "confirmed"}>{segment.confidence === "unknown" ? "revisar" : "confirmada"}</i></small></span><Icon name="chevron" size={15} /></button>)}{project.maneuvers.slice(0, 3).map((maneuver) => <button key={maneuver.id} className="maneuver-item" onClick={() => seekTo(maneuver.distanceM)}><span className={`maneuver-arrow ${maneuver.kind}`}>{maneuver.kind === "right" ? "↱" : maneuver.kind === "left" ? "↰" : "↑"}</span><span><strong>{maneuver.kind === "right" ? "Vire à direita" : maneuver.kind === "left" ? "Vire à esquerda" : "Continue em frente"}</strong><small>no próximo trecho <em>{formatDistance(maneuver.distanceM - frame.distanceM)}</em></small></span></button>)}</div> : <div className="review-list"><div className="review-callout"><Icon name="alert" size={17} /><div><strong>1 trecho requer revisão</strong><p>O nome da via não foi confirmado pelo modo fixture.</p></div></div><div className="review-metric"><span>COBERTURA ASSOCIADA</span><strong>92%</strong><div className="metric-bar"><i style={{ width: "92%" }} /></div></div><div className="review-metric"><span>DIVERGÊNCIA ESTIMADA</span><strong>1,8%</strong><small>Dentro do limiar de diagnóstico</small></div><button className="outline-button" onClick={() => { setActivePanel("route"); setActiveSegment("segment-4"); }}>Abrir trecho pendente <Icon name="forward" size={14} /></button></div>}
        <div className="sidebar-bottom"><div className="draft-status"><span className="save-check"><Icon name="check" size={12} /></span><span>Rascunho salvo localmente<small>Última alteração há 2 min</small></span></div><button className="save-button" onClick={saveDraft}><Icon name="save" size={14} /> Salvar rascunho</button></div>
      </aside>
      <section className="stage-column"><div className="stage-toolbar"><div className="breadcrumbs"><span>PROJETOS</span><b>/</b><strong>{fileName}</strong></div><div className="stage-tools"><div className="segmented"><button className={viewMode === "2D" ? "active" : ""} onClick={() => setViewMode("2D")}>2D</button><button className={viewMode === "3D" ? "active" : ""} onClick={() => setViewMode("3D")}>3D</button></div><button className="tool-button" onClick={() => stageRef.current?.requestFullscreen()}><Icon name="expand" size={15} /> Tela cheia</button></div></div>
        <div className={`map-stage ${viewMode === "2D" ? "map-2d" : "map-3d"} ${mapboxEnabled ? "has-mapbox" : ""}`} ref={stageRef}>{mapboxEnabled && <MapboxMap project={project} frame={frame} viewMode={viewMode} cinematic={preset === "Cinematográfico"} showRaw={showRaw} showMatched={showMatched} playing={playing} speed={speed} duration={duration} onElapsed={setElapsed} onComplete={() => setPlaying(false)} />}<div className="map-grid" /><div className="map-water water-one" /><div className="map-water water-two" /><svg className="route-map" viewBox="0 0 1000 620" role="img" aria-label="Visualização do percurso GPX"><g className="roads">{[120, 220, 325, 440, 555, 700, 820].map((x) => <path key={`v-${x}`} d={`M ${x} 0 C ${x - 40} 150 ${x + 50} 330 ${x - 12} 620`} />)}{[110, 220, 340, 470, 570].map((y) => <path key={`h-${y}`} d={`M 0 ${y} C 240 ${y - 25} 620 ${y + 36} 1000 ${y - 12}`} />)}</g><g className="city-blocks">{[[150, 150, 75, 40], [640, 90, 110, 56], [810, 330, 78, 65], [90, 420, 120, 60], [470, 470, 92, 45], [720, 510, 130, 38]].map(([x, y, w, h]) => <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} rx="3" />)}</g>{showRaw && <polyline className="raw-line" points={screenPoints.map(([x, y]) => `${x},${y}`).join(" ")} />}{showMatched && <polyline className="matched-line" points={matchedScreenPoints.map(([x, y]) => `${x},${y}`).join(" ")} />}<polyline className="route-line" points={screenPoints.map(([x, y]) => `${x},${y}`).join(" ")} /><polyline className="completed-line" points={screenPoints.slice(0, completedPointCount).map(([x, y]) => `${x},${y}`).join(" ")} />{project.maneuvers.slice(0, 3).map((maneuver, index) => { const point = screenPoints[Math.min(screenPoints.length - 1, Math.max(0, project.distancesM.findIndex((distance) => distance >= maneuver.distanceM)))]; return <g key={maneuver.id} className="turn-marker" transform={`translate(${point[0]} ${point[1]})`}><circle r="15" /><text y="5">{index === 0 ? "↱" : index === 1 ? "↰" : "↑"}</text></g>; })}<g className="start-marker" transform={`translate(${screenPoints[0][0]} ${screenPoints[0][1]})`}><circle r="13" /><text y="4">S</text></g><g className="finish-marker" transform={`translate(${screenPoints.at(-1)?.[0]} ${screenPoints.at(-1)?.[1]})`}><circle r="13" /><text y="5">F</text></g><g className="participant" transform={`translate(${projectPointToScreen(frame.point, activePoints)}) rotate(${frame.bearing})`}><circle r="18" /><path d="M0-12 7 7 0 3-7 7Z" /></g></svg>
          <div className="map-caption"><span className="live-pill"><i /> PREVIEW AO VIVO</span><span>Modo {viewMode} · dados {project.source === "fixture" ? "simulados" : "GPX original"}</span></div><div className="map-controls"><button className="map-control" onClick={() => setShowRaw((value) => !value)}><span className="legend raw" />Original</button><button className="map-control" onClick={() => setShowMatched((value) => !value)}><span className="legend matched" />Associado</button><button className="map-control"><span className="legend playback" />Animação</button></div><div className="compass"><Icon name="compass" size={17} /><span>N</span></div><div className="hud"><div className="hud-top"><div><span className="hud-label">AGORA</span><strong>{frame.street?.name ?? "Via sem nome confirmado"}</strong></div><span className="hud-km">KM {Math.floor(frame.distanceM / 1000).toString().padStart(2, "0")}</span></div><div className="hud-next"><span className="next-arrow">{frame.nextManeuver?.kind === "left" ? "↰" : frame.nextManeuver?.kind === "right" ? "↱" : "↑"}</span><span><small>PRÓXIMA MANOBRA</small><b>{frame.nextManeuver?.kind === "finish" ? "Chegada" : frame.nextManeuver?.kind === "left" ? "Vire à esquerda" : frame.nextManeuver?.kind === "right" ? "Vire à direita" : "Continue em frente"}</b></span><strong className="next-distance">{formatDistance(frame.distanceToNextManeuver)}</strong></div></div><div className="stage-mode-label"><span className="mode-icon">{viewMode === "3D" ? "◩" : "□"}</span>{preset.toUpperCase()}<small>{viewMode === "3D" ? "PERSPECTIVA" : "NORTE FIXO"}</small></div></div>
        <div className="player"><div className="timeline-row"><span className="time-label">{formatTime(elapsed)}</span><input aria-label="Linha do tempo" type="range" min="0" max={duration} step="0.1" value={elapsed} onChange={(event) => setElapsed(Number(event.target.value))} style={{ "--progress": `${elapsed / duration * 100}%` } as CSSProperties} /><span className="time-label muted">{formatTime(duration)}</span></div><div className="player-row"><div className="transport"><button aria-label="Voltar 5 segundos" onClick={() => setElapsed((value) => Math.max(0, value - 5))}><Icon name="back" /></button><button className="play-button" aria-label={playing ? "Pausar" : "Reproduzir"} onClick={() => setPlaying((value) => !value)}><Icon name={playing ? "pause" : "play"} size={18} /></button><button aria-label="Avançar 5 segundos" onClick={() => setElapsed((value) => Math.min(duration, value + 5))}><Icon name="forward" /></button></div><div className="player-stats"><span><small>PERCORRIDO</small><strong>{formatDistance(frame.distanceM)}</strong></span><span><small>RESTANTE</small><strong>{formatDistance(project.totalDistanceM - frame.distanceM)}</strong></span><span><small>PROGRESSO</small><strong>{Math.round(frame.progress * 100)}%</strong></span></div><div className="player-options"><label>Velocidade <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>{[0.25, 0.5, 1, 1.5, 2, 4].map((value) => <option key={value} value={value}>{value}×</option>)}</select></label><label>Preset <select value={preset} onChange={(event) => setPreset(event.target.value)}>{["Navegação 3D", "Vista aérea", "Cinematográfico", "Mapa 2D"].map((value) => <option key={value}>{value}</option>)}</select></label></div></div></div>
      </section>
      <aside className="right-panel"><div className="right-heading"><div><span className="eyebrow">INSPEÇÃO</span><h2>Detalhes do trecho</h2></div><button className="icon-button small" aria-label="Configurações"><Icon name="settings" size={15} /></button></div><div className="selected-route"><div className="selected-route-head"><span className="segment-badge">{String(project.segments.findIndex((segment) => segment.id === activeStreet?.id) + 1).padStart(2, "0")}</span><div><span className="eyebrow">VIA ATUAL</span><h3>{activeStreet?.name ?? "Via sem nome confirmado"}</h3></div></div><div className="confidence-row"><span className={activeStreet?.confidence === "unknown" ? "confidence unknown" : "confidence"}><i /> {activeStreet?.confidence === "unknown" ? "Requer revisão" : "Alta confiança"}</span><span className="source-label">Fonte: {activeStreet?.source === "unknown" ? "não resolvida" : "matching"}</span></div></div><div className="inspector-section"><div className="section-title"><span>GEOMETRIA</span><button aria-label="Recolher"><Icon name="chevron" size={13} /></button></div><div className="detail-grid"><div><span>INÍCIO</span><strong>{formatDistance(activeStreet?.startM ?? 0)}</strong></div><div><span>FIM</span><strong>{formatDistance(activeStreet?.endM ?? 0)}</strong></div><div><span>EXTENSÃO</span><strong>{formatDistance((activeStreet?.endM ?? 0) - (activeStreet?.startM ?? 0))}</strong></div><div><span>ORIGEM</span><strong>GPX oficial</strong></div></div></div><div className="inspector-section"><div className="section-title"><span>CORREÇÃO MANUAL</span><span className="manual-tag">REVERSÍVEL</span></div><label className="field-label">Nome de exibição<input value={activeStreet?.name ?? ""} placeholder="Via sem nome confirmado" onChange={(event) => { const name = event.target.value; setProject((current) => ({ ...current, segments: current.segments.map((segment) => segment.id === activeStreet?.id ? { ...segment, name: name || null, source: name ? "manual" : "unknown", confidence: name ? "medium" : "unknown" } : segment) })); }} /></label><p className="field-help"><Icon name="alert" size={13} /> A correção altera apenas o rótulo. O GPX original permanece intacto.</p><button className="confirm-button" onClick={() => notify("Correção registrada no rascunho.")}><Icon name="check" size={14} /> Confirmar correção</button></div><div className="inspector-section diagnostics"><div className="section-title"><span>DIAGNÓSTICOS</span><span className="diagnostic-count">3</span></div><div className="diagnostic-row"><span className="diagnostic-icon good"><Icon name="check" size={13} /></span><span>Sequência do GPX preservada</span><strong>OK</strong></div><div className="diagnostic-row"><span className="diagnostic-icon good"><Icon name="check" size={13} /></span><span>Desvio estimado do matching</span><strong>1,8%</strong></div><div className="diagnostic-row"><span className="diagnostic-icon warn"><Icon name="alert" size={13} /></span><span>Nome da via requer revisão</span><strong>PEND.</strong></div></div><div className="right-footer"><span><Icon name="layers" size={14} /> Camadas <b>3</b></span><span><Icon name="map" size={14} /> Estilo <b>Standard</b></span></div></aside>
    </div>{toast && <div className="toast"><Icon name="check" size={14} /> {toast}</div>}
  </main>;
}

function projectPoints(points: readonly (readonly [number, number])[]) {
  const longitudes = points.map(([lng]) => lng); const latitudes = points.map(([, lat]) => lat); const minLng = Math.min(...longitudes); const maxLng = Math.max(...longitudes); const minLat = Math.min(...latitudes); const maxLat = Math.max(...latitudes);
  return points.map(([lng, lat]) => [90 + (lng - minLng) / Math.max(0.0001, maxLng - minLng) * 770, 70 + (maxLat - lat) / Math.max(0.0001, maxLat - minLat) * 480] as [number, number]);
}

function projectPointToScreen(point: readonly [number, number], points: readonly (readonly [number, number])[]) {
  const longitudes = points.map(([lng]) => lng); const latitudes = points.map(([, lat]) => lat); const minLng = Math.min(...longitudes); const maxLng = Math.max(...longitudes); const minLat = Math.min(...latitudes); const maxLat = Math.max(...latitudes);
  return `${90 + (point[0] - minLng) / Math.max(0.0001, maxLng - minLng) * 770} ${70 + (maxLat - point[1]) / Math.max(0.0001, maxLat - minLat) * 480}`;
}

type MatchingResponse = {
  error?: string;
  matchings?: Array<{
    geometry?: { coordinates?: number[][] };
    legs?: Array<{ steps?: Array<{ name?: string | null; distance?: number }> }>;
  }>;
};

function samePoint(a: Point, b: Point) {
  return a[0] === b[0] && a[1] === b[1];
}
