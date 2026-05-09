import { TelegramClient, tl } from '@mtcute/node';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

function env(name: string, fallback?: string): string | undefined {
  return process.env[name] ?? fallback;
}

function envRequired(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function envBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value == null || value === '') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'y', 'on'].includes(value.toLowerCase());
}

function envNumber(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a number`);
  }

  return parsed;
}

type JsonLike = string | number | boolean | null | JsonLike[] | { [key: string]: JsonLike };

function toTlJsonValue(value: JsonLike): tl.TypeJSONValue {
  if (value === null) {
    return { _: 'jsonNull' } as const;
  }

  if (typeof value === 'string') {
    return { _: 'jsonString', value } as const;
  }

  if (typeof value === 'number') {
    return { _: 'jsonNumber', value } as const;
  }

  if (typeof value === 'boolean') {
    return { _: 'jsonBool', value } as const;
  }

  if (Array.isArray(value)) {
    return {
      _: 'jsonArray',
      value: value.map((item) =>
        toTlJsonValue(item as JsonLike),
      ),
    } as const;
  }

  return {
    _: 'jsonObject',
    value: Object.entries(value).map(([key, item]) => ({
      _: 'jsonObjectValue' as const,
      key,
      value: toTlJsonValue(item as JsonLike),
    })),
  } as const;
}

function buildInitConnectionOptions() {
  const params: Record<string, string | number> = {
    tz_offset: envNumber('TZ_OFFSET', -new Date().getTimezoneOffset() * 60),
    package_id: env('PACKAGE_ID', 'com.example.telegram.androidlike')!,
  };

  const deviceToken = env('DEVICE_TOKEN');
  if (deviceToken) {
    params.device_token = deviceToken;
  }

  const certificateFingerprint = env('CERT_FINGERPRINT');
  if (certificateFingerprint) {
    params.data = certificateFingerprint;
  }

  const installer = env('INSTALLER');
  if (installer) {
    params.installer = installer;
  }

  const perfCat = env('PERF_CAT');
  if (perfCat) {
    params.perf_cat = envNumber('PERF_CAT', 2);
  }

  return {
    deviceModel: env('DEVICE_MODEL', 'GooglePixel8Pro')!,
    systemVersion: env('SYSTEM_VERSION', 'SDK 34')!,
    appVersion: env('APP_VERSION', '11.10.2 (4410)')!,
    systemLangCode: env('SYSTEM_LANG_CODE', 'zh-cn')!,
    langPack: env('LANG_PACK', 'android')!,
    langCode: env('LANG_CODE', 'zh-cn')!,
    params: toTlJsonValue(params),
  };
}

function buildCodeSettings() {
  return {
    allowFlashcall: envBoolean('ALLOW_FLASHCALL', false),
    currentNumber: envBoolean('CURRENT_NUMBER', false),
    allowAppHash: envBoolean('ALLOW_APP_HASH', false),
    allowMissedCall: envBoolean('ALLOW_MISSED_CALL', false),
    allowFirebase: envBoolean('ALLOW_FIREBASE', false),
    unknownNumber: envBoolean('UNKNOWN_NUMBER', true),
  };
}

function getErrorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function ask(rl: readline.Interface, prompt: string, fallback?: string): Promise<string> {
  const suffix = fallback ? ` [${fallback}]` : '';
  const answer = (await rl.question(`${prompt}${suffix}: `)).trim();
  return answer || fallback || '';
}

async function main(): Promise<void> {
  const apiId = Number(envRequired('TELEGRAM_API_ID'));
  if (Number.isNaN(apiId)) {
    throw new Error('TELEGRAM_API_ID must be a number');
  }
  const apiHash = envRequired('TELEGRAM_API_HASH');

  const baseDir = path.dirname(fileURLToPath(import.meta.url));
  const projectDir = path.resolve(baseDir, '..');
  const storageDir = path.join(projectDir, '.data');
  await mkdir(storageDir, { recursive: true });

  const client = new TelegramClient({
    apiId,
    apiHash,
    storage: path.join(storageDir, 'android-like'),
    initConnectionOptions: buildInitConnectionOptions(),
  });

  const rl = readline.createInterface({ input, output });

  try {
    const phone = await ask(rl, 'Phone number', env('TELEGRAM_PHONE'));
    if (!phone) {
      throw new Error('Phone number is required');
    }

    const codeSettings = buildCodeSettings();

    console.log('Using initConnection options:', buildInitConnectionOptions());
    console.log('Using codeSettings:', codeSettings);

    const sent = await client.sendCode({
      phone,
      codeSettings,
    });

    if (!('phoneCodeHash' in sent)) {
      console.log(`Already authorized as ${sent.displayName}`);
      console.log(`String session: ${await client.exportSession()}`);
      return;
    }

    console.log(`Code sent via: ${sent.type}`);
    console.log(`phoneCodeHash: ${sent.phoneCodeHash}`);
    console.log(`nextType: ${sent.nextType}`);
    console.log(`timeout: ${sent.timeout}s`);
    console.log(`length: ${sent.length}`);

    const phoneCode = await ask(rl, 'Enter the verification code');
    if (!phoneCode) {
      throw new Error('Verification code is required');
    }

    try {
      const user = await client.signIn({
        phone,
        phoneCodeHash: sent.phoneCodeHash,
        phoneCode,
      });

      console.log(`Authorized as ${user.displayName}`);
    } catch (error) {
      const errorText = getErrorText(error);
      if (!errorText.includes('SESSION_PASSWORD_NEEDED')) {
        throw error;
      }

      const password = await ask(rl, '2FA password');
      if (!password) {
        throw new Error('2FA password is required');
      }

      const user = await client.checkPassword(password);
      console.log(`Authorized as ${user.displayName} using 2FA`);
    }

    console.log(`String session: ${await client.exportSession()}`);
  } finally {
    rl.close();
    await client.destroy();
  }
}

main().catch((error) => {
  console.error('Login failed:', error);
  process.exitCode = 1;
});
