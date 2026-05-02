'use client';

import { PageHeader } from '@/components/ui/PageHeader';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { useEffect, useState } from 'react';
import { getThemePreference, setThemePreference } from '@/lib/theme';

type ThemeMode = 'system' | 'light' | 'dark';

export default function AppearanceSettingsPage() {
  const [mode, setMode] = useState<ThemeMode>('system');

  useEffect(() => {
    setMode(getThemePreference());
  }, []);

  function handleChange(value: string) {
    const newMode = value as ThemeMode;
    setMode(newMode);
    setThemePreference(newMode);
  }

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader title="外观" subtitle="选择 Shrew 的外观模式" onBack={() => window.history.back()} />
      <div className="flex-1 px-page-x pt-page-top">
        <SectionHeader title="外观模式" description="选择你偏好的配色方案。选择后立即生效。" />
        <div className="mt-widget-gap">
          <ChipGroup
            options={['system', 'light', 'dark']}
            value={mode}
            onChange={handleChange}
          />
          <div className="mt-block-gap flex gap-4">
            <div className="flex-1 rounded-card p-card-p border border-line-default text-center">
              <div className="text-card-title text-text-primary mb-1">浅色</div>
              <div className="text-body-sm text-text-muted">适合明亮环境</div>
            </div>
            <div className="flex-1 rounded-card p-card-p border border-line-default text-center">
              <div className="text-card-title text-text-primary mb-1">深色</div>
              <div className="text-body-sm text-text-muted">适合暗光环境</div>
            </div>
            <div className="flex-1 rounded-card p-card-p border border-line-default text-center">
              <div className="text-card-title text-text-primary mb-1">跟随系统</div>
              <div className="text-body-sm text-text-muted">自动适配</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
