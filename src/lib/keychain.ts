// 注意：此文件在 Electron main process 中使用
// safeStorage 在 renderer 中不可用

import { safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

const KEYCHAIN_DIR = path.join(app.getPath('home'), '.aiva', 'secure');
const LEGACY_KEY_FILE = path.join(KEYCHAIN_DIR, 'anthropic-key.enc');
const OLD_KEY_FILE = path.join(KEYCHAIN_DIR, 'api-key.enc');

function keyPath(providerKey: string): string {
  if (!/^[a-z0-9-]+$/.test(providerKey)) throw new Error(`Invalid provider key: ${providerKey}`);
  return path.join(KEYCHAIN_DIR, `api-key-${providerKey}.enc`);
}

// One-time migration: rename legacy key file chain
// anthropic-key.enc → api-key.enc → api-key-{currentProvider}.enc
export function migrateKeyFiles(currentProviderKey: string): void {
  // Step 1: legacy anthropic-key.enc → api-key.enc
  if (fs.existsSync(LEGACY_KEY_FILE) && !fs.existsSync(OLD_KEY_FILE)) {
    fs.renameSync(LEGACY_KEY_FILE, OLD_KEY_FILE);
  }
  // Step 2: api-key.enc → api-key-{currentProvider}.enc
  const newPath = keyPath(currentProviderKey);
  if (fs.existsSync(OLD_KEY_FILE) && !fs.existsSync(newPath)) {
    fs.renameSync(OLD_KEY_FILE, newPath);
  }
}

export function saveApiKey(key: string, providerKey: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption not available on this system');
  }
  if (!fs.existsSync(KEYCHAIN_DIR)) fs.mkdirSync(KEYCHAIN_DIR, { recursive: true });
  const encrypted = safeStorage.encryptString(key);
  fs.writeFileSync(keyPath(providerKey), encrypted);
}

export function loadApiKey(providerKey: string): string | null {
  const filePath = keyPath(providerKey);
  if (!fs.existsSync(filePath)) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  const encrypted = fs.readFileSync(filePath);
  return safeStorage.decryptString(encrypted);
}

export function deleteApiKey(providerKey: string): void {
  const filePath = keyPath(providerKey);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

export function hasApiKey(providerKey: string): boolean {
  return fs.existsSync(keyPath(providerKey));
}

const VOLCENGINE_CRED_FILE = path.join(KEYCHAIN_DIR, 'volcengine.json');

interface VolcengineCredentials {
  appId: string;
  accessToken: string;
}

export function saveVolcengineCredentials(appId: string, accessToken: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption not available on this system');
  }
  if (!fs.existsSync(KEYCHAIN_DIR)) fs.mkdirSync(KEYCHAIN_DIR, { recursive: true });
  const json = JSON.stringify({ appId, accessToken });
  const encrypted = safeStorage.encryptString(json);
  fs.writeFileSync(VOLCENGINE_CRED_FILE, encrypted);
}

export function loadVolcengineCredentials(): VolcengineCredentials | null {
  if (!fs.existsSync(VOLCENGINE_CRED_FILE)) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  const encrypted = fs.readFileSync(VOLCENGINE_CRED_FILE);
  const json = safeStorage.decryptString(encrypted);
  return JSON.parse(json);
}

export function hasVolcengineCredentials(): boolean {
  return fs.existsSync(VOLCENGINE_CRED_FILE);
}

const ALIYUN_VOICE_CRED_FILE = path.join(KEYCHAIN_DIR, 'aliyun-voice.json');

interface AliyunVoiceCredentials {
  apiKey: string;
}

export function saveAliyunVoiceCredentials(apiKey: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption not available on this system');
  }
  if (!fs.existsSync(KEYCHAIN_DIR)) fs.mkdirSync(KEYCHAIN_DIR, { recursive: true });
  const json = JSON.stringify({ apiKey });
  const encrypted = safeStorage.encryptString(json);
  fs.writeFileSync(ALIYUN_VOICE_CRED_FILE, encrypted);
}

export function loadAliyunVoiceCredentials(): AliyunVoiceCredentials | null {
  if (!fs.existsSync(ALIYUN_VOICE_CRED_FILE)) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  const encrypted = fs.readFileSync(ALIYUN_VOICE_CRED_FILE);
  const json = safeStorage.decryptString(encrypted);
  return JSON.parse(json);
}

export function hasAliyunVoiceCredentials(): boolean {
  return fs.existsSync(ALIYUN_VOICE_CRED_FILE);
}
