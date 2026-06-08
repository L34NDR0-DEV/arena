// Histórico de versões do jogo, exibido no painel "Novidades" do menu.
// Para lançar uma atualização: adicione uma nova entrada no TOPO da lista.
export const CHANGELOG = [
  {
    version: 'v2.1',
    date: '2026-06-08',
    changes: [
      'Novo modo "Equipe Online": PvP em times, até 6 jogadores (3x3), primeira equipe a 200 abates vence',
      'Torneio Tower Defense: dispute o controle da torre central em duplas e ganhe a skin exclusiva "Hex Champion"',
      'Corrigido: fila do Equipe Online e do Tower Defense agora forma as partidas corretamente (antes travava sem encontrar ninguém)',
      'Botão "X" para cancelar a busca por partida e sair da fila a qualquer momento',
      'Corrigida a chama do propulsor das naves, que aparecia na frente em vez de atrás',
      'Guia de boas-vindas para novos pilotos, com instrutor explicando os controles e os modos de jogo',
      'Avisos de novos modos de jogo direto no menu',
      'Música de abertura agora toca corretamente em Android e navegadores web (antes só funcionava no iPhone)',
    ],
  },
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
