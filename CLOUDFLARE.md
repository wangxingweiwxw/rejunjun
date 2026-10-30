# Cloudflare Workers 发布

站点：https://rejunjun.chipai.cc
Worker：`rejunjun`

仓库根目录包含 `wrangler.jsonc`。Workers Builds 使用默认仓库根目录，部署命令为 `npx wrangler@4.141.0 deploy`。Wrangler 自动执行 `node build.mjs`，只上传 `dist/` 中的 13 个当前第三人称版本资源。普通发布无需安装游戏依赖或转换模型。

```bash
npm test
node build.mjs
npx wrangler@4.141.0 deploy --dry-run
npx wrangler@4.141.0 deploy
```

本机首次部署需 `npx wrangler@4.141.0 login`；Cloudflare Git 集成自带构建身份。保持已有域名绑定。配置中的静态资源目录必须是 `./dist`，不能改成 `.`，否则可能上传开发文件和 node_modules。

修改 `source/` 后先执行 `npm run bundle`，并提交更新的 `assets/app.js`。`dist/`、node_modules、ZIP、报告和本机凭据不提交。

发布后检查主页标题“生化骏骏危机”，等待开始按钮可用，进入游戏检查第三人称镜头、人物、贴图及浏览器错误。
