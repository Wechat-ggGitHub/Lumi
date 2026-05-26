'use client';

import { useState, useEffect, useCallback } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import GlassCard from '@/components/ui/GlassCard';
import { EmptyState } from '@/components/ui/EmptyState';

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
  const ipcRenderer = typeof window !== 'undefined' ? getIpcRenderer() : null;

  const loadSkills = useCallback(() => {
    ipcRenderer?.invoke('skills:list').then((data: SkillInfo[]) => { setSkills(data); });
  }, [ipcRenderer]);

  useEffect(() => { loadSkills(); }, [loadSkills]);

  const handleImport = async () => {
    setImportError(null);
    const result = await ipcRenderer?.invoke('skills:import');
    if (result?.error) { setImportError(result.error); }
    else if (result) { setSkills(result); }
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
    if (content) setDetailSkill({ name, content });
  };

  const enabledSkills = skills.filter(s => s.enabled);
  const disabledSkills = skills.filter(s => !s.enabled);

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader title="技能管理"
        onBack={() => window.history.back()} />
      <div className="flex-1 overflow-auto px-page-x pb-6">
        {enabledSkills.length > 0 && (
          <div className="mb-section-gap">
            <SectionHeader title="已启用技能" description={`${enabledSkills.length} 个`} />
            <div className="flex flex-col gap-2">
              {enabledSkills.map(skill => (
                <GlassCard key={skill.name} variant="content">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="text-card-title text-text-primary">{skill.name}</div>
                      <div className="text-body-sm text-text-muted mt-0.5">{skill.description}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      <StatusBadge status="success" label="已启用" />
                      <Button variant="ghost" size="sm" onClick={() => handleViewDetail(skill.name)}>查看</Button>
                      <Button variant="ghost" size="sm" onClick={() => handleToggle(skill.name, false)}>停用</Button>
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          </div>
        )}
        {disabledSkills.length > 0 && (
          <div className="mb-section-gap">
            <SectionHeader title="待配置" description={`${disabledSkills.length} 个`} />
            <div className="flex flex-col gap-2">
              {disabledSkills.map(skill => (
                <GlassCard key={skill.name} variant="content" className="opacity-60">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="text-card-title text-text-primary">{skill.name}</div>
                      <div className="text-body-sm text-text-muted mt-0.5">{skill.description}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      <StatusBadge status="default" label="已停用" />
                      <Button variant="ghost" size="sm" onClick={() => handleToggle(skill.name, true)}>启用</Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(skill.name)} className="!text-danger">删除</Button>
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          </div>
        )}
        {skills.length === 0 && (
          <div className="mb-section-gap">
            <EmptyState title="暂无技能" description="导入 .md 文件、.zip 压缩包或包含 SKILL.md 的文件夹来添加技能" />
          </div>
        )}
        <div className="mb-section-gap">
          <SectionHeader title="新增技能" />
          <div className="bg-bg-surface-1 border border-line-default rounded-card p-card-p">
            <div className="mb-3">
              <Button variant="secondary" size="sm" onClick={handleImport}>导入技能</Button>
            </div>
            <p className="text-label-xs text-text-muted">需要包含 SKILL.md 文件</p>
          </div>
        </div>
        {importError && <p className="text-body-sm text-danger">{importError}</p>}
      </div>
      {detailSkill && (
        <div className="fixed inset-0 bg-bg-app/80 backdrop-blur-sm flex items-center justify-center z-50" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} onClick={() => setDetailSkill(null)}>
          <div className="bg-bg-surface-2 rounded-card p-6 max-w-xl w-[90%] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-section-title text-text-primary min-w-0 truncate">{detailSkill.name}</h2>
              <Button variant="ghost" size="sm" className="flex-shrink-0 ml-3" onClick={() => setDetailSkill(null)}>关闭</Button>
            </div>
            <pre className="bg-bg-app rounded-input p-4 overflow-auto flex-1 text-body-sm leading-relaxed whitespace-pre-wrap break-words text-text-secondary">
              {detailSkill.content}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
