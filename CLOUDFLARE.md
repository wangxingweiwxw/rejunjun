# RE Junjun · Cloudflare Workers 部署

日志中的失败原因是 Wrangler 自动生成了 `assets.directory: "."`，导致扫描整个仓库，并把安装依赖产生的 `node_modules/workerd/bin/workerd`（128 MiB）当作网站文件上传，超过静态文件 25 MiB 限制。

新版明确配置 `assets.directory: "./dist"`，并在 Wrangler 部署前执行 `node build.mjs`。构建仅复制 17 个游戏运行文件和归属文件。无需 Python，无需额外游戏依赖。日志中 Bun 的 `No packages!` 提示不是失败原因。

## Git 仓库部署

1. 将本项目内容提交到你连接 Cloudflare 的 Git 仓库。务必包括 `wrangler.jsonc`、`build.mjs`、`package.json`，以及 `index.html`、`game.js`、`core.js`、`style.css`、`assets/`、`vendor/`、`upstream/` 和 `THIRD_PARTY_NOTICES.md`。
2. 如果仓库里已有旧的自动生成 `wrangler.jsonc`，用本版覆盖。若有 `wrangler.toml` 或 `wrangler.json`，移除同一项目中冲突的旧配置，保留本版 `wrangler.jsonc`。
3. 在 Cloudflare 的 `rejunjun` Worker 构建设置中按下表填写。

| 设置 | 值 |
| --- | --- |
| 根目录 / Root directory | 包含 `wrangler.jsonc` 的目录 |
| 构建命令 / Build command | 留空（Wrangler 会执行配置内的 `node build.mjs`） |
| 部署命令 / Deploy command | `npx wrangler@4.141.0 deploy` |
| Worker 名称 | `rejunjun` |

若游戏文件直接位于仓库根目录，Root directory 使用默认根目录；若仓库保留了外层 `re-junjun-web/` 文件夹，Root directory 填 `re-junjun-web`。直接解压专用的 `RE-Junjun-Cloudflare部署包.zip` 上传到仓库根目录即可，不需要再套一层目录。

`dist/` 不必提交到 Git；部署时自动生成。`node_modules/`、ZIP 和测试报告也不需要上传。本地修改配置不会自动更新你的 Git 仓库，请提交新版文件后重新触发部署。

## 本机命令

需要 Node.js 和 npm，在包含 `wrangler.jsonc` 的目录执行：

```bash
node build.mjs
npx wrangler@4.141.0 deploy --dry-run
```

以上只构建和校验，不发布网站。正式发布时执行：

```bash
npx wrangler@4.141.0 login
npx wrangler@4.141.0 deploy
```

Cloudflare Git 集成已经提供发布身份时，不需要手动运行 `login`。部署成功后使用控制台显示的 `workers.dev` 地址，也可以绑定自己的域名。

## 成功检查

- 构建日志显示 `RE Junjun: built 17 static files in dist/`。
- 资产目录是 `.../dist`，不是整个 `.../repo`。
- 不会再上传 `node_modules/workerd`。
- 网站显示 RE Junjun，进入游戏后模型和纹理加载正常。

官方文档：

- https://developers.cloudflare.com/workers/static-assets/get-started/
- https://developers.cloudflare.com/workers/static-assets/binding/
- https://developers.cloudflare.com/workers/wrangler/custom-builds/
