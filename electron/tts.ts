import WebSocket from 'ws';
import zlib from 'zlib';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, ChildProcess } from 'child_process';
import { log } from '../src/lib/logger';

const WS_URL = 'wss://openspeech.bytedance.com/api/v3/tts/bigmodel';
const RESOURCE_ID = 'volc.seedtts';
const CONNECT_TIMEOUT = 10_000;
const TOTAL_TIMEOUT = 30_000;

export interface TtsOptions {
  appId: string;
  accessToken: string;
  text: string;
  signal?: AbortSignal;
}

function makeHeader(
  messageType: number,
  messageFlags: number,
  serialization: number,
  compression: number,
): Buffer {
  return Buffer.from([
    0x11,
    (messageType << 4) | messageFlags,
    (serialization << 4) | compression,
    0x00,
  ]);
}

const HEADER_FULL_CLIENT = makeHeader(0x1, 0x0, 0x1, 0x1);

export class TtsService {
  private playProcess: ChildProcess | null = null;
  private tempFile: string | null = null;

  async synthesize(options: TtsOptions): Promise<string | null> {
    const { appId, accessToken, text, signal } = options;

    if (!text || text.trim().length === 0) {
      log.info('TTS: 文本为空，跳过合成');
      return null;
    }

    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `shrew-tts-${Date.now()}.mp3`);
    this.tempFile = tempFile;

    return new Promise<string | null>((resolve) => {
      const totalTimer = setTimeout(() => {
        ws.close();
        resolve(null);
      }, TOTAL_TIMEOUT);

      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(totalTimer);
          ws.close();
          this.cleanup();
          resolve(null);
        }, { once: true });
      }

      const ws = new WebSocket(WS_URL, {
        headers: {
          'X-Api-App-Key': appId,
          'X-Api-Access-Key': accessToken,
          'X-Api-Resource-Id': RESOURCE_ID,
          'X-Api-Connect-Id': crypto.randomUUID(),
        },
      });

      let settled = false;
      const audioChunks: Buffer[] = [];

      const done = (result: string | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(totalTimer);
        resolve(result);
      };

      ws.on('error', (err) => {
        log.error('TTS: WebSocket 连接错误:', err.message);
        done(null);
      });

      ws.on('close', () => {
        if (!settled) {
          log.warn('TTS: WebSocket 意外关闭');
          done(null);
        }
      });

      const connectTimer = setTimeout(() => {
        ws.close();
        done(null);
      }, CONNECT_TIMEOUT);

      ws.on('open', () => {
        clearTimeout(connectTimer);
        log.info('TTS: WebSocket 已连接, 文本长度:', text.length);

        const config = JSON.stringify({
          user: { uid: 'shrew-app' },
          audio: {
            voice_type: 'zh_female_cancan',
            encoding: 'mp3',
            speed_ratio: 1.0,
          },
          request: {
            text,
            operation: 'query',
          },
        });

        const configPayload = zlib.gzipSync(Buffer.from(config));
        const configSize = Buffer.alloc(4);
        configSize.writeUInt32BE(configPayload.length, 0);

        ws.send(Buffer.concat([HEADER_FULL_CLIENT, configSize, configPayload]));
      });

      ws.on('message', (data: WebSocket.Data) => {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        if (buf.length < 4) return;

        const messageType = (buf[1] >> 4) & 0xf;

        if (messageType === 0xf) {
          if (buf.length >= 12) {
            const errorCode = buf.readUInt32BE(4);
            const errorMsgSize = buf.readUInt32BE(8);
            const errorMsg = buf.subarray(12, 12 + errorMsgSize).toString('utf-8');
            log.error('TTS: 服务端错误, code:', errorCode, 'msg:', errorMsg);
          }
          ws.close();
          done(null);
          return;
        }

        if (messageType === 0x9) {
          const flags = buf[1] & 0xf;
          const compression = buf[2] & 0xf;
          const payloadSize = buf.length > 8 ? buf.readUInt32BE(8) : 0;
          const payloadBuf = buf.subarray(12, 12 + payloadSize);

          if (flags === 0x1) {
            let audioData: Buffer;
            if (compression === 0x1) {
              audioData = zlib.gunzipSync(payloadBuf);
            } else {
              audioData = payloadBuf;
            }
            audioChunks.push(audioData);
          }

          if (flags === 0x3) {
            if (audioChunks.length === 0) {
              log.warn('TTS: 无音频数据返回');
              done(null);
              return;
            }

            const fullAudio = Buffer.concat(audioChunks);
            fs.writeFileSync(tempFile, fullAudio);
            log.info('TTS: 音频写入完成, 大小:', fullAudio.length, '路径:', tempFile);
            done(tempFile);
          }
        }
      });
    });
  }

  play(audioPath: string): Promise<void> {
    return new Promise((resolve) => {
      this.playProcess = spawn('afplay', [audioPath]);
      this.playProcess.on('close', () => {
        this.playProcess = null;
        resolve();
      });
      this.playProcess.on('error', (err) => {
        log.error('TTS: afplay 错误:', err.message);
        this.playProcess = null;
        resolve();
      });
    });
  }

  stop(): void {
    if (this.playProcess) {
      this.playProcess.kill('SIGTERM');
      this.playProcess = null;
    }
    this.cleanup();
  }

  private cleanup(): void {
    if (this.tempFile) {
      try { fs.unlinkSync(this.tempFile); } catch {}
      this.tempFile = null;
    }
  }

  get isPlaying(): boolean {
    return this.playProcess !== null;
  }
}
