# Progresso de implementação

## Fase 0–1 — PoC local

Implementado:

- shell do estúdio em pt-BR com layout de três painéis;
- fixture local autorizado e upload/parse de GPX;
- limites de arquivo/pontos, validação de coordenadas e bloqueio de DTD/ENTITY;
- distância geodésica acumulada e `getFrameAtTime()` com busca monotônica;
- camadas original, associado simulado, playback e percurso concluído;
- HUD, manobras, revisão, correção manual, seek, velocidade e rascunho local.

## Fase 2–4 — Renderer e matching

Implementado:

- Mapbox GL JS carregado somente no client quando `NEXT_PUBLIC_MAPBOX_TOKEN` existe;
- fontes GeoJSON persistentes para rota bruta, rota associada, trecho concluído e marcador;
- terreno DEM, câmera 2D/3D follow e buildings extruded quando o estilo fornece `composite`;
- participante 3D em camada customizada Three.js com cleanup de geometrias e materiais;
- `POST /api/matching` server-side com Zod, timeout, sanitização de resposta e erros estruturados;
- botão de análise no estúdio, sem request durante playback ou seek.

Validação executada: `pnpm lint`, `pnpm typecheck`, `pnpm build`.

## Pendências

- adicionar retry com backoff/jitter para falhas transitórias do provider;
- reconciliar múltiplos `matchings`, tracepoints nulos e chunks sobrepostos;
- testes unitários Vitest e E2E Playwright para fixtures geográficos;
- persistência IndexedDB sob política de licença;
- Mapbox GL JS como renderer principal e 3D real apenas após validar credenciais/licenças.
