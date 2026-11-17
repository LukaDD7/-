# 知班 · 班主任工作平台

面向班主任的日常工作平台，提供适配电脑与手机的网页工作台，以及独立的原生微信小程序客户端。原“时序”个人日程保留在 `/planner`，两者使用独立数据。

## 功能

- **每日待办**：手动录入、粘贴通知生成可编辑草稿；按时间或轻重缓急排序，支持完成、改期、取消和独立提醒开关。
- **周程与学期安排**：周历、月历、跨天安排、逐项编号；同一事项同步显示于待办与日历。
- **班会记录**：主题、开展时间、主要内容、后续措施与每周主题检查计划。
- **学生关爱**：学生代号、情况记录、带日期和时间的访谈、后续措施和跟进安排。
- **突发事件档案**：发生时间、经过、方法、结果、办结与复查；文件夹拖拽或移动、档案导出与打印。
- **每日关怀**：60条审核内容，同日固定，一轮内按展示历史去重；需持续补充内容库。
- **工作总结**：周、月、学期、自然年统计，可编辑、导出和打印总结草稿。
- **备份与恢复**：独立本机保存、JSON备份、严格恢复校验；网页提供上一步撤销。

## 本机运行

需要 Node.js 22.13 或更高版本。

```sh
npm ci
npm run dev
```

打开终端显示的地址，默认是 `http://127.0.0.1:5173/`。Mac也可双击 `启动知班.command`。首次打开提供明确标记的虚构示例，可清空后使用自己的资料。

网页Mac开发服务使用 Apple Vision 在本机识别图片，不向第三方上传图片；其他系统或未启动识别服务时，可以粘贴周程文字继续。

## 原生微信小程序

```sh
npm run build:teacher-mini
```

在微信开发者工具中导入生成的 `teacher-miniprogram/`，源码在 `teacher-mini-src/`。默认游客AppID用于工具查看；真机预览与发布需要自己的AppID。

复制 `teacher-mini.config.example.json` 为被Git忽略的 `teacher-mini.config.local.json`，填写公开客户端配置后重新构建。AppSecret、数据库密码和模型密钥只应配置在服务端。

原“时序”小程序源码在 `mini-src/`，使用 `npm run build:mini` 单独构建。

## 当前接入范围

知班当前为本机体验版，网页和小程序各自保存本机数据，可通过JSON备份迁移；尚未接入教师账号或跨设备同步。微信服务号推送、小程序订阅消息后台发送、原生端图片OCR以及正式微信发布，需要真实账号、模板、HTTPS接口与服务端配置。界面明确展示未接入状态，提醒开关仅保存提醒计划。

- [使用说明](docs/知班使用说明.md)
- [微信、OCR与提醒接入](docs/teacher-integrations.md)
- [原生小程序配置说明](teacher-mini-src/README.md)
- [原个人日程小程序说明](mini-src/README.md)
- [服务端部署模板](deploy/README.md)

## 验证

```sh
npm test
npm run test:teacher
npm run typecheck
npm run build:local
npm run typecheck:teacher-mini
npm run build:teacher-mini
```

微信模拟测试与TypeScript构建不能替代微信开发者工具编译和真机验收。

## 项目结构

| 路径 | 内容 |
| --- | --- |
| `components/teacher-workspace.tsx` | 网页工作台与业务交互 |
| `lib/teacher.ts` | 共享模型、日期、文本识别、统计和关怀语 |
| `lib/teacher-workflows.ts` | 日程与档案联动、完成历史保护 |
| `lib/teacher-browser.ts` | 提醒计划、浏览器备份、图片识别调用 |
| `teacher-mini-src/` | 原生知班小程序 |
| `build/teacher-ocr-plugin.ts` | 本机开发服务图片OCR接口 |
| `scripts/teacher-ocr.swift` | Apple Vision识别实现 |
| `server/` | 原时序账号、数据库、同步与微信登录后台 |
| `tests/` | 核心、提醒、档案联动及客户端模拟测试 |

依赖、构建产物、个人备份、日志、真实客户端配置与凭证均不提交到仓库。本仓库中的服务端模板不代表知班已完成云端接入。
