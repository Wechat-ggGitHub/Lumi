#!/usr/bin/env node
import http from 'http';
import { randomUUID } from 'crypto';
import { execSync } from 'child_process';
import zlib from 'zlib';

// Dynamic import for ws (ESM)
const { default: WebSocket } = await import('ws');

const PORT = 3456;

// ============================================================
// V1 Standard TTS (BV voices)
// Endpoint: wss://openspeech.bytedance.com/api/v1/tts/ws_binary
// ============================================================

// V1 header: version=1, header_size=1, msg_type=1(full client), flags=0, serialization=1(JSON), compression=1(gzip)
const V1_HEADER = Buffer.from([0x11, 0x10, 0x11, 0x00]);

function synthesizeV1(text, voiceType, appId, accessToken, cluster) {
  return new Promise((resolve, reject) => {
    const audioChunks = [];
    let settled = false;

    const done = (err, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(result);
    };

    const timer = setTimeout(() => {
      ws.close();
      done(new Error('V1 TTS timeout'));
    }, 30000);

    const ws = new WebSocket('wss://openspeech.bytedance.com/api/v1/tts/ws_binary', {
      headers: {
        Authorization: `Bearer; ${accessToken}`,
      },
    });

    ws.on('error', (err) => done(new Error(`V1 WebSocket error: ${err.message}`)));
    ws.on('close', () => { if (!settled) done(new Error('V1 WebSocket closed unexpectedly')); });

    ws.on('open', () => {
      const requestJson = {
        app: { appid: appId, token: accessToken, cluster: cluster || 'volcano_tts' },
        user: { uid: 'tts-demo' },
        audio: {
          voice_type: voiceType,
          encoding: 'mp3',
          speed_ratio: 1.0,
          volume_ratio: 1.0,
          pitch_ratio: 1.0,
        },
        request: {
          reqid: randomUUID(),
          text,
          text_type: 'plain',
          operation: 'submit',
        },
      };

      const payloadBuf = zlib.gzipSync(Buffer.from(JSON.stringify(requestJson)));
      const sizeBuf = Buffer.alloc(4);
      sizeBuf.writeUInt32BE(payloadBuf.length, 0);

      ws.send(Buffer.concat([V1_HEADER, sizeBuf, payloadBuf]));
    });

    ws.on('message', (data) => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (buf.length < 4) return;

      const headerSize = (buf[0] & 0x0f) * 4;
      const messageType = (buf[1] >> 4) & 0xf;
      const messageFlags = buf[1] & 0x0f;
      const compression = buf[2] & 0x0f;
      const payload = buf.subarray(headerSize);

      // Error (0xf)
      if (messageType === 0xf) {
        if (payload.length >= 8) {
          const code = payload.readUInt32BE(0);
          const msgSize = payload.readUInt32BE(4);
          let errorMsg = payload.subarray(8);
          if (compression === 0x1) {
            try { errorMsg = zlib.gunzipSync(errorMsg); } catch {}
          }
          done(new Error(`V1 error code=${code}: ${errorMsg.toString('utf-8')}`));
        } else {
          done(new Error('V1 unknown error'));
        }
        return;
      }

      // Audio-only server response (0xb)
      if (messageType === 0xb) {
        if (messageFlags === 0) return; // ACK, no data

        // sequence number (4 bytes) + payload size (4 bytes) + payload
        if (payload.length < 8) return;
        const seqNum = payload.readInt32BE(0);
        const payloadSize = payload.readUInt32BE(4);
        const audioData = payload.subarray(8, 8 + payloadSize);

        if (audioData.length > 0) {
          audioChunks.push(audioData);
        }

        // Last message (seq < 0)
        if (seqNum < 0) {
          ws.close();
          if (audioChunks.length === 0) {
            done(new Error('V1 TTS: no audio data'));
          } else {
            done(null, Buffer.concat(audioChunks));
          }
        }
      }

      // Frontend server response (0xc)
      if (messageType === 0xc) {
        if (payload.length >= 4) {
          const msgSize = payload.readUInt32BE(0);
          let msgData = payload.subarray(4, 4 + msgSize);
          if (compression === 0x1) {
            try { msgData = zlib.gunzipSync(msgData); } catch {}
          }
          try {
            const msg = JSON.parse(msgData.toString('utf-8'));
            if (msg.code && msg.code !== 3000) {
              done(new Error(`V1 TTS error: ${msg.message || JSON.stringify(msg)}`));
            }
          } catch {}
        }
      }
    });
  });
}

