import http from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT || 8787);
const rooms = new Map();
const suits = ["♠", "♥", "♣", "♦"];
const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const DEFAULT_SETTINGS = {
  actionTimeoutSeconds: 30,
  roundLimit: 0,
  timeLimitMinutes: 0,
  minBet: 10,
  maxBet: 50,
  betStep: 10,
  initialChips: 0,
};

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "content-type": "application/json; charset=utf-8",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function makeCode() {
  for (;;) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    if (!rooms.has(code)) return code;
  }
}

function createDeck() {
  return suits.flatMap((suit) => ranks.map((rank) => ({ suit, rank, id: `${rank}${suit}-${randomUUID()}` })));
}

function shuffle(cards) {
  const copy = [...cards];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function drawCard(room) {
  if (room.deck.length === 0) {
    room.deck = shuffle(room.used);
    room.used = [];
    room.events.unshift("牌库不足，系统已把用过的牌洗回牌库。");
  }
  return room.deck.pop();
}

function cardValue(card) {
  if (card.rank === "A") return 11;
  if (["J", "Q", "K"].includes(card.rank)) return 10;
  return Number(card.rank);
}

function handScore(cards) {
  let total = cards.reduce((sum, card) => sum + cardValue(card), 0);
  let aces = cards.filter((card) => card.rank === "A").length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

function isPairOfAces(cards) {
  return cards.length === 2 && cards.every((card) => card.rank === "A");
}

function handRank(cards) {
  const score = handScore(cards);
  if (cards.length >= 5 && score <= 21) return { level: 3, multiplier: 5 };
  if (isPairOfAces(cards)) return { level: 2, multiplier: 3 };
  if (score === 21) return { level: 1, multiplier: 2 };
  return { level: 0, multiplier: 1 };
}

function handLabel(cards) {
  if (isBust(cards)) return "爆牌";
  const rank = handRank(cards);
  if (rank.level === 3) return "五小牛";
  if (rank.level === 2) return "一对 A";
  if (rank.level === 1) return "21 点";
  return `${handScore(cards)} 点`;
}

function isBust(cards) {
  return handScore(cards) > 21;
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function sanitizeSettings(settings = {}) {
  const minBet = clampNumber(settings.minBet, DEFAULT_SETTINGS.minBet, 10, 500);
  const maxBet = clampNumber(settings.maxBet, DEFAULT_SETTINGS.maxBet, minBet, 1000);
  const betStep = clampNumber(settings.betStep, DEFAULT_SETTINGS.betStep, 1, 100);
  return {
    actionTimeoutSeconds: clampNumber(settings.actionTimeoutSeconds, DEFAULT_SETTINGS.actionTimeoutSeconds, 10, 120),
    roundLimit: clampNumber(settings.roundLimit, DEFAULT_SETTINGS.roundLimit, 0, 99),
    timeLimitMinutes: clampNumber(settings.timeLimitMinutes, DEFAULT_SETTINGS.timeLimitMinutes, 0, 240),
    minBet,
    maxBet,
    betStep,
    initialChips: 0,
  };
}

function createHand(bet = 0, options = {}) {
  return {
    cards: options.cards || [],
    bet,
    betConfirmed: Boolean(options.betConfirmed),
    stood: false,
    busted: false,
    wasSplit: Boolean(options.wasSplit),
  };
}

function createPlayer(nickname, seatIndex, isHost = false, settings = DEFAULT_SETTINGS) {
  return {
    id: randomUUID(),
    nickname: String(nickname || "玩家").slice(0, 16),
    seatIndex,
    chips: settings.initialChips,
    status: "connected",
    isHost,
    isDealer: false,
    activeFromRound: 1,
    hands: [createHand(settings.minBet * 2)],
  };
}

function createRoom(nickname, maxPlayers = 5, rawSettings = {}) {
  const code = makeCode();
  const settings = sanitizeSettings(rawSettings);
  const host = createPlayer(nickname, 0, true, settings);
  host.isDealer = true;
  const room = {
    code,
    maxPlayers: Math.min(5, Math.max(3, Number(maxPlayers) || 5)),
    settings,
    round: 0,
    startedAt: null,
    gameOverReason: "",
    status: "lobby",
    dealerRevealed: false,
    currentTurnPlayerId: null,
    currentHandIndex: 0,
    turnDeadlineAt: null,
    nextDealerId: null,
    deck: shuffle(createDeck()),
    used: [],
    players: [host],
    events: [`${host.nickname} 创建了房间。`],
    settlements: [],
    updatedAt: Date.now(),
  };
  rooms.set(code, room);
  return { room, player: host };
}

function joinRoom(room, nickname) {
  if (room.players.length >= room.maxPlayers) throw new Error("房间已满");
  const player = createPlayer(nickname, room.players.length, false, room.settings);
  player.activeFromRound = room.status === "lobby" ? room.round : room.round + 1;
  room.players.push(player);
  room.events.unshift(`${player.nickname} 加入房间。`);
  room.updatedAt = Date.now();
  return player;
}

function activePlayers(room) {
  return room.players.filter((player) => player.activeFromRound <= room.round);
}

function dealer(room) {
  return room.players.find((player) => player.isDealer) || room.players[0];
}

function idlePlayers(room) {
  return activePlayers(room).filter((player) => !player.isDealer);
}

function defaultBet(room) {
  return Math.min(room.settings.maxBet, Math.max(room.settings.minBet, room.settings.minBet * 2));
}

function activeHand(player, room) {
  return player?.hands?.[room.currentHandIndex] || null;
}

function handDone(hand) {
  return !hand || hand.stood || hand.busted;
}

function canSplitHand(hand) {
  return Boolean(hand && hand.cards.length === 2 && !hand.wasSplit && hand.cards[0].rank === hand.cards[1].rank);
}

function setTurnDeadline(room) {
  if (!["player_turn", "dealer_turn"].includes(room.status) || !room.currentTurnPlayerId) {
    room.turnDeadlineAt = null;
    return;
  }
  room.turnDeadlineAt = Date.now() + room.settings.actionTimeoutSeconds * 1000;
}

function clearDealerFlags(room) {
  room.players.forEach((player) => {
    player.isDealer = false;
  });
}

function nextDealerAfter(room, currentDealerId) {
  const eligible = room.players
    .filter((player) => player.activeFromRound <= room.round + 1)
    .sort((a, b) => a.seatIndex - b.seatIndex);
  if (eligible.length === 0) return null;
  const current = eligible.findIndex((player) => player.id === currentDealerId);
  return eligible[(current + 1 + eligible.length) % eligible.length];
}

function applyPendingDealer(room) {
  if (!room.nextDealerId) return;
  const next = room.players.find((player) => player.id === room.nextDealerId);
  if (!next) {
    room.nextDealerId = null;
    return;
  }
  clearDealerFlags(room);
  next.isDealer = true;
  room.nextDealerId = null;
  room.events.unshift(`${next.nickname} 接庄。`);
}

function startRound(room) {
  if (room.players.length < 3) throw new Error("至少 3 人才能开始");
  if (room.gameOverReason) throw new Error(room.gameOverReason);
  applyPendingDealer(room);
  room.players.forEach((player) => {
    player.hands.forEach((hand) => room.used.push(...hand.cards));
  });
  if (room.deck.length < room.players.length * 3) {
    room.deck = shuffle([...room.deck, ...room.used]);
    room.used = [];
  }
  room.round += 1;
  room.startedAt ||= Date.now();
  room.status = "betting";
  room.dealerRevealed = false;
  room.currentTurnPlayerId = null;
  room.currentHandIndex = 0;
  room.turnDeadlineAt = null;
  activePlayers(room).forEach((player) => {
    player.hands = [createHand(player.isDealer ? 0 : defaultBet(room), { betConfirmed: player.isDealer })];
  });
  room.events.unshift(`第 ${room.round} 局开始，等待闲家下注。`);
  room.settlements = [];
  room.updatedAt = Date.now();
}

function dealInitialCards(room) {
  if (room.deck.length < activePlayers(room).length * 2) {
    room.deck = shuffle([...room.deck, ...room.used]);
    room.used = [];
    room.events.unshift("牌库不足，系统已把用过的牌洗回牌库。");
  }
  for (let pass = 0; pass < 2; pass += 1) {
    activePlayers(room).forEach((player) => {
      player.hands[0].cards.push(drawCard(room));
    });
  }
  room.status = "player_turn";
  const first = idlePlayers(room)[0];
  room.currentTurnPlayerId = first?.id || null;
  room.currentHandIndex = 0;
  setTurnDeadline(room);
  room.events.unshift("下注完成，开始发牌。");
  room.updatedAt = Date.now();
}

function prepareDeal(room, player, shouldShuffle = false) {
  const house = dealer(room);
  if (room.status !== "dealer_prepare") throw new Error("当前不是庄家发牌准备阶段");
  if (player.id !== house.id) throw new Error("只有庄家可以选择是否洗牌");
  if (shouldShuffle) {
    room.deck = shuffle([...room.deck, ...room.used]);
    room.used = [];
    room.events.unshift("庄家选择洗牌后发牌。");
  } else {
    room.events.unshift("庄家选择不洗牌，直接发牌。");
  }
  dealInitialCards(room);
}

function normalizeBet(room, value) {
  const bet = Number(value);
  const { minBet, maxBet, betStep } = room.settings;
  if (!Number.isFinite(bet) || bet < minBet || bet > maxBet || bet % betStep !== 0) {
    throw new Error(`下注必须是 ${minBet}-${maxBet}，并按 ${betStep} 递增`);
  }
  return bet;
}

function placeBet(room, player, betValue) {
  if (room.status !== "betting") throw new Error("当前不是下注阶段");
  if (player.isDealer) throw new Error("庄家不需要下注");
  if (player.activeFromRound > room.round) throw new Error("你将在下一局参与");
  const hand = player.hands[0];
  hand.bet = normalizeBet(room, betValue);
  hand.betConfirmed = true;
  room.events.unshift(`${player.nickname} 下注 ${hand.bet}。`);
  if (idlePlayers(room).every((item) => item.hands[0]?.betConfirmed)) {
    room.status = "dealer_prepare";
    room.currentTurnPlayerId = dealer(room).id;
    room.currentHandIndex = 0;
    room.turnDeadlineAt = null;
    room.events.unshift("下注完成，等待庄家选择是否洗牌。");
    room.updatedAt = Date.now();
    return;
  }
  room.updatedAt = Date.now();
}

function advancePlayerTurn(room) {
  const current = room.players.find((player) => player.id === room.currentTurnPlayerId);
  if (current) {
    const nextHandIndex = current.hands.findIndex((hand, index) => index > room.currentHandIndex && !handDone(hand));
    if (nextHandIndex >= 0) {
      room.currentHandIndex = nextHandIndex;
      setTurnDeadline(room);
      return;
    }
  }

  const players = idlePlayers(room);
  const currentIndex = players.findIndex((player) => player.id === room.currentTurnPlayerId);
  const next = players.find((player, index) => index > currentIndex && player.hands.some((hand) => !handDone(hand)));
  if (next) {
    room.currentTurnPlayerId = next.id;
    room.currentHandIndex = next.hands.findIndex((hand) => !handDone(hand));
    setTurnDeadline(room);
    return;
  }
  startDealerTurn(room);
}

function startDealerTurn(room) {
  room.status = "dealer_turn";
  room.dealerRevealed = true;
  room.currentTurnPlayerId = dealer(room).id;
  room.currentHandIndex = 0;
  setTurnDeadline(room);
  room.events.unshift("闲家行动结束，庄家亮牌。");
  room.updatedAt = Date.now();
}

function advanceDealerTurn(room) {
  const house = dealer(room);
  const nextHandIndex = house.hands.findIndex((hand, index) => index > room.currentHandIndex && !handDone(hand));
  if (nextHandIndex >= 0) {
    room.currentHandIndex = nextHandIndex;
    setTurnDeadline(room);
    return;
  }
  settleRound(room);
}

function dealerHit(room, player) {
  const house = dealer(room);
  if (room.status !== "dealer_turn") throw new Error("当前不是庄家回合");
  if (player.id !== house.id) throw new Error("只有庄家可以操作");
  const hand = activeHand(house, room);
  if (hand.stood || hand.busted) throw new Error("庄家手牌已结束");
  const card = drawCard(room);
  hand.cards.push(card);
  room.events.unshift(`庄家第 ${room.currentHandIndex + 1} 手要牌。`);
  if (isBust(hand.cards)) {
    hand.busted = true;
    hand.stood = true;
    room.events.unshift("庄家爆牌。");
    advanceDealerTurn(room);
    return;
  }
  setTurnDeadline(room);
  room.updatedAt = Date.now();
}

function dealerStand(room, player) {
  const house = dealer(room);
  if (room.status !== "dealer_turn") throw new Error("当前不是庄家回合");
  if (player.id !== house.id) throw new Error("只有庄家可以操作");
  const hand = activeHand(house, room);
  if (handScore(hand.cards) <= 13) throw new Error("小于等于 13 必须要牌");
  hand.stood = true;
  room.events.unshift(`庄家第 ${room.currentHandIndex + 1} 手 ${handScore(hand.cards)} 点停牌。`);
  advanceDealerTurn(room);
}

function compareHands(playerCards, dealerCards) {
  const playerBust = isBust(playerCards);
  const dealerBust = isBust(dealerCards);
  if (playerBust && dealerBust) return 1;
  if (playerBust) return -1;
  if (dealerBust) return 1;

  const playerRank = handRank(playerCards).level;
  const dealerRank = handRank(dealerCards).level;
  if (playerRank !== dealerRank) return playerRank > dealerRank ? 1 : -1;

  const playerScore = handScore(playerCards);
  const dealerScore = handScore(dealerCards);
  if (playerScore > dealerScore) return 1;
  return -1;
}

function compareReason(playerCards, dealerCards, result) {
  const playerBust = isBust(playerCards);
  const dealerBust = isBust(dealerCards);
  if (playerBust && dealerBust) return "双方爆牌，闲家胜";
  if (dealerBust) return "庄家爆牌，闲家胜";
  if (playerBust) return "闲家爆牌，庄家胜";

  const playerRank = handRank(playerCards).level;
  const dealerRank = handRank(dealerCards).level;
  if (playerRank !== dealerRank) {
    return result > 0 ? `${handLabel(playerCards)} 胜出` : `${handLabel(dealerCards)} 胜出`;
  }

  const playerScore = handScore(playerCards);
  const dealerScore = handScore(dealerCards);
  if (playerScore === dealerScore) return "同点庄赢";
  return result > 0 ? "闲家点数更高" : "庄家点数更高";
}

function checkGameOver(room) {
  if (room.settings.roundLimit && room.round >= room.settings.roundLimit) {
    room.gameOverReason = `本场已完成 ${room.settings.roundLimit} 局`;
  }
  if (
    room.settings.timeLimitMinutes &&
    room.startedAt &&
    Date.now() - room.startedAt >= room.settings.timeLimitMinutes * 60 * 1000
  ) {
    room.gameOverReason = `本场 ${room.settings.timeLimitMinutes} 分钟倒计时已结束`;
  }
}

function settleRound(room) {
  const house = dealer(room);
  const houseBusted = house.hands.some((hand) => hand.busted);
  room.settlements = [];
  idlePlayers(room).forEach((player) => {
    player.hands.forEach((hand, handIndex) => {
      house.hands.forEach((houseHand, dealerHandIndex) => {
        const result = compareHands(hand.cards, houseHand.cards);
        const multiplier = Math.max(handRank(hand.cards).multiplier, handRank(houseHand.cards).multiplier);
        const delta = hand.bet * multiplier * result;
        player.chips += delta;
        house.chips -= delta;
        room.settlements.push({
          playerId: player.id,
          playerName: player.nickname,
          dealerId: house.id,
          dealerName: house.nickname,
          handIndex,
          dealerHandIndex,
          bet: hand.bet,
          multiplier,
          delta,
          result: result > 0 ? "win" : "lose",
          reason: compareReason(hand.cards, houseHand.cards, result),
          playerHandLabel: player.hands.length > 1 ? `第 ${handIndex + 1} 手 ${handLabel(hand.cards)}` : handLabel(hand.cards),
          dealerHandLabel: house.hands.length > 1 ? `庄第 ${dealerHandIndex + 1} 手 ${handLabel(houseHand.cards)}` : handLabel(houseHand.cards),
          playerTotal: player.chips,
          dealerTotal: house.chips,
        });
      });
    });
  });
  if (houseBusted) {
    const nextDealer = nextDealerAfter(room, house.id);
    if (nextDealer && nextDealer.id !== house.id) {
      room.nextDealerId = nextDealer.id;
      room.events.unshift(`庄家爆牌，下一局 ${nextDealer.nickname} 坐庄。`);
    }
  }
  room.status = "settlement";
  room.currentTurnPlayerId = null;
  room.currentHandIndex = 0;
  room.turnDeadlineAt = null;
  checkGameOver(room);
  room.events.unshift("本局结算完成。");
  room.updatedAt = Date.now();
}

function hit(room, player) {
  if (room.status === "dealer_turn") {
    dealerHit(room, player);
    return;
  }
  if (room.status !== "player_turn") throw new Error("当前不能要牌");
  if (room.currentTurnPlayerId !== player.id) throw new Error("还没轮到你");
  const hand = activeHand(player, room);
  if (hand.stood || hand.busted) throw new Error("这手牌已结束");
  const card = drawCard(room);
  hand.cards.push(card);
  room.events.unshift(`${player.nickname} 第 ${room.currentHandIndex + 1} 手要牌。`);
  if (isBust(hand.cards)) {
    hand.busted = true;
    hand.stood = true;
    room.events.unshift(`${player.nickname} 爆牌。`);
    advancePlayerTurn(room);
  } else {
    setTurnDeadline(room);
  }
  room.updatedAt = Date.now();
}

function stand(room, player) {
  if (room.status === "dealer_turn") {
    dealerStand(room, player);
    return;
  }
  if (room.status !== "player_turn") throw new Error("当前不能停牌");
  if (room.currentTurnPlayerId !== player.id) throw new Error("还没轮到你");
  const hand = activeHand(player, room);
  if (handScore(hand.cards) <= 13) throw new Error("小于等于 13 必须要牌");
  hand.stood = true;
  room.events.unshift(`${player.nickname} 第 ${room.currentHandIndex + 1} 手停牌。`);
  advancePlayerTurn(room);
  room.updatedAt = Date.now();
}

function split(room, player) {
  if (!["player_turn", "dealer_turn"].includes(room.status)) throw new Error("当前不能分牌");
  if (room.currentTurnPlayerId !== player.id) throw new Error("还没轮到你");
  if (room.status === "dealer_turn" && player.id !== dealer(room).id) throw new Error("只有庄家可以操作");
  const hand = activeHand(player, room);
  if (!canSplitHand(hand)) throw new Error("只有起手对子可以分牌，且不能再次分牌");
  const [first, second] = hand.cards;
  const bet = player.isDealer ? 0 : hand.bet;
  const firstHand = createHand(bet, { cards: [first], betConfirmed: true, wasSplit: true });
  const secondHand = createHand(bet, { cards: [second], betConfirmed: true, wasSplit: true });
  player.hands.splice(room.currentHandIndex, 1, firstHand, secondHand);
  room.events.unshift(`${player.nickname} 分牌，从第 1 手开始操作。`);
  setTurnDeadline(room);
  room.updatedAt = Date.now();
}

function timeoutAct(room) {
  const player = room.players.find((item) => item.id === room.currentTurnPlayerId);
  const hand = activeHand(player, room);
  if (!player || !hand || handDone(hand)) return;
  let drew = 0;
  while (handScore(hand.cards) <= 13 && !isBust(hand.cards) && drew < 8) {
    hand.cards.push(drawCard(room));
    drew += 1;
  }
  if (isBust(hand.cards)) {
    hand.busted = true;
    hand.stood = true;
    room.events.unshift(`${player.nickname} 超时自动要牌后爆牌。`);
  } else {
    hand.stood = true;
    room.events.unshift(`${player.nickname} 超时，系统自动不要了。`);
  }
  if (room.status === "dealer_turn") advanceDealerTurn(room);
  else advancePlayerTurn(room);
  room.updatedAt = Date.now();
}

function applyTimeouts(room) {
  let guard = 0;
  while (
    ["player_turn", "dealer_turn"].includes(room.status) &&
    room.turnDeadlineAt &&
    Date.now() >= room.turnDeadlineAt &&
    guard < 20
  ) {
    timeoutAct(room);
    guard += 1;
  }
}

function publicCard(card) {
  return card ? { rank: card.rank, suit: card.suit, id: card.id } : null;
}

function visibleRoom(room, viewerId) {
  applyTimeouts(room);
  return {
    code: room.code,
    maxPlayers: room.maxPlayers,
    settings: room.settings,
    round: room.round,
    status: room.status,
    gameOverReason: room.gameOverReason,
    startedAt: room.startedAt,
    dealerRevealed: room.dealerRevealed,
    currentTurnPlayerId: room.currentTurnPlayerId,
    currentHandIndex: room.currentHandIndex,
    turnDeadlineAt: room.turnDeadlineAt,
    nextDealerId: room.nextDealerId,
    deckCount: room.deck.length,
    usedCount: room.used.length,
    events: room.events.slice(0, 5),
    settlements: room.settlements || [],
    showdownSteps: room.settlements || [],
    updatedAt: room.updatedAt,
    viewerId,
    players: room.players.map((player) => {
      const canSeeHand = (hand) =>
        room.status === "settlement" ||
        player.id === viewerId ||
        (player.isDealer && room.dealerRevealed) ||
        hand.busted ||
        (hand.stood && handRank(hand.cards).level > 0);
      const canSeeCard = (hand, index) => canSeeHand(hand) || index >= 2;
      return {
        id: player.id,
        name: player.nickname,
        nickname: player.nickname,
        chips: player.chips,
        isHost: player.isHost,
        isDealer: player.isDealer,
        activeFromRound: player.activeFromRound,
        hands: player.hands.map((hand) => ({
          bet: hand.bet,
          betConfirmed: Boolean(hand.betConfirmed),
          stood: hand.stood,
          busted: hand.busted,
          wasSplit: hand.wasSplit,
          canSplit: player.id === viewerId && player.id === room.currentTurnPlayerId && canSplitHand(hand),
          cards: hand.cards.map((card, index) => (canSeeCard(hand, index) ? publicCard(card) : { hidden: true })),
        })),
      };
    }),
  };
}

function roomSummary(room) {
  applyTimeouts(room);
  const house = dealer(room);
  return {
    code: room.code,
    maxPlayers: room.maxPlayers,
    playerCount: room.players.length,
    round: room.round,
    status: room.status,
    statusLabel: room.gameOverReason ? "已结束" : {
      lobby: "等待开局",
      betting: "下注中",
      dealer_prepare: "庄家发牌",
      player_turn: "闲家回合",
      dealer_turn: "庄家回合",
      settlement: "本局结算",
    }[room.status] || "牌局中",
    dealerName: house?.nickname || "",
    hostName: room.players.find((player) => player.isHost)?.nickname || "",
    canJoin: room.players.length < room.maxPlayers,
    updatedAt: room.updatedAt,
  };
}

function findPlayer(room, playerId) {
  const player = room.players.find((item) => item.id === playerId);
  if (!player) throw new Error("玩家不存在");
  return player;
}

async function handle(req, res) {
  if (req.method === "OPTIONS") return json(res, 200, { ok: true });
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, { ok: true, rooms: rooms.size });
    }

    if (req.method === "GET" && url.pathname === "/api/rooms") {
      const list = [...rooms.values()]
        .map(roomSummary)
        .filter((room) => room.canJoin)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 12);
      return json(res, 200, { rooms: list });
    }

    if (req.method === "POST" && url.pathname === "/api/rooms") {
      const body = await readBody(req);
      const { room, player } = createRoom(body.nickname, body.maxPlayers, body.settings);
      return json(res, 201, { room: visibleRoom(room, player.id), playerId: player.id });
    }

    const joinMatch = url.pathname.match(/^\/api\/rooms\/(\d{6})\/join$/);
    if (req.method === "POST" && joinMatch) {
      const room = rooms.get(joinMatch[1]);
      if (!room) throw new Error("房间不存在");
      applyTimeouts(room);
      const body = await readBody(req);
      const player = joinRoom(room, body.nickname);
      return json(res, 200, { room: visibleRoom(room, player.id), playerId: player.id });
    }

    const roomMatch = url.pathname.match(/^\/api\/rooms\/(\d{6})$/);
    if (req.method === "GET" && roomMatch) {
      const room = rooms.get(roomMatch[1]);
      if (!room) throw new Error("房间不存在");
      applyTimeouts(room);
      const playerId = url.searchParams.get("playerId");
      return json(res, 200, { room: visibleRoom(room, playerId), playerId });
    }

    const actionMatch = url.pathname.match(/^\/api\/rooms\/(\d{6})\/action$/);
    if (req.method === "POST" && actionMatch) {
      const room = rooms.get(actionMatch[1]);
      if (!room) throw new Error("房间不存在");
      applyTimeouts(room);
      const body = await readBody(req);
      const player = findPlayer(room, body.playerId);
      if (body.type === "start_round") startRound(room);
      else if (body.type === "place_bet") placeBet(room, player, body.bet);
      else if (body.type === "hit") hit(room, player);
      else if (body.type === "stand") stand(room, player);
      else if (body.type === "split") split(room, player);
      else if (body.type === "deal_keep") prepareDeal(room, player, false);
      else if (body.type === "deal_shuffle") prepareDeal(room, player, true);
      else if (body.type === "reveal_dealer") startDealerTurn(room);
      else throw new Error("未知操作");
      return json(res, 200, { room: visibleRoom(room, player.id), playerId: player.id });
    }

    return json(res, 404, { error: "Not found" });
  } catch (error) {
    return json(res, 400, { error: error.message || "Bad request" });
  }
}

http.createServer(handle).listen(PORT, () => {
  console.log(`21 point room server listening on ${PORT}`);
});
