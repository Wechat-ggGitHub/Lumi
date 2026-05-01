'use client';

import { useState, useEffect, useCallback } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';

interface SkillInfo {
  name: string;
  description: string;
  enabled: boolean;
  skillDir: string;
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [detailSkill, setDetailSkill] = useState<{ name: string; content: string } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ name: string; x: number; y: number } | null>(null);
  const ipcRenderer = typeof window !== 'undefined' ? getIpcRenderer() : null;

  const loadSkills = useCallback(() => {
    ipcRenderer?.invoke('skills:list').then((data: SkillInfo[]) => {
      setSkills(data);
    });
  }, [ipcRenderer]);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const handleImport = async () => {
    setImportError(null);
    const result = await ipcRenderer?.invoke('skills:import');
    if (result?.error) {
      setImportError(result.error);
    } else if (result) {
      setSkills(result);
    }
  };

  const handleToggle = async (name: string, enabled: boolean) => {
    const updated = await ipcRenderer?.invoke('skills:toggle', { name, enabled });
    if (updated) setSkills(updated);
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`确定删除技能「${name}」？`)) return;
    const updated = await ipcRenderer?.invoke('skills:delete', { name });
    if (updated) setSkills(updated);
    setDetailSkill(null);
  };

  const handleViewDetail = async (name: string) => {
    const content = await ipcRenderer?.invoke('skills:read', { name });
    if (content) {
      setDetailSkill({ name, content });
    }
  };

  const handleContextMenu = (e: React.MouseEvent, name: string) => {
    e.preventDefault();
    setContextMenu({ name, x: e.clientX, y: e.clientY });
  };

  const styles = {
    container: {
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: 14, color: '#e0e0e0',
      background: '#1a1a1e', minHeight: '100vh',
      padding: 24, maxWidth: 600, margin: '0 auto',
    },
    header: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 24,
    },
    title: { fontSize: 18, fontWeight: 600, margin: 0 },
    backBtn: {
      padding: '6px 16px', borderRadius: 8,
      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
      color: '#888', fontSize: 13, cursor: 'pointer',
    },
    importArea: {
      border: '2px dashed rgba(255,255,255,0.1)',
      borderRadius: 12, padding: '24px 16px',
      textAlign: 'center' as const, marginBottom: 24,
      cursor: 'pointer', color: '#666',
      transition: 'border-color 0.2s',
    },
    sectionTitle: {
      fontSize: 13, color: '#888', marginBottom: 12,
      textTransform: 'uppercase' as const, letterSpacing: '0.5px',
    },
    card: {
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 10, padding: '14px 16px', marginBottom: 10,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      cursor: 'pointer',
    },
    cardDisabled: { opacity: 0.5 },
    toggle: (on: boolean) => ({
      width: 44, height: 24, borderRadius: 12,
      border: 'none', background: on ? '#AF52DE' : 'rgba(255,255,255,0.1)',
      cursor: 'pointer', position: 'relative' as const,
      transition: 'background 0.2s', flexShrink: 0,
    }),
    toggleKnob: (on: boolean) => ({
      width: 18, height: 18, borderRadius: '50%',
      background: '#fff', position: 'absolute' as const,
      top: 3, left: on ? 23 : 3, transition: 'left 0.2s',
    }),
    emptyState: { color: '#666', textAlign: 'center' as const, padding: 40 },
    overlay: {
      position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.7)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 100,
    },
    modal: {
      background: '#2a2a2e', borderRadius: 12, padding: 24,
      maxWidth: 560, width: '90%', maxHeight: '80vh',
      display: 'flex', flexDirection: 'column' as const,
    },
    pre: {
      background: '#1a1a1e', borderRadius: 8, padding: 16,
      overflow: 'auto', flex: 1, fontSize: 12, lineHeight: 1.6,
      whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const,
    },
    contextMenu: {
      position: 'fixed' as const, background: '#2a2a2e',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 8, padding: '4px 0', zIndex: 200,
      minWidth: 160,
    },
    contextItem: {
      padding: '8px 16px', cursor: 'pointer', fontSize: 13,
      color: '#e0e0e0', display: 'block', width: '100%',
      border: 'none', background: 'none', textAlign: 'left' as const,
    },
    error: { color: '#ff6b6b', fontSize: 12, marginTop: 8 },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>技能管理</h1>
        <button onClick={() => window.history.back()} style={styles.backBtn}>返回</button>
      </div>

      <div style={styles.importArea} onClick={handleImport}>
        点击选择包含 SKILL.md 的文件夹来导入技能
      </div>

      {importError && <div style={styles.error}>{importError}</div>}

      <div style={styles.sectionTitle}>已安装 ({skills.length})</div>

      {skills.length === 0 && (
        <div style={styles.emptyState}>
          暂无技能。导入一个包含 SKILL.md 的文件夹来添加技能。
        </div>
      )}

      {skills.map(skill => (
        <div
          key={skill.name}
          style={{ ...styles.card, ...(!skill.enabled ? styles.cardDisabled : {}) }}
          onClick={() => handleToggle(skill.name, !skill.enabled)}
          onContextMenu={(e) => handleContextMenu(e, skill.name)}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>{skill.name}</div>
            <div style={{ fontSize: 12, color: '#666' }}>{skill.description}</div>
          </div>
          <button style={styles.toggle(skill.enabled)} onClick={(e) => { e.stopPropagation(); }}>
            <div style={styles.toggleKnob(skill.enabled)} />
          </button>
        </div>
      ))}

      {contextMenu && (
        <div style={{ ...styles.contextMenu, top: contextMenu.y, left: contextMenu.x }}>
          <button style={styles.contextItem} onClick={() => { handleViewDetail(contextMenu.name); setContextMenu(null); }}>
            查看详情
          </button>
          <button style={{ ...styles.contextItem, color: '#ff6b6b' }} onClick={() => { handleDelete(contextMenu.name); setContextMenu(null); }}>
            删除
          </button>
        </div>
      )}

      {detailSkill && (
        <div style={styles.overlay} onClick={() => setDetailSkill(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{detailSkill.name}</h2>
              <button
                style={{ ...styles.backBtn, fontSize: 12 }}
                onClick={() => setDetailSkill(null)}
              >关闭</button>
            </div>
            <pre style={styles.pre}>{detailSkill.content}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