// ============================================================
// V3 Bidirectional TTS (大模型 voices)
// Endpoint: wss://openspeech.bytedance.com/api/v3/tts/bidirection
// ============================================================

const V3_RESOURCE_ID = 'volc.service_type.10029';

function makeV3Header(messageType, messageFlags, serialization, compression) {
  return Buffer.from([
    0x11,
    (messageType << 4) | messageFlags,
    (serialization << 4) | compression,
    0x00,
  ]);
}

const V3_HEADER_CLIENT_EVENT = makeV3Header(0x1, 0x4, 0x1, 0x0);

const V3_EVENT_START_CONNECTION = 1;
const V3_EVENT_FINISH_CONNECTION = 2;
const V3_EVENT_START_SESSION = 100;
const V3_EVENT_FINISH_SESSION = 102;
const V3_EVENT_TASK_REQUEST = 200;

function buildV3EventMessage(eventCode, sessionId, payload) {
  const payloadBuf = Buffer.from(JSON.stringify(payload));
  const parts = [V3_HEADER_CLIENT_EVENT];
  const eventBuf = Buffer.alloc(4);
  eventBuf.writeInt32BE(eventCode, 0);
  parts.push(eventBuf);

  if (sessionId !== null) {
    const sidBuf = Buffer.from(sessionId);
    const sidSizeBuf = Buffer.alloc(4);
    sidSizeBuf.writeUInt32BE(sidBuf.length, 0);
    parts.push(sidSizeBuf, sidBuf);
  }

  const payloadSizeBuf = Buffer.alloc(4);
  payloadSizeBuf.writeUInt32BE(payloadBuf.length, 0);
  parts.push(payloadSizeBuf, payloadBuf);

  return Buffer.concat(parts);
}

