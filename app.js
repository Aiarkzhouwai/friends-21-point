const suits = ["♠", "♥", "♣", "♦"];
const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const DEFAULT_API_BASE = "https://friends-21-point-api.onrender.com";

const state = {
  online: false,
  uiMode: "entry",
  apiBase: localStorage.getItem("apiBase") || DEFAULT_API_BASE,
  roomCode: localStorage.getItem("roomCode") || "",
  playerId: localStorage.getItem("playerId") || "",
  pollTimer: null,
  round: 1,
  deck: [],
  used: [],
  viewerId: "zhou",
  dealerRevealed: false,
  activePlayerIndex: 0,
  players: [
    {
      id: "dealer",
      name: "小林",
      chips: 530,
      isDealer: true,
      hands: [{ cards: [], bet: 0, stood: false, busted: false }],
    },
    {
      id: "zhou",
      name: "阿周",
      chips: 500,
      isDealer: false,
      hands: [{ cards: [], bet: 20, stood: false, busted: false }],
    },
    {
      id: "ning",
      name: "宁宁",
      chips: 480,
      isDealer: false,
      hands: [{ cards: [], bet: 30, stood: false, busted: false }],
    },
    {
      id: "yan",
      name: "阿言",
      chips: 510,
      isDealer: false,
      hands: [{ cards: [], bet: 10, stood: false, busted: false }],
    },
  ],
  logs: [],
};

const els = {
  entryScreen: document.querySelector("#entryScreen"),
  lobbyScreen: document.querySelector("#lobbyScreen"),
  gameScreen: document.querySelector("#gameScreen"),
  dealerArea: document.querySelector("#dealerArea"),
  playersGrid: document.querySelector("#playersGrid"),
  viewerArea: document.querySelector("#viewerArea"),
  deckCount: document.querySelector("#deckCount"),
  discardCount: document.querySelector("#discardCount"),
  roundLabel: document.querySelector("#roundLabel"),
  turnLabel: document.querySelector("#turnLabel"),
  latestEvent: document.querySelector("#latestEvent"),
  toast: document.querySelector("#toast"),
  entryStatus: document.querySelector("#entryStatus"),
  dealBtn: document.querySelector("#dealBtn"),
  nextRoundBtn: document.querySelector("#nextRoundBtn"),
  hitBtn: document.querySelector("#hitBtn"),
  standBtn: document.querySelector("#standBtn"),
  revealBtn: document.querySelector("#revealBtn"),
  connectionState: document.querySelector("#connectionState"),
  nicknameInput: document.querySelector("#nicknameInput"),
  roomCodeInput: document.querySelector("#roomCodeInput"),
  apiBaseInput: document.querySelector("#apiBaseInput"),
  createRoomBtn: document.querySelector("#createRoomBtn"),
  joinRoomBtn: document.querySelector("#joinRoomBtn"),
  continueRoomBtn: document.querySelector("#continueRoomBtn"),
  leaveRoomBtn: document.querySelector("#leaveRoomBtn"),
  backToLobbyBtn: document.querySelector("#backToLobbyBtn"),
  copyRoomBtn: document.querySelector("#copyRoomBtn"),
  lobbyRoomCode: document.querySelector("#lobbyRoomCode"),
  playerCountLabel: document.querySelector("#playerCountLabel"),
  lobbyPlayers: document.querySelector("#lobbyPlayers"),
  lobbyHint: document.querySelector("#lobbyHint"),
  actionHint: document.querySelector("#actionHint"),
  settlementSheet: document.querySelector("#settlementSheet"),
  settlementEvents: document.querySelector("#settlementEvents"),
};

els.apiBaseInput.value = state.apiBase;
els.roomCodeInput.value = state.roomCode;
els.continueRoomBtn.hidden = !(state.roomCode && state.playerId);

function createDeck() {
  return suits.flatMap((suit) =>
    ranks.map((rank) => ({
      suit,
      rank,
      id: `${rank}${suit}-${Math.random().toString(16).slice(2)}`,
    })),
  );
}

