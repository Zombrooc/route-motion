# RouteMotion Studio

Estúdio para revisar e animar percursos GPX em 2D/3D. O GPX original é preservado. Sem token, o app funciona em modo fixture; com token, ativa Mapbox GL JS, terreno, edifícios, câmera follow e participante 3D via Three.js.

## Executar

```bash
pnpm install
pnpm dev
```

Checks:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## Fluxo implementado

- Fixture de demonstração sem credenciais.
- Upload local de `.gpx` com limite de 10 MB e 50.000 pontos.
- Validação de coordenadas e rejeição de DTD/entidades externas.
- Traçado original, associado simulado e camada de animação.
- Mapbox GL JS com fontes/layers GeoJSON persistentes, terreno e buildings quando disponíveis.
- Camada customizada Three.js compartilhando o contexto WebGL para o marcador 3D.
- `POST /api/matching` com Zod, timeout de 15 s, limites de lote e tratamento de 429/5xx.
- Player determinístico com play/pause, seek, teclado, velocidade, 2D/3D e tela cheia.
- Lista de vias/manobras, diagnósticos e correção reversível do nome de exibição.
- Salvamento explícito de rascunho local sem respostas de provider.

Para ativar o renderer e matching, copie `.env.example` para `.env.local`, preencha `NEXT_PUBLIC_MAPBOX_TOKEN` com token público restrito por URL e `MAPBOX_SECRET_TOKEN` com token server-side. Não comite `.env.local`. Geocoding, IndexedDB e exportação de vídeo continuam fora desta entrega.
