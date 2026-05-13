'use client'

import { useState, useEffect } from 'react'
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

  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

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

  const clearStatus = () => { setStatus('idle'); setErrorMsg('') }

  const handleSaveVolcengine = async () => {
    if (!volcAppId.trim() || !volcAccessToken.trim()) {
      setErrorMsg('App ID 和 Access Token 需同时填写')
      setStatus('error')
      setTimeout(clearStatus, 3000)
      return
    }
    setStatus('saving')
    try {
      await getIpcRenderer()?.invoke('settings:save-volcengine-credentials', {
        appId: volcAppId.trim(),
        accessToken: volcAccessToken.trim(),
      })
      setHasVolcCreds(true)
      setVolcAccessToken('')
      setStatus('saved')
    } catch (e: any) {
      setErrorMsg(e?.message || '未知错误')
      setStatus('error')
    }
    setTimeout(clearStatus, 2000)
  }

  const handleSaveAliyun = async () => {
    if (!aliyunApiKey.trim()) {
      setErrorMsg('请输入 API Key')
      setStatus('error')
      setTimeout(clearStatus, 3000)
      return
    }
    setStatus('saving')
    try {
      await getIpcRenderer()?.invoke('settings:save-aliyun-credentials', { apiKey: aliyunApiKey.trim() })
      setHasAliyunCreds(true)
      setAliyunApiKey('')
      setStatus('saved')
    } catch (e: any) {
      setErrorMsg(e?.message || '未知错误')
      setStatus('error')
    }
    setTimeout(clearStatus, 2000)
  }

  const handleApplyProvider = async (type: 'asr' | 'tts', provider: string) => {
    const configured = type === 'asr' ? asrCredConfigured : ttsCredConfigured
    if (!configured) {
      setErrorMsg('请先保存该服务商的密钥')
      setStatus('error')
      setTimeout(clearStatus, 3000)
      return
    }
    setStatus('saving')
    try {
      await getIpcRenderer()?.invoke('settings:save-voice-provider', { type, provider })
      setStatus('saved')
    } catch (e: any) {
      setErrorMsg(e?.message || '未知错误')
      setStatus('error')
    }
    setTimeout(clearStatus, 2000)
  }

  const renderCredentialInputs = (providerKey: string) => {
    if (providerKey === 'volcengine') {
      return (
        <>
          <SingleLineInput label="App ID" value={volcAppId} onChange={e => setVolcAppId(e.target.value)}
            placeholder={hasVolcCreds ? '已存储（输入新 ID 替换）' : '输入 App ID'} />
          <SingleLineInput label="Access Token" type="password" value={volcAccessToken}
            onChange={e => setVolcAccessToken(e.target.value)}
            placeholder={hasVolcCreds ? '输入新 Token 替换' : '输入 Access Token'} />
          <Button variant="secondary" onClick={handleSaveVolcengine} disabled={status === 'saving'}>
            {status === 'saving' ? '保存中...' : '保存密钥'}
          </Button>
        </>
      )
    }
    return (
      <>
        <SingleLineInput label="API Key" type="password" value={aliyunApiKey}
          onChange={e => setAliyunApiKey(e.target.value)}
          placeholder={hasAliyunCreds ? '已存储（输入新 Key 替换）' : '输入 API Key（sk-xxx 格式）'} />
        <Button variant="secondary" onClick={handleSaveAliyun} disabled={status === 'saving'}>
          {status === 'saving' ? '保存中...' : '保存密钥'}
        </Button>
      </>
    )
  }

  const showReuseHint = asrProvider === ttsProvider && asrCredConfigured && !ttsCredConfigured

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader title="语音" subtitle="语音识别与合成服务配置"
        onBack={() => navigate('/settings')} />

      <div className="flex-1 overflow-auto px-page-x pb-6">
        {/* ASR 区块 */}
        <div className="mb-section-gap">
          <SectionHeader title="语音识别（ASR）" description="将语音转为文字" />
          <div className="flex items-center gap-2 mb-3">
            <span className="text-body-sm text-text-muted">连接状态:</span>
            <StatusBadge status={asrCredConfigured ? 'success' : 'warning'}
              label={asrCredConfigured ? '已配置' : '未配置'} />
          </div>
          <Select label="服务商" options={PROVIDER_OPTIONS} value={asrProvider}
            onChange={v => setAsrProvider(v)} />
          {renderCredentialInputs(asrProvider)}
          <div className="mt-3">
            <Button variant="primary" onClick={() => handleApplyProvider('asr', asrProvider)}
              disabled={status === 'saving'}>
              应用 ASR 服务商
            </Button>
          </div>
          <button className="text-body-sm text-brand mt-2 block"
            onClick={() => navigate(`/settings/voice/tutorial?provider=${asrProvider}`)}>
            如何获取密钥？
          </button>
        </div>

        {/* TTS 区块 */}
        <div className="mb-section-gap">
          <SectionHeader title="语音合成（TTS）" description="将文字转为语音播报" />
          <div className="flex items-center gap-2 mb-3">
            <span className="text-body-sm text-text-muted">连接状态:</span>
            <StatusBadge status={ttsCredConfigured ? 'success' : 'warning'}
              label={ttsCredConfigured ? '已配置' : '未配置'} />
          </div>
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
          {ttsProvider !== asrProvider && renderCredentialInputs(ttsProvider)}
          <div className="mt-3">
            <Button variant="primary" onClick={() => handleApplyProvider('tts', ttsProvider)}
              disabled={status === 'saving'}>
              应用 TTS 服务商
            </Button>
          </div>
          <button className="text-body-sm text-brand mt-2 block"
            onClick={() => navigate(`/settings/voice/tutorial?provider=${ttsProvider}`)}>
            如何获取密钥？
          </button>
        </div>

        {status === 'error' && <p className="text-body-sm text-danger mt-1">{errorMsg}</p>}
        {status === 'saved' && <p className="text-body-sm text-success mt-1">已保存</p>}
      </div>
    </div>
  )
}
