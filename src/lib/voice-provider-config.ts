export interface VoiceProviderConfig {
  key: string
  name: string
  asrSupported: boolean
  ttsSupported: boolean
  credentialFields: CredentialField[]
}

export interface CredentialField {
  key: string
  label: string
  type: 'text' | 'password'
  placeholder: string
}

export const VOICE_PROVIDERS: Record<string, VoiceProviderConfig> = {
  volcengine: {
    key: 'volcengine',
    name: '火山引擎',
    asrSupported: true,
    ttsSupported: true,
    credentialFields: [
      { key: 'appId', label: 'App ID', type: 'text', placeholder: '在火山引擎 API 服务中心获取' },
      { key: 'accessToken', label: 'Access Token', type: 'password', placeholder: '点击小眼睛显示' },
    ],
  },
  aliyun: {
    key: 'aliyun',
    name: '阿里云百炼',
    asrSupported: true,
    ttsSupported: true,
    credentialFields: [
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-xxx 格式' },
    ],
  },
}

export type VoiceProviderKey = 'volcengine' | 'aliyun'
