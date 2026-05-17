// 注意：此文件在 Electron main process 中使用
// 加密使用 crypto AES-256-GCM（与运行模式无关的确定性密钥）

import { app } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const KEYCHAIN_DIR = path.join(app.getPath('home'), '.lumi', 'secure');
const ENCRYPTION_VERSION = 2;

function keyPath(providerKey: string): string {
  if (!/^[a-z0-9-]+$/.test(providerKey)) throw new Error(`Invalid provider key: ${providerKey}`);
  return path.join(KEYCHAIN_DIR, `api-key-${providerKey}.enc`);
}

// 从用户主目录派生稳定密钥，dev 和 production 模式使用相同密钥
function getEncryptionKey(): Buffer {
  return crypto.scryptSync(path.join(app.getPath('home'), '.lumi'), 'lumi-secure-storage-v2', 32);
}

function encryptValue(plaintext: string): Buffer {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // 格式: [version: 1B] [IV: 16B] [tag: 16B] [encrypted: NB]
  return Buffer.concat([Buffer.from([ENCRYPTION_VERSION]), iv, tag, encrypted]);
}

function decrypt(data: Buffer): string | null {
  try {
    if (data.length < 33 || data[0] !== ENCRYPTION_VERSION) return null;
    const key = getEncryptionKey();
    const iv = data.subarray(1, 17);
    const tag = data.subarray(17, 33);
    const encrypted = data.subarray(33);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final('utf8');
  } catch {
    return null;
  }
}

function loadEncryptedFile(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  let data: Buffer;
  try {
    data = fs.readFileSync(filePath);
  } catch {
    return null;
  }

  return decrypt(data);
}

function saveEncryptedFile(filePath: string, plaintext: string): void {
  if (!fs.existsSync(KEYCHAIN_DIR)) fs.mkdirSync(KEYCHAIN_DIR, { recursive: true });
  fs.writeFileSync(filePath, encryptValue(plaintext));
}

export function saveApiKey(key: string, providerKey: string): void {
  saveEncryptedFile(keyPath(providerKey), key);
}

export function loadApiKey(providerKey: string): string | null {
  return loadEncryptedFile(keyPath(providerKey));
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
  const json = JSON.stringify({ appId, accessToken });
  saveEncryptedFile(VOLCENGINE_CRED_FILE, json);
}

export function loadVolcengineCredentials(): VolcengineCredentials | null {
  const raw = loadEncryptedFile(VOLCENGINE_CRED_FILE);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function hasVolcengineCredentials(): boolean {
  return fs.existsSync(VOLCENGINE_CRED_FILE);
}

const ALIYUN_VOICE_CRED_FILE = path.join(KEYCHAIN_DIR, 'aliyun-voice.json');

interface AliyunVoiceCredentials {
  apiKey: string;
}

export function saveAliyunVoiceCredentials(apiKey: string): void {
  const json = JSON.stringify({ apiKey });
  saveEncryptedFile(ALIYUN_VOICE_CRED_FILE, json);
}

export function loadAliyunVoiceCredentials(): AliyunVoiceCredentials | null {
  const raw = loadEncryptedFile(ALIYUN_VOICE_CRED_FILE);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function hasAliyunVoiceCredentials(): boolean {
  return fs.existsSync(ALIYUN_VOICE_CRED_FILE);
}