function synthesizeV3(text, speaker, appId, accessToken) {
  return new Promise((resolve, reject) => {
    const audioChunks = [];
    let sessionId = null;
    let settled = false;

    const done = (err, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(totalTimer);
      if (err) reject(err);
      else resolve(result);
    };

    const totalTimer = setTimeout(() => {
      ws.close();
      done(new Error('V3 TTS timeout'));
    }, 30000);

    const ws = new WebSocket('wss://openspeech.bytedance.com/api/v3/tts/bidirection', {
      headers: {
        'X-Api-App-Key': appId,
        'X-Api-Access-Key': accessToken,
        'X-Api-Resource-Id': V3_RESOURCE_ID,
        'X-Api-Connect-Id': randomUUID(),
      },
    });

    ws.on('error', (err) => done(new Error(`V3 WebSocket error: ${err.message}`)));
    ws.on('close', () => { if (!settled) done(new Error('V3 WebSocket closed unexpectedly')); });

    ws.on('open', () => {
      ws.send(buildV3EventMessage(V3_EVENT_START_CONNECTION, null, {}));
    });

    ws.on('message', (data) => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (buf.length < 4) return;

      const messageType = (buf[1] >> 4) & 0xf;

      if (messageType === 0xf) {
        let errorMsg = 'Unknown V3 error';
        if (buf.length >= 8) {
          const errorCode = buf.readUInt32BE(4);
          if (buf.length > 8) {
            const compression = buf[2] & 0xf;
            const payloadBuf = buf.subarray(8);
            try {
              errorMsg = compression === 0x1
                ? zlib.gunzipSync(payloadBuf).toString('utf-8')
                : payloadBuf.toString('utf-8');
            } catch { errorMsg = payloadBuf.toString('hex'); }
          }
          errorMsg = `code=${errorCode} ${errorMsg}`;
        }
        ws.close();
        done(new Error(`V3 TTS error: ${errorMsg}`));
        return;
      }

      if (messageType === 0x9) {
        if (buf.length < 8) return;
        const eventCode = buf.readInt32BE(4);
        let offset = 8;
        let idStr = '';
        if (offset + 4 <= buf.length) {
          const idSize = buf.readUInt32BE(offset);
          offset += 4;
          if (idSize > 0 && offset + idSize <= buf.length) {
            idStr = buf.subarray(offset, offset + idSize).toString('utf-8');
            offset += idSize;
          }
        }

        switch (eventCode) {
          case 50: // ConnectionStarted
            sessionId = `demo-${Date.now()}`;
            ws.send(buildV3EventMessage(V3_EVENT_START_SESSION, sessionId, {
              user: { uid: 'tts-demo' },
              event: V3_EVENT_START_SESSION,
              namespace: 'BidirectionalTTS',
              req_params: {
                speaker,
                audio_params: { format: 'mp3', sample_rate: 24000 },
              },
            }));
            break;

          case 150: // SessionStarted
            ws.send(buildV3EventMessage(V3_EVENT_TASK_REQUEST, sessionId, {
              event: V3_EVENT_TASK_REQUEST,
              namespace: 'BidirectionalTTS',
              req_params: { text, speaker },
            }));
            ws.send(buildV3EventMessage(V3_EVENT_FINISH_SESSION, sessionId, {}));
            break;

          case 352: // TtsResponse (audio in JSON payload)
            // Audio data is in the payload, try to extract
            {
              let audioOffset = 8;
              if (audioOffset + 4 <= buf.length) {
                const idSize = buf.readUInt32BE(audioOffset);
                audioOffset += 4 + idSize;
              }
              if (audioOffset + 4 <= buf.length) {
                const audioPayloadSize = buf.readUInt32BE(audioOffset);
                audioOffset += 4;
                if (audioPayloadSize > 0 && audioOffset + audioPayloadSize <= buf.length) {
                  const compression = buf[2] & 0xf;
                  const audioBuf = buf.subarray(audioOffset, audioOffset + audioPayloadSize);
                  audioChunks.push(compression === 0x1 ? zlib.gunzipSync(audioBuf) : audioBuf);
                }
              }
            }
            break;

          case 152: // SessionFinished
            ws.send(buildV3EventMessage(V3_EVENT_FINISH_CONNECTION, null, {}));
            if (audioChunks.length === 0) {
              done(new Error('V3 TTS: no audio data'));
            } else {
              done(null, Buffer.concat(audioChunks));
            }
            break;

          case 51: done(new Error('V3 connection failed')); break;
          case 153: done(new Error('V3 session failed')); break;
        }
      }

      // Audio-only (0xb)
      if (messageType === 0xb) {
        const compression = buf[2] & 0xf;
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
            audioChunks.push(compression === 0x1 ? zlib.gunzipSync(audioBuf) : audioBuf);
          }
        }
      }
    });
  });
}

// ============================================================
// Voice Data
// ============================================================

