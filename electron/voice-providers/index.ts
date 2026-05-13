import { AsrProvider, TtsProvider } from './types'
import { VolcengineAsr } from './volcengine-asr'
import { VolcengineTts } from './volcengine-tts'
import { AliyunAsr } from './aliyun-asr'
import { AliyunTts } from './aliyun-tts'
import { loadVolcengineCredentials, loadAliyunVoiceCredentials } from '../../src/lib/keychain'

export { VolcengineAsr, VolcengineTts, AliyunAsr, AliyunTts }
export type { AsrProvider, TtsProvider, TtsResult, AsrResult } from './types'

export function loadVoiceCredentials(providerKey: string): Record<string, string> | null {
  switch (providerKey) {
    case 'volcengine': {
      const creds = loadVolcengineCredentials()
      if (!creds) return null
      return { appId: creds.appId, accessToken: creds.accessToken }
    }
    case 'aliyun': {
      const creds = loadAliyunVoiceCredentials()
      if (!creds) return null
      return { apiKey: creds.apiKey }
    }
    default:
      return null
  }
}

export function createAsrProvider(providerKey: string, credentials: Record<string, string>): AsrProvider {
  switch (providerKey) {
    case 'volcengine':
      return new VolcengineAsr(credentials.appId, credentials.accessToken)
    case 'aliyun':
      return new AliyunAsr(credentials.apiKey)
    default:
      throw new Error(`Unknown ASR provider: ${providerKey}`)
  }
}

export function createTtsProvider(providerKey: string, credentials: Record<string, string>): TtsProvider {
  switch (providerKey) {
    case 'volcengine':
      return new VolcengineTts(credentials.appId, credentials.accessToken)
    case 'aliyun':
      return new AliyunTts(credentials.apiKey)
    default:
      throw new Error(`Unknown TTS provider: ${providerKey}`)
  }
}
