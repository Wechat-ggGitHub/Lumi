import WebSocket from 'ws'
import fs from 'fs'
import { AsrProvider, AsrResult } from './types'
import { log } from '../../src/lib/logger'

const WS_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference'
const CONNECT_TIMEOUT = 10_000
const TOTAL_TIMEOUT = 30_000
const SAMPLE_RATE = 16000
const BYTES_PER_SAMPLE = 2
const CHANNELS = 1
const CHUNK_BYTES = SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS * (100 / 1000) // 3200 bytes = 100ms

export class AliyunAsr implements AsrProvider {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async transcribe(filePath: string): Promise<AsrResult> {
    const wavBuffer = fs.readFileSync(filePath)
    const pcmData = wavBuffer.subarray(44)
    log.info('AliyunASR: 开始转写, PCM大小:', pcmData.length)

    return new Promise<AsrResult>((resolve, reject) => {
      let settled = false
      let fullText = ''
      const taskId = crypto.randomUUID()

      const done = (err: Error | null, result?: AsrResult) => {
        if (settled) return
        settled = true
        clearTimeout(totalTimer)
        clearTimeout(connectTimer)
        if (err) reject(err)
        else resolve(result || { text: '' })
      }

      const totalTimer = setTimeout(() => {
        ws.close()
        done(new Error('语音识别超时'))
      }, TOTAL_TIMEOUT)

      const ws = new WebSocket(WS_URL, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      })

      const connectTimer = setTimeout(() => {
        ws.close()
        done(new Error('语音识别服务连接超时'))
      }, CONNECT_TIMEOUT)

      ws.on('error', (err) => {
        log.error('AliyunASR: WebSocket 错误:', err.message)
        done(new Error('语音识别服务连接失败'))
      })

      ws.on('close', (code, reason) => {
        if (!settled) {
          log.warn('AliyunASR: WebSocket 意外关闭, code:', code)
          if (fullText) {
            done(null, { text: fullText })
          } else {
            done(new Error(`连接关闭: ${code}`))
          }
        }
      })

      ws.on('open', () => {
        clearTimeout(connectTimer)
        log.info('AliyunASR: WebSocket 已连接')

        ws.send(JSON.stringify({
          header: { action: 'run-task', task_id: taskId, streaming: 'duplex' },
          payload: {
            task_group: 'audio',
            task: 'asr',
            function: 'recognition',
            model: 'paraformer-realtime-v2',
            parameters: { format: 'pcm', sample_rate: SAMPLE_RATE, language_hints: ['zh', 'en'] },
            input: {},
          },
        }))
      })

      ws.on('message', (data: WebSocket.Data) => {
        // Only process text (JSON) frames
        const msg = typeof data === 'string' ? data : Buffer.isBuffer(data) ? null : null
        if (msg === null) return

        let parsed: any
        try { parsed = JSON.parse(msg) } catch { return }

        const event = parsed?.header?.event

        if (event === 'task-started') {
          log.info('AliyunASR: 任务已启动, 开始发送音频')
          let offset = 0
          const sendChunk = () => {
            if (settled) return
            if (offset >= pcmData.length) {
              ws.send(JSON.stringify({
                header: { action: 'finish-task', task_id: taskId, streaming: 'duplex' },
                payload: { input: {} },
              }))
              return
            }
            const end = Math.min(offset + CHUNK_BYTES, pcmData.length)
            ws.send(pcmData.subarray(offset, end))
            offset = end
            setTimeout(sendChunk, 100)
          }
          sendChunk()
          return
        }

        if (event === 'result-generated') {
          const sentenceText = parsed?.payload?.output?.sentence?.text
          if (sentenceText) {
            // Paraformer sends cumulative text in each result-generated
            fullText = sentenceText
            log.info('AliyunASR: 识别结果:', sentenceText.slice(0, 50))
          }
          return
        }

        if (event === 'task-finished') {
          log.info('AliyunASR: 任务完成, 最终结果长度:', fullText.length)
          done(null, { text: fullText })
          ws.close()
          return
        }

        if (event === 'task-failed') {
          const errMsg = parsed?.payload?.message || '未知错误'
          log.error('AliyunASR: 任务失败:', errMsg)
          done(new Error(`语音识别失败: ${errMsg}`))
          ws.close()
          return
        }
      })
    })
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
}
