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

- `Segurar direção` — mover
- `Espaço` — atirar
- `Shift` — dash
- `1-5` — usar item
- `X` — slot extra
- `ESC` — pausa
- `M` — som

## Modos de jogo

- **Contra 1** — 5 vidas cada lado. Quem perder todas primeiro, perde.
- **Contra 2** — enfrente 2 inimigos ao mesmo tempo. Mantenha distância.
- **Duplo** — jogue com um amigo na mesma sala (multiplayer).
- **Livre** — sem timer, para praticar à vontade.
- **Teste** — inimigos não atacam, ideal para testar mecânicas.
- **Survivor** — ondas infinitas de inimigos. Sobreviva o máximo possível.

> ⚠️ O jogo está em desenvolvimento — modos, balanceamento e conteúdo podem mudar a qualquer momento.

## Stack

- Renderização: HTML5 Canvas 2D API
- Servidor: Node.js puro (HTTP + WebSocket implementado manualmente, sem npm)
- Módulos: ES modules nativos do navegador (sem build step)

## Estrutura

- `server.js` — servidor HTTP estático + WebSocket multiplayer
- `index.html` — menu, HUD e tela de game over
- `src/` — código do jogo (naves, inimigos, itens, combate, arena, áudio, rede, UI)
