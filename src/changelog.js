// Histórico de versões do jogo, exibido no painel "Novidades" do menu.
// Para lançar uma atualização: adicione uma nova entrada no TOPO da lista.
export const CHANGELOG = [
  {
    version: 'v2.0',
    date: '2026-06-07',
    changes: [
      'Painel de novidades adicionado ao menu',
      'Servidor pronto para deploy online (porta configurável)',
    ],
  },
  {
    version: 'v1.0',
    date: '2026-06-06',
    changes: [
      'Lançamento inicial: arena espacial, ondas de inimigos e itens coletáveis',
      'Modo multiplayer via WebSocket',
      '7 naves selecionáveis',
    ],
  },
];

export const CURRENT_VERSION = CHANGELOG[0].version;
