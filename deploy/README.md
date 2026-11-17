# 服务端部署模板

本目录保留原“时序”个人日程系统的 Node.js / PostgreSQL 部署模板。知班新增模块目前采用独立本机保存；这些模板尚未提供知班的云端数据同步和定时微信通知服务。

## 配置

需要 Node.js 22.13 或更新版本、PostgreSQL、受信任的 HTTPS 入口。公开部署前设置自己的域名、数据库与访问规则。

服务端环境变量包括：

- `PGHOST`、`PGPORT`、`PGDATABASE`、`PGUSER`、`PGPASSWORD`。
- `APP_ORIGIN`：真实HTTPS域名；本机回环测试允许HTTP。
- `HOST`、`PORT`：服务监听地址，建议在反向代理后使用回环地址。
- 可选模型配置：`BOYU_API_BASE`、`BOYU_API_KEY`、`BOYU_MODEL`。
- 微信登录配置：`WECHAT_APP_ID`、`WECHAT_APP_SECRET`。

真实环境文件、初始化账号、数据库备份和所有密钥均放在源码之外，限制读取权限。不要将AppSecret或数据库密码写入小程序配置。

## 构建和运行

```sh
npm ci
npm run build:local
npm run start:cloud
```

`server/index.mjs` 初始化数据库表并启动HTTP服务。首次账号通过 `server/create-user.mjs` 在可信终端创建，密码交互输入，避免命令参数和日志记录。

Docker方案见 `Dockerfile`、`compose.yaml`；原生systemd方案见 `shixu.service`。模板中的用户、目录和环境文件路径需按自己的服务器调整。

## 备份与验收

`backup.sh` 和 `backup-native.sh` 提供数据库备份示例，`shixu-backup.timer` 提供定时任务模板。另行配置异机副本并验证恢复。

运行 `npm run test:cloud` 验证账号隔离、HTTP保存、版本冲突、会话及微信登录适配。`verify-native.mjs` 会创建验证账号并访问运行中的测试服务，应仅用于你明确配置的验收环境。

## 可选私人SSH入口

`scripts/cloud-tunnel.py` 提供本地回环端口转发。服务器地址从 `SHIXU_SSH_DEST` 或未跟踪的 `cloud-tunnel.config.local.json` 读取，格式参考根目录的 `cloud-tunnel.config.example.json`。SSH密钥和固定的服务器指纹文件由使用者在源码之外单独配置。

## 微信接入

登录、服务号提醒和小程序订阅消息分别核验对应主体、模板权限和用户授权。知班提醒计划的后端发送及原生OCR接口约定见 [接入说明](../docs/teacher-integrations.md)。
