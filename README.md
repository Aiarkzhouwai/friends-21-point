# 21 Point Online Room Game

这是一个面向朋友局的 21 点在线房间小游戏。项目会优先考虑多人在线、轮流坐庄、下注、结算和房间同步；本地单机/同屏模式可以作为开发调试能力，但不是最终形态。

## 当前方向

- 平台：手机优先的 Web App，兼容桌面浏览器。
- 模式：创建房间、邀请朋友加入、多人下注、轮流坐庄。
- 核心：清晰的游戏状态机、可配置桌规、可追溯的下注和结算记录。
- 体验：朋友聚会式轻量娱乐，不做真钱支付，不处理真实资金。

## 文档

- [产品概要](./docs/product-brief.md)
- [在线房间与技术方向](./docs/online-room-architecture.md)
- [规则与状态机草案](./docs/game-rules-and-state.md)

## 当前原型

已添加一个零依赖网页前端和一个零依赖 Node 在线房间服务：

- `index.html`
- `styles.css`
- `app.js`
- `scripts/build.mjs`
- `server.mjs`
- `render.yaml`

直接用浏览器打开 `index.html` 即可体验离线演示。线上页面默认连接 Render 后端：

- 前端：https://aiarkzhouwai.github.io/friends-21-point/
- 后端：https://friends-21-point-api.onrender.com

生成可发布目录：

```bash
node scripts/build.mjs
```

发布目录为 `dist/`。

本地启动在线房间服务：

```bash
node server.mjs
```

健康检查：

```bash
curl http://127.0.0.1:8787/health
```

## 下一步

1. 确认你们实际玩的桌规。
2. 确认第一版是否需要账号，还是房间昵称即可。
3. 选择技术栈并搭建最小可玩的在线房间原型。
