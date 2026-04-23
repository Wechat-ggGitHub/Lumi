// 注意：此文件在 Electron main process 中使用
// safeStorage 在 renderer 中不可用

import { safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

const KEYCHAIN_DIR = path.join(app.getPath('userData'), 'secure');
const API_KEY_FILE = path.join(KEYCHAIN_DIR, 'api-key.enc');
const LEGACY_KEY_FILE = path.join(KEYCHAIN_DIR, 'anthropic-key.enc');

// One-time migration: rename legacy key file to new name
export function migrateKeyFile(): void {
  if (fs.existsSync(LEGACY_KEY_FILE) && !fs.existsSync(API_KEY_FILE)) {
    fs.renameSync(LEGACY_KEY_FILE, API_KEY_FILE);
  }
}

export function saveApiKey(key: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption not available on this system');
  }
  if (!fs.existsSync(KEYCHAIN_DIR)) fs.mkdirSync(KEYCHAIN_DIR, { recursive: true });
  const encrypted = safeStorage.encryptString(key);
  fs.writeFileSync(API_KEY_FILE, encrypted);
}

export function loadApiKey(): string | null {
  if (!fs.existsSync(API_KEY_FILE)) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  const encrypted = fs.readFileSync(API_KEY_FILE);
  return safeStorage.decryptString(encrypted);
}

export function deleteApiKey(): void {
  if (fs.existsSync(API_KEY_FILE)) fs.unlinkSync(API_KEY_FILE);
}

export function hasApiKey(): boolean {
  return fs.existsSync(API_KEY_FILE);
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
