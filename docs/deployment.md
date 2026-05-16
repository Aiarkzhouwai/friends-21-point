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

真正在线房间需要后端能力：

- 房间创建和加入
- 玩家会话
- 服务端洗牌和发牌
- 实时状态同步
- 操作合法性校验
- 断线重连

推荐后端方案：

- Supabase：数据库、匿名/昵称会话、实时订阅、服务端函数。
- 或 Node.js + WebSocket：更适合完全自控游戏状态机。

## 我需要的资源

如果要我继续完成并发布到公网，需要以下资源之一：

1. Vercel/Netlify/Cloudflare Pages/GitHub Pages 中任选一个平台的项目访问权限。
2. 如果要做在线房间版，需要 Supabase 项目 URL、匿名公钥，以及可执行服务端逻辑的权限；或一台可部署 Node.js WebSocket 服务的服务器。
3. 如果要绑定域名，需要域名和 DNS 管理权限。

## 注意

当前版本不是完整多人在线版。它是一个可发布的前端原型，用来验证界面、动画和核心交互。多人在线版需要在前端之外增加权威服务端。
