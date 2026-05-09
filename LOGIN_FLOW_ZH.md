# Telegram Android 登录与验证码流程分析

本文基于 `TMessagesProj/src/main/java/org/telegram/ui/LoginActivity.java`、`LaunchActivity.java`、`AndroidUtilities.java`、`SmsReceiver.java` 与 `AndroidManifest.xml` 的当前实现。

## 1. 登录入口

- 启动后，如果当前账号未激活，会走未登录流程。
- `LaunchActivity#getClientNotActivatedFragment()`：
  - 如果登录状态有中间页状态，返回 `new LoginActivity()`；
  - 否则返回 `IntroActivity`。
- 关键位置：
  - `LaunchActivity.java:1055-1060`

## 2. 手机号提交与发码（auth.sendCode）

在 `LoginActivity.PhoneView` 中点击下一步后：

1. 组装 `TL_codeSettings`（是否允许 app hash、flash call、logout tokens 等）。
2. 处理短信 hash：
   - 清空 `sms_hash_code`；
   - 若后端允许 `allow_app_hash`，写入 `sms_hash = BuildVars.getSmsHash()`。
3. 登录场景发送 `TL_auth_sendCode`：
   - 参数包含 `api_id/api_hash/phone_number/settings`。
4. 成功后进入 `fillNextCodeParams(...)`，根据后端返回码类型跳到对应验证码页面。

关键位置：
- `LoginActivity.java:3116-3122`（sms_hash 存储）
- `LoginActivity.java:3152-3157`（`TL_auth_sendCode`）
- `LoginActivity.java:3192`（进入 `fillNextCodeParams`）

## 3. 验证码页路由（按后端返回类型）

`fillNextCodeParams(Bundle, auth_SentCode, ...)` 会解析两类信息：

1. `res.type`：当前应该使用哪种验证码方式（App 内码/SMS/来电/Fragment SMS/词语验证码等）；
2. `res.next_type`：当前失败或超时后可切换到的下一种方式。

它会设置 `phoneHash`（即 `phone_code_hash`）以及 `timeout/length/pattern/prefix/url` 等参数，并通过 `setPage(...)` 跳转到不同视图：
- `VIEW_CODE_MESSAGE`（应用内码）
- `VIEW_CODE_SMS`（短信码，含 Firebase SMS）
- `VIEW_CODE_CALL` / `VIEW_CODE_FLASH_CALL` / `VIEW_CODE_MISSED_CALL`
- `VIEW_CODE_FRAGMENT_SMS`
- `VIEW_CODE_WORD` / `VIEW_CODE_PHRASE`
- 以及邮箱、付费等分支

关键位置：
- `LoginActivity.java:1753-1947`

## 4. 验证码输入页初始化

进入 `LoginActivitySmsView.setParams(...)` 后：

- 会加载手机号、`phoneHash`、`nextType`、超时时间、码长等；
- 针对 SMS 场景：
  - `AndroidUtilities.setWaitingForSms(true)`
  - 注册 `NotificationCenter.didReceiveSmsCode` 监听
- 针对来电场景则监听 `didReceiveCall`。

关键位置：
- `LoginActivity.java:4314-4335`（等待事件与参数初始化）

## 5. 短信验证码自动读取流程（重点）

### 5.1 开启 SMS Retriever

- 在 SMS 验证页初始化时调用 `AndroidUtilities.setWaitingForSms(true)`。
- 内部通过 Google Play Services 的 `SmsRetrieverClient.startSmsRetriever()` 开始监听。

关键位置：
- `AndroidUtilities.java:2442-2449`

### 5.2 广播接收器接收短信

- `AndroidManifest.xml` 注册了：
  - `<receiver android:name=".SmsReceiver">`
  - 监听 action：`com.google.android.gms.auth.api.phone.SMS_RETRIEVED`
- `SmsReceiver.onReceive(...)` 在满足 `isWaitingForSms()` 时：
  - 取到短信文本；
  - 使用正则提取数字/短横线并去掉短横线；
  - 码长 >= 3 才认定有效；
  - 若本地有 `sms_hash`，会把 `hash|code` 写到 `sms_hash_code`；
  - 最后发送 `NotificationCenter.didReceiveSmsCode`。

关键位置：
- `AndroidManifest.xml:430-436`
- `SmsReceiver.java:35-54`

### 5.3 登录页收到验证码并自动提交

- `LoginActivitySmsView.didReceivedNotification(...)` 收到 `didReceiveSmsCode` 后：
  - 填入验证码输入框；
  - 直接调用 `onNextPressed(null)` 发起校验请求。

关键位置：
- `LoginActivity.java:5144-5147`

### 5.4 本地 hash 缓存码复用

SMS 页面初始化时还会读 `sms_hash_code`：
- 若与当前 `sms_hash` 匹配（且不是新账号流程），会直接填码并触发 `onNextPressed(null)`。

关键位置：
- `LoginActivity.java:4490-4504`

## 6. 验证码校验（auth.signIn）

用户手动输入或自动填充后，`LoginActivitySmsView.onNextPressed(...)`：

1. 取 code；
2. 停止 SMS/Call 监听；
3. 发送 `TL_auth_signIn`，核心参数：
   - `phone_number`
   - `phone_code`
   - `phone_code_hash`（上一步发码返回）

成功分支：
- 已注册用户：`onAuthSuccess(...)`；
- 未注册：进入 `VIEW_REGISTER`；
- 需要二步验证：请求 `account.getPassword`，进入 `VIEW_PASSWORD`。

关键位置：
- `LoginActivity.java:4867-4872`（`TL_auth_signIn`）
- `LoginActivity.java:4884-4903`（成功）
- `LoginActivity.java:4906-4927`（二步验证）

## 7. 重发验证码与降级策略

### 7.1 倒计时后重发

- 倒计时结束后，点击 `timeText` 或内部逻辑会触发 `TL_auth_resendCode`。
- 返回新的 `auth_sentCode` 后再次走 `fillNextCodeParams(...)`，可能切换验证码类型（例如 SMS → Call，或词语码分支）。

关键位置：
- `LoginActivity.java:3811-3839`
- `LoginActivity.java:4155-4186`

### 7.2 Firebase SMS + 完整性校验链路

对于 `TL_auth_sentCodeTypeFirebaseSms`：
- 先走 Play Integrity/SafetyNet 获取 token；
- 调用 `auth.requestFirebaseSms`；
- 若失败则回退 `auth.resendCode`。

关键位置：
- `LoginActivity.java:1765-1877`
- `LoginActivity.java:1692-1727`

## 8. 失败与取消

- 常见错误处理：
  - `PHONE_CODE_INVALID/EMPTY`：提示错误并清空重输；
  - `PHONE_CODE_EXPIRED`：回到手机号输入页；
  - `FLOOD_WAIT`：频率限制提示。
- 返回编辑手机号时会调用 `TL_auth_cancelCode` 取消当前验证码会话。

关键位置：
- `LoginActivity.java:4954-4967`（验码错误处理）
- `LoginActivity.java:5072-5077`（`TL_auth_cancelCode`）

## 9. 总结（验证码主链路）

主链路可以概括为：

1. `auth.sendCode` 获取 `phone_code_hash` 与验证码类型；
2. 进入对应验证码页并开始等待 SMS/Call 事件；
3. 自动读取或手动输入验证码；
4. `auth.signIn(phone, code, phone_code_hash)` 完成登录；
5. 失败时按 `next_type` 与倒计时逻辑重发/降级到其他验证方式。

