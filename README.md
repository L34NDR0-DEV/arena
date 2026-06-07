# Tower Defense on the Space

Jogo de arena espacial 2D feito em HTML5 Canvas, com servidor Node.js puro (sem dependências) e multiplayer via WebSocket.

## Como rodar

```bash
node server.js
```

Depois abra [http://localhost:3000](http://localhost:3000) no navegador.

- **Solo**: funciona offline, sem WebSocket (fallback automático).
- **Multiplayer**: jogadores na mesma sala compartilham o mesmo campo de jogo.

## Controles

- `WASD` — mover
- `Mouse` — mirar
- `Clique` — atirar
- `Shift` — dash
- `E` — escudo
- `ESC` — menu

## Stack

- Renderização: HTML5 Canvas 2D API
- Servidor: Node.js puro (HTTP + WebSocket implementado manualmente, sem npm)
- Módulos: ES modules nativos do navegador (sem build step)

## Estrutura

- `server.js` — servidor HTTP estático + WebSocket multiplayer
- `index.html` — menu, HUD e tela de game over
- `src/` — código do jogo (naves, inimigos, itens, combate, arena, áudio, rede, UI)
