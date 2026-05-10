import WebSocket from 'ws';
import fs from 'fs';
import zlib from 'zlib';
import { log } from './logger';

const WS_URL = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream';
const RESOURCE_ID = 'volc.seedasr.sauc.duration';
const CONNECT_TIMEOUT = 10_000;
const TOTAL_TIMEOUT = 30_000;
const CHUNK_DURATION_MS = 200;
const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2;
const CHANNELS = 1;
// 200ms of 16kHz 16bit mono audio = 6400 bytes
const CHUNK_BYTES = SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS * (CHUNK_DURATION_MS / 1000);

// Binary protocol byte constructors (big-endian)
function makeHeader(
  messageType: number,
  messageFlags: number,
  serialization: number,
  compression: number,
): Buffer {
  // byte 0: protocol version (4 bits) | header size (4 bits) = 0x11
  // byte 1: message type (4 bits) | flags (4 bits)
  // byte 2: serialization (4 bits) | compression (4 bits)
  // byte 3: reserved = 0x00
  return Buffer.from([
    0x11,
    (messageType << 4) | messageFlags,
    (serialization << 4) | compression,
    0x00,
  ]);
}

const HEADER_FULL_CLIENT = makeHeader(0x1, 0x0, 0x1, 0x1); // type=1 flags=0 json+gzip
const HEADER_AUDIO = (isLast: boolean) =>
  makeHeader(0x2, isLast ? 0x2 : 0x0, 0x0, 0x1); // type=2, flags=0or2, raw+gzip

// Message type from server
const MSG_SERVER_RESPONSE = 0x9;
const MSG_ERROR = 0xf;

export class DoubaoASR {
  private appId: string;
  private accessToken: string;

  constructor(appId: string, accessToken: string) {
    this.appId = appId;
    this.accessToken = accessToken;
  }

