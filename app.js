const suits = ["♠", "♥", "♣", "♦"];
const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const DEFAULT_API_BASE = "https://friends-21-point-api.onrender.com";
const DEFAULT_BGM_SRC = "./assets/audio/room-bgm.m4a";
const nicknamePrefixes = ["无敌", "超级", "发财", "幸运", "快乐", "威猛", "闪亮", "稳赢", "豪气", "暴富", "神勇", "如意"];

const state = {
  online: false,
  uiMode: "entry",
  apiBase: localStorage.getItem("apiBase") || DEFAULT_API_BASE,
  roomCode: localStorage.getItem("roomCode") || "",
  playerId: localStorage.getItem("playerId") || "",
  pollTimer: null,
  roomListTimer: null,
  roomList: [],
  selectedBet: 20,
  showdown: {
    key: "",
    index: 0,
    showPanel: false,
    timer: null,
  },
  cinematicQueue: [],
  cinematicActive: null,
  cinematicTimer: null,
  dismissedDissolveKey: "",
  seenChatIds: new Set(),
  heardChatIds: new Set(),
  seenCinematicIds: new Set(),
  soundMuted: localStorage.getItem("soundMuted") === "true",
  soundUnlocked: false,
  audioContext: null,
  bgmAudio: null,
  bgmUrl: DEFAULT_BGM_SRC,
  bgmPlaying: false,
  bgmBaseVolume: 0.14,
  bgmDuckTimer: null,
  currentDealerId: "",
  dealerChangeId: "",
  dealerChangeTimer: null,
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
      chips: 0,
      isDealer: true,
      hands: [{ cards: [], bet: 0, stood: false, busted: false }],
    },
    {
      id: "zhou",
      name: "阿周",
      chips: 0,
      isDealer: false,
      hands: [{ cards: [], bet: 20, stood: false, busted: false }],
    },
    {
      id: "ning",
      name: "宁宁",
      chips: 0,
      isDealer: false,
      hands: [{ cards: [], bet: 30, stood: false, busted: false }],
    },
    {
      id: "yan",
      name: "阿言",
      chips: 0,
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
  countdownBadge: document.querySelector("#countdownBadge"),
  turnLabel: document.querySelector("#turnLabel"),
  latestEvent: document.querySelector("#latestEvent"),
  toast: document.querySelector("#toast"),
  cinematicOverlay: document.querySelector("#cinematicOverlay"),
  roomModal: document.querySelector("#roomModal"),
  entryStatus: document.querySelector("#entryStatus"),
  dealBtn: document.querySelector("#dealBtn"),
  dissolveRoomBtn: document.querySelector("#dissolveRoomBtn"),
  nextRoundBtn: document.querySelector("#nextRoundBtn"),
  hitBtn: document.querySelector("#hitBtn"),
  standBtn: document.querySelector("#standBtn"),
  splitBtn: document.querySelector("#splitBtn"),
  revealBtn: document.querySelector("#revealBtn"),
  connectionState: document.querySelector("#connectionState"),
  nicknameInput: document.querySelector("#nicknameInput"),
  roomCodeInput: document.querySelector("#roomCodeInput"),
  nicknameOptions: document.querySelector("#nicknameOptions"),
  rerollNicknameBtn: document.querySelector("#rerollNicknameBtn"),
  apiBaseInput: document.querySelector("#apiBaseInput"),
  createRoomBtn: document.querySelector("#createRoomBtn"),
  maxPlayersInput: document.querySelector("#maxPlayersInput"),
  actionTimeoutInput: document.querySelector("#actionTimeoutInput"),
  roundLimitInput: document.querySelector("#roundLimitInput"),
  timeLimitInput: document.querySelector("#timeLimitInput"),
  joinRoomBtn: document.querySelector("#joinRoomBtn"),
  continueRoomBtn: document.querySelector("#continueRoomBtn"),
  refreshRoomsBtn: document.querySelector("#refreshRoomsBtn"),
  roomList: document.querySelector("#roomList"),
  leaveRoomBtn: document.querySelector("#leaveRoomBtn"),
  backToLobbyBtn: document.querySelector("#backToLobbyBtn"),
  copyRoomBtn: document.querySelector("#copyRoomBtn"),
  lobbyRoomCode: document.querySelector("#lobbyRoomCode"),
  playerCountLabel: document.querySelector("#playerCountLabel"),
  lobbyPlayers: document.querySelector("#lobbyPlayers"),
  lobbyHint: document.querySelector("#lobbyHint"),
  ruleStrip: document.querySelector("#ruleStrip"),
  actionHint: document.querySelector("#actionHint"),
  betPanel: document.querySelector("#betPanel"),
  betAmountLabel: document.querySelector("#betAmountLabel"),
  betOptions: document.querySelector("#betOptions"),
  confirmBetBtn: document.querySelector("#confirmBetBtn"),
  settlementSheet: document.querySelector("#settlementSheet"),
  settlementEvents: document.querySelector("#settlementEvents"),
  showdownBanner: document.querySelector("#showdownBanner"),
  danmakuLayer: document.querySelector("#danmakuLayer"),
  chatForm: document.querySelector("#chatForm"),
  chatInput: document.querySelector("#chatInput"),
  quickChat: document.querySelector("#quickChat"),
  soundToggleBtn: document.querySelector("#soundToggleBtn"),
  bgmBtn: document.querySelector("#bgmBtn"),
  bgmInput: document.querySelector("#bgmInput"),
  dissolveRoomTableBtn: document.querySelector("#dissolveRoomTableBtn"),
};

els.apiBaseInput.value = state.apiBase;
els.roomCodeInput.value = state.roomCode;
els.continueRoomBtn.hidden = !(state.roomCode && state.playerId);

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function selectedQuickName() {
  return els.nicknameOptions?.querySelector("button.selected")?.dataset.name || "";
}

function setQuickNickname(name = selectedQuickName()) {
  if (!name) return;
  els.nicknameInput.value = `${randomItem(nicknamePrefixes)}${name}`;
  [...els.nicknameOptions.querySelectorAll("button")].forEach((button) => {
    button.classList.toggle("selected", button.dataset.name === name);
  });
}

function nicknameValue() {
  return els.nicknameInput.value.trim();
}

function requireNickname() {
  const nickname = nicknameValue();
  if (!nickname) {
    showToast("请先输入或选择昵称");
    els.nicknameInput.focus();
    throw new Error("请先输入或选择昵称");
  }
  return nickname;
}

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

function currentViewerHand(viewer) {
  return viewer?.hands?.[state.currentHandIndex || 0] || viewer?.hands?.[0];
}

function timeLeftLabel() {
  if (!state.turnDeadlineAt || !["betting", "dealer_prepare", "player_turn", "dealer_turn"].includes(state.status)) return "";
  const seconds = Math.max(0, Math.ceil((state.turnDeadlineAt - Date.now()) / 1000));
  return `${seconds}s`;
}

