# node-test

`@mtcute/node` 的 TypeScript 示例，用来尽量模拟 Telegram Android 的登录发码请求。

## 这个示例做了什么

- 设置 Android 风格的 `initConnection` 字段：
  - `deviceModel`
  - `systemVersion`
  - `appVersion`
  - `systemLangCode`
  - `langPack=android`
  - `langCode`
- 发送 `auth.sendCode`
- 输入验证码后执行 `auth.signIn`
- 如果账号开启 2FA，会继续提示输入密码
- 成功后输出 `string session`

## 使用方式

1. 进入目录：

   ```bash
   cd node-test
   ```

2. 复制环境变量模板：

   ```bash
   cp .env.example .env
   ```

3. 填入你自己的 `TELEGRAM_API_ID` / `TELEGRAM_API_HASH`

   > 仓库 README 已要求 fork/app 使用你自己的 API 凭据，不要直接依赖官方默认值。

4. 编译：

   ```bash
   npm run build
   ```

5. 运行（Node 20+ 可直接加载 `.env`）：

   ```bash
   node --env-file=.env dist/login.js
   ```

   或者手动导出环境变量后：

   ```bash
   npm run start
   ```

## 说明

- 为了更接近普通 Android 短信登录，这里默认关闭：
  - `allowFirebase`
  - `allowFlashcall`
  - `allowMissedCall`
  - `allowAppHash`
- 这样更适合在 Node.js 中跑通，不去模拟 Play Integrity / SafetyNet / Firebase 的 Android 专属流程。
- Android 原生客户端还会在 `initConnection.params` 里附带一些扩展字段；本示例保留了常用字段：
  - `tz_offset`
  - `device_token`（可选）
  - `data`（证书指纹，可选）
  - `installer`（可选）
  - `package_id`
  - `perf_cat`（可选）
