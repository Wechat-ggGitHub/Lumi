'use client';

import { useState, useEffect, useCallback } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import type { Persona } from '@/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SingleLineInput } from '@/components/ui/SingleLineInput';
import { Textarea } from '@/components/ui/Textarea';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { Button } from '@/components/ui/Button';
import { BottomActionBar } from '@/components/ui/BottomActionBar';

const PERSONALITY_OPTIONS = ['专业', '友好', '严谨', '活泼', '温和'];
const TONE_OPTIONS = ['自然', '正式', '轻松', '简洁'];
const DETAIL_OPTIONS = ['详细', '平衡', '简洁'];
const CLARIFY_OPTIONS = ['总是先确认', '视情况平衡', '先执行再问'];
const WORK_STYLE_OPTIONS = ['先执行再总结', '逐步确认', '一步到位'];

export default function PersonaPage() {
  const [persona, setPersona] = useState<Persona | null>(null);
  const [saved, setSaved] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const ipcRenderer = typeof window !== 'undefined' ? getIpcRenderer() : null;

  useEffect(() => {
    ipcRenderer?.invoke('persona:load').then((data: Persona) => {
      setPersona(data);
      if (data.system_prompt) setAdvancedOpen(true);
    });
  }, [ipcRenderer]);

  const handleSave = useCallback(() => {
    if (!persona || !ipcRenderer) return;
    ipcRenderer.invoke('persona:save', {
      name: persona.name,
      bio: persona.bio,
      personality: persona.personality,
      tone: persona.tone,
      detail_level: persona.detail_level,
      clarify_pref: persona.clarify_pref,
      work_style: persona.work_style,
      system_prompt: persona.system_prompt,
    }).then((updated: Persona) => {
      setPersona(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }, [persona, ipcRenderer]);

  if (!persona) {
    return <div className="p-6 text-text-muted">加载中...</div>;
  }

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader title="分身设定" subtitle="配置你的 AI 分身身份和行为风格"
        onBack={() => window.history.back()} />
      <div className="flex-1 overflow-auto px-page-x pb-6">
        <div className="mb-section-gap">
          <SectionHeader title="基础身份" />
          <div className="flex items-center gap-4 mb-block-gap">
            <div className="w-12 h-12 rounded-full bg-brand-soft flex items-center justify-center text-section-title text-brand font-semibold flex-shrink-0">
              {persona.name?.[0] || 'S'}
            </div>
            <div className="flex-1">
              <SingleLineInput value={persona.name} onChange={e => setPersona({ ...persona, name: e.target.value })} placeholder="分身名称" />
            </div>
          </div>
          <Textarea value={persona.bio || ''} onChange={e => setPersona({ ...persona, bio: e.target.value })} placeholder="一句话描述你的分身..." />
        </div>
        <div className="mb-section-gap">
          <SectionHeader title="人格表达" />
          <div className="mb-block-gap">
            <label className="block text-label text-text-muted mb-1">性格</label>
            <ChipGroup options={PERSONALITY_OPTIONS} value={persona.personality} onChange={v => setPersona({ ...persona, personality: v })} />
          </div>
          <div className="mb-block-gap">
            <label className="block text-label text-text-muted mb-1">语气</label>
            <ChipGroup options={TONE_OPTIONS} value={persona.tone} onChange={v => setPersona({ ...persona, tone: v })} />
          </div>
          <div>
            <label className="block text-label text-text-muted mb-1">回答详略</label>
            <ChipGroup options={DETAIL_OPTIONS} value={persona.detail_level} onChange={v => setPersona({ ...persona, detail_level: v })} />
          </div>
        </div>
        <div className="mb-section-gap">
          <SectionHeader title="协作偏好" />
          <div className="mb-block-gap">
            <label className="block text-label text-text-muted mb-1">澄清偏好</label>
            <ChipGroup options={CLARIFY_OPTIONS} value={persona.clarify_pref} onChange={v => setPersona({ ...persona, clarify_pref: v })} />
          </div>
          <div>
            <label className="block text-label text-text-muted mb-1">工作方式</label>
            <ChipGroup options={WORK_STYLE_OPTIONS} value={persona.work_style} onChange={v => setPersona({ ...persona, work_style: v })} />
          </div>
        </div>
        <div className="mb-section-gap">
          <button onClick={() => setAdvancedOpen(!advancedOpen)}
            className="flex items-center gap-2 text-section-title text-text-secondary hover:text-text-primary transition-colors cursor-pointer">
            <span className={`transition-transform ${advancedOpen ? 'rotate-90' : ''}`}>▸</span>
            高级设置
          </button>
          {advancedOpen && (
            <div className="mt-3">
              <Textarea label="自定义 System Prompt" helperText="追加到分身上下文末尾的额外指令"
                value={persona.system_prompt || ''} onChange={e => setPersona({ ...persona, system_prompt: e.target.value })}
                placeholder="输入自定义指令..." className="!font-mono" />
            </div>
          )}
        </div>
      </div>
      <BottomActionBar>
        <Button variant="primary" onClick={handleSave}>{saved ? '已保存' : '保存更改'}</Button>
      </BottomActionBar>
    </div>
  );
}
