import http from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT || 8787);
const rooms = new Map();
const suits = ["♠", "♥", "♣", "♦"];
const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const BET_MIN = 10;
const BET_MAX = 50;
const BET_STEP = 10;

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

function createPlayer(nickname, seatIndex, isHost = false) {
  return {
    id: randomUUID(),
    nickname: String(nickname || "玩家").slice(0, 16),
    seatIndex,
    chips: 500,
    status: "connected",
    isHost,
    isDealer: false,
    activeFromRound: 1,
    hands: [{ cards: [], bet: 20, stood: false, busted: false }],
  };
}

function createRoom(nickname, maxPlayers = 5) {
  const code = makeCode();
  const host = createPlayer(nickname, 0, true);
  host.isDealer = true;
  const room = {
    code,
    maxPlayers: Math.min(5, Math.max(3, Number(maxPlayers) || 5)),
    round: 0,
    status: "lobby",
    dealerRevealed: false,
    currentTurnPlayerId: null,
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
  const player = createPlayer(nickname, room.players.length, false);
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

function startRound(room) {
  if (room.players.length < 3) throw new Error("至少 3 人才能开始");
  room.players.forEach((player) => {
    player.hands.forEach((hand) => room.used.push(...hand.cards));
  });
  if (room.deck.length < room.players.length * 3) {
    room.deck = shuffle([...room.deck, ...room.used]);
    room.used = [];
  }
  room.round += 1;
  room.status = "betting";
  room.dealerRevealed = false;
  room.currentTurnPlayerId = null;
  activePlayers(room).forEach((player) => {
    player.hands = [{ cards: [], bet: player.isDealer ? 0 : 20, betConfirmed: player.isDealer, stood: false, busted: false }];
  });
  room.events.unshift(`第 ${room.round} 局开始，等待闲家下注。`);
  room.settlements = [];
  room.updatedAt = Date.now();
}

function dealInitialCards(room) {
  for (let pass = 0; pass < 2; pass += 1) {
    activePlayers(room).forEach((player) => {
      player.hands[0].cards.push(drawCard(room));
    });
  }
  room.status = "player_turn";
  const first = idlePlayers(room)[0];
  room.currentTurnPlayerId = first?.id || null;
  room.events.unshift("下注完成，开始发牌。");
  room.updatedAt = Date.now();
}

function normalizeBet(value) {
  const bet = Number(value);
  if (!Number.isFinite(bet) || bet < BET_MIN || bet > BET_MAX || bet % BET_STEP !== 0) {
    throw new Error(`下注必须是 ${BET_MIN}-${BET_MAX}，并按 ${BET_STEP} 递增`);
  }
  return bet;
}

function placeBet(room, player, betValue) {
  if (room.status !== "betting") throw new Error("当前不是下注阶段");
  if (player.isDealer) throw new Error("庄家不需要下注");
  if (player.activeFromRound > room.round) throw new Error("你将在下一局参与");
  const hand = player.hands[0];
  hand.bet = normalizeBet(betValue);
  hand.betConfirmed = true;
  room.events.unshift(`${player.nickname} 下注 ${hand.bet}。`);
  if (idlePlayers(room).every((item) => item.hands[0]?.betConfirmed)) {
    dealInitialCards(room);
    return;
  }
  room.updatedAt = Date.now();
}

function nextTurn(room) {
  const players = idlePlayers(room);
  const currentIndex = players.findIndex((player) => player.id === room.currentTurnPlayerId);
  const next = players.find((player, index) => index > currentIndex && !player.hands[0].stood && !player.hands[0].busted);
  if (next) {
    room.currentTurnPlayerId = next.id;
    return;
  }
  startDealerTurn(room);
}

function startDealerTurn(room) {
  room.status = "dealer_turn";
  room.dealerRevealed = true;
  room.currentTurnPlayerId = dealer(room).id;
  room.events.unshift("闲家行动结束，庄家亮牌。");
  room.updatedAt = Date.now();
}

function dealerHit(room, player) {
  const house = dealer(room);
  if (room.status !== "dealer_turn") throw new Error("当前不是庄家回合");
  if (player.id !== house.id) throw new Error("只有庄家可以操作");
  const hand = house.hands[0];
  if (hand.stood || hand.busted) throw new Error("庄家手牌已结束");
  const card = drawCard(room);
  hand.cards.push(card);
  room.events.unshift(`庄家要牌。`);
  if (isBust(hand.cards)) {
    hand.busted = true;
    hand.stood = true;
    room.events.unshift("庄家爆牌。");
    settleRound(room);
    return;
  }
  room.updatedAt = Date.now();
}

function dealerStand(room, player) {
  const house = dealer(room);
  if (room.status !== "dealer_turn") throw new Error("当前不是庄家回合");
  if (player.id !== house.id) throw new Error("只有庄家可以操作");
  const hand = house.hands[0];
  while (handScore(hand.cards) <= 13) {
    throw new Error("小于等于 13 必须要牌");
  }
  hand.stood = true;
  room.events.unshift(`庄家 ${handScore(hand.cards)} 点停牌。`);
  settleRound(room);
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

function settleRound(room) {
  const house = dealer(room);
  const houseHand = house.hands[0];
  room.settlements = [];
  idlePlayers(room).forEach((player) => {
    const hand = player.hands[0];
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
      bet: hand.bet,
      multiplier,
      delta,
      result: result > 0 ? "win" : "lose",
      reason: compareReason(hand.cards, houseHand.cards, result),
      playerHandLabel: handLabel(hand.cards),
      dealerHandLabel: handLabel(houseHand.cards),
      playerTotal: player.chips,
      dealerTotal: house.chips,
    });
  });
  room.status = "settlement";
  room.currentTurnPlayerId = null;
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
  const hand = player.hands[0];
  if (hand.stood || hand.busted) throw new Error("这手牌已结束");
  const card = drawCard(room);
  hand.cards.push(card);
  room.events.unshift(`${player.nickname} 要牌。`);
  if (isBust(hand.cards)) {
    hand.busted = true;
    hand.stood = true;
    room.events.unshift(`${player.nickname} 爆牌。`);
    nextTurn(room);
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
  const hand = player.hands[0];
  if (handScore(hand.cards) <= 13) throw new Error("小于等于 13 必须要牌");
  hand.stood = true;
  room.events.unshift(`${player.nickname} 停牌。`);
  nextTurn(room);
  room.updatedAt = Date.now();
}

function publicCard(card) {
  return card ? { rank: card.rank, suit: card.suit, id: card.id } : null;
}

function visibleRoom(room, viewerId) {
  return {
    code: room.code,
    maxPlayers: room.maxPlayers,
    round: room.round,
    status: room.status,
    dealerRevealed: room.dealerRevealed,
    currentTurnPlayerId: room.currentTurnPlayerId,
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
          cards: hand.cards.map((card, index) => (canSeeCard(hand, index) ? publicCard(card) : { hidden: true })),
        })),
      };
    }),
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

    if (req.method === "POST" && url.pathname === "/api/rooms") {
      const body = await readBody(req);
      const { room, player } = createRoom(body.nickname, body.maxPlayers);
      return json(res, 201, { room: visibleRoom(room, player.id), playerId: player.id });
    }

    const joinMatch = url.pathname.match(/^\/api\/rooms\/(\d{6})\/join$/);
    if (req.method === "POST" && joinMatch) {
      const room = rooms.get(joinMatch[1]);
      if (!room) throw new Error("房间不存在");
      const body = await readBody(req);
      const player = joinRoom(room, body.nickname);
      return json(res, 200, { room: visibleRoom(room, player.id), playerId: player.id });
    }

    const roomMatch = url.pathname.match(/^\/api\/rooms\/(\d{6})$/);
    if (req.method === "GET" && roomMatch) {
      const room = rooms.get(roomMatch[1]);
      if (!room) throw new Error("房间不存在");
      const playerId = url.searchParams.get("playerId");
      return json(res, 200, { room: visibleRoom(room, playerId), playerId });
    }

    const actionMatch = url.pathname.match(/^\/api\/rooms\/(\d{6})\/action$/);
    if (req.method === "POST" && actionMatch) {
      const room = rooms.get(actionMatch[1]);
      if (!room) throw new Error("房间不存在");
      const body = await readBody(req);
      const player = findPlayer(room, body.playerId);
      if (body.type === "start_round") startRound(room);
      else if (body.type === "place_bet") placeBet(room, player, body.bet);
      else if (body.type === "hit") hit(room, player);
      else if (body.type === "stand") stand(room, player);
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