function pendingJoinersLabel() {
  const pending = (state.players || []).filter((player) => state.status !== "lobby" && player.activeFromRound > state.round);
  if (!pending.length) return "";
  const names = pending.map((player) => (player.id === state.viewerId ? "你" : player.name)).join("、");
  return `${names} 等待下局加入`;
}

function nextDealerNotice() {
  if (state.status !== "settlement" || !state.nextDealerId) return "";
  const player = state.players?.find((item) => item.id === state.nextDealerId);
  if (!player) return "";
  return `庄家爆牌，下局 ${player.id === state.viewerId ? "你" : player.name} 坐庄`;
}

function gameCountdownLabel() {
  const minutes = Number(state.settings?.timeLimitMinutes || 0);
  if (!minutes || !state.startedAt) return "";
  const remaining = Math.max(0, state.startedAt + minutes * 60 * 1000 - Date.now());
  const totalSeconds = Math.ceil(remaining / 1000);
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function activeHandLabel() {
  const player = currentPlayer();
  if (!player || player.hands.length <= 1) return "";
  return `第 ${(state.currentHandIndex || 0) + 1}/${player.hands.length} 手`;
}

function hashString(value) {
  return String(value || "")
    .split("")
    .reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7);
}

function renderAvatar(player) {
  const seed = hashString(player.id || player.name);
  const palettes = [
    ["#ffd76f", "#8b4dff", "#1f2a44", "#f7f1d8"],
    ["#7ee787", "#0d6f4a", "#20253a", "#f4d1b2"],
    ["#79c0ff", "#1f6feb", "#1b2237", "#ffe2a8"],
    ["#ff9b96", "#b4233a", "#22263a", "#f8d6bb"],
    ["#d2a8ff", "#6f42c1", "#202034", "#ffd9c0"],
  ];
  const palette = palettes[seed % palettes.length];
  const cells = [];
  for (let row = 0; row < 7; row += 1) {
    for (let col = 0; col < 7; col += 1) {
      let color = "transparent";
      const mirrorCol = col > 3 ? 6 - col : col;
      const edge = row === 0 || row === 6 || col === 0 || col === 6;
      if (edge && row > 0 && row < 6 && col > 0 && col < 6) color = palette[2];
      if (row >= 1 && row <= 5 && mirrorCol >= 1) color = palette[3];
      if ((row === 1 && mirrorCol >= 1) || (row === 2 && mirrorCol === 1)) color = palette[0];
      if ((row === 3 && (col === 2 || col === 4)) || (row === 5 && col >= 2 && col <= 4)) color = palette[2];
      if (((seed >> (row + mirrorCol)) & 1) && row >= 2 && row <= 4 && mirrorCol === 3) color = palette[1];
      cells.push(`<i style="background:${color}"></i>`);
    }
  }
  return `<span class="avatar pixel-avatar" aria-hidden="true">${cells.join("")}</span>`;
}

