# 时序原生微信小程序客户端

原生 WXML / WXSS / TypeScript；个人主体邀请内测。此目录是源代码，导入微信开发者工具时选择构建生成的 `miniprogram/`，不要直接导入本目录。

## 构建与校验

- `npm run typecheck:mini`
- `npm run build:mini`
- `npm run test:mini`

公开配置示例为项目根目录 `mini.config.example.json`，复制到被 Git 忽略的 `mini.config.local.json` 后填入独立 AppID 和 HTTPS API origin；也可双击“配置微信小程序.command”。禁止在这两个配置或小程序源码中放入 AppSecret、博约 Key 或数据库凭证。

构建直接转译 `lib/planner.ts` 和 `lib/cloud-sync.ts` 到产物的 `core/`，不会维护第二份排程逻辑。此目录 `core/*.d.ts` 只用于类型引用。ID、请求、缓存、页面生命周期在本端适配，核心规则不变。

客户端使用服务端签发的 mini 类型 Bearer 会话。现有网页 Cookie 会话不能直接当作 Bearer 使用；mini 会话也不能塞到网页 Cookie。账户绑定用 web 会话生成的10分钟一次性票据，新用户用限次/限时邀请码。

页面覆盖：日视图与任务列表、任务详情/进度/依赖/移动/锁定/重复、固定日程、每日复查、AI 草案及确认、内测资格与用量、工作偏好、邀请登录。周网格拖拽、订阅消息提醒、真实收款、自动续扣不属于此版。

`api.ts` 只接受 HTTPS origin，产物保持 urlCheck=true。未配置时明确拒绝发送请求。缓存按后端和账号分区，版本冲突不自动覆盖；本地撤销只覆盖最近一次提交。首次启动仍需要联网登录，当前不支持未登录冷启动时读取历史缓存。

## 验证边界

Node 中的客户端模拟运行测试覆盖 API 适配、页面绑定处理函数、进度编辑、AI 依赖确认等，不能替代微信开发者工具原生编译或真机测试。当前没有 AppID、AppSecret 和已备案 HTTPS 地址，尚未进行这些外部验证。