function shuffle(cards) {
  const copy = [...cards];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function drawCard() {
  if (state.deck.length === 0) {
    state.deck = shuffle(state.used);
    state.used = [];
    addLog("牌库不足，系统已把用过的牌洗回牌库。");
  }
  return state.deck.pop();
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
  if (cards.length >= 5 && score <= 21) return { label: "五小牛 x5", level: 3, multiplier: 5 };
  if (isPairOfAces(cards)) return { label: "一对 A x3", level: 2, multiplier: 3 };
  if (score === 21) return { label: "21 点 x2", level: 1, multiplier: 2 };
  return { label: "", level: 0, multiplier: 1 };
}

function isBust(cards) {
  return handScore(cards) > 21;
}

function currentPlayer() {
  if (state.currentTurnPlayerId) {
    return state.players.find((player) => player.id === state.currentTurnPlayerId);
  }
  const idlePlayers = state.players.filter((player) => !player.isDealer);
  return idlePlayers[state.activePlayerIndex] || idlePlayers[0];
}

function dealer() {
  return state.players.find((player) => player.isDealer);
}

function resetRound() {
  if (state.online) {
    sendAction("start_round");
    return;
  }
  state.players.forEach((player) => {
    player.hands.forEach((hand) => {
      state.used.push(...hand.cards);
    });
  });
  state.round += 1;
  if (state.deck.length < 16) {
    state.deck = shuffle([...state.deck, ...state.used]);
    state.used = [];
    addLog("剩余牌不足，系统自动洗回已用牌。");
  }
  state.dealerRevealed = false;
  state.activePlayerIndex = 0;
  state.players.forEach((player) => {
    player.hands = [{ cards: [], bet: player.isDealer ? 0 : [10, 20, 30][Math.floor(Math.random() * 3)], stood: false, busted: false }];
  });

  for (let pass = 0; pass < 2; pass += 1) {
    state.players.forEach((player) => {
      player.hands[0].cards.push(drawCard());
    });
  }

  addLog(`第 ${state.round} 局开始，庄家选择重新洗牌。`);
  render(true);
}

function addLog(message) {
  state.logs.unshift(message);
  state.logs = state.logs.slice(0, 8);
  if (els.latestEvent) {
    els.latestEvent.textContent = message;
  }
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.remove("show"), 1800);
}

function hit() {
  if (state.online) {
    sendAction("hit");
    return;
  }
  const player = currentPlayer();
  const hand = player.hands[0];
  if (!hand || hand.stood || hand.busted) return;

  const score = handScore(hand.cards);
  if (score > 13 && Math.random() > 0.7) {
    showToast("演示里可以要牌，也可以停牌。");
  }

  const card = drawCard();
  hand.cards.push(card);
  addLog(`${player.name} 要到 ${card.rank}${card.suit}。`);

  const rank = handRank(hand.cards);
  if (rank.level > 0) {
    showToast(`${player.name} 触发 ${rank.label}`);
  }

  if (isBust(hand.cards)) {
    hand.busted = true;
    hand.stood = true;
    addLog(`${player.name} 爆牌，等待庄家结果。`);
    nextPlayer();
  }
  render(true);
}

function stand() {
  if (state.online) {
    sendAction("stand");
    return;
  }
  const player = currentPlayer();
  const hand = player.hands[0];
  if (handScore(hand.cards) <= 13) {
    showToast("小于等于 13 必须要牌。");
    return;
  }
  hand.stood = true;
  addLog(`${player.name} 停牌。`);
  nextPlayer();
  render();
}

function nextPlayer() {
  const idlePlayers = state.players.filter((player) => !player.isDealer);
  const nextIndex = idlePlayers.findIndex((player, index) => index > state.activePlayerIndex && !player.hands[0].stood);
  if (nextIndex >= 0) {
    state.activePlayerIndex = nextIndex;
    return;
  }
  state.dealerRevealed = true;
  dealerTurn();
}

function dealerTurn() {
  const house = dealer();
  const hand = house.hands[0];
  while (handScore(hand.cards) <= 13) {
    const card = drawCard();
    hand.cards.push(card);
    addLog(`庄家补到 ${card.rank}${card.suit}。`);
  }
  if (isBust(hand.cards)) {
    hand.busted = true;
    addLog("庄家爆牌，下局逆时针下庄。");
  } else {
    hand.stood = true;
    addLog(`庄家 ${handScore(hand.cards)} 点停牌，开始结算。`);
  }
  settleRound();
}

