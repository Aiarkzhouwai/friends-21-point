# 在线房间与技术方向

## 推荐形式

手机优先 Web App + 实时后端。

前端负责：

- 房间界面。
- 手牌展示。
- 下注输入。
- 玩家操作按钮。
- 游戏记录展示。

后端负责：

- 房间创建和加入。
- 玩家会话。
- 洗牌和发牌。
- 持续牌库、弃牌堆和自动回收。
- 游戏状态推进。
- 操作合法性校验。
- 下注与结算。
- 断线重连状态恢复。

## 技术栈候选

### 方案 A：Next.js + Supabase

适合快速上线。Supabase 可以承担数据库、鉴权、实时订阅。

优点：

- 开发速度快。
- 部署简单。
- 实时能力够用。
- 后续可以自然加入账号。

注意：

- 复杂状态机最好仍放在服务端函数或 API 中处理。
- 不要让客户端直接改游戏关键状态。

### 方案 B：React/Vite + Node.js + WebSocket

适合完全掌控实时逻辑。

优点：

- 游戏同步模型更直接。
- 状态机更集中。
- 房间广播容易控制。

注意：

- 需要自己处理部署、持久化、断线重连、房间清理。

### 当前建议

第一版推荐 `Next.js + Supabase` 或 `React/Vite + Node.js + WebSocket` 二选一。

如果目标是尽快和朋友玩起来：选 Next.js + Supabase。
如果你更想把实时游戏逻辑做得扎实可控：选 React/Vite + Node.js + WebSocket。

## 房间模型草案

Room:

- id
- code
- hostPlayerId
- status: lobby | betting | dealing | player_turn | dealer_turn | settlement | finished
- settings
- shoe
- currentRoundId
- maxPlayers
- createdAt
- updatedAt

Player:

- id
- roomId
- nickname
- seatIndex
- chips
- status: connected | disconnected | left | observing
- isHost
- joinedRoundId
- activeFromRoundId
- joinedAt

Round:

- id
- roomId
- dealerPlayerId
- dealerBustWhileDrawing
- shuffleChoice
- status
- startedAt
- endedAt

Hand:

- id
- roundId
- playerId
- cards
- bet
- splitFromHandId
- splitIndex
- isSplitEligible
- canSplitAgain: false after split
- status: waiting | active | stood | busted | blackjack | settled
- payout

RoomSettings:

- minPlayers: 3
- maxPlayers: 5
- initialChips: 500
- allowNegativeChips: true
- minBet: default 10
- maxBet: default 50
- betStep: default 10
- dealerBetRequired: false
- settlementMode: dealer_vs_each_player
- dealerChangeDirection: counterclockwise
- mustHitAtOrBelow: default 13
- tieWinner: dealer
- aceMode: best_non_busting_total
- dealerCardsVisibility: hidden_until_dealer_turn
- splitRequiresAdditionalBet: true
- splitAdditionalBetMode: match_original_bet
- resplitAllowed: false
- splitAcesCanHitNormally: true
- midRoundJoinMode: active_next_round
- dealerSplitSettlementMode: each_dealer_hand_vs_each_player
- handRankOrder:
  - fiveCardNonBust
  - pairOfAces
  - twentyOne
  - normal
- scoreMultipliers:
  - normalWin: 1
  - twentyOne: 2
  - pairOfAces: 3
  - fiveCardNonBust: 5

Shoe:

- drawPile
- usedPile
- lastShuffledAt
- shuffleCount

ActionLog:

- id
- roomId
- roundId
- playerId
- type
- payload
- createdAt

## 状态同步原则

- 客户端提交意图，例如 bet、choose_shuffle、split、hit、stand、start_round。
- 服务端验证当前状态和玩家身份。
- 服务端更新状态并广播新快照。
- 服务端按接收者生成可见状态：闲家行动阶段不向非庄家玩家暴露庄家暗牌。
- 客户端不自行推演权威结果，只做乐观提示或等待服务端确认。

## 防作弊原则

- 洗牌和发牌只在服务端执行。
- 当前牌库和已用牌只在服务端维护。
- 未到摊牌时，其他玩家不应看到隐藏牌。
- 庄家暗牌必须在服务端保留完整信息，只向当前有权限的玩家展示。
- 下注、要牌、停牌必须校验是否轮到该玩家。
- 小于等于 13 时停牌请求必须被服务端拒绝。
- 筹码允许为负数，不能把筹码不足作为拒绝下注或拆分追加下注的理由。
- 筹码变动只能由结算逻辑产生。
- 所有关键操作写入 ActionLog，方便回看和排查。

## 断线重连

第一版建议：

- 玩家用房间码 + 本地会话 token 恢复身份。
- 短时间断线不移除玩家。
- 当前轮到断线玩家时，可以由房主跳过、托管停牌，或等待倒计时。

待定：

- 是否需要倒计时自动操作。
- 玩家中途退出是否立即结算。
- 庄家退出时如何换庄。
