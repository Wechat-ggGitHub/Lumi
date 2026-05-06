import WebSocket from 'ws';
import zlib from 'zlib';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { log } from '../src/lib/logger';
import { parseSentenceFromPayload } from './tts-sentence-parser';

const WS_URL = 'wss://openspeech.bytedance.com/api/v3/tts/bidirection';
const RESOURCE_ID = 'volc.service_type.10029';
const CONNECT_TIMEOUT = 10_000;
const TOTAL_TIMEOUT = 30_000;

export interface TtsOptions {
  appId: string;
  accessToken: string;
  text: string;
  signal?: AbortSignal;
}

export interface TtsSentence {
  text: string;
  startTime: number;
  endTime: number;
}

export interface TtsWord {
  word: string;
  startTime: number;
  endTime: number;
}

export interface TtsResult {
  audioPath: string;
  sentences: TtsSentence[];
  words: TtsWord[];
}

// V3 binary protocol header
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

// Full-client request with event number: type=0x1, flags=0x4
const HEADER_CLIENT_EVENT = makeHeader(0x1, 0x4, 0x1, 0x0);

// Event codes
const EVENT_START_CONNECTION = 1;
const EVENT_FINISH_CONNECTION = 2;
const EVENT_START_SESSION = 100;
const EVENT_FINISH_SESSION = 102;
const EVENT_TASK_REQUEST = 200;

// Server event codes
const EVENT_CONNECTION_STARTED = 50;
const EVENT_SESSION_STARTED = 150;
const EVENT_SESSION_FINISHED = 152;
const EVENT_TTS_SENTENCE_START = 350;
const EVENT_TTS_RESPONSE = 352;
const EVENT_TTS_SENTENCE_END = 351;

function buildEventMessage(eventCode: number, sessionId: string | null, payload: object): Buffer {
  const payloadJson = JSON.stringify(payload);
  const payloadBuf = Buffer.from(payloadJson);

  const parts: Buffer[] = [HEADER_CLIENT_EVENT];
  const eventBuf = Buffer.alloc(4);
  eventBuf.writeInt32BE(eventCode, 0);
  parts.push(eventBuf);

  if (sessionId !== null) {
    const sidBuf = Buffer.from(sessionId);
    const sidSizeBuf = Buffer.alloc(4);
    sidSizeBuf.writeUInt32BE(sidBuf.length, 0);
    parts.push(sidSizeBuf);
    parts.push(sidBuf);
  }

  const payloadSizeBuf = Buffer.alloc(4);
  payloadSizeBuf.writeUInt32BE(payloadBuf.length, 0);
  parts.push(payloadSizeBuf);
  parts.push(payloadBuf);

  return Buffer.concat(parts);
}

export class TtsService {
  private tempFile: string | null = null;

  async synthesize(options: TtsOptions): Promise<TtsResult | null> {
    const { appId, accessToken, text, signal } = options;

    if (!text || text.trim().length === 0) {
      log.info('TTS: 文本为空，跳过合成');
      return null;
    }

    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `shrew-tts-${Date.now()}.mp3`);
    this.tempFile = tempFile;