const VOICES = {
  '推荐免费': [
    { name: '灿灿', id: 'BV700_streaming', gender: '女' },
    { name: '通用女声', id: 'BV001_streaming', gender: '女' },
    { name: '通用男声', id: 'BV002_streaming', gender: '男' },
    { name: '擎苍', id: 'BV701_streaming', gender: '男' },
    { name: '通用赘婿', id: 'BV119_streaming', gender: '男' },
    { name: '儒雅青年', id: 'BV102_streaming', gender: '男' },
    { name: '甜宠少御', id: 'BV113_streaming', gender: '女' },
    { name: '古风少御', id: 'BV115_streaming', gender: '女' },
    { name: '亲切女声', id: 'BV007_streaming', gender: '女' },
    { name: '阳光男声', id: 'BV056_streaming', gender: '男' },
    { name: '活泼女声', id: 'BV005_streaming', gender: '女' },
    { name: '奶气萌娃', id: 'BV051_streaming', gender: '童' },
    { name: '知性姐姐-双语', id: 'BV034_streaming', gender: '女' },
    { name: '温柔小哥', id: 'BV033_streaming', gender: '男' },
    { name: '东北老铁', id: 'BV021_streaming', gender: '男' },
    { name: '重庆小伙', id: 'BV019_streaming', gender: '男' },
    { name: '广西表哥', id: 'BV213_streaming', gender: '男' },
    { name: '活力女声-Ariana', id: 'BV503_streaming', gender: '女' },
    { name: '活力男声-Jackson', id: 'BV504_streaming', gender: '男' },
    { name: '气质女声', id: 'BV522_streaming', gender: '女' },
    { name: '日语男声', id: 'BV524_streaming', gender: '男' },
  ],
  '通用场景': [
    { name: '灿灿 2.0', id: 'BV700_V2_streaming', gender: '女' },
    { name: '炀炀', id: 'BV705_streaming', gender: '男' },
    { name: '擎苍 2.0', id: 'BV701_V2_streaming', gender: '男' },
    { name: '通用女声 2.0', id: 'BV001_V2_streaming', gender: '女' },
    { name: '超自然-梓梓 2.0', id: 'BV406_V2_streaming', gender: '女' },
    { name: '超自然-梓梓', id: 'BV406_streaming', gender: '女' },
    { name: '超自然-燃燃 2.0', id: 'BV407_V2_streaming', gender: '男' },
    { name: '超自然-燃燃', id: 'BV407_streaming', gender: '男' },
    { name: '开朗青年', id: 'BV004_streaming', gender: '男' },
    { name: '霸气青叔', id: 'BV107_streaming', gender: '男' },
    { name: '质朴青年', id: 'BV100_streaming', gender: '男' },
  ],
  '有声阅读': [
    { name: '擎苍', id: 'BV701_streaming', gender: '男' },
    { name: '阳光青年', id: 'BV123_streaming', gender: '男' },
    { name: '反卷青年', id: 'BV120_streaming', gender: '男' },
    { name: '通用赘婿', id: 'BV119_streaming', gender: '男' },
    { name: '古风少御', id: 'BV115_streaming', gender: '女' },
    { name: '温柔淑女', id: 'BV104_streaming', gender: '女' },
    { name: '甜宠少御', id: 'BV113_streaming', gender: '女' },
    { name: '儒雅青年', id: 'BV102_streaming', gender: '男' },
  ],
  '智能助手': [
    { name: '甜美小源', id: 'BV405_streaming', gender: '女' },
    { name: '知性女声', id: 'BV009_streaming', gender: '女' },
    { name: '亲切男声', id: 'BV008_streaming', gender: '男' },
    { name: '诚诚', id: 'BV419_streaming', gender: '男' },
    { name: '童童', id: 'BV415_streaming', gender: '女' },
  ],
  '特色音色': [
    { name: '奶气萌娃', id: 'BV051_streaming', gender: '童' },
    { name: '动漫海绵', id: 'BV063_streaming', gender: '?' },
    { name: '动漫海星', id: 'BV417_streaming', gender: '?' },
    { name: '动漫小新', id: 'BV050_streaming', gender: '童' },
    { name: '天才童声', id: 'BV061_streaming', gender: '童' },
    { name: '小萝莉', id: 'BV064_streaming', gender: '女' },
    { name: '说唱小哥', id: 'BR001_streaming', gender: '男' },
  ],
  '视频配音': [
    { name: '译制片男声', id: 'BV408_streaming', gender: '男' },
    { name: '懒小羊', id: 'BV426_streaming', gender: '?' },
    { name: '清新文艺女声', id: 'BV428_streaming', gender: '女' },
    { name: '鸡汤女声', id: 'BV403_streaming', gender: '女' },
    { name: '活力解说男', id: 'BV410_streaming', gender: '男' },
    { name: '影视解说小帅', id: 'BV411_streaming', gender: '男' },
    { name: '解说小帅-多情感', id: 'BV437_streaming', gender: '男' },
    { name: '影视解说小美', id: 'BV412_streaming', gender: '女' },
    { name: '沉稳解说男', id: 'BV142_streaming', gender: '男' },
    { name: '潇洒青年', id: 'BV143_streaming', gender: '男' },
    { name: '直播一姐', id: 'BV418_streaming', gender: '女' },
    { name: '纨绔青年', id: 'BV159_streaming', gender: '男' },
  ],
  '广告/新闻': [
    { name: '促销男声', id: 'BV401_streaming', gender: '男' },
    { name: '促销女声', id: 'BV402_streaming', gender: '女' },
    { name: '磁性男声', id: 'BV006_streaming', gender: '男' },
    { name: '新闻女声', id: 'BV011_streaming', gender: '女' },
    { name: '新闻男声', id: 'BV012_streaming', gender: '男' },
    { name: '智慧老者', id: 'BV158_streaming', gender: '男' },
    { name: '慈爱姥姥', id: 'BV157_streaming', gender: '女' },
  ],
  '方言': [
    { name: '东北老铁', id: 'BV021_streaming', gender: '男' },
    { name: '东北丫头', id: 'BV020_streaming', gender: '女' },
    { name: '方言灿灿', id: 'BV704_streaming', gender: '女' },
    { name: '西安佟掌柜', id: 'BV210_streaming', gender: '男' },
    { name: '沪上阿姐', id: 'BV217_streaming', gender: '女' },
    { name: '广西表哥', id: 'BV213_streaming', gender: '男' },
    { name: '甜美台妹', id: 'BV025_streaming', gender: '女' },
    { name: '台普男声', id: 'BV227_streaming', gender: '男' },
    { name: '港剧男神', id: 'BV026_streaming', gender: '男' },
    { name: '广东女仔', id: 'BV424_streaming', gender: '女' },
    { name: '重庆小伙', id: 'BV019_streaming', gender: '男' },
    { name: '重庆幺妹儿', id: 'BV423_streaming', gender: '女' },
    { name: '长沙靓女', id: 'BV216_streaming', gender: '女' },
    { name: '湖南妹坨', id: 'BV226_streaming', gender: '女' },
  ],
  '多语种': [
    { name: '慵懒女声-Ava', id: 'BV511_streaming', gender: '女' },
    { name: '活力女声-Ariana', id: 'BV503_streaming', gender: '女' },
    { name: '活力男声-Jackson', id: 'BV504_streaming', gender: '男' },
    { name: '天才少女', id: 'BV421_streaming', gender: '女' },
    { name: 'Stefan', id: 'BV702_streaming', gender: '男' },
    { name: '亲切女声-Anna', id: 'BV040_streaming', gender: '女' },
    { name: '元气少女', id: 'BV520_streaming', gender: '女' },
    { name: '萌系少女', id: 'BV521_streaming', gender: '女' },
    { name: '日语男声', id: 'BV524_streaming', gender: '男' },
  ],
  '大模型 (V3)': [
    { name: '双快思思 (Moon)', id: 'zh_female_shuangkuaisisi_moon_bigtts', gender: '女', v3: true },
    { name: '傲娇公子 (SC-2.0)', id: 'saturn_zh_male_aojiaogongzi_tob', gender: '男', v3: true },
    { name: '傲娇精英 (SC-2.0)', id: 'saturn_zh_male_aojiaojingying_tob', gender: '男', v3: true },
  ],
};

