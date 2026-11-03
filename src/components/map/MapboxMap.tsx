"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import mapboxgl from "mapbox-gl";
import * as THREE from "three";
import { getFrameAtTime, playbackPoints, type Point, type PlaybackFrame, type RouteProject } from "@/domain/route";

type MapboxMapProps = {
  project: RouteProject;
  frame: PlaybackFrame;
  viewMode: "2D" | "3D";
  cinematic: boolean;
  showRaw: boolean;
  showMatched: boolean;
  playing: boolean;
  speed: number;
  duration: number;
  onElapsed: (elapsed: number) => void;
  onComplete: () => void;
};

type ParticipantLayer = mapboxgl.CustomLayerInterface & {
  update: (point: Point, bearing: number) => void;
};

export function MapboxMap({ project, frame, viewMode, cinematic, showRaw, showMatched, playing, speed, duration, onElapsed, onComplete }: MapboxMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const participantLayerRef = useRef<ParticipantLayer | null>(null);
  const projectRef = useRef(project);
  const frameRef = useRef(frame);
  const cameraTargetRef = useRef<Point | null>(null);
  const onCompleteRef = useRef(onComplete);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    projectRef.current = project;
    frameRef.current = frame;
    onCompleteRef.current = onComplete;
  }, [project, frame, onComplete]);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!containerRef.current || !token || mapRef.current) return;
    mapboxgl.accessToken = token;
    const container = containerRef.current;

    const map = new mapboxgl.Map({
      container,
      style: "mapbox://styles/mapbox/standard",
      center: [...playbackPoints(project)[0]],
      zoom: 13.4,
      pitch: 58,
      bearing: frame.bearing,
      attributionControl: true,
      antialias: true,
    });
    mapRef.current = map;
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(container);

    const onError = (event: mapboxgl.ErrorEvent) => {
      if (event.error) {
        setStatus("error");
        setError(event.error.message || "Não foi possível carregar o mapa Mapbox.");
      }
    };
    const onStyleImageMissing = (event: { id: string }) => {
      if (!map.hasImage(event.id)) map.addImage(event.id, transparentImage());
    };
    map.on("error", onError);
    map.on("styleimagemissing", onStyleImageMissing);
    map.on("load", () => {
      addRouteSources(map, projectRef.current, frameRef.current.progress);
      addTerrain(map, viewMode === "3D" || cinematic);
      addBuildings(map);
      const participantLayer = createParticipantLayer(map, frameRef.current.point, frameRef.current.bearing);
      participantLayerRef.current = participantLayer;
      map.addLayer(participantLayer);
      map.resize();
      map.fitBounds(routeBounds(playbackPoints(projectRef.current)), { padding: 70, duration: 0, maxZoom: 15.5 });
      setStatus("ready");
    });

    return () => {
      map.off("error", onError);
      map.off("styleimagemissing", onStyleImageMissing);
      resizeObserver.disconnect();
      participantLayerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // The map instance is intentionally created once per mounted view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    updateRouteSource(map, project);
    const routeBoundsValue = routeBounds(playbackPoints(project));
    map.fitBounds(routeBoundsValue, { padding: 70, duration: 400, maxZoom: 15.5 });
  }, [project]);

  useEffect(() => {
    const map = mapRef.current;
    if (!playing && map?.isStyleLoaded()) renderFrame(map, participantLayerRef.current, frame, cinematic, cameraTargetRef);
  }, [cinematic, frame, playing]);

  useEffect(() => {
    const map = mapRef.current;
    if (!playing || !map?.isStyleLoaded()) return;
    const startedAt = performance.now();
    const initialElapsed = frameRef.current.elapsedSeconds;
    let animationFrame = 0;
    let lastReportAt = 0;
    const tick = (now: number) => {
      const elapsed = Math.min(duration, initialElapsed + (now - startedAt) / 1000 * speed);
      renderFrame(map, participantLayerRef.current, getFrameAtTime(projectRef.current, elapsed, duration), cinematic, cameraTargetRef);
      if (elapsed >= duration) { onElapsed(duration); onCompleteRef.current(); return; }
      if (now - lastReportAt >= 100) { lastReportAt = now; onElapsed(elapsed); }
      animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [cinematic, duration, onElapsed, playing, speed]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    addTerrain(map, viewMode === "3D" || cinematic);
    if (!cinematic) {
      cameraTargetRef.current = null;
      map.fitBounds(routeBounds(playbackPoints(project)), { padding: 70, duration: 400, maxZoom: 15.5 });
    }
  }, [cinematic, project, viewMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (map.getLayer("route-motion-raw")) map.setLayoutProperty("route-motion-raw", "visibility", showRaw ? "visible" : "none");
    if (map.getLayer("route-motion-matched")) map.setLayoutProperty("route-motion-matched", "visibility", showMatched ? "visible" : "none");
  }, [showRaw, showMatched]);

  return <div className="mapbox-stage">
    <div ref={containerRef} className="mapbox-canvas" aria-label="Mapa Mapbox do percurso" />
    {status === "loading" && <div className="mapbox-status">Carregando mapa…</div>}
    {status === "error" && <div className="mapbox-status mapbox-error"><strong>Mapbox indisponível</strong><span>{error}</span><small>O traçado GPX continua disponível no modo local.</small></div>}
  </div>;
}