    return new Promise<TtsResult | null>((resolve) => {
      let settled = false;
      const audioChunks: Buffer[] = [];
      const sentences: TtsSentence[] = [];
      const allWords: TtsWord[] = [];
      let cumulativeTime = 0;
      let sessionId: string | null = null;

      const done = (result: TtsResult | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(totalTimer);
        resolve(result);
      };

      const totalTimer = setTimeout(() => {
        ws.close();
        done(null);
      }, TOTAL_TIMEOUT);

      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(totalTimer);
          ws.close();
          this.cleanup();
          done(null);
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

      const connectTimer = setTimeout(() => {
        ws.close();
        done(null);
      }, CONNECT_TIMEOUT);

      ws.on('error', (err) => {
        log.error('TTS: WebSocket 连接错误:', err.message);
        done(null);
      });

      ws.on('close', (code: number, reason: Buffer) => {
        if (!settled) {
          log.warn('TTS: WebSocket 意外关闭, code:', code, 'reason:', reason?.toString('utf-8'));
          if (audioChunks.length > 0) {
            const fullAudio = Buffer.concat(audioChunks);
            fs.writeFileSync(tempFile, fullAudio);
            log.info('TTS: 使用部分音频, 大小:', fullAudio.length, '句子数:', sentences.length);
            done({ audioPath: tempFile, sentences, words: allWords });
          } else {
            done(null);
          }
        }
      });

      ws.on('open', () => {
        clearTimeout(connectTimer);
        log.info('TTS: WebSocket 已连接, 文本长度:', text.length);

        // Step 1: StartConnection
        ws.send(buildEventMessage(EVENT_START_CONNECTION, null, {}));
      });

      ws.on('message', (data: WebSocket.Data) => {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        if (buf.length < 4) return;

        const messageType = (buf[1] >> 4) & 0xf;

        // Error
        if (messageType === 0xf) {
          if (buf.length >= 8) {
            const errorCode = buf.readUInt32BE(4);
            let errorMsg = '';
            if (buf.length > 8) {
              const compression = buf[2] & 0xf;
              const payloadBuf = buf.subarray(8);
              try {
                if (compression === 0x1) {
                  errorMsg = zlib.gunzipSync(payloadBuf).toString('utf-8');
                } else {
                  errorMsg = payloadBuf.toString('utf-8');
                }
              } catch {
                errorMsg = payloadBuf.toString('hex');
              }
            }
            log.error('TTS: 服务端错误, code:', errorCode, 'msg:', errorMsg);
          }
          ws.close();
          done(null);
          return;
        }

        // Server response (messageType 0x9)
        if (messageType === 0x9) {
          if (buf.length < 8) return;

          const eventCode = buf.readInt32BE(4);
          let offset = 8;

          // Read connection_id or session_id if present
          let idStr = '';
          if (offset + 4 <= buf.length) {
            const idSize = buf.readUInt32BE(offset);
            offset += 4;
            if (idSize > 0 && offset + idSize <= buf.length) {
              idStr = buf.subarray(offset, offset + idSize).toString('utf-8');
              offset += idSize;
            }
          }

          // Read payload
          let payload: any = {};
          if (offset + 4 <= buf.length) {
            const payloadSize = buf.readUInt32BE(offset);
            offset += 4;
            if (payloadSize > 0 && offset + payloadSize <= buf.length) {
              const compression = buf[2] & 0xf;
              const payloadBuf = buf.subarray(offset, offset + payloadSize);
              try {
                let payloadStr: string;
                if (compression === 0x1) {
                  payloadStr = zlib.gunzipSync(payloadBuf).toString('utf-8');
                } else {
                  payloadStr = payloadBuf.toString('utf-8');
                }
                payload = JSON.parse(payloadStr);
              } catch {
                // payload might not be JSON
              }
            }
          }

          switch (eventCode) {
            case EVENT_CONNECTION_STARTED:
              // Connection established, start session
              sessionId = `shrew-${Date.now()}`;
              const sessionPayload = {
                user: { uid: 'shrew-app' },
                event: EVENT_START_SESSION,
                namespace: 'BidirectionalTTS',
                req_params: {
                  speaker: 'zh_female_shuangkuaisisi_moon_bigtts',
                  audio_params: {
                    format: 'mp3',
                    sample_rate: 24000,
                    enable_timestamp: true,
                  },
                },
              };
              ws.send(buildEventMessage(EVENT_START_SESSION, sessionId, sessionPayload));
              break;

            case EVENT_SESSION_STARTED:
              // Session ready, send text
              const taskPayload = {
                event: EVENT_TASK_REQUEST,
                namespace: 'BidirectionalTTS',
                req_params: {
                  text,
                  speaker: 'zh_female_shuangkuaisisi_moon_bigtts',
                },
              };
              ws.send(buildEventMessage(EVENT_TASK_REQUEST, sessionId, taskPayload));
              // Immediately send FinishSession to indicate text is complete
              ws.send(buildEventMessage(EVENT_FINISH_SESSION, sessionId, {}));
              break;

            case EVENT_TTS_RESPONSE: {
              // Audio data
              const compression = buf[2] & 0xf;
              // For audio data, find the payload after session_id
              let audioOffset = 8; // skip header(4) + event(4)
              if (audioOffset + 4 <= buf.length) {
                const idSize = buf.readUInt32BE(audioOffset);
                audioOffset += 4 + idSize;
              }
              if (audioOffset + 4 <= buf.length) {
                const audioPayloadSize = buf.readUInt32BE(audioOffset);
                audioOffset += 4;
                if (audioPayloadSize > 0 && audioOffset + audioPayloadSize <= buf.length) {
                  const audioBuf = buf.subarray(audioOffset, audioOffset + audioPayloadSize);
                  if (compression === 0x1) {
                    audioChunks.push(zlib.gunzipSync(audioBuf));
                  } else {
                    audioChunks.push(audioBuf);
                  }
                }
              }
              break;
            }

            case EVENT_TTS_SENTENCE_END:
              log.info('TTS: SentenceEnd payload:', JSON.stringify(payload));
              {
                const parsed = parseSentenceFromPayload(payload);
                if (parsed) {
                  if (parsed.words && parsed.words.length > 0) {
                    for (const w of parsed.words) {
                      allWords.push({
                        word: w.word,
                        startTime: w.startTime,
                        endTime: w.endTime,
                      });
                    }
                    const lastWord = parsed.words[parsed.words.length - 1];
                    sentences.push({
                      text: parsed.text,
                      startTime: parsed.words[0].startTime,
                      endTime: lastWord.endTime,
                    });
                    cumulativeTime = lastWord.endTime;
                  } else {
                    sentences.push({
                      text: parsed.text,
                      startTime: cumulativeTime,
                      endTime: cumulativeTime + parsed.duration,
                    });
                    cumulativeTime += parsed.duration;
                  }
                }
              }
              break;

            case EVENT_SESSION_FINISHED:
              // All audio received
              if (audioChunks.length === 0) {
                log.warn('TTS: 无音频数据返回');
                ws.send(buildEventMessage(EVENT_FINISH_CONNECTION, null, {}));
                done(null);
                return;
              }
              const fullAudio = Buffer.concat(audioChunks);
              fs.writeFileSync(tempFile, fullAudio);
              log.info('TTS: 音频写入完成, 大小:', fullAudio.length, '路径:', tempFile, '句子数:', sentences.length);
              ws.send(buildEventMessage(EVENT_FINISH_CONNECTION, null, {}));
              done({ audioPath: tempFile, sentences, words: allWords });
              break;

            case 51: // ConnectionFailed
              log.error('TTS: 建连失败, payload:', JSON.stringify(payload));
              done(null);
              break;

            case 153: // SessionFailed
              log.error('TTS: 会话失败, payload:', JSON.stringify(payload));
              done(null);
              break;
          }
        }

        // Audio-only server response (messageType 0xb)
        if (messageType === 0xb) {
          const compression = buf[2] & 0xf;
          // payload after event(4) + session_id
          let audioOffset = 8;
          if (audioOffset + 4 <= buf.length) {
            const idSize = buf.readUInt32BE(audioOffset);
            audioOffset += 4 + idSize;
          }
          if (audioOffset + 4 <= buf.length) {
            const audioPayloadSize = buf.readUInt32BE(audioOffset);
            audioOffset += 4;
            if (audioPayloadSize > 0 && audioOffset + audioPayloadSize <= buf.length) {
              const audioBuf = buf.subarray(audioOffset, audioOffset + audioPayloadSize);
              if (compression === 0x1) {
                audioChunks.push(zlib.gunzipSync(audioBuf));
              } else {
                audioChunks.push(audioBuf);
              }
            }
          }
        }
      });
    });
  }

  stop(): void {
    this.cleanup();
  }

  private cleanup(): void {
    if (this.tempFile) {
      try { fs.unlinkSync(this.tempFile); } catch {}
      this.tempFile = null;
    }
  }
}
