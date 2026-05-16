# 发布说明

## 当前可发布内容

当前项目可以先发布为静态网页原型，发布目录为 `dist/`。

生成发布目录：

```bash
node scripts/build.mjs
```

本地预览发布目录：

```bash
python3 -m http.server 4173 -d dist
```

## 推荐发布路径

### 第一阶段：静态原型发布

适合马上给朋友打开体验 UI 和基础交互。

可选平台：

- Vercel
- Netlify
- Cloudflare Pages
- GitHub Pages

发布配置：

- Build command: `node scripts/build.mjs`
- Output directory: `dist`

仓库内已包含 GitHub Pages 工作流：

- `.github/workflows/pages.yml`

推送到 `main` 后，GitHub Actions 会构建 `dist/` 并部署到 Pages。

### 第二阶段：在线房间版

当前已加入第一版在线房间服务 `server.mjs`。它使用内存保存房间状态，适合 MVP：

- 房间创建和加入
- 玩家会话 ID
- 服务端洗牌和发牌
- 前端轮询同步
- 操作合法性校验
- 基础断线恢复：同一浏览器保留 roomCode/playerId

Render 部署建议：

- 使用仓库里的 `render.yaml` 创建 Web Service。
- Start command: `node server.mjs`
- Health check path: `/health`
- 部署完成后，把 Render 服务 URL 填到网页底部“后端地址”。

限制：

- Render 免费实例重启后，内存房间会丢失。
- 当前同步方式是轮询，不是 WebSocket。
- 当前在线 MVP 尚未实现拆分、多手牌和完整轮庄下庄。

后续正式版建议：

- 把房间状态持久化到 Redis/Postgres。
- 把轮询升级为 WebSocket。
- 补全拆分、庄家拆分、多手结算和中途加入观战。
- 加入房间过期清理和基础防刷。

## 我需要的资源

如果要我继续部署后端到 Render，需要以下资源之一：

1. Render 账号连接这个 GitHub 仓库，并允许从 `render.yaml` 创建服务。
2. 或提供 Render API Key，我用 Render API 创建服务。
3. 如果要绑定域名，需要域名和 DNS 管理权限。

## 注意

当前版本不是完整多人在线版。它是一个可发布的前端原型，用来验证界面、动画和核心交互。多人在线版需要在前端之外增加权威服务端。