function formatChips(value, withCurrency = false) {
  const number = Number(value) || 0;
  const sign = number < 0 ? "-" : number > 0 && !withCurrency ? "+" : "";
  const body = withCurrency ? `${Math.abs(number).toFixed(2)}` : `${Math.abs(number)}`;
  return `${sign}${withCurrency ? "$" : ""}${body}`;
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

function ensureAudioContext() {
  if (state.audioContext) return state.audioContext;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  state.audioContext = new AudioContextClass();
  return state.audioContext;
}

function unlockSound() {
  if (state.soundMuted || state.soundUnlocked) return;
  const context = ensureAudioContext();
  if (!context) return;
  context.resume?.();
  state.soundUnlocked = true;
  renderSoundToggle();
}

function tone(context, frequency, start, duration, gainValue, type = "sine") {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function noiseTap(context, start, duration, gainValue, frequency = 1600) {
  const sampleRate = context.sampleRate;
  const buffer = context.createBuffer(1, Math.max(1, Math.floor(sampleRate * duration)), sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(frequency, start);
  filter.Q.setValueAtTime(0.8, start);
  gain.gain.setValueAtTime(gainValue, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.buffer = buffer;
  source.connect(filter).connect(gain).connect(context.destination);
  source.start(start);
}

function playSound(type) {
  if (state.soundMuted || !state.soundUnlocked) return;
  const context = ensureAudioContext();
  if (!context) return;
  duckBgm(900);
  const now = context.currentTime + 0.01;
  const quiet = 0.045;
  const sounds = {
    deal: () => {
      noiseTap(context, now, 0.08, 0.032, 1500);
      tone(context, 310, now + 0.02, 0.06, quiet * 0.55, "triangle");
    },
    hit: () => {
      noiseTap(context, now, 0.06, 0.026, 1800);
      tone(context, 420, now + 0.018, 0.07, quiet * 0.5, "triangle");
    },
    stand: () => tone(context, 210, now, 0.12, quiet * 0.62, "sine"),
    bust: () => {
      tone(context, 260, now, 0.1, quiet * 0.65, "sawtooth");
      tone(context, 170, now + 0.09, 0.14, quiet * 0.55, "sawtooth");
    },
    special: () => {
      [620, 820, 1080].forEach((frequency, index) => tone(context, frequency, now + index * 0.065, 0.12, quiet * 0.58, "triangle"));
    },
    chip: () => {
      noiseTap(context, now, 0.12, 0.035, 2400);
      tone(context, 520, now + 0.035, 0.08, quiet * 0.45, "square");
    },
    chat: () => tone(context, 760, now, 0.06, quiet * 0.34, "sine"),
    crown: () => {
      tone(context, 680, now, 0.12, quiet * 0.55, "triangle");
      tone(context, 940, now + 0.09, 0.16, quiet * 0.48, "triangle");
    },
    bet: () => {
      noiseTap(context, now, 0.07, 0.026, 2100);
      tone(context, 480, now + 0.02, 0.05, quiet * 0.42, "square");
    },
  };
  sounds[type]?.();
}

function speakPhrase(text) {
  if (state.soundMuted || !state.soundUnlocked || !("speechSynthesis" in window)) return;
  duckBgm(1500);
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = 1.08;
  utterance.pitch = 1.02;
  utterance.volume = 0.52;
  window.speechSynthesis.speak(utterance);
}

function duckBgm(duration = 1000) {
  const audio = state.bgmAudio;
  if (!state.bgmPlaying || !audio) return;
  audio.volume = Math.min(audio.volume, state.bgmBaseVolume * 0.32);
  window.clearTimeout(state.bgmDuckTimer);
  state.bgmDuckTimer = window.setTimeout(() => {
    if (state.bgmPlaying && state.bgmAudio) state.bgmAudio.volume = state.bgmBaseVolume;
  }, duration);
}

function cinematicVoice(kind) {
  if (kind === "five") return "五小牛";
  if (kind === "twenty-one") return "二十一点";
  if (kind === "bust") return "爆了";
  return "";
}

function renderSoundToggle() {
  if (!els.soundToggleBtn) return;
  els.soundToggleBtn.textContent = state.soundMuted ? "静音" : state.soundUnlocked ? "音效开" : "音效";
  els.soundToggleBtn.classList.toggle("muted", state.soundMuted);
  els.soundToggleBtn.setAttribute("aria-pressed", String(!state.soundMuted));
}

function toggleSound() {
  state.soundMuted = !state.soundMuted;
  localStorage.setItem("soundMuted", String(state.soundMuted));
  if (!state.soundMuted) {
    unlockSound();
    playSound("stand");
  }
  renderSoundToggle();
}

function totalCards(room) {
  return (room?.players || []).reduce(
    (sum, player) => sum + (player.hands || []).reduce((handSum, hand) => handSum + (hand.cards?.length || 0), 0),
    0,
  );
}

function playSnapshotSounds(oldRoom, newRoom) {
  if (!oldRoom || !newRoom) return;
  const oldCards = totalCards(oldRoom);
  const newCards = totalCards(newRoom);
  if (newCards > oldCards) playSound(newCards - oldCards > 1 ? "deal" : "hit");

  const oldStatus = oldRoom.status;
  const newStatus = newRoom.status;
  if (oldStatus !== "settlement" && newStatus === "settlement") playSound("chip");
  if (oldStatus !== "betting" && newStatus === "betting") playSound("bet");

  const oldDealerId = oldRoom.players?.find((player) => player.isDealer)?.id || "";
  const newDealerId = newRoom.players?.find((player) => player.isDealer)?.id || "";
  if (oldDealerId && newDealerId && oldDealerId !== newDealerId) playSound("crown");

  (newRoom.chats || []).forEach((chat) => {
    if (state.heardChatIds.has(chat.id)) return;
    state.heardChatIds.add(chat.id);
    const fromSelf = chat.playerId === state.playerId;
    if (!fromSelf) playSound("chat");
  });
}

function enqueueCinematics(cinematics = []) {
  const incoming = cinematics
    .slice()
    .reverse()
    .filter((event) => event?.id && !state.seenCinematicIds.has(event.id));
  if (!incoming.length) return;
  incoming.forEach((event) => {
    state.seenCinematicIds.add(event.id);
    if (event.round === state.round) state.cinematicQueue.push(event);
  });
  state.cinematicQueue = state.cinematicQueue.slice(-3);
  playNextCinematic();
}

function cowHtml(index) {
  return `
    <div class="cinematic-cow" style="--cow:${index}">
      <div class="cinematic-cow-body"></div>
      <div class="cinematic-cow-head">
        <i class="cinematic-horn left"></i>
        <i class="cinematic-horn right"></i>
        <i class="cinematic-hair"></i>
        <i class="cinematic-hair"></i>
        <i class="cinematic-hair"></i>
        <i class="cinematic-forehead"></i>
        <i class="cinematic-eye left"></i>
        <i class="cinematic-eye right"></i>
        <i class="cinematic-snout"></i>
        <i class="cinematic-mouth"></i>
        <i class="cinematic-tooth left"></i>
        <i class="cinematic-tooth right"></i>
      </div>
    </div>
  `;
}

function sparkHtml(count = 24) {
  return Array.from({ length: count }, (_, index) => {
    const angle = (Math.PI * 2 * index) / count;
    const distance = 110 + Math.random() * 190;
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;
    const left = 45 + Math.random() * 10;
    const top = 44 + Math.random() * 12;
    return `<i class="cinematic-spark" style="left:${left}%;top:${top}%;--x:${x}px;--y:${y}px"></i>`;
  }).join("");
}

function renderCinematicScene(event) {
  if (event.kind === "five") {
    return `
      <div class="cinematic-burst-lines"></div>
      ${sparkHtml(34)}
      <div class="cinematic-card">
        <div class="cinematic-cow-pack">${[1, 2, 3, 4, 5].map(cowHtml).join("")}</div>
        <h2 class="cinematic-title">五小牛！</h2>
      </div>
    `;
  }
  if (event.kind === "twenty-one") {
    return `
      <div class="cinematic-burst-lines"></div>
      <i class="cinematic-slash"></i>
      ${sparkHtml(18)}
      <div class="cinematic-card">
        <h2 class="cinematic-title">21点！</h2>
      </div>
    `;
  }
  return `
    <div class="cinematic-burst-lines"></div>
    <i class="cinematic-cracked-card"></i>
    ${sparkHtml(16)}
    <div class="cinematic-card">
      <h2 class="cinematic-title">爆了！</h2>
    </div>
  `;
}

function playNextCinematic() {
  if (state.cinematicActive || !state.cinematicQueue.length || !els.cinematicOverlay) return;
  const event = state.cinematicQueue.shift();
  state.cinematicActive = event;
  const kindClass = event.kind === "twenty-one" ? "twenty-one" : event.kind;
  els.cinematicOverlay.className = `cinematic-overlay show ${kindClass}`;
  els.cinematicOverlay.innerHTML = renderCinematicScene(event);
  const sound = event.kind === "five" || event.kind === "twenty-one" ? "special" : "bust";
  playSound(sound);
  speakPhrase(cinematicVoice(event.kind));
  const duration = event.kind === "five" ? 2300 : 1700;
  window.clearTimeout(state.cinematicTimer);
  state.cinematicTimer = window.setTimeout(() => {
    els.cinematicOverlay.classList.add("out");
    window.setTimeout(() => {
      els.cinematicOverlay.className = "cinematic-overlay";
      els.cinematicOverlay.innerHTML = "";
      state.cinematicActive = null;
      playNextCinematic();
    }, 280);
  }, duration);
}

function hit() {
  if (state.online) {
    if (state.status === "dealer_prepare") {
      sendAction("deal_shuffle");
      return;
    }
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
    if (state.status === "dealer_prepare") {
      sendAction("deal_keep");
      return;
    }
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
  if (playerScore < dealerScore) return -1;
  if (playerCards.length > dealerCards.length) return 1;
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
  updateShowdownState();

  if (state.uiMode === "entry") {
    els.entryStatus.textContent = state.apiBase ? "在线服务已连接" : "请先设置后端地址";
    els.continueRoomBtn.hidden = !(state.roomCode && state.playerId);
    renderRoomList();
    return;
  }

  renderLobby();

  const house = dealer();
  if (!house) return;

  els.dealerArea.innerHTML = house.id === state.viewerId ? "" : renderSeat(house, true, animateCards, flipDealer);
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
  const isViewerDealerPrepare = house.id === state.viewerId && state.status === "dealer_prepare";
  const isViewerBetting = state.status === "betting" && viewer && !viewer.isDealer && viewer.activeFromRound <= state.round;
  const viewerBetConfirmed = Boolean(viewer?.hands?.[0]?.betConfirmed);
  const viewerHand = currentViewerHand(viewer);
  const mustHit = viewerHand ? handScore(viewerHand.cards) <= 13 : false;
  const canSplit = Boolean(viewerHand?.canSplit);
  const left = timeLeftLabel();
  const pendingLabel = pendingJoinersLabel();
  const dealerNotice = nextDealerNotice();
  els.deckCount.textContent = `牌库 ${state.deckCount ?? state.deck.length}`;
  els.discardCount.textContent = `已用 ${state.usedCount ?? state.used.length}`;
  els.latestEvent.textContent = dealerNotice || pendingLabel || state.logs?.[0] || "等待玩家操作";
  const countdown = gameCountdownLabel();
  els.roundLabel.textContent = `第 ${state.round} 局 · ${getRoundLabel()}`;
  els.countdownBadge.textContent = countdown ? `本场剩余 ${countdown}` : "";
  els.countdownBadge.hidden = !countdown;
  const handLabel = activeHandLabel();
  els.turnLabel.textContent = state.status === "settlement"
    ? state.showdown.showPanel
      ? dealerNotice || "本局结算完成"
      : "逐家比牌中"
    : state.status === "betting"
    ? `等待闲家下注${left ? ` · ${left}` : ""}`
    : state.status === "dealer_prepare"
    ? isViewerDealerPrepare
      ? `下注完成，等待你决定是否洗牌${left ? ` · ${left}` : ""}`
      : `下注完成，等待庄家发牌${left ? ` · ${left}` : ""}`
    : state.status === "dealer_turn"
    ? isViewerDealerTurn
      ? `庄家回合，${handLabel ? `${handLabel} · ` : ""}等待你决策${left ? ` · ${left}` : ""}`
      : "庄家牌已亮，等待庄家决策"
    : isViewerTurn
      ? `轮到你行动${handLabel ? ` · ${handLabel}` : ""}${left ? ` · ${left}` : ""}`
      : currentPlayer()
        ? `等待 ${currentPlayer().name} 行动${handLabel ? ` · ${handLabel}` : ""}${left ? ` · ${left}` : ""}`
        : "等待开局";
  const isViewerDealer = house.id === state.viewerId;
  const canRevealDealer = state.online ? false : !state.dealerRevealed;
  els.revealBtn.disabled = !canRevealDealer;
  els.hitBtn.disabled = !(isViewerTurn || isViewerDealerTurn || isViewerDealerPrepare);
  els.standBtn.disabled = isViewerDealerPrepare ? false : !(isViewerTurn || isViewerDealerTurn) || mustHit;
  els.splitBtn.disabled = !(isViewerTurn || isViewerDealerTurn) || !canSplit;
  els.hitBtn.textContent = isViewerDealerPrepare ? "洗牌发牌" : isViewerTurn || isViewerDealerTurn ? "要！" : "等待中";
  els.standBtn.textContent = isViewerDealerPrepare
    ? "直接发牌"
    : (isViewerTurn || isViewerDealerTurn) && mustHit
      ? "必须要"
      : isViewerTurn || isViewerDealerTurn
        ? "不要了"
        : "等待中";
  els.splitBtn.textContent = canSplit ? "分牌" : "不可分牌";
  els.revealBtn.textContent = state.status === "dealer_turn" ? "庄家决策中" : "亮庄家牌";
  els.dealBtn.textContent = state.online && state.status === "lobby" ? "开始游戏" : "下一局";
  renderBetPanel(isViewerBetting, viewerBetConfirmed, viewerHand?.bet || 20);
  els.actionHint.textContent = getActionHint(isViewerTurn, isViewerDealerTurn, isViewerBetting, viewerBetConfirmed, isViewerDealerPrepare);
  renderDissolveControls(viewer);
  renderRoomModal(viewer);
  renderShowdownBanner();
  renderDanmaku();
  renderSettlement();
}

function updateShowdownState() {
  if (state.status !== "settlement") {
    window.clearTimeout(state.showdown.timer);
    state.showdown.key = "";
    state.showdown.index = 0;
    state.showdown.showPanel = false;
    return;
  }

  const steps = state.showdownSteps || state.settlements || [];
  const key = `${state.roomCode || "local"}-${state.round}-${state.updatedAt || ""}`;
  if (state.showdown.key === key) return;

  window.clearTimeout(state.showdown.timer);
  state.showdown.key = key;
  state.showdown.index = 0;
  state.showdown.showPanel = steps.length === 0;

  if (steps.length) {
    scheduleShowdownStep(steps.length);
  }
}

function scheduleShowdownStep(total) {
  window.clearTimeout(state.showdown.timer);
  state.showdown.timer = window.setTimeout(() => {
    if (state.status !== "settlement") return;
    if (state.showdown.index < total - 1) {
      state.showdown.index += 1;
      render(false);
      scheduleShowdownStep(total);
      return;
    }
    state.showdown.showPanel = true;
    render(false);
  }, 2800);
}

function renderLobby() {
  if (!state.players?.length) return;
  els.lobbyRoomCode.textContent = state.roomCode || state.code || "------";
  els.playerCountLabel.textContent = `${state.players.length}/${state.maxPlayers || 5}`;
  els.connectionState.textContent = state.status === "lobby" ? "等待开局" : getRoundLabel();
  els.lobbyPlayers.innerHTML = state.players.map(renderLobbyPlayer).join("");
  renderRuleStrip();
  const canStart = state.players.length >= 3 && (state.status === "lobby" || state.status === "settlement") && !state.gameOverReason;
  els.dealBtn.disabled = !canStart;
  els.dealBtn.textContent = state.status === "settlement" ? "下一局" : "开始游戏";
  renderDissolveControls(state.players.find((player) => player.id === state.viewerId));
  els.lobbyHint.textContent = state.gameOverReason
    ? state.gameOverReason
    : canStart
      ? "准备好了就开始；新加入玩家下一局参与。"
      : "至少 3 人开始；可以先把房间号发给朋友。";
}

function dissolveVoteLabel(viewer) {
  const vote = state.dissolveVote;
  if (state.gameOverReason === "房间已解散") return "房间已解散";
  if (vote?.active) {
    const voted = vote.votes?.includes(viewer?.id);
    return voted ? `已同意解散 ${vote.voteCount}/${vote.threshold}` : `同意解散 ${vote.voteCount}/${vote.threshold}`;
  }
  return viewer?.isHost ? "发起解散房间" : "";
}

function renderDissolveControls(viewer) {
  const label = dissolveVoteLabel(viewer);
  [els.dissolveRoomBtn, els.dissolveRoomTableBtn].forEach((button) => {
    if (!button) return;
    const show = Boolean(label) && state.online && state.status !== "closed";
    button.hidden = !show;
    button.disabled = state.gameOverReason === "房间已解散" || Boolean(state.dissolveVote?.votes?.includes(viewer?.id));
    button.textContent = label || "发起解散房间";
  });
}

function isDissolvedRoom() {
  return state.gameOverReason === "房间已解散";
}

function finalScoreRows() {
  return [...(state.players || [])]
    .sort((a, b) => b.chips - a.chips)
    .map((player, index) => `
      <li>
        <span>${index + 1}. ${player.id === state.viewerId ? "你" : player.name}${player.isDealer ? " · 庄" : ""}</span>
        <strong>${formatChips(player.chips)}</strong>
      </li>
    `)
    .join("");
}

function renderRoomModal(viewer) {
  if (!els.roomModal) return;
  let html = "";
  const vote = state.dissolveVote;

  if (state.gameOverReason) {
    const dissolved = isDissolvedRoom();
    html = `
      <div class="room-modal-card ${dissolved ? "danger" : ""}">
        <span class="eyebrow">${dissolved ? "房间已解散" : "本场结束"}</span>
        <h2>${dissolved ? "解散投票已通过" : state.gameOverReason}</h2>
        ${dissolved ? "<p>本房间已经关闭，可以回到大厅重新创建或加入房间。</p>" : `<ul class="final-score-list">${finalScoreRows()}</ul>`}
        <button class="primary large" id="modalReturnHomeBtn" type="button">返回大厅</button>
      </div>
    `;
  } else if (vote?.active) {
    const voteKey = `${vote.initiatorId}-${vote.voteCount}`;
    const voted = vote.votes?.includes(viewer?.id);
    if (voted || state.dismissedDissolveKey !== voteKey) {
      html = `
        <div class="room-modal-card danger">
          <span class="eyebrow">解散投票</span>
          <h2>有人发起了解散房间</h2>
          <p>当前 ${vote.voteCount}/${vote.threshold} 人同意，过半后房间会关闭。</p>
          <div class="modal-actions">
            <button class="danger" id="modalDissolveAgreeBtn" type="button" ${voted ? "disabled" : ""}>${voted ? "已同意" : "同意解散"}</button>
            <button class="ghost" id="modalDissolveCloseBtn" type="button" data-vote-key="${voteKey}">先不管</button>
          </div>
        </div>
      `;
    }
  }

  els.roomModal.innerHTML = html;
  els.roomModal.classList.toggle("show", Boolean(html));
}

function renderRuleStrip() {
  const settings = state.settings || {};
  const minBet = settings.minBet || 10;
  const maxBet = settings.maxBet || 50;
  const timeout = settings.actionTimeoutSeconds || 30;
  const roundLimit = settings.roundLimit ? `${settings.roundLimit} 局结束` : "不限局数";
  const timeLimit = settings.timeLimitMinutes ? `${settings.timeLimitMinutes} 分钟结束` : "不限时间";
  const countdown = gameCountdownLabel();
  els.ruleStrip.innerHTML = [
    `下注 ${minBet}-${maxBet}`,
    `≤13 自动要牌`,
    `${timeout}s 超时托管`,
    "可分牌，不可再分",
    "庄爆换下一庄",
    countdown ? `总倒计时 ${countdown}` : `${roundLimit} · ${timeLimit}`,
  ].map((item) => `<span>${item}</span>`).join("");
}

function renderLobbyPlayer(player) {
  const isViewer = player.id === state.viewerId;
  const pending = state.status !== "lobby" && player.activeFromRound > state.round;
  const stateLabel = pending ? "下一局加入" : player.isDealer ? "庄家" : "已入座";
  const nextDealer = state.nextDealerId === player.id ? " · 下局庄" : "";
  return `
    <article class="lobby-player ${isViewer ? "self" : ""}">
      ${renderAvatar(player)}
      <div>
        <strong>${isViewer ? "你" : player.name}</strong>
        <small>${stateLabel}${nextDealer}</small>
      </div>
      <span class="chips">${formatChips(player.chips)}</span>
    </article>
  `;
}

function renderViewerSeat(player, animateCards) {
  const handHtml = player.hands.map((hand, index) => renderHand(hand, player, index, animateCards, false)).join("");
  const role = player.isDealer ? "庄家" : getPlayerStateLabel(player);
  const showdownStep = currentShowdownStep();
  const resultBadge = showdownStep && player.id === showdownStep.playerId ? renderResultBadge(showdownStep) : "";
  const betTotal = player.hands.reduce((sum, hand) => sum + (hand.bet || 0), 0);
  return `
    <article class="viewer-panel">
      <div class="viewer-profile">
        ${renderAvatar(player)}
        <div>
          <strong>你</strong>
          <small>${role} · 筹码 ${formatChips(player.chips)}${betTotal ? ` · 本局下注 ${betTotal}` : ""}</small>
        </div>
      </div>
      <div class="viewer-hands">${handHtml}</div>
      ${resultBadge}
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

function renderBetPanel(isViewerBetting, viewerBetConfirmed, currentBet) {
  els.betPanel.classList.toggle("show", isViewerBetting);
  document.querySelector(".action-buttons").classList.toggle("hidden", isViewerBetting);
  if (!isViewerBetting) return;
  if (!state.selectedBet || viewerBetConfirmed) state.selectedBet = currentBet;
  els.betAmountLabel.textContent = state.selectedBet;
  els.confirmBetBtn.disabled = viewerBetConfirmed;
  els.confirmBetBtn.textContent = viewerBetConfirmed ? `已下注 ${currentBet}` : "确认下注";
  [...els.betOptions.querySelectorAll("button")].forEach((button) => {
    const selected = Number(button.dataset.bet) === Number(state.selectedBet);
    button.classList.toggle("selected", selected);
    button.disabled = viewerBetConfirmed;
  });
}

function getActionHint(isViewerTurn, isViewerDealerTurn = false, isViewerBetting = false, viewerBetConfirmed = false, isViewerDealerPrepare = false) {
  const left = timeLeftLabel();
  const timer = left ? ` · ${left}` : "";
  const hand = activeHandLabel();
  const handText = hand ? `正在操作${hand} · ` : "";
  const pending = pendingJoinersLabel();
  const dealerNotice = nextDealerNotice();
  if (state.status === "settlement") return state.gameOverReason || dealerNotice || "本局已结算";
  if (isViewerBetting) return viewerBetConfirmed ? `已确认下注，等待其他闲家${timer}` : `请选择本局下注${timer}，超时自动下注`;
  if (state.status === "betting") return `${pending ? `${pending} · ` : ""}等待闲家下注${timer}`;
  if (isViewerDealerPrepare) return `下注完成：5 秒内可洗牌，超时默认不洗牌${timer}`;
  if (state.status === "dealer_prepare") return `下注完成，等待庄家选择是否洗牌${timer}`;
  if (isViewerDealerTurn) return `${handText}庄家回合：你可以要、不要了，或对子分牌${timer}`;
  if (state.status === "dealer_turn") return `${handText}庄家牌已亮，等待庄家决策${timer}`;
  if (isViewerTurn) return `${handText}轮到你行动${timer}`;
  if (currentPlayer()) return `${handText}等待 ${currentPlayer().name} 行动${timer}`;
  return "等待开局";
}

function renderSettlement() {
  const visible = state.status === "settlement" && state.showdown.showPanel;
  els.settlementSheet.classList.toggle("show", visible);
  if (!visible) return;
  els.nextRoundBtn.disabled = Boolean(state.gameOverReason);
  els.nextRoundBtn.textContent = state.gameOverReason ? "本场已结束" : "下一局";
  const settlements = state.settlements || [];
  const rows = settlements.map((item) => {
    const positive = item.delta > 0;
    const label = positive ? `+${item.delta}` : `${item.delta}`;
    return `
      <article class="settlement-row ${positive ? "win" : "lose"}">
        <div>
          <strong>${item.playerName}</strong>
          <small>${item.playerHandLabel} vs ${item.dealerHandLabel} · 下注 ${item.bet} · x${item.multiplier}</small>
        </div>
        <span>${label}</span>
      </article>
    `;
  });
  const dealerNotice = nextDealerNotice();
  if (dealerNotice) {
    rows.unshift(`
      <article class="dealer-switch-panel">
        <span>庄家爆牌</span>
        <strong>${dealerNotice.replace("庄家爆牌，", "")}</strong>
      </article>
    `);
  }
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
  rows.push(renderScoreboard());
  els.settlementEvents.innerHTML = rows.length
    ? rows.join("")
    : (state.logs || []).slice(0, 4).map((event) => `<p>${event}</p>`).join("");
}

function renderScoreboard() {
  const players = [...(state.players || [])].sort((a, b) => b.chips - a.chips);
  const rows = players.map((player, index) => {
    const score = formatChips(player.chips);
    return `<li><span>${index + 1}. ${player.id === state.viewerId ? "你" : player.name}${player.isDealer ? " · 庄" : ""}</span><strong>${score}</strong></li>`;
  }).join("");
  return `
    <article class="scoreboard-panel">
      <strong>本场总分</strong>
      <ul>${rows}</ul>
    </article>
  `;
}

function currentShowdownStep() {
  if (state.status !== "settlement" || state.showdown.showPanel) return null;
  const steps = state.showdownSteps || state.settlements || [];
  return steps[state.showdown.index] || null;
}

function renderShowdownBanner() {
  const step = currentShowdownStep();
  els.showdownBanner.classList.toggle("show", Boolean(step));
  if (!step) {
    els.showdownBanner.innerHTML = "";
    return;
  }
  const delta = step.delta > 0 ? `+${step.delta}` : `${step.delta}`;
  els.showdownBanner.innerHTML = `
    <strong>${step.playerName} vs ${step.dealerName}</strong>
    <span>${step.playerHandLabel} 对 ${step.dealerHandLabel}</span>
    <em>${step.reason} · ${delta}</em>
  `;
}

function renderDanmaku() {
  if (!els.danmakuLayer || !state.chats?.length) return;
  state.chats
    .slice()
    .reverse()
    .forEach((chat) => {
      if (state.seenChatIds.has(chat.id)) return;
      state.seenChatIds.add(chat.id);
      const item = document.createElement("div");
      item.className = "danmaku";
      item.style.top = `${12 + Math.floor(Math.random() * 54)}%`;
      item.textContent = `${chat.name}: ${chat.text}`;
      els.danmakuLayer.appendChild(item);
      window.setTimeout(() => item.remove(), 6500);
    });
}

function getRoundLabel() {
  if (state.status === "lobby") return "等待开局";
  if (state.status === "betting") return "下注中";
  if (state.status === "dealer_prepare") return "庄家发牌";
  if (state.status === "settlement") return "结算完成";
  if (state.status === "dealer_turn") return "庄家回合";
  if (state.status === "player_turn") return "闲家回合";
  return state.dealerRevealed ? "庄家回合" : "闲家回合";
}

function renderSeat(player, isHouse, animateCards, flipDealer) {
  const otherPlayers = state.players.filter((item) => !item.isDealer && item.id !== state.viewerId);
  const seatIndex = player.id === state.viewerId ? 0 : otherPlayers.findIndex((item) => item.id === player.id) + 1;
  const isViewer = player.id === state.viewerId;
  const active = ["player_turn", "dealer_turn"].includes(state.status) && currentPlayer()?.id === player.id;
  const busted = player.hands.some((hand) => hand.busted);
  const showdownStep = currentShowdownStep();
  const isShowdownFocus = showdownStep && (player.id === showdownStep.playerId || player.id === showdownStep.dealerId);
  const resultBadge = showdownStep && player.id === showdownStep.playerId ? renderResultBadge(showdownStep) : "";
  const seatClass = isHouse
    ? `seat-position dealer-position compact-seat dealer-card ${active ? "active" : ""} ${isShowdownFocus ? "showdown-focus" : ""}`
    : `seat-position player-seat seat-${seatIndex} ${isViewer ? "viewer-seat" : "compact-seat"} ${active ? "active" : ""} ${busted ? "busted" : ""} ${isShowdownFocus ? "showdown-focus" : ""}`;
  const actionState = getPlayerStateLabel(player);
  const displayName = isViewer ? "You" : player.name;
  const badge = player.isDealer ? '<span class="dealer-badge dealer-crown" aria-label="庄家"></span>' : "";
  const betTotal = player.isDealer ? 0 : player.hands.reduce((sum, hand) => sum + (hand.bet || 0), 0);
  const dealerChanged = state.dealerChangeId === player.id ? " dealer-changed" : "";
  return `
    <article class="${seatClass}${dealerChanged}">
      ${player.hands.map((hand, index) => renderHand(hand, player, index, animateCards, flipDealer)).join("")}
      <div class="profile-row">
        ${renderAvatar(player)}
        <div class="profile-card">
          <div class="profile-main">
            <strong>${displayName}</strong>
            ${badge}
          </div>
          <span class="chips">${formatChips(player.chips, true)}</span>
          ${betTotal ? `<span class="bet-chip">下注 ${betTotal}</span>` : ""}
          <small>${actionState}</small>
        </div>
      </div>
      ${resultBadge}
    </article>
  `;
}

function renderResultBadge(step) {
  const positive = step.delta > 0;
  const text = positive ? "赢麻啦！" : "亏瞎了～";
  const delta = positive ? `+${step.delta}` : `${step.delta}`;
  return `<div class="result-badge ${positive ? "win" : "lose"}"><strong>${text}</strong><span>${delta}</span></div>`;
}

function canRevealHand(player) {
  if (player.id === state.viewerId) return true;
  if (player.isDealer && state.dealerRevealed) return true;
  if (player.hands.some((hand) => hand.cards.some((card) => card && !card.hidden))) return true;
  return false;
}

function getPlayerStateLabel(player) {
  if (player.isDealer) {
    if (player.hands.some((hand) => hand.busted)) return '<span class="state-bust">爆牌</span>';
    if (state.status === "dealer_turn") return player.id === state.viewerId ? "你决策" : "庄家决策";
    return state.dealerRevealed ? "庄家亮牌" : "暗牌";
  }
  if (player.hands.some((hand) => hand.busted)) return '<span class="state-bust">爆牌</span>';
  const revealedSpecial = player.hands
    .map((hand) => {
      const visible = hand.cards.length > 0 && hand.cards.every((card, index) => !isCardHidden(card, player, index));
      return visible ? handRank(hand.cards).label : "";
    })
    .find(Boolean);
  if (revealedSpecial) return revealedSpecial;
  if (currentPlayer()?.id === player.id && !state.dealerRevealed) {
    return player.id === state.viewerId ? "轮到你" : "行动中";
  }
  if (player.hands.every((hand) => hand.stood || hand.busted)) return "已结束";
  return "等待";
}

function renderHand(hand, player, handIndex, animateCards, flipDealer) {
  const isHouse = player.isDealer;
  const allCardsVisible = hand.cards.every((card, index) => !isCardHidden(card, player, index));
  const rank = allCardsVisible ? handRank(hand.cards) : { label: "", level: 0 };
  const visibleCards = hand.cards.map((card, index) => {
    const hidden = isCardHidden(card, player, index);
    return renderCard(card, hidden, animateCards, flipDealer && !hidden, rank.level > 0);
  });
  const score = allCardsVisible ? handScore(hand.cards) : `${hand.cards.length} 张牌`;
  const bustClass = allCardsVisible && isBust(hand.cards) ? "bust" : "";
  const hotClass = rank.label ? "hot" : "";
  const isActiveHand = ["player_turn", "dealer_turn"].includes(state.status) && currentPlayer()?.id === player.id && handIndex === (state.currentHandIndex || 0);
  const activeClass = isActiveHand ? "active-hand" : "";
  const handName = player.hands.length > 1 ? `<span class="score-pill hand-index ${isActiveHand ? "active" : ""}">${isActiveHand ? "操作中 · " : ""}第 ${handIndex + 1} 手</span>` : "";
  return `
    <div class="hand-wrap ${activeClass}">
      <div class="hand-row ${handIndex > 0 ? "split" : ""}">${visibleCards.join("")}</div>
      <div class="hand-meta">
        ${handName}
        <span class="score-pill ${bustClass || hotClass}">${bustClass ? "爆牌" : allCardsVisible ? `${score} 点` : score}</span>
        ${hand.bet ? `<span class="score-pill">下注 ${hand.bet}</span>` : ""}
        ${rank.label ? `<span class="tag">${rank.label}</span>` : ""}
      </div>
    </div>
  `;
}

function isCardHidden(card, player, index) {
  if (!card || card.hidden) return true;
  if (player.isDealer && player.id !== state.viewerId && !state.dealerRevealed && index > 0) return true;
  return false;
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
  const wasOnline = state.online;
  const oldRoom = {
    status: state.status,
    players: state.players,
    chats: state.chats,
  };
  const oldDealerId = state.currentDealerId || state.players?.find((player) => player.isDealer)?.id || "";
  const newDealerId = payload.room?.players?.find((player) => player.isDealer)?.id || "";
  playSnapshotSounds(oldRoom, payload.room);
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
  if (wasOnline) {
    enqueueCinematics(payload.room?.cinematics || []);
  } else {
    (payload.room?.cinematics || []).forEach((event) => state.seenCinematicIds.add(event.id));
  }
  if (oldDealerId && newDealerId && oldDealerId !== newDealerId) {
    state.dealerChangeId = newDealerId;
    window.clearTimeout(state.dealerChangeTimer);
    state.dealerChangeTimer = window.setTimeout(() => {
      state.dealerChangeId = "";
      render(false);
    }, 2000);
  }
  state.currentDealerId = newDealerId;
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
    const nickname = requireNickname();
    const settings = {
      actionTimeoutSeconds: Number(els.actionTimeoutInput.value),
      roundLimit: Number(els.roundLimitInput.value),
      timeLimitMinutes: Number(els.timeLimitInput.value),
    };
    const payload = await apiRequest("/api/rooms", {
      method: "POST",
      body: JSON.stringify({ nickname, maxPlayers: Number(els.maxPlayersInput.value), settings }),
    });
    els.roomCodeInput.value = payload.room.code;
    applyOnlineSnapshot(payload, { animate: true });
    showToast(`房间 ${payload.room.code} 已创建`);
  } catch (error) {
    showToast(error.message);
  }
}

async function joinOnlineRoom(codeOverride = "") {
  try {
    state.apiBase = normalizeApiBase(els.apiBaseInput.value);
    const code = String(codeOverride || els.roomCodeInput.value).trim();
    if (!code) throw new Error("请选择或输入房间号");
    els.roomCodeInput.value = code;

    if (state.playerId && state.roomCode === code) {
      state.online = true;
      await syncOnlineRoom();
      showToast(`已回到房间 ${code}`);
      return;
    }

    const nickname = requireNickname();
    const payload = await apiRequest(`/api/rooms/${code}/join`, {
      method: "POST",
      body: JSON.stringify({ nickname, playerId: state.roomCode === code ? state.playerId : "" }),
    });
    applyOnlineSnapshot(payload, { animate: true });
    showToast(payload.rejoined ? `已回到房间 ${code}` : `已加入房间 ${code}`);
  } catch (error) {
    showToast(error.message);
  }
}

async function loadRoomList() {
  if (state.online && state.uiMode !== "entry") return;
  try {
    const data = await apiRequest("/api/rooms");
    state.roomList = data.rooms || [];
    renderRoomList();
  } catch (error) {
    if (els.roomList) els.roomList.innerHTML = `<p>暂时拉不到房间列表：${error.message}</p>`;
  }
}

function renderRoomList() {
  if (!els.roomList) return;
  if (!state.roomList.length) {
    els.roomList.innerHTML = "<p>目前没有可加入的房间。你可以先创建一个。</p>";
    return;
  }
  els.roomList.innerHTML = state.roomList.map((room) => `
    <button class="room-item" type="button" data-room-code="${room.code}">
      <div>
        <strong>${room.code} · ${room.statusLabel}</strong>
        <small>${room.hostName || "朋友"} 的房间 · 庄家 ${room.dealerName || "-"}</small>
      </div>
      <span>${room.playerCount}/${room.maxPlayers}</span>
    </button>
  `).join("");
}

function startRoomListPolling() {
  window.clearInterval(state.roomListTimer);
  loadRoomList();
  state.roomListTimer = window.setInterval(() => {
    if (state.uiMode === "entry" && !state.online) loadRoomList();
  }, 5000);
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
  state.roomCode = "";
  state.playerId = "";
  localStorage.removeItem("roomCode");
  localStorage.removeItem("playerId");
  setMode("entry");
  render();
  startRoomListPolling();
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
  window.clearInterval(state.roomListTimer);
  window.clearInterval(state.pollTimer);
  state.pollTimer = window.setInterval(syncOnlineRoom, 1800);
}

async function sendAction(type) {
  try {
    unlockSound();
    const soundByAction = {
      hit: "hit",
      stand: "stand",
      split: "deal",
      deal_keep: "deal",
      deal_shuffle: "deal",
      start_round: "deal",
      place_bet: "bet",
      reveal_dealer: "crown",
    };
    playSound(soundByAction[type]);
    if (type === "hit") speakPhrase("来");
    if (type === "stand") speakPhrase("算了算了");
    const payload = await apiRequest(`/api/rooms/${state.roomCode}/action`, {
      method: "POST",
      body: JSON.stringify({ playerId: state.playerId, type }),
    });
    applyOnlineSnapshot(payload, { animate: true });
  } catch (error) {
    showToast(error.message);
  }
}

async function voteDissolveRoom() {
  try {
    const payload = await apiRequest(`/api/rooms/${state.roomCode}/action`, {
      method: "POST",
      body: JSON.stringify({ playerId: state.playerId, type: "dissolve_room" }),
    });
    applyOnlineSnapshot(payload, { animate: false });
  } catch (error) {
    showToast(error.message);
  }
}

function ensureBgmAudio() {
  if (state.bgmAudio) return state.bgmAudio;
  state.bgmAudio = new Audio(state.bgmUrl || DEFAULT_BGM_SRC);
  state.bgmAudio.loop = true;
  state.bgmAudio.volume = state.bgmBaseVolume;
  return state.bgmAudio;
}

function renderBgmButton() {
  if (!els.bgmBtn) return;
  els.bgmBtn.textContent = state.bgmPlaying ? "音乐关" : "音乐";
  els.bgmBtn.classList.toggle("muted", !state.bgmPlaying);
}

async function toggleBgm() {
  unlockSound();
  const audio = ensureBgmAudio();
  if (!audio.src && state.bgmUrl) audio.src = state.bgmUrl;
  if (!state.bgmUrl) {
    els.bgmInput.click();
    return;
  }
  if (state.bgmPlaying) {
    audio.pause();
    state.bgmPlaying = false;
    renderBgmButton();
    return;
  }
  try {
    await audio.play();
    state.bgmPlaying = true;
  } catch {
    showToast("手机浏览器需要再点一次音乐按钮");
  }
  renderBgmButton();
}

function loadBgmFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (state.bgmUrl?.startsWith("blob:")) URL.revokeObjectURL(state.bgmUrl);
  state.bgmUrl = URL.createObjectURL(file);
  const audio = ensureBgmAudio();
  audio.src = state.bgmUrl;
  audio.volume = state.bgmBaseVolume;
  audio.play()
    .then(() => {
      state.bgmPlaying = true;
      renderBgmButton();
      showToast("房间音乐已播放");
    })
    .catch(() => {
      state.bgmPlaying = false;
      renderBgmButton();
      showToast("已选择音乐，再点音乐按钮播放");
    });
}

async function sendChat(message) {
  const text = String(message || "").trim();
  if (!text) return;
  try {
    unlockSound();
    playSound("chat");
    const payload = await apiRequest(`/api/rooms/${state.roomCode}/action`, {
      method: "POST",
      body: JSON.stringify({ playerId: state.playerId, type: "chat", message: text }),
    });
    els.chatInput.value = "";
    applyOnlineSnapshot(payload, { animate: false });
  } catch (error) {
    showToast(error.message);
  }
}

function selectBet(event) {
  const button = event.target.closest("button[data-bet]");
  if (!button) return;
  state.selectedBet = Number(button.dataset.bet);
  render(false);
}

async function confirmBet() {
  try {
    unlockSound();
    playSound("bet");
    const payload = await apiRequest(`/api/rooms/${state.roomCode}/action`, {
      method: "POST",
      body: JSON.stringify({ playerId: state.playerId, type: "place_bet", bet: state.selectedBet }),
    });
    applyOnlineSnapshot(payload, { animate: true });
  } catch (error) {
    showToast(error.message);
  }
}

els.dealBtn.addEventListener("click", resetRound);
els.hitBtn.addEventListener("click", hit);
els.standBtn.addEventListener("click", stand);
els.splitBtn.addEventListener("click", () => sendAction("split"));
els.revealBtn.addEventListener("click", revealDealer);
els.createRoomBtn.addEventListener("click", createOnlineRoom);
els.joinRoomBtn.addEventListener("click", () => joinOnlineRoom());
els.nicknameOptions.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-name]");
  if (!button) return;
  setQuickNickname(button.dataset.name);
});
els.rerollNicknameBtn.addEventListener("click", () => {
  const name = selectedQuickName() || "舟";
  setQuickNickname(name);
});
els.refreshRoomsBtn.addEventListener("click", loadRoomList);
els.roomList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-room-code]");
  if (!button) return;
  joinOnlineRoom(button.dataset.roomCode);
});
els.continueRoomBtn.addEventListener("click", continueOnlineRoom);
els.leaveRoomBtn.addEventListener("click", leaveRoom);
els.backToLobbyBtn.addEventListener("click", () => setMode("lobby"));
els.copyRoomBtn.addEventListener("click", copyRoomCode);
els.nextRoundBtn.addEventListener("click", resetRound);
els.betOptions.addEventListener("click", selectBet);
els.confirmBetBtn.addEventListener("click", confirmBet);
els.chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendChat(els.chatInput.value);
});
els.quickChat.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-chat]");
  if (!button) return;
  sendChat(button.dataset.chat);
});
els.soundToggleBtn.addEventListener("click", toggleSound);
els.bgmBtn.addEventListener("click", toggleBgm);
els.bgmInput.addEventListener("change", loadBgmFile);
els.dissolveRoomBtn.addEventListener("click", voteDissolveRoom);
els.dissolveRoomTableBtn.addEventListener("click", voteDissolveRoom);
els.roomModal.addEventListener("click", (event) => {
  if (event.target.closest("#modalReturnHomeBtn")) {
    leaveRoom();
    return;
  }
  if (event.target.closest("#modalDissolveAgreeBtn")) {
    voteDissolveRoom();
    return;
  }
  const close = event.target.closest("#modalDissolveCloseBtn");
  if (close) {
    state.dismissedDissolveKey = close.dataset.voteKey || "";
    render(false);
  }
});
document.addEventListener("pointerdown", unlockSound, { once: true });

state.deck = shuffle(createDeck());
state.round = 0;
renderSoundToggle();
renderBgmButton();
render();
startRoomListPolling();
