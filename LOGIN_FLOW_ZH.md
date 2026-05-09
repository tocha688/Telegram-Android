# Telegram Android 登录与验证码流程分析（含可点击源码定位）

> 说明：下面的链接都使用“仓库相对路径 + 行号锚点”，在 GitHub 页面可直接点击跳转到对应代码。

## 0. 关键方法索引（文件 + 行号 + 可点击）

| 场景 | 方法/逻辑 | 文件 | 行号 | 链接 |
|---|---|---|---|---|
| 未登录入口 | `getClientNotActivatedFragment()` | `LaunchActivity.java` | 1055-1060 | [跳转](./TMessagesProj/src/main/java/org/telegram/ui/LaunchActivity.java#L1055-L1060) |
| 发登录码 | `TL_auth_sendCode` 请求组装与发送 | `LoginActivity.java` | 3152-3157, 3177-3193 | [跳转1](./TMessagesProj/src/main/java/org/telegram/ui/LoginActivity.java#L3152-L3157) / [跳转2](./TMessagesProj/src/main/java/org/telegram/ui/LoginActivity.java#L3177-L3193) |
| 验证码类型路由 | `fillNextCodeParams(Bundle, auth_SentCode, boolean)` | `LoginActivity.java` | 1753-1947 | [跳转](./TMessagesProj/src/main/java/org/telegram/ui/LoginActivity.java#L1753-L1947) |
| 验证码页初始化 | `LoginActivitySmsView.setParams(...)` | `LoginActivity.java` | 4293-4538 | [跳转](./TMessagesProj/src/main/java/org/telegram/ui/LoginActivity.java#L4293-L4538) |
| 开启短信监听 | `AndroidUtilities.setWaitingForSms(boolean)` | `AndroidUtilities.java` | 2442-2459 | [跳转](./TMessagesProj/src/main/java/org/telegram/messenger/AndroidUtilities.java#L2442-L2459) |
| 短信广播接收 | `SmsReceiver.onReceive(...)` | `SmsReceiver.java` | 27-55 | [跳转](./TMessagesProj/src/main/java/org/telegram/messenger/SmsReceiver.java#L27-L55) |
| 短信广播注册 | `SmsReceiver` receiver 声明 | `AndroidManifest.xml` | 430-436 | [跳转](./TMessagesProj/src/main/AndroidManifest.xml#L430-L436) |
| 自动填码并提交 | `didReceivedNotification(...)` | `LoginActivity.java` | 5140-5157 | [跳转](./TMessagesProj/src/main/java/org/telegram/ui/LoginActivity.java#L5140-L5157) |
| 验码请求 | `LoginActivitySmsView.onNextPressed(...)` 中 `TL_auth_signIn` | `LoginActivity.java` | 4682-4990（重点 4867-4872） | [跳转1](./TMessagesProj/src/main/java/org/telegram/ui/LoginActivity.java#L4682-L4990) / [跳转2](./TMessagesProj/src/main/java/org/telegram/ui/LoginActivity.java#L4867-L4872) |
| 倒计时重发 | `timeText` 点击 -> `TL_auth_resendCode` | `LoginActivity.java` | 3800-3839 | [跳转](./TMessagesProj/src/main/java/org/telegram/ui/LoginActivity.java#L3800-L3839) |
| 主动重发 | `resendCode()` | `LoginActivity.java` | 4155-4206 | [跳转](./TMessagesProj/src/main/java/org/telegram/ui/LoginActivity.java#L4155-L4206) |
| 取消验证码会话 | `TL_auth_cancelCode` | `LoginActivity.java` | 5072-5077 | [跳转](./TMessagesProj/src/main/java/org/telegram/ui/LoginActivity.java#L5072-L5077) |

---

## 1. 登录入口

- 启动后，如果账号未激活，会走未登录流程。
- 入口方法：`LaunchActivity#getClientNotActivatedFragment()`：
  - 有登录中间态：`new LoginActivity()`
  - 无中间态：`IntroActivity`
- 对应代码：
  - [LaunchActivity.java#L1055-L1060](./TMessagesProj/src/main/java/org/telegram/ui/LaunchActivity.java#L1055-L1060)

## 2. 手机号提交与发码（`auth.sendCode`）

在 `LoginActivity.PhoneView` 点击下一步后：

1. 组装 `TL_codeSettings`；
2. 处理短信 hash 缓存（`sms_hash` / `sms_hash_code`）；
3. 发起 `TL_auth_sendCode`；
4. 成功后进入 `fillNextCodeParams(...)` 按类型路由验证码页。

对应代码：
- sms hash 写入：
  - [LoginActivity.java#L3116-L3122](./TMessagesProj/src/main/java/org/telegram/ui/LoginActivity.java#L3116-L3122)
- `TL_auth_sendCode`：
  - [LoginActivity.java#L3152-L3157](./TMessagesProj/src/main/java/org/telegram/ui/LoginActivity.java#L3152-L3157)
- 请求成功后路由：
  - [LoginActivity.java#L3177-L3193](./TMessagesProj/src/main/java/org/telegram/ui/LoginActivity.java#L3177-L3193)

## 3. 验证码页面路由（按后端 `type/next_type`）

核心方法：`fillNextCodeParams(Bundle params, TLRPC.auth_SentCode res, boolean animate)`

它会：
- 提取 `phone_code_hash`、`timeout`、`length`、`pattern`、`prefix`、`url`；
- 根据 `res.type` 与 `res.next_type` 选择 `VIEW_CODE_SMS / CALL / FLASH_CALL / MESSAGE / FRAGMENT_SMS / WORD / PHRASE` 等页面。

对应代码：
- [LoginActivity.java#L1753-L1947](./TMessagesProj/src/main/java/org/telegram/ui/LoginActivity.java#L1753-L1947)

## 4. 验证码输入页初始化

核心方法：`LoginActivitySmsView.setParams(Bundle params, boolean restore)`

主要动作：
- 加载手机号、`phoneHash`、`nextType`、超时、码长；
- SMS 场景：`setWaitingForSms(true)` + 监听 `didReceiveSmsCode`；
- 来电场景：监听 `didReceiveCall`。

对应代码：
- [LoginActivity.java#L4293-L4538](./TMessagesProj/src/main/java/org/telegram/ui/LoginActivity.java#L4293-L4538)
- 其中 SMS 监听注册点：
  - [LoginActivity.java#L4316-L4319](./TMessagesProj/src/main/java/org/telegram/ui/LoginActivity.java#L4316-L4319)

## 5. 短信验证码自动读取流程（重点）

### 5.1 开启 SMS Retriever

- 方法：`AndroidUtilities.setWaitingForSms(true)`
- 内部调用：`SmsRetriever.getClient(...).startSmsRetriever()`

对应代码：
- [AndroidUtilities.java#L2442-L2459](./TMessagesProj/src/main/java/org/telegram/messenger/AndroidUtilities.java#L2442-L2459)

### 5.2 短信广播接收与解析

- Manifest 注册广播：`SmsReceiver`
  - [AndroidManifest.xml#L430-L436](./TMessagesProj/src/main/AndroidManifest.xml#L430-L436)
- 接收与提取验证码：`SmsReceiver.onReceive(...)`
  - [SmsReceiver.java#L27-L55](./TMessagesProj/src/main/java/org/telegram/messenger/SmsReceiver.java#L27-L55)

### 5.3 自动填码并自动提交

- 方法：`LoginActivitySmsView.didReceivedNotification(...)`
- 收到 `didReceiveSmsCode` 后立即：
  1. `codeFieldContainer.setText(...)`
  2. `onNextPressed(null)`

对应代码：
- [LoginActivity.java#L5140-L5157](./TMessagesProj/src/main/java/org/telegram/ui/LoginActivity.java#L5140-L5157)

### 5.4 hash 缓存复用

- 在 SMS 页初始化时读取 `sms_hash_code`，命中后直接填码+提交。

对应代码：
- [LoginActivity.java#L4490-L4504](./TMessagesProj/src/main/java/org/telegram/ui/LoginActivity.java#L4490-L4504)

## 6. 验证码校验（`auth.signIn`）

核心方法：`LoginActivitySmsView.onNextPressed(String code)`

流程：
1. 取 code；
2. 解除监听（SMS/Call）；
3. 发 `TL_auth_signIn(phone_number, phone_code, phone_code_hash)`；
4. 成功：`onAuthSuccess(...)` 或进入注册；
5. `SESSION_PASSWORD_NEEDED`：拉取密码参数并进二步验证页。

对应代码：
- 方法体：
  - [LoginActivity.java#L4682-L4990](./TMessagesProj/src/main/java/org/telegram/ui/LoginActivity.java#L4682-L4990)
- `TL_auth_signIn`：
  - [LoginActivity.java#L4867-L4872](./TMessagesProj/src/main/java/org/telegram/ui/LoginActivity.java#L4867-L4872)
- 成功分支：
  - [LoginActivity.java#L4884-L4903](./TMessagesProj/src/main/java/org/telegram/ui/LoginActivity.java#L4884-L4903)
- 二步验证分支：
  - [LoginActivity.java#L4906-L4927](./TMessagesProj/src/main/java/org/telegram/ui/LoginActivity.java#L4906-L4927)

## 7. 重发与降级

### 7.1 倒计时后重发

- `timeText` 点击触发 `TL_auth_resendCode`。
- 对应代码：
  - [LoginActivity.java#L3800-L3839](./TMessagesProj/src/main/java/org/telegram/ui/LoginActivity.java#L3800-L3839)

### 7.2 主动重发方法

- 方法：`resendCode()`
- 对应代码：
  - [LoginActivity.java#L4155-L4206](./TMessagesProj/src/main/java/org/telegram/ui/LoginActivity.java#L4155-L4206)

### 7.3 Firebase SMS + Integrity/SafetyNet 回退

- 入口与完整逻辑：
  - [LoginActivity.java#L1765-L1877](./TMessagesProj/src/main/java/org/telegram/ui/LoginActivity.java#L1765-L1877)
- 回退重发：
  - [LoginActivity.java#L1692-L1727](./TMessagesProj/src/main/java/org/telegram/ui/LoginActivity.java#L1692-L1727)

## 8. 错误处理与取消

- 验码错误（无效/过期/限流）分支：
  - [LoginActivity.java#L4954-L4967](./TMessagesProj/src/main/java/org/telegram/ui/LoginActivity.java#L4954-L4967)
- 返回编辑号码时取消验证码会话（`TL_auth_cancelCode`）：
  - [LoginActivity.java#L5072-L5077](./TMessagesProj/src/main/java/org/telegram/ui/LoginActivity.java#L5072-L5077)

## 9. 一句话主链路

`auth.sendCode` → `fillNextCodeParams` 路由验证码页 → 自动/手动输入验证码 → `auth.signIn` → 成功登录或进入注册/二步验证；失败则按 `next_type` 和倒计时重发、降级到其他验证方式。