  async validateCredentials(): Promise<void> {
    log.info('豆包ASR: 验证凭证开始');
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(WS_URL, {
        headers: {
          'X-Api-App-Key': this.appId,
          'X-Api-Access-Key': this.accessToken,
          'X-Api-Resource-Id': RESOURCE_ID,
          'X-Api-Connect-Id': crypto.randomUUID(),
        },
      });

      const timer = setTimeout(() => {
        ws.close();
        reject(new Error('语音识别服务连接超时'));
      }, CONNECT_TIMEOUT);

      ws.on('open', () => {
        clearTimeout(timer);
        ws.close();
        log.info('豆包ASR: 凭证验证成功');
        resolve();
      });

      ws.on('error', (err) => {
        clearTimeout(timer);
        log.error('豆包ASR: 凭证验证失败:', err.message);
        reject(new Error('凭证无效或语音识别服务不可用'));
      });
    });
  }

  async transcribe(wavFilePath: string): Promise<string> {
    const wavBuffer = fs.readFileSync(wavFilePath);
    const pcmData = wavBuffer.subarray(44);
    log.info('豆包ASR: 开始转写, WAV大小:', wavBuffer.length, 'PCM大小:', pcmData.length);

    return new Promise<string>((resolve, reject) => {
      const totalTimer = setTimeout(() => {
        ws.close();
        reject(new Error('语音识别超时，请重试'));
      }, TOTAL_TIMEOUT);

      const ws = new WebSocket(WS_URL, {
        headers: {
          'X-Api-App-Key': this.appId,
          'X-Api-Access-Key': this.accessToken,
          'X-Api-Resource-Id': RESOURCE_ID,
          'X-Api-Connect-Id': crypto.randomUUID(),
        },
      });

      let settled = false;
      const done = (err: Error | null, result?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(totalTimer);
        if (err) reject(err);
        else resolve(result || '');
      };

      ws.on('error', (err) => {
        log.error('豆包ASR: WebSocket 连接错误:', err.message);
        done(new Error('语音识别服务连接失败，请检查网络'));
      });

      ws.on('close', (code, reason) => {
        if (!settled) {
          log.warn('豆包ASR: WebSocket 意外关闭, code:', code);
          done(new Error(`连接关闭: ${code} ${reason}`));
        }
      });

      const connectTimer = setTimeout(() => {
        ws.close();
        done(new Error('语音识别服务连接失败，请检查网络'));
      }, CONNECT_TIMEOUT);

      ws.on('open', () => {
        clearTimeout(connectTimer);
        log.info('豆包ASR: WebSocket 已连接, 开始发送音频数据');

        // 1. Send full client request (JSON config, gzip compressed)
        const config = JSON.stringify({
          user: { uid: 'aiva-app' },
          audio: {
            format: 'pcm',
            rate: SAMPLE_RATE,
            bits: BYTES_PER_SAMPLE * 8,
            channel: CHANNELS,
          },
          request: {
            model_name: 'bigmodel',
            enable_itn: true,
            enable_punc: true,
            enable_ddc: true,
            result_type: 'full',
          },
        });

        const configPayload = zlib.gzipSync(Buffer.from(config));
        const configSize = Buffer.alloc(4);
        configSize.writeUInt32BE(configPayload.length, 0);

        ws.send(Buffer.concat([HEADER_FULL_CLIENT, configSize, configPayload]));

        // 2. Send audio chunks
        let offset = 0;
        while (offset < pcmData.length) {
          const end = Math.min(offset + CHUNK_BYTES, pcmData.length);
          const chunk = pcmData.subarray(offset, end);
          const isLast = end >= pcmData.length;

          const header = HEADER_AUDIO(isLast);
          const compressed = zlib.gzipSync(chunk);
          const sizeBuf = Buffer.alloc(4);
          sizeBuf.writeUInt32BE(compressed.length, 0);

          ws.send(Buffer.concat([header, sizeBuf, compressed]));
          offset = end;
        }

        // Edge case: empty PCM data — send last-empty packet
        if (pcmData.length === 0) {
          const header = HEADER_AUDIO(true);
          const compressed = zlib.gzipSync(Buffer.alloc(0));
          const sizeBuf = Buffer.alloc(4);
          sizeBuf.writeUInt32BE(compressed.length, 0);
          ws.send(Buffer.concat([header, sizeBuf, compressed]));
        }
      });

      ws.on('message', (data: WebSocket.Data) => {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        if (buf.length < 4) return;

        const messageType = (buf[1] >> 4) & 0xf;

        if (messageType === MSG_ERROR) {
          if (buf.length >= 12) {
            const errorCode = buf.readUInt32BE(4);
            const errorMsgSize = buf.readUInt32BE(8);
            const errorMsg = buf.subarray(12, 12 + errorMsgSize).toString('utf-8');
            log.error('豆包ASR: 服务端错误, code:', errorCode, 'msg:', errorMsg);
            done(new Error(mapErrorCode(errorCode, errorMsg)));
          } else {
            log.error('豆包ASR: 服务端错误 (帧过短)');
            done(new Error('语音识别服务返回错误'));
          }
          ws.close();
          return;
        }

        if (messageType === MSG_SERVER_RESPONSE) {
          // Response: 4-byte header + 4-byte sequence + 4-byte payload size + payload
          if (buf.length < 12) return;

          const flags = buf[1] & 0xf;
          const compression = buf[2] & 0xf;
          const payloadSize = buf.readUInt32BE(8);
          const payloadBuf = buf.subarray(12, 12 + payloadSize);

          let payloadStr: string;
          if (compression === 0x1) {
            payloadStr = zlib.gunzipSync(payloadBuf).toString('utf-8');
          } else {
            payloadStr = payloadBuf.toString('utf-8');
          }

          const payload = JSON.parse(payloadStr);

          // Check for error in response payload
          if (payload.code && payload.code !== 0) {
            log.error('豆包ASR: 响应错误, code:', payload.code, 'msg:', payload.message);
            done(new Error(mapErrorCode(payload.code, payload.message || '')));
            ws.close();
            return;
          }

          if (flags === 0x3) {
            const text = payload?.result?.text?.trim() || '';
            log.info('豆包ASR: 最终转写结果, 长度:', text.length);
            done(null, text);
            ws.close();
          }
        }
      });
    });
  }
}

function mapErrorCode(code: number, serverMsg: string): string {
  switch (code) {
    case 45000001: return '请求参数错误';
    case 45000002: return '音频为空，请重新录制';
    case 45000081: return '等待超时';
    case 45000151: return '音频格式不正确';
    case 55000031: return '服务繁忙，请稍后重试';
    default:
      if (Math.floor(code / 100000) === 550) return '语音识别服务内部错误';
      return `语音识别失败: ${serverMsg || code}`;
  }
}