// ============================================================
// HTTP Server
// ============================================================

function generateHTML() {
  const voicesJSON = JSON.stringify(VOICES);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TTS 音色试听</title>
<script src="https://cdn.tailwindcss.com"><\/script>
<style>
  body { background: #0f172a; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 12px 16px; transition: all 0.2s; }
  .card:hover { border-color: #6366f1; background: #1e293b; }
  .card.playing { border-color: #22c55e; box-shadow: 0 0 12px rgba(34,197,94,0.2); }
  .card.error { border-color: #ef4444; }
  .btn { background: #6366f1; color: white; border: none; border-radius: 8px; padding: 6px 14px; cursor: pointer; font-size: 14px; transition: all 0.15s; }
  .btn:hover { background: #818cf8; }
  .btn:disabled { background: #475569; cursor: not-allowed; }
  .btn-stop { background: #ef4444; }
  .btn-stop:hover { background: #f87171; }
  .tab-btn { padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 14px; background: transparent; border: 1px solid #334155; color: #94a3b8; transition: all 0.15s; }
  .tab-btn.active { background: #6366f1; border-color: #6366f1; color: white; }
  .tab-btn:hover:not(.active) { border-color: #6366f1; color: #c7d2fe; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; }
  .badge-f { background: #831843; color: #f9a8d4; }
  .badge-m { background: #1e3a5f; color: #93c5fd; }
  .badge-c { background: #064e3b; color: #6ee7b7; }
  .badge-v3 { background: #7c2d12; color: #fdba74; }
  .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid #475569; border-top-color: #6366f1; border-radius: 50%; animation: spin 0.6s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  input, textarea { background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 8px 12px; color: #e2e8f0; font-size: 14px; outline: none; }
  input:focus, textarea:focus { border-color: #6366f1; }
  .voice-id { font-family: 'SF Mono', Monaco, monospace; font-size: 11px; color: #64748b; word-break: break-all; }
</style>
</head>
<body class="min-h-screen p-6">
<div class="max-w-6xl mx-auto">
  <h1 class="text-2xl font-bold mb-6">TTS 音色试听工具</h1>

  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
    <div>
      <label class="block text-sm text-slate-400 mb-1">App ID</label>
      <input id="appId" type="text" class="w-full" placeholder="火山引擎 App ID" />
    </div>
    <div>
      <label class="block text-sm text-slate-400 mb-1">Access Token</label>
      <input id="accessToken" type="password" class="w-full" placeholder="火山引擎 Access Token" />
    </div>
    <div>
      <label class="block text-sm text-slate-400 mb-1">Cluster <span class="text-slate-500">(V1必填)</span></label>
      <input id="cluster" type="text" class="w-full" placeholder="如 volcano_tts" value="volcano_tts" />
    </div>
    <div>
      <label class="block text-sm text-slate-400 mb-1">试听文本</label>
      <input id="ttsText" type="text" class="w-full" value="你好，我是豆包语音助手，很高兴为你服务。" />
    </div>
  </div>

  <div class="flex gap-2 mb-2 items-center flex-wrap">
    <span class="text-sm text-slate-400">自定义音色：</span>
    <input id="customId" type="text" class="w-64" placeholder="输入 voice_type 或 speaker ID" />
    <select id="customApi" class="text-sm" style="background:#0f172a;border:1px solid #334155;border-radius:8px;padding:6px 10px;color:#e2e8f0;">
      <option value="v1">V1 标准 (BV系列)</option>
      <option value="v3">V3 大模型</option>
    </select>
    <button class="btn" onclick="playCustom()">试听</button>
  </div>

  <div class="flex gap-2 mb-6 flex-wrap" id="tabs"></div>

  <div id="voiceGrid" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3"></div>
</div>

<div id="statusBar" class="fixed bottom-4 right-4 bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-sm hidden">
  <span id="statusText"></span>
</div>

<script>
const VOICES = ${voicesJSON};
const categories = Object.keys(VOICES);
let activeTab = categories[0];
let currentAudio = null;
let currentCard = null;

function renderTabs() {
  const tabsEl = document.getElementById('tabs');
  tabsEl.innerHTML = categories.map(cat => {
    const count = VOICES[cat].length;
    const isActive = cat === activeTab;
    return '<button class="tab-btn' + (isActive ? ' active' : '') + '" onclick="switchTab(\\''+cat+'\\')">' + cat + ' (' + count + ')</button>';
  }).join('');
}

function genderBadge(g) {
  if (g === '女') return '<span class="badge badge-f">女</span>';
  if (g === '男') return '<span class="badge badge-m">男</span>';
  if (g === '童') return '<span class="badge badge-c">童</span>';
  return '';
}

function renderGrid() {
  const grid = document.getElementById('voiceGrid');
  const voices = VOICES[activeTab] || [];
  grid.innerHTML = voices.map((v, i) => {
    const isV3 = v.v3 ? true : false;
    return '<div class="card" id="card-' + activeTab + '-' + i + '">' +
      '<div class="flex items-center justify-between mb-1">' +
        '<span class="font-medium">' + v.name + '</span>' +
        '<div class="flex items-center gap-1">' +
          genderBadge(v.gender) +
          (isV3 ? '<span class="badge badge-v3">V3</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="voice-id mb-2">' + v.id + '</div>' +
      '<div class="flex items-center gap-2">' +
        '<button class="btn" id="btn-' + activeTab + '-' + i + '" onclick="playVoice(\\'' + activeTab + '\\', ' + i + ')">播放</button>' +
        '<span id="spinner-' + activeTab + '-' + i + '" class="hidden"><span class="spinner"></span></span>' +
        '<span id="error-' + activeTab + '-' + i + '" class="text-red-400 text-xs"></span>' +
      '</div>' +
    '</div>';
  }).join('');
}

function switchTab(cat) {
  activeTab = cat;
  renderTabs();
  renderGrid();
}

function getCredentials() {
  const appId = document.getElementById('appId').value.trim();
  const accessToken = document.getElementById('accessToken').value.trim();
  if (!appId || !accessToken) {
    alert('请先输入 App ID 和 Access Token');
    return null;
  }
  return { appId, accessToken };
}

function stopCurrent() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (currentCard) {
    currentCard.classList.remove('playing');
    const btn = currentCard.querySelector('.btn');
    if (btn) { btn.textContent = '播放'; btn.classList.remove('btn-stop'); btn.disabled = false; }
    currentCard = null;
  }
}

function showStatus(msg) {
  const bar = document.getElementById('statusBar');
  document.getElementById('statusText').textContent = msg;
  bar.classList.remove('hidden');
}

function hideStatus() {
  document.getElementById('statusBar').classList.add('hidden');
}

async function synthesize(voiceId, isV3) {
  const creds = getCredentials();
  if (!creds) return null;
  const text = document.getElementById('ttsText').value.trim() || '你好，我是豆包语音助手。';
  const cluster = document.getElementById('cluster').value.trim();
  showStatus('正在合成: ' + voiceId + ' ...');
  const res = await fetch('/api/synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiType: isV3 ? 'v3' : 'v1',
      speaker: voiceId,
      text,
      appId: creds.appId,
      accessToken: creds.accessToken,
      cluster,
    }),
  });
  const data = await res.json();
  hideStatus();
  if (data.error) throw new Error(data.error);
  return data.audio;
}

async function playVoice(cat, index) {
  const voice = VOICES[cat][index];
  const cardId = 'card-' + cat + '-' + index;
  const btnId = 'btn-' + cat + '-' + index;
  const spinnerId = 'spinner-' + cat + '-' + index;
  const errorId = 'error-' + cat + '-' + index;
  const card = document.getElementById(cardId);
  const btn = document.getElementById(btnId);
  const spinner = document.getElementById(spinnerId);
  const errorEl = document.getElementById(errorId);

  if (card.classList.contains('playing')) {
    stopCurrent();
    return;
  }

  stopCurrent();
  errorEl.textContent = '';
  card.classList.remove('error');
  btn.disabled = true;
  btn.textContent = '合成中...';
  spinner.classList.remove('hidden');

  try {
    const base64 = await synthesize(voice.id, voice.v3);
    if (!base64) throw new Error('无音频数据');
    const audio = new Audio('data:audio/mp3;base64,' + base64);
    currentAudio = audio;
    currentCard = card;
    card.classList.add('playing');
    btn.textContent = '停止';
    btn.classList.add('btn-stop');
    btn.disabled = false;

    audio.onended = () => {
      card.classList.remove('playing');
      btn.textContent = '播放';
      btn.classList.remove('btn-stop');
      currentAudio = null;
      currentCard = null;
    };
    audio.onerror = () => {
      throw new Error('音频播放失败');
    };
    audio.play();
  } catch (err) {
    card.classList.add('error');
    errorEl.textContent = err.message;
    btn.textContent = '播放';
    btn.disabled = false;
  } finally {
    spinner.classList.add('hidden');
  }
}

async function playCustom() {
  const id = document.getElementById('customId').value.trim();
  if (!id) { alert('请输入音色 ID'); return; }
  const isV3 = document.getElementById('customApi').value === 'v3';
  stopCurrent();
  showStatus('正在合成: ' + id + ' ...');
  try {
    const base64 = await synthesize(id, isV3);
    hideStatus();
    if (!base64) throw new Error('无音频数据');
    const audio = new Audio('data:audio/mp3;base64,' + base64);
    currentAudio = audio;
    audio.play();
  } catch (err) {
    hideStatus();
    alert('合成失败: ' + err.message);
  }
}

renderTabs();
renderGrid();
<\/script>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(generateHTML());
    return;
  }

  if (req.method === 'POST' && req.url === '/api/synthesize') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const { apiType, speaker, text, appId, accessToken, cluster } = JSON.parse(body);
        if (!speaker || !text || !appId || !accessToken) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing required fields' }));
          return;
        }

        let audioBuffer;
        if (apiType === 'v3') {
          audioBuffer = await synthesizeV3(text, speaker, appId, accessToken);
        } else {
          audioBuffer = await synthesizeV1(text, speaker, appId, accessToken, cluster);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ audio: audioBuffer.toString('base64') }));
      } catch (err) {
        console.error('Synthesis error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`TTS 音色试听工具已启动: ${url}`);
  try {
    execSync(`open "${url}"`, { stdio: 'ignore' });
  } catch {
    console.log('请在浏览器中手动打开上述地址');
  }
});
