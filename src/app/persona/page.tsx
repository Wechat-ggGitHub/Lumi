'use client';

import { useState, useEffect, useCallback } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import type { Persona } from '@/types';

const PERSONALITY_OPTIONS = ['专业', '友好', '严谨', '活泼', '温和'];
const TONE_OPTIONS = ['自然', '正式', '轻松', '简洁'];
const DETAIL_OPTIONS = ['详细', '平衡', '简洁'];
const CLARIFY_OPTIONS = ['总是先确认', '视情况平衡', '先执行再问'];
const WORK_STYLE_OPTIONS = ['先执行再总结', '逐步确认', '一步到位'];

function SelectField({ label, value, options, onChange }: {
  label: string; value: string; options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 11, color: '#888', marginBottom: 4 }}>{label}</label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {options.map(opt => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            style={{
              padding: '4px 12px',
              borderRadius: 6,
              border: value === opt ? '1px solid #AF52DE' : '1px solid rgba(255,255,255,0.08)',
              background: value === opt ? 'rgba(175,82,222,0.2)' : 'rgba(255,255,255,0.03)',
              color: value === opt ? '#AF52DE' : '#888',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function PersonaPage() {
  const [persona, setPersona] = useState<Persona | null>(null);
  const [saved, setSaved] = useState(false);
  const ipcRenderer = typeof window !== 'undefined' ? getIpcRenderer() : null;

  useEffect(() => {
    ipcRenderer?.invoke('persona:load').then((data: Persona) => {
      setPersona(data);
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
    return <div style={{ padding: 24, color: '#666' }}>加载中...</div>;
  }

  return (
    <div style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: 14, color: '#e0e0e0',
      background: '#1a1a1e', minHeight: '100vh',
      padding: 24, maxWidth: 600, margin: '0 auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>分身设定</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => window.history.back()} style={{
            padding: '6px 16px', borderRadius: 8,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
            color: '#888', fontSize: 13, cursor: 'pointer',
          }}>
            返回
          </button>
          <button onClick={handleSave} style={{
            padding: '6px 16px', borderRadius: 8,
            background: saved ? '#34C759' : '#AF52DE', border: 'none',
            color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 500,
          }}>
            {saved ? '已保存' : '保存'}
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 11, color: '#888', marginBottom: 4 }}>名称</label>
        <input
          value={persona.name}
          onChange={e => setPersona({ ...persona, name: e.target.value })}
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 14,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
            color: '#e0e0e0', outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 11, color: '#888', marginBottom: 4 }}>简介</label>
        <textarea
          value={persona.bio || ''}
          onChange={e => setPersona({ ...persona, bio: e.target.value })}
          placeholder="描述你的分身..."
          rows={3}
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
            color: '#e0e0e0', outline: 'none', resize: 'vertical', boxSizing: 'border-box',
            lineHeight: 1.5,
          }}
        />
      </div>

      <SelectField label="性格" value={persona.personality} options={PERSONALITY_OPTIONS}
        onChange={v => setPersona({ ...persona, personality: v })} />
      <SelectField label="语气" value={persona.tone} options={TONE_OPTIONS}
        onChange={v => setPersona({ ...persona, tone: v })} />
      <SelectField label="详细程度" value={persona.detail_level} options={DETAIL_OPTIONS}
        onChange={v => setPersona({ ...persona, detail_level: v })} />
      <SelectField label="澄清偏好" value={persona.clarify_pref} options={CLARIFY_OPTIONS}
        onChange={v => setPersona({ ...persona, clarify_pref: v })} />
      <SelectField label="工作方式" value={persona.work_style} options={WORK_STYLE_OPTIONS}
        onChange={v => setPersona({ ...persona, work_style: v })} />

      <div style={{ marginBottom: 16, marginTop: 16 }}>
        <label style={{ display: 'block', fontSize: 11, color: '#888', marginBottom: 4 }}>高级 System Prompt</label>
        <textarea
          value={persona.system_prompt || ''}
          onChange={e => setPersona({ ...persona, system_prompt: e.target.value })}
          placeholder="自定义指令，会追加到分身上下文末尾..."
          rows={4}
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
            color: '#e0e0e0', outline: 'none', resize: 'vertical', boxSizing: 'border-box',
            lineHeight: 1.5, fontFamily: 'monospace',
          }}
        />
      </div>
    </div>
  );
}
