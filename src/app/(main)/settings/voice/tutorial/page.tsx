'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { getIpcRenderer } from '@/lib/electron-ipc'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'

interface TutorialStep {
  title: string
  description: string
  link?: { label: string; url: string }
}

const VOLCENGINE_STEPS: TutorialStep[] = [
  {
    title: '1. 注册火山引擎账号',
    description: '访问火山引擎官网，使用手机号注册并登录。',
    link: { label: '打开火山引擎官网', url: 'https://www.volcengine.com/' },
  },
  {
    title: '2. 完成实名认证',
    description: '进入控制台后，按提示完成实名认证（支持微信/抖音扫脸，约 1 分钟）。所有 API 开通都需要实名认证。',
  },
  {
    title: '3. 进入豆包语音服务',
    description: '访问豆包语音控制台，点击「创建应用」。',
    link: { label: '打开豆包语音控制台', url: 'https://console.volcengine.com/speech/service/overview' },
  },
  {
    title: '4. 创建应用',
    description: '应用名称填 aiva，应用简介写「自己用」，接入能力选择「豆包流式语音识别模型 2.0 小时版」，点击确定。',
  },
  {
    title: '5. 获取密钥',
    description: '创建成功后，在左侧「API 服务中心」找到 App ID 和 Access Token（点击小眼睛显示）。火山引擎提供 20 小时免费额度。',
  },
]

const ALIYUN_STEPS: TutorialStep[] = [
  {
    title: '1. 开通阿里云百炼',
    description: '访问百炼控制台，使用阿里云账号登录。新用户需完成实名认证。',
    link: { label: '打开百炼控制台', url: 'https://bailian.console.aliyun.com/' },
  },
  {
    title: '2. 创建 API Key',
    description: '在百炼控制台左侧菜单找到「API-KEY 管理」，点击「创建 API Key」。复制生成的密钥（sk-xxx 格式），只显示一次。',
    link: { label: '打开 API-KEY 管理', url: 'https://bailian.console.aliyun.com/#/api-key' },
  },
  {
    title: '3. 开通语音模型',
    description: '在模型广场搜索并开通以下模型（免费额度可用）：\n· 语音识别：Paraformer（实时语音识别）\n· 语音合成：CosyVoice',
    link: { label: '打开模型广场', url: 'https://bailian.console.aliyun.com/cn-beijing#/model-market' },
  },
]

function TutorialContent() {
  const searchParams = useSearchParams()
  const initialProvider = searchParams.get('provider') || 'volcengine'
  const [activeTab, setActiveTab] = useState<'volcengine' | 'aliyun'>(
    initialProvider === 'aliyun' ? 'aliyun' : 'volcengine'
  )

  const steps = activeTab === 'volcengine' ? VOLCENGINE_STEPS : ALIYUN_STEPS

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader title="获取密钥教程" subtitle="按步骤获取语音服务的 API 密钥"
        onBack={() => getIpcRenderer()?.send('navigate:route', { path: '/settings/voice' })} />

      <div className="flex-1 overflow-auto px-page-x pb-6">
        <div className="flex gap-2 mb-section-gap">
          <button
            className={`px-4 py-2 rounded-input text-body-sm transition-colors ${
              activeTab === 'volcengine' ? 'bg-brand text-white' : 'bg-bg-surface-2 text-text-primary'
            }`}
            onClick={() => setActiveTab('volcengine')}
          >
            火山引擎
          </button>
          <button
            className={`px-4 py-2 rounded-input text-body-sm transition-colors ${
              activeTab === 'aliyun' ? 'bg-brand text-white' : 'bg-bg-surface-2 text-text-primary'
            }`}
            onClick={() => setActiveTab('aliyun')}
          >
            阿里云百炼
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {steps.map((step, i) => (
            <div key={i} className="p-4 rounded-card bg-bg-surface-1">
              <h3 className="text-body font-medium text-text-primary mb-2">{step.title}</h3>
              <p className="text-body-sm text-text-muted whitespace-pre-line">{step.description}</p>
              {step.link && (
                <button
                  className="text-body-sm text-brand mt-2 block"
                  onClick={() => getIpcRenderer()?.send('open-external', step.link!.url)}
                >
                  {step.link.label} →
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-section-gap">
          <Button variant="primary" onClick={() =>
            getIpcRenderer()?.send('navigate:route', { path: '/settings/voice' })
          }>
            返回设置页面
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function VoiceTutorialPage() {
  return (
    <Suspense>
      <TutorialContent />
    </Suspense>
  )
}
