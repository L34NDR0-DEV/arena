// Histórico de versões do jogo, exibido no painel "Novidades" do menu.
// Para lançar uma atualização: adicione uma nova entrada no TOPO da lista.
export const CHANGELOG = [
  {
    version: 'v2.3',
    date: '2026-06-12',
    changes: [
      'Sistema de versão obrigatório: o jogo detecta atualização nova, limpa cache antigo e recarrega para manter todos na versão atual',
      'Tower Defense: spawn das naves ficou mais seguro e evita nascer dentro da torre central ou dos relés',
      'Modos online: contador compacto de abates da equipe ao lado dos slots de arma',
      'Corrigido falso aviso da narradora dizendo que você eliminou alguém ao iniciar partidas online',
      'Abates não são contabilizados durante a zona segura inicial dos modos online',
    ],
  },
  {
    version: 'v2.2',
    date: '2026-06-11',
    changes: [
      'Narradora: voz feminina narra os momentos da partida (boas-vindas, kills, morte, vitória, derrota, buraco negro, paredes elétricas, disconnects e manutenção)',
      'Fila de voz: narração nunca se sobrepõe — cada fala espera a anterior terminar',
      'Aviso de manutenção do servidor em tempo real: painel aparece no topo da tela sem interromper o jogo (amarelo = aviso, vermelho = bloqueado)',
      '20 novos itens de tiro com temática arcade: LASER, PLASMA, SHOTGUN, SNIPER, ROCKET, FREEZE, CHAIN, HOMING, BOUNCE, TOXIC, DRAIN, GRAVITY, QUANTUM, PIERCING, RAPID, NOVA, SHIELD, REGEN, BURST e NUKE',
      'Sistema de troca de arma base: o primeiro item de tiro coletado torna-se a arma padrão da nave',
      '7 novos inimigos: Disco Alienígena, Berserker, Fantasma, Juggernaut, Sniper, Bombardeiro, Ceifador, Demônio da Velocidade e Tanque',
      'Inimigos com mais vida em todos os modos; inimigos ganham poderes especiais conforme a onda avança',
      'Torres com escudo regenerativo, reflexo de dano (25%), ondas de choque que atordoam inimigos por 90s',
      'Atirar em parede recupera vida e XP, com chance de dropar item aleatório',
      'Buracos negros refletem balas dos inimigos de volta',
      'Paredes elétricas nos últimos 30s da partida: aviso por voz e visual pulsante no canvas',
      'Dash aprimorado: mais rápido e longo; com vida cheia é gratuito, abaixo de 90% consome vida convertida em mana',
      'Tempo de partida: 15 min no modo normal, 20 min no modo online',
      'Modos online com menos obstáculos para combate mais aberto',
      'Itens ficam mais tempo na arena e surgem com maior frequência',
    ],
  },
  {
    version: 'v2.1',
    date: '2026-06-08',
    changes: [
      'Novo modo "Equipe Online": PvP em times, até 6 jogadores (3x3), primeira equipe a 200 abates vence',
      'Torneio Tower Defense: dispute o controle da torre central em duplas e ganhe a skin exclusiva "Stealwing"',
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