function settleRound() {
  const house = dealer();
  const houseHand = house.hands[0];
  state.players
    .filter((player) => !player.isDealer)
    .forEach((player) => {
      const hand = player.hands[0];
      const result = compareHands(hand.cards, houseHand.cards);
      const multiplier = Math.max(handRank(hand.cards).multiplier, handRank(houseHand.cards).multiplier);
      const delta = hand.bet * multiplier * result;
      player.chips += delta;
      house.chips -= delta;
    });
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

function revealDealer() {
  if (state.online) {
    sendAction("reveal_dealer");
    return;
  }
  state.dealerRevealed = true;
  addLog("庄家亮牌。");
  render(false, true);
}

function setMode(mode) {
  state.uiMode = mode;
  els.entryScreen.classList.toggle("active", mode === "entry");
  els.lobbyScreen.classList.toggle("active", mode === "lobby");
  els.gameScreen.classList.toggle("active", mode === "table");
}

function modeFromStatus() {
  if (!state.online) return state.uiMode;
  if (state.status === "lobby") return "lobby";
  return "table";
}

function render(animateCards = false, flipDealer = false) {
  setMode(modeFromStatus());

  if (state.uiMode === "entry") {
    els.entryStatus.textContent = state.apiBase ? "在线服务已连接" : "请先设置后端地址";
    els.continueRoomBtn.hidden = !(state.roomCode && state.playerId);
    return;
  }

  renderLobby();

  const house = dealer();
  if (!house) return;

  els.dealerArea.innerHTML = renderSeat(house, true, animateCards, flipDealer);
  const idlePlayers = state.players.filter((player) => !player.isDealer);
  const viewer = state.players.find((player) => player.id === state.viewerId);
  const otherPlayers = idlePlayers.filter((player) => player.id !== state.viewerId);
  els.playersGrid.innerHTML = otherPlayers
    .filter(Boolean)
    .map((player) => renderSeat(player, false, animateCards, false))
    .join("");
  els.viewerArea.innerHTML = viewer ? renderViewerSeat(viewer, animateCards) : renderSpectatorSeat();

  const isViewerTurn = currentPlayer()?.id === state.viewerId && (state.status ? state.status === "player_turn" : !state.dealerRevealed);
  const isViewerDealerTurn = house.id === state.viewerId && state.status === "dealer_turn";
  const viewerHand = viewer?.hands?.[0];
  const mustHit = viewerHand ? handScore(viewerHand.cards) <= 13 : false;
  els.deckCount.textContent = `牌库 ${state.deckCount ?? state.deck.length}`;
  els.discardCount.textContent = `已用 ${state.usedCount ?? state.used.length}`;
  els.roundLabel.textContent = `第 ${state.round} 局 · ${getRoundLabel()}`;
  els.turnLabel.textContent = state.status === "dealer_turn"
    ? isViewerDealerTurn
      ? "庄家回合，等待你决策"
      : "庄家牌已亮，等待庄家决策"
    : isViewerTurn
      ? "轮到你行动"
      : currentPlayer()
        ? `等待 ${currentPlayer().name} 行动`
        : "等待开局";
  const isViewerDealer = house.id === state.viewerId;
  const canRevealDealer = state.online ? false : !state.dealerRevealed;
  els.revealBtn.disabled = !canRevealDealer;
  els.hitBtn.disabled = !(isViewerTurn || isViewerDealerTurn);
  els.standBtn.disabled = !(isViewerTurn || isViewerDealerTurn) || mustHit;
  els.hitBtn.textContent = isViewerTurn || isViewerDealerTurn ? "要牌" : "等待中";
  els.standBtn.textContent = (isViewerTurn || isViewerDealerTurn) && mustHit ? "必须要牌" : isViewerTurn || isViewerDealerTurn ? "停牌" : "等待中";
  els.revealBtn.textContent = state.status === "dealer_turn" ? "庄家决策中" : "亮庄家牌";
  els.dealBtn.textContent = state.online && state.status === "lobby" ? "开始游戏" : "下一局";
  els.actionHint.textContent = getActionHint(isViewerTurn, isViewerDealerTurn);
  renderSettlement();
}

function renderLobby() {
  if (!state.players?.length) return;
  els.lobbyRoomCode.textContent = state.roomCode || state.code || "------";
  els.playerCountLabel.textContent = `${state.players.length}/${state.maxPlayers || 5}`;
  els.connectionState.textContent = state.status === "lobby" ? "等待开局" : getRoundLabel();
  els.lobbyPlayers.innerHTML = state.players.map(renderLobbyPlayer).join("");
  const canStart = state.players.length >= 3 && (state.status === "lobby" || state.status === "settlement");
  els.dealBtn.disabled = !canStart;
  els.dealBtn.textContent = state.status === "settlement" ? "下一局" : "开始游戏";
  els.lobbyHint.textContent = canStart ? "准备好了就开始；新加入玩家下一局参与。" : "至少 3 人开始；可以先把房间号发给朋友。";
}

function renderLobbyPlayer(player) {
  const initials = player.name.slice(0, 1);
  const isViewer = player.id === state.viewerId;
  const pending = state.status !== "lobby" && player.activeFromRound > state.round;
  const stateLabel = pending ? "下一局加入" : player.isDealer ? "庄家" : "已入座";
  return `
    <article class="lobby-player ${isViewer ? "self" : ""}">
      <span class="avatar">${initials}</span>
      <div>
        <strong>${isViewer ? "你" : player.name}</strong>
        <small>${stateLabel}</small>
      </div>
      <span class="chips">${player.chips}</span>
    </article>
  `;
}

function renderViewerSeat(player, animateCards) {
  const handHtml = player.hands.map((hand, index) => renderHand(hand, player, index, animateCards, false)).join("");
  const role = player.isDealer ? "庄家" : getPlayerStateLabel(player);
  return `
    <article class="viewer-panel">
      <div class="viewer-profile">
        <span class="avatar">${player.name.slice(0, 1)}</span>
        <div>
          <strong>你</strong>
          <small>${role} · 筹码 ${player.chips}</small>
        </div>
      </div>
      <div class="viewer-hands">${handHtml}</div>
    </article>
  `;
}

function renderSpectatorSeat() {
  return `
    <article class="viewer-panel spectator-panel">
      <strong>旁观中</strong>
      <small>本局已开始，你将在下一局参与。</small>
    </article>
  `;
}

function getActionHint(isViewerTurn, isViewerDealerTurn = false) {
  if (state.status === "settlement") return "本局已结算";
  if (isViewerDealerTurn) return "庄家回合：你可以要牌或停牌";
  if (state.status === "dealer_turn") return "庄家牌已亮，等待庄家决策";
  if (isViewerTurn) return "轮到你行动";
  if (currentPlayer()) return `等待 ${currentPlayer().name} 行动`;
  return "等待开局";
}

function renderSettlement() {
  const visible = state.status === "settlement";
  els.settlementSheet.classList.toggle("show", visible);
  if (!visible) return;
  const settlements = state.settlements || [];
  const rows = settlements.map((item) => {
    const positive = item.delta > 0;
    const label = positive ? `+${item.delta}` : `${item.delta}`;
    return `
      <article class="settlement-row ${positive ? "win" : "lose"}">
        <div>
          <strong>${item.playerName}</strong>
          <small>下注 ${item.bet} · 倍率 x${item.multiplier}</small>
        </div>
        <span>${label}</span>
      </article>
    `;
  });
  if (settlements.length) {
    const dealerDelta = settlements.reduce((sum, item) => sum - item.delta, 0);
    const dealerName = settlements[0].dealerName || "庄家";
    rows.push(`
      <article class="settlement-row dealer-total ${dealerDelta >= 0 ? "win" : "lose"}">
        <div>
          <strong>${dealerName}</strong>
          <small>庄家本轮总盈亏</small>
        </div>
        <span>${dealerDelta >= 0 ? `+${dealerDelta}` : dealerDelta}</span>
      </article>
    `);
  }
  els.settlementEvents.innerHTML = rows.length
    ? rows.join("")
    : (state.logs || []).slice(0, 4).map((event) => `<p>${event}</p>`).join("");
}

function getRoundLabel() {
  if (state.status === "lobby") return "等待开局";
  if (state.status === "settlement") return "结算完成";
  if (state.status === "dealer_turn") return "庄家回合";
  if (state.status === "player_turn") return "闲家回合";
  return state.dealerRevealed ? "庄家回合" : "闲家回合";
}

function renderSeat(player, isHouse, animateCards, flipDealer) {
  const otherPlayers = state.players.filter((item) => !item.isDealer && item.id !== state.viewerId);
  const seatIndex = player.id === state.viewerId ? 0 : otherPlayers.findIndex((item) => item.id === player.id) + 1;
  const isViewer = player.id === state.viewerId;
  const active = !isHouse && currentPlayer()?.id === player.id && !state.dealerRevealed;
  const busted = player.hands.some((hand) => hand.busted);
  const seatClass = isHouse
    ? "seat-position dealer-position compact-seat dealer-card"
    : `seat-position player-seat seat-${seatIndex} ${isViewer ? "viewer-seat" : "compact-seat"} ${active ? "active" : ""} ${busted ? "busted" : ""}`;
  const chips = player.chips >= 0 ? `+${player.chips}` : player.chips;
  const initials = player.name.slice(0, 1);
  const actionState = getPlayerStateLabel(player);
  const displayName = isViewer ? "You" : player.name;
  const badge = player.isDealer ? '<span class="dealer-badge">庄</span>' : "";
  return `
    <article class="${seatClass}">
      ${player.hands.map((hand, index) => renderHand(hand, player, index, animateCards, flipDealer)).join("")}
      <div class="profile-row">
        <span class="avatar">${initials}</span>
        <div class="profile-card">
          <div class="profile-main">
            <strong>${displayName}</strong>
            ${badge}
          </div>
          <span class="chips">$${Math.abs(player.chips).toFixed(2)}</span>
          <small>${actionState}</small>
        </div>
      </div>
    </article>
  `;
}

function canRevealHand(player) {
  if (player.id === state.viewerId) return true;
  if (player.isDealer && state.dealerRevealed) return true;
  if (player.hands.some((hand) => hand.cards.some((card) => card && !card.hidden))) return true;
  return false;
}

function getPlayerStateLabel(player) {
  if (player.isDealer) {
    if (state.status === "dealer_turn") return player.id === state.viewerId ? "你决策" : "庄家决策";
    return state.dealerRevealed ? "庄家亮牌" : "暗牌";
  }
  if (currentPlayer()?.id === player.id && !state.dealerRevealed) {
    return player.id === state.viewerId ? "轮到你" : "行动中";
  }
  if (player.hands.every((hand) => hand.stood || hand.busted)) return "已结束";
  return "等待";
}

function renderHand(hand, player, handIndex, animateCards, flipDealer) {
  const reveal = canRevealHand(player);
  const isHouse = player.isDealer;
  const rank = reveal ? handRank(hand.cards) : { label: "", level: 0 };
  const visibleCards = hand.cards.map((card, index) => {
    const hidden = !reveal || (isHouse && player.id !== state.viewerId && !state.dealerRevealed && index > 0);
    return renderCard(card, hidden, animateCards, flipDealer && !hidden, rank.level > 0);
  });
  const score = reveal ? handScore(hand.cards) : `${hand.cards.length} 张牌`;
  const bustClass = reveal && isBust(hand.cards) ? "bust" : "";
  const hotClass = rank.label ? "hot" : "";
  return `
    <div class="hand-wrap">
      <div class="hand-row ${handIndex > 0 ? "split" : ""}">${visibleCards.join("")}</div>
      <div class="hand-meta">
        <span class="score-pill ${bustClass || hotClass}">${bustClass ? "爆牌" : reveal ? `${score} 点` : score}</span>
        ${hand.bet ? `<span class="score-pill">下注 ${hand.bet}</span>` : ""}
        ${rank.label ? `<span class="tag">${rank.label}</span>` : ""}
      </div>
    </div>
  `;
}

function renderCard(card, hidden, animate, flip, isSpecialHand) {
  if (hidden || card?.hidden) return `<div class="card back ${animate ? "dealt" : ""}"></div>`;
  const red = ["♥", "♦"].includes(card.suit) ? "red" : "";
  const special = isSpecialHand ? "special" : "";
  const specialAnimate = isSpecialHand && animate ? "special-animate" : "";
  return `
    <div class="card ${red} ${animate ? "dealt" : ""} ${flip ? "flip" : ""} ${special} ${specialAnimate}">
      <span class="rank">${card.rank}</span>
      <span class="suit">${card.suit}</span>
    </div>
  `;
}

function normalizeApiBase(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

async function apiRequest(path, options = {}) {
  const apiBase = normalizeApiBase(els.apiBaseInput.value || state.apiBase);
  if (!apiBase) throw new Error("请先填写后端地址");
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

function applyOnlineSnapshot(payload, options = {}) {
  state.online = true;
  state.playerId = payload.playerId || state.playerId;
  state.viewerId = state.playerId;
  state.roomCode = payload.room?.code || state.roomCode;
  state.apiBase = normalizeApiBase(els.apiBaseInput.value || state.apiBase);
  localStorage.setItem("apiBase", normalizeApiBase(els.apiBaseInput.value || state.apiBase));
  localStorage.setItem("roomCode", state.roomCode);
  localStorage.setItem("playerId", state.playerId);
  Object.assign(state, payload.room);
  state.viewerId = state.playerId;
  state.logs = payload.room.events || [];
  if (els.latestEvent) {
    els.latestEvent.textContent = state.logs[0] || "房间状态已同步。";
  }
  render(Boolean(options.animate));
  startPolling();
}

async function createOnlineRoom() {
  try {
    state.apiBase = normalizeApiBase(els.apiBaseInput.value);
    const payload = await apiRequest("/api/rooms", {
      method: "POST",
      body: JSON.stringify({ nickname: els.nicknameInput.value, maxPlayers: 5 }),
    });
    els.roomCodeInput.value = payload.room.code;
    applyOnlineSnapshot(payload, { animate: true });
    showToast(`房间 ${payload.room.code} 已创建`);
  } catch (error) {
    showToast(error.message);
  }
}

async function joinOnlineRoom() {
  try {
    state.apiBase = normalizeApiBase(els.apiBaseInput.value);
    const code = els.roomCodeInput.value.trim();
    const payload = await apiRequest(`/api/rooms/${code}/join`, {
      method: "POST",
      body: JSON.stringify({ nickname: els.nicknameInput.value }),
    });
    applyOnlineSnapshot(payload, { animate: true });
    showToast(`已加入房间 ${code}`);
  } catch (error) {
    showToast(error.message);
  }
}

async function syncOnlineRoom() {
  if (!state.online || !state.roomCode || !state.playerId) return;
  try {
    const payload = await apiRequest(`/api/rooms/${state.roomCode}?playerId=${encodeURIComponent(state.playerId)}`);
    applyOnlineSnapshot(payload, { animate: false });
  } catch (error) {
    els.connectionState.textContent = `同步失败：${error.message}`;
  }
}

async function continueOnlineRoom() {
  if (!state.roomCode || !state.playerId) return;
  state.online = true;
  await syncOnlineRoom();
}

function leaveRoom() {
  window.clearInterval(state.pollTimer);
  state.online = false;
  state.uiMode = "entry";
  setMode("entry");
  render();
}

async function copyRoomCode() {
  const code = state.roomCode || state.code;
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    showToast("房间号已复制");
  } catch {
    showToast(`房间号 ${code}`);
  }
}

function startPolling() {
  window.clearInterval(state.pollTimer);
  state.pollTimer = window.setInterval(syncOnlineRoom, 1800);
}

async function sendAction(type) {
  try {
    const payload = await apiRequest(`/api/rooms/${state.roomCode}/action`, {
      method: "POST",
      body: JSON.stringify({ playerId: state.playerId, type }),
    });
    applyOnlineSnapshot(payload, { animate: true });
  } catch (error) {
    showToast(error.message);
  }
}

els.dealBtn.addEventListener("click", resetRound);
els.hitBtn.addEventListener("click", hit);
els.standBtn.addEventListener("click", stand);
els.revealBtn.addEventListener("click", revealDealer);
els.createRoomBtn.addEventListener("click", createOnlineRoom);
els.joinRoomBtn.addEventListener("click", joinOnlineRoom);
els.continueRoomBtn.addEventListener("click", continueOnlineRoom);
els.leaveRoomBtn.addEventListener("click", leaveRoom);
els.backToLobbyBtn.addEventListener("click", () => setMode("lobby"));
els.copyRoomBtn.addEventListener("click", copyRoomCode);
els.nextRoundBtn.addEventListener("click", resetRound);

state.deck = shuffle(createDeck());
state.round = 0;
render();
