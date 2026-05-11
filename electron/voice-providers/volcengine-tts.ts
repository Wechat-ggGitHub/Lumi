import { TtsProvider } from './types'
import { TtsService } from '../tts'
import { log } from '../../src/lib/logger'

export interface TtsSentence {
  text: string
  startTime: number
  endTime: number
}

export interface TtsWord {
  word: string
  startTime: number
  endTime: number
}

export class VolcengineTts implements TtsProvider {
  private service: TtsService
  private appId: string
  private accessToken: string

  constructor(appId: string, accessToken: string) {
    this.service = new TtsService()
    this.appId = appId
    this.accessToken = accessToken
  }

  async synthesize(text: string, signal?: AbortSignal): Promise<import('./types').TtsResult | null> {
    const result = await this.service.synthesize({
      appId: this.appId,
      accessToken: this.accessToken,
      text,
      signal,
    })
    if (!result) return null
    return {
      audioPath: result.audioPath,
      sentences: result.sentences,
      words: result.words,
    }
  }

  stop(): void {
    this.service.stop()
  }

  async validateCredentials(): Promise<void> {
    const { DoubaoASR } = await import('../../src/lib/doubao-asr')
    const asr = new DoubaoASR(this.appId, this.accessToken)
    await asr.validateCredentials()
  }
}
