'use client'

import { useState, useEffect, useRef } from 'react'
import { getIpcRenderer } from '@/lib/electron-ipc'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { SingleLineInput } from '@/components/ui/SingleLineInput'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { VOICE_PROVIDERS } from '@/lib/voice-provider-config'

const PROVIDER_OPTIONS = [
  { value: 'volcengine', label: '火山引擎' },
  { value: 'aliyun', label: '阿里云百炼' },
]

type BlockStatus = 'idle' | 'saving' | 'saved' | 'error'

interface BlockState {
  status: BlockStatus
  errorMsg: string
}

export default function VoiceSettingsPage() {
  const [asrProvider, setAsrProvider] = useState('volcengine')
  const [ttsProvider, setTtsProvider] = useState('volcengine')

  // 火山引擎凭据
  const [volcAppId, setVolcAppId] = useState('')
  const [volcAccessToken, setVolcAccessToken] = useState('')
  const [hasVolcCreds, setHasVolcCreds] = useState(false)

  // 阿里云凭据
  const [aliyunApiKey, setAliyunApiKey] = useState('')
  const [hasAliyunCreds, setHasAliyunCreds] = useState(false)

  // 分离各区块状态，避免共享 status 导致消息错位和 timer 竞争
  const [asrBlock, setAsrBlock] = useState<BlockState>({ status: 'idle', errorMsg: '' })
  const [ttsBlock, setTtsBlock] = useState<BlockState>({ status: 'idle', errorMsg: '' })

  const asrTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ttsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const ipc = getIpcRenderer()
    ipc?.invoke('settings:load-voice-provider', { type: 'asr' }).then((p: string) => setAsrProvider(p))
    ipc?.invoke('settings:load-voice-provider', { type: 'tts' }).then((p: string) => setTtsProvider(p))
    ipc?.invoke('settings:load-volcengine-credentials').then((c: any) => {
      if (c) {
        setVolcAppId(c.appId || '')
        setHasVolcCreds(c.hasCredentials || false)
      }
    })
    ipc?.invoke('settings:load-aliyun-credentials').then((c: any) => {
      if (c) {
        setAliyunApiKey(c.hasCredentials ? c.apiKey : '')
        setHasAliyunCreds(c.hasCredentials || false)
      }
    })
  }, [])

  const navigate = (path: string) => getIpcRenderer()?.send('navigate:route', { path })

  const asrCredConfigured = asrProvider === 'volcengine' ? hasVolcCreds : hasAliyunCreds
  const ttsCredConfigured = ttsProvider === 'volcengine' ? hasVolcCreds : hasAliyunCreds

  const clearBlock = (block: 'asr' | 'tts') => {
    if (block === 'asr') {
      if (asrTimerRef.current) clearTimeout(asrTimerRef.current)
      asrTimerRef.current = setTimeout(() => setAsrBlock({ status: 'idle', errorMsg: '' }), 2000)
    } else {
      if (ttsTimerRef.current) clearTimeout(ttsTimerRef.current)
      ttsTimerRef.current = setTimeout(() => setTtsBlock({ status: 'idle', errorMsg: '' }), 2000)
    }
  }

  const handleSaveVolcengine = async (block: 'asr' | 'tts') => {
    if (!volcAppId.trim() || !volcAccessToken.trim()) {
      const set = block === 'asr' ? setAsrBlock : setTtsBlock
      set({ status: 'error', errorMsg: 'App ID 和 Access Token 需同时填写' })
      clearBlock(block)
      return
    }
    const set = block === 'asr' ? setAsrBlock : setTtsBlock
    set({ status: 'saving', errorMsg: '' })
    try {
      await getIpcRenderer()?.invoke('settings:save-volcengine-credentials', {
        appId: volcAppId.trim(),
        accessToken: volcAccessToken.trim(),
      })
      setHasVolcCreds(true)
      setVolcAccessToken('')
      set({ status: 'saved', errorMsg: '' })
    } catch (e: any) {
      set({ status: 'error', errorMsg: e?.message || '未知错误' })
    }
    clearBlock(block)
  }

  const handleSaveAliyun = async (block: 'asr' | 'tts') => {
    if (!aliyunApiKey.trim()) {
      const set = block === 'asr' ? setAsrBlock : setTtsBlock
      set({ status: 'error', errorMsg: '请输入 API Key' })
      clearBlock(block)
      return
    }
    const set = block === 'asr' ? setAsrBlock : setTtsBlock
    set({ status: 'saving', errorMsg: '' })
    try {
      await getIpcRenderer()?.invoke('settings:save-aliyun-credentials', { apiKey: aliyunApiKey.trim() })
      setHasAliyunCreds(true)
      setAliyunApiKey('')
      set({ status: 'saved', errorMsg: '' })
    } catch (e: any) {
      set({ status: 'error', errorMsg: e?.message || '未知错误' })
    }
    clearBlock(block)
  }

  const handleApplyProvider = async (type: 'asr' | 'tts', provider: string) => {
    const configured = type === 'asr' ? asrCredConfigured : ttsCredConfigured
    const set = type === 'asr' ? setAsrBlock : setTtsBlock
    if (!configured) {
      set({ status: 'error', errorMsg: '请先保存该服务商的密钥' })
      clearBlock(type)
      return
    }
    set({ status: 'saving', errorMsg: '' })
    try {
      await getIpcRenderer()?.invoke('settings:save-voice-provider', { type, provider })
      set({ status: 'saved', errorMsg: '' })
    } catch (e: any) {
      set({ status: 'error', errorMsg: e?.message || '未知错误' })
    }
    clearBlock(type)
  }

  const renderCredentialInputs = (providerKey: string, _block: 'asr' | 'tts') => {
    if (providerKey === 'volcengine') {
      return (
        <>
          <SingleLineInput label="App ID" value={volcAppId} onChange={e => setVolcAppId(e.target.value)}
            placeholder={hasVolcCreds ? '已存储（输入新 ID 替换）' : '输入 App ID'} />
          <SingleLineInput label="Access Token" type="password" value={volcAccessToken}
            onChange={e => setVolcAccessToken(e.target.value)}
            placeholder={hasVolcCreds ? '输入新 Token 替换' : '输入 Access Token'} />
        </>
      )
    }
    return (
      <>
        <SingleLineInput label="API Key" type="password" value={aliyunApiKey}
          onChange={e => setAliyunApiKey(e.target.value)}
          placeholder={hasAliyunCreds ? '已存储（输入新 Key 替换）' : '输入 API Key（sk-xxx 格式）'} />
      </>
    )
  }

  // 复用提示：当 ASR 和 TTS 选同一个 provider 且凭据已配置时，
  // 提示用户可以直接「应用」到另一个类型，无需重新输入
  const showReuseHint = asrProvider === ttsProvider && asrCredConfigured

  const renderBlockMessage = (block: 'asr' | 'tts') => {
    const blockState = block === 'asr' ? asrBlock : ttsBlock
    if (blockState.status === 'error') return <p className="text-body-sm text-danger mt-1">{blockState.errorMsg}</p>
    if (blockState.status === 'saved') return <p className="text-body-sm text-success mt-1">已保存</p>
    return null
  }

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader title="语音"
        onBack={() => navigate('/settings')} />

      <div className="flex-1 overflow-auto px-page-x pb-6">
        {/* ASR 区块 */}
        <div className="mb-section-gap">
          <SectionHeader title="语音识别（ASR）"
            action={
              <StatusBadge status={asrCredConfigured ? 'success' : 'warning'}
                label={asrCredConfigured ? '已配置' : '未配置'} />
            }
          />
          <Select label="服务商" options={PROVIDER_OPTIONS} value={asrProvider}
            onChange={v => setAsrProvider(v)} />
          {renderCredentialInputs(asrProvider, 'asr')}
          <div className="flex items-center justify-end gap-2 mt-3">
            <button
              onClick={() => navigate(`/settings/voice/tutorial?provider=${asrProvider}`)}
              className="w-[28px] h-[28px] flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-surface-2 transition-colors"
              title="如何获取密钥"
            >
              <span className="text-sm">↗</span>
            </button>
            <div className="flex-1" />
            <Button variant="secondary"
              onClick={() => asrProvider === 'volcengine' ? handleSaveVolcengine('asr') : handleSaveAliyun('asr')}
              disabled={asrBlock.status === 'saving'}>
              {asrBlock.status === 'saving' ? '保存中...' : '保存密钥'}
            </Button>
            <Button variant="primary" onClick={() => handleApplyProvider('asr', asrProvider)}
              disabled={asrBlock.status === 'saving'}>
              应用
            </Button>
          </div>
          {renderBlockMessage('asr')}
        </div>

        <div className="border-t border-line-default my-section-gap" />

        {/* TTS 区块 */}
        <div className="mb-section-gap">
          <SectionHeader title="语音合成（TTS）"
            action={
              <StatusBadge status={ttsCredConfigured ? 'success' : 'warning'}
                label={ttsCredConfigured ? '已配置' : '未配置'} />
            }
          />
          <Select label="服务商" options={PROVIDER_OPTIONS} value={ttsProvider}
            onChange={v => setTtsProvider(v)} />
          {showReuseHint && (
            <div className="flex items-center gap-2 p-2 rounded-input bg-bg-surface-2 mt-2 mb-2">
              <span className="text-body-sm text-text-muted">
                已从 ASR 配置中检测到 {VOICE_PROVIDERS[ttsProvider]?.name} 的密钥
              </span>
              <Button variant="secondary" size="sm"
                onClick={() => handleApplyProvider('tts', ttsProvider)}>复用</Button>
            </div>
          )}
          {!showReuseHint && renderCredentialInputs(ttsProvider, 'tts')}
          <div className="flex items-center justify-end gap-2 mt-3">
            <button
              onClick={() => navigate(`/settings/voice/tutorial?provider=${ttsProvider}`)}
              className="w-[28px] h-[28px] flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-surface-2 transition-colors"
              title="如何获取密钥"
            >
              <span className="text-sm">↗</span>
            </button>
            <div className="flex-1" />
            {!showReuseHint && (
              <Button variant="secondary"
                onClick={() => ttsProvider === 'volcengine' ? handleSaveVolcengine('tts') : handleSaveAliyun('tts')}
                disabled={ttsBlock.status === 'saving'}>
                {ttsBlock.status === 'saving' ? '保存中...' : '保存密钥'}
              </Button>
            )}
            <Button variant="primary" onClick={() => handleApplyProvider('tts', ttsProvider)}
              disabled={ttsBlock.status === 'saving'}>
              应用
            </Button>
          </div>
          {renderBlockMessage('tts')}
        </div>
      </div>
    </div>
  )
}
