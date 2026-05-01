'use client';

import { useState, useEffect, useCallback } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import type { SkillConfig } from '@/types';

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillConfig[]>([]);
  const ipcRenderer = typeof window !== 'undefined' ? getIpcRenderer() : null;

  useEffect(() => {
    ipcRenderer?.invoke('skills:list').then((data: SkillConfig[]) => {
      setSkills(data);
    });
  }, [ipcRenderer]);

  const handleToggle = useCallback((id: string, enabled: boolean) => {
    ipcRenderer?.invoke('skills:toggle', { id, enabled }).then((updated: SkillConfig[]) => {
      setSkills(updated);
    });
  }, [ipcRenderer]);

  return (
    <div style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: 14, color: '#e0e0e0',
      background: '#1a1a1e', minHeight: '100vh',
      padding: 24, maxWidth: 600, margin: '0 auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>技能管理</h1>
        <button onClick={() => window.history.back()} style={{
          padding: '6px 16px', borderRadius: 8,
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
          color: '#888', fontSize: 13, cursor: 'pointer',
        }}>
          返回
        </button>
      </div>

      {skills.length === 0 && (
        <div style={{ color: '#666', textAlign: 'center', padding: 40 }}>
          暂无可用技能
        </div>
      )}

      {skills.map(skill => (
        <div key={skill.id} style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 10,
          padding: '14px 16px',
          marginBottom: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>{skill.name}</div>
            <div style={{ fontSize: 12, color: '#666' }}>{skill.description}</div>
          </div>
          <button
            onClick={() => handleToggle(skill.id, !skill.enabled)}
            style={{
              width: 44, height: 24,
              borderRadius: 12,
              border: 'none',
              background: skill.enabled ? '#AF52DE' : 'rgba(255,255,255,0.1)',
              cursor: 'pointer',
              position: 'relative',
              transition: 'background 0.2s',
              flexShrink: 0,
            }}
          >
            <div style={{
              width: 18, height: 18,
              borderRadius: '50%',
              background: '#fff',
              position: 'absolute',
              top: 3,
              left: skill.enabled ? 23 : 3,
              transition: 'left 0.2s',
            }} />
          </button>
        </div>
      ))}
    </div>
  );
}
