import WebSocket from 'ws'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { TtsProvider, TtsResult } from './types'
import { TtsSentence, TtsWord } from './volcengine-tts'
import { log } from '../../src/lib/logger'

const WS_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference'
const CONNECT_TIMEOUT = 10_000
const TOTAL_TIMEOUT = 30_000

export class AliyunTts implements TtsProvider {
  private apiKey: string
  private tempFile: string | null = null

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async synthesize(text: string, signal?: AbortSignal): Promise<TtsResult | null> {
    if (!text || text.trim().length === 0) {
      log.info('AliyunTTS: 文本为空，跳过合成')
      return null
    }

    const tempFile = path.join(os.tmpdir(), `aiva-tts-${Date.now()}.mp3`)
    this.tempFile = tempFile

    return new Promise<TtsResult | null>((resolve) => {
      let settled = false
      const audioChunks: Buffer[] = []
      const sentences: TtsSentence[] = []
      const allWords: TtsWord[] = []
      const taskId = crypto.randomUUID()
      let taskStarted = false

      const done = (result: TtsResult | null) => {
        if (settled) return
        settled = true
        clearTimeout(totalTimer)
        clearTimeout(connectTimer)
        resolve(result)
      }

      const totalTimer = setTimeout(() => { ws.close(); done(null) }, TOTAL_TIMEOUT)

      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(totalTimer)
          ws.close()
          this.cleanup()
          done(null)
        }, { once: true })
      }

      const ws = new WebSocket(WS_URL, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      })

      const connectTimer = setTimeout(() => { ws.close(); done(null) }, CONNECT_TIMEOUT)

      ws.on('error', (err) => {
        log.error('AliyunTTS: WebSocket 错误:', err.message)
        done(null)
      })

      ws.on('close', () => {
        if (!settled && audioChunks.length > 0) {
          const fullAudio = Buffer.concat(audioChunks)
          fs.writeFileSync(tempFile, fullAudio)
          log.info('AliyunTTS: 使用部分音频, 大小:', fullAudio.length)
          done({ audioPath: tempFile, sentences, words: allWords })
        } else if (!settled) {
          done(null)
        }
      })

      ws.on('open', () => {
        clearTimeout(connectTimer)
        log.info('AliyunTTS: WebSocket 已连接, 文本长度:', text.length)

        ws.send(JSON.stringify({
          header: { action: 'run-task', task_id: taskId, streaming: 'duplex' },
          payload: {
            task_group: 'audio',
            task: 'tts',
            function: 'SpeechSynthesizer',
            model: 'cosyvoice-v2',
            parameters: {
              text_type: 'PlainText',
              voice: 'longxiaochun_v2',
              format: 'mp3',
              sample_rate: 24000,
              volume: 50,
              rate: 1.0,
              pitch: 1.0,
            },
            input: {},
          },
        }))
      })

      ws.on('message', (data: WebSocket.Data) => {
        // Binary frame = audio data
        if (Buffer.isBuffer(data)) {
          if (data.length > 0) audioChunks.push(data)
          return
        }

        // Text frame = JSON event
        const msg = typeof data === 'string' ? data : null
        if (msg === null) return

        let parsed: any
        try { parsed = JSON.parse(msg) } catch { return }

        const event = parsed?.header?.event

        if (event === 'task-started') {
          taskStarted = true
          log.info('AliyunTTS: 任务已启动, 发送文本')
          // Send text
          ws.send(JSON.stringify({
            header: { action: 'continue-task', task_id: taskId, streaming: 'duplex' },
            payload: { input: { text } },
          }))
          // Indicate text is complete
          ws.send(JSON.stringify({
            header: { action: 'finish-task', task_id: taskId, streaming: 'duplex' },
            payload: { input: {} },
          }))
          return
        }

        if (event === 'result-generated') {
          const sentenceText = parsed?.payload?.output?.sentence?.text
          const startTime = parsed?.payload?.output?.sentence?.start_time
          const endTime = parsed?.payload?.output?.sentence?.end_time
          if (sentenceText) {
            log.info('AliyunTTS: 句子完成:', sentenceText.slice(0, 30))
            if (typeof startTime === 'number' && typeof endTime === 'number') {
              sentences.push({ text: sentenceText, startTime, endTime })
            }
          }
          return
        }

        if (event === 'task-finished') {
          if (audioChunks.length === 0) {
            log.warn('AliyunTTS: 无音频数据')
            done(null)
            return
          }
          const fullAudio = Buffer.concat(audioChunks)
          fs.writeFileSync(tempFile, fullAudio)
          log.info('AliyunTTS: 音频写入完成, 大小:', fullAudio.length)
          done({ audioPath: tempFile, sentences, words: allWords })
          return
        }

        if (event === 'task-failed') {
          const errMsg = parsed?.payload?.message || '未知错误'
          log.error('AliyunTTS: 任务失败:', errMsg)
          done(null)
          return
        }
      })
    })
  }

  stop(): void {
    this.cleanup()
  }

  async validateCredentials(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(WS_URL, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      })
      const timer = setTimeout(() => { ws.close(); reject(new Error('连接超时')) }, CONNECT_TIMEOUT)
      ws.on('open', () => { clearTimeout(timer); ws.close(); resolve() })
      ws.on('error', () => { clearTimeout(timer); reject(new Error('API Key 无效')) })
    })
  }

  private cleanup(): void {
    if (this.tempFile) {
      try { fs.unlinkSync(this.tempFile) } catch {}
      this.tempFile = null
    }
  }
}