function transparentImage() {
  return { width: 2, height: 2, data: new Uint8Array(16) };
}

function addRouteSources(map: mapboxgl.Map, project: RouteProject, progress: number) {
  map.addSource("route-motion-route", { type: "geojson", data: lineFeature(project.points), lineMetrics: true });
  map.addSource("route-motion-matched", { type: "geojson", data: lineFeature(project.matched) });
  map.addSource("route-motion-playback", { type: "geojson", data: lineFeature(playbackPoints(project)), lineMetrics: true });
  map.addSource("route-motion-marker", { type: "geojson", data: pointFeature(playbackPoints(project)[0]) });
  map.addLayer({ id: "route-motion-raw", type: "line", source: "route-motion-route", paint: { "line-color": "#d8e0d8", "line-width": 2, "line-opacity": 0.38, "line-dasharray": [2, 3] } });
  map.addLayer({ id: "route-motion-matched", type: "line", source: "route-motion-matched", paint: { "line-color": "#f39b63", "line-width": 4, "line-opacity": 0.42 } });
  map.addLayer({ id: "route-motion-base", type: "line", source: "route-motion-playback", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#b8d76b", "line-width": 6, "line-opacity": 0.32 } });
  map.addLayer({ id: "route-motion-completed-line", type: "line", source: "route-motion-playback", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-gradient": completedLineGradient(progress), "line-width": 6, "line-opacity": 0.95 } });
  map.addLayer({ id: "route-motion-marker-dot", type: "circle", source: "route-motion-marker", paint: { "circle-radius": 8, "circle-color": "#d1f46b", "circle-stroke-color": "#152019", "circle-stroke-width": 3 } });
}

function updateRouteSource(map: mapboxgl.Map, project: RouteProject) {
  const raw = map.getSource("route-motion-route") as mapboxgl.GeoJSONSource | undefined;
  const matched = map.getSource("route-motion-matched") as mapboxgl.GeoJSONSource | undefined;
  const playback = map.getSource("route-motion-playback") as mapboxgl.GeoJSONSource | undefined;
  raw?.setData(lineFeature(project.points));
  matched?.setData(lineFeature(project.matched));
  playback?.setData(lineFeature(playbackPoints(project)));
}

function renderFrame(map: mapboxgl.Map, participantLayer: ParticipantLayer | null, frame: PlaybackFrame, cinematic: boolean, cameraTargetRef: MutableRefObject<Point | null>) {
  const markerSource = map.getSource("route-motion-marker") as mapboxgl.GeoJSONSource | undefined;
  markerSource?.setData(pointFeature(frame.point));
  map.setPaintProperty("route-motion-completed-line", "line-gradient", completedLineGradient(frame.progress));
  participantLayer?.update(frame.point, frame.bearing);
  if (cinematic) updateCinematicCamera(map, frame, cameraTargetRef);
  else cameraTargetRef.current = null;
}

function updateCinematicCamera(map: mapboxgl.Map, frame: PlaybackFrame, cameraTargetRef: MutableRefObject<Point | null>) {
  const previous = cameraTargetRef.current ?? frame.point;
  const target: Point = [lerp(previous[0], frame.point[0], 0.08), lerp(previous[1], frame.point[1], 0.08)];
  const position = offsetPoint(target, frame.bearing + 180, 140);
  const camera = map.getFreeCameraOptions();
  camera.position = mapboxgl.MercatorCoordinate.fromLngLat({ lng: position[0], lat: position[1] }, 220);
  camera.lookAtPoint({ lng: target[0], lat: target[1] });
  map.setFreeCameraOptions(camera);
  cameraTargetRef.current = target;
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}

function offsetPoint([lng, lat]: Point, bearing: number, distanceM: number): Point {
  const radians = bearing * Math.PI / 180;
  const latOffset = Math.cos(radians) * distanceM / 111_320;
  const lngOffset = Math.sin(radians) * distanceM / (111_320 * Math.cos(lat * Math.PI / 180));
  return [lng + lngOffset, lat + latOffset];
}

function addTerrain(map: mapboxgl.Map, enabled: boolean) {
  if (!map.getSource("route-motion-dem")) map.addSource("route-motion-dem", { type: "raster-dem", url: "mapbox://mapbox.mapbox-terrain-dem-v1", tileSize: 512, maxzoom: 14 });
  map.setTerrain(enabled ? { source: "route-motion-dem", exaggeration: 1.15 } : null);
}

function addBuildings(map: mapboxgl.Map) {
  if (map.getLayer("route-motion-buildings") || !map.getSource("composite")) return;
  try {
    map.addLayer({ id: "route-motion-buildings", type: "fill-extrusion", source: "composite", "source-layer": "building", minzoom: 14, filter: ["==", ["get", "extrude"], "true"], paint: { "fill-extrusion-color": "#aab9aa", "fill-extrusion-height": ["coalesce", ["get", "height"], 0], "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0], "fill-extrusion-opacity": 0.55 } });
  } catch {
    // Standard styles may already own their building layer.
  }
}

function createParticipantLayer(map: mapboxgl.Map, initialPoint: Point, initialBearing: number): ParticipantLayer {
  let renderer: THREE.WebGLRenderer | null = null;
  let camera: THREE.Camera | null = null;
  const projectionMatrix = new THREE.Matrix4();
  const scene = new THREE.Scene();
  const participant = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.75, 2.2, 12), new THREE.MeshPhongMaterial({ color: 0xd1f46b }));
  const halo = new THREE.Mesh(new THREE.RingGeometry(1.8, 2.05, 32), new THREE.MeshBasicMaterial({ color: 0xd1f46b, transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
  body.position.z = 1.2; halo.rotation.x = -Math.PI / 2; halo.position.z = 0.05; participant.add(body, halo); scene.add(participant);
  scene.add(new THREE.AmbientLight(0xffffff, 1.8));
  const layer: ParticipantLayer = {
    id: "route-motion-participant",
    type: "custom",
    renderingMode: "3d",
    onAdd: (_map, gl) => {
      renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
      camera = new THREE.Camera();
      layer.update(initialPoint, initialBearing);
    },
    render: (gl, matrix) => {
      if (!renderer || !camera) return;
      camera.projectionMatrix = projectionMatrix.fromArray(matrix as unknown as number[]);
      renderer.resetState();
      renderer.render(scene, camera);
    },
    onRemove: () => {
      body.geometry.dispose(); body.material.dispose(); halo.geometry.dispose(); halo.material.dispose();
      renderer?.dispose(); renderer = null; camera = null;
    },
    update: (point, bearing) => {
      const mercator = mapboxgl.MercatorCoordinate.fromLngLat([...point], 0);
      const scale = mercator.meterInMercatorCoordinateUnits() * 7;
      participant.position.set(mercator.x, mercator.y, mercator.z);
      participant.scale.setScalar(scale);
      participant.rotation.z = -THREE.MathUtils.degToRad(bearing);
      map.triggerRepaint();
    },
  };
  return layer;
}

function lineFeature(points: readonly Point[]): GeoJSON.Feature<GeoJSON.LineString> {
  return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: points.map(([lng, lat]) => [lng, lat]) } };
}

function pointFeature(point: Point): GeoJSON.Feature<GeoJSON.Point> {
  return { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [point[0], point[1]] } };
}

function completedLineGradient(progress: number): mapboxgl.Expression {
  const safeProgress = Math.min(1, Math.max(0, progress));
  return ["step", ["line-progress"], "#d1f46b", safeProgress, "rgba(0,0,0,0)"];
}

function routeBounds(points: readonly Point[]): mapboxgl.LngLatBoundsLike {
  const lngs = points.map(([lng]) => lng); const lats = points.map(([, lat]) => lat);
  return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
}
