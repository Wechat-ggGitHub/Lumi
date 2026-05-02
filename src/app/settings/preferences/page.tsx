'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';

export default function PreferencesSettingsPage() {
  const [permissionMode, setPermissionMode] = useState('confirm');
  const [enterBehavior, setEnterBehavior] = useState('send');

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader title="交互偏好" subtitle="自定义 Shrew 的交互方式" onBack={() => window.history.back()} />
      <div className="flex-1 px-page-x pt-page-top space-y-section-gap">
        <div>
          <SectionHeader title="权限模式" description="Shrew 执行命令时的确认策略" />
          <div className="mt-widget-gap">
            <ChipGroup
              options={['confirm', 'auto']}
              value={permissionMode}
              onChange={setPermissionMode}
            />
          </div>
        </div>
        <div>
          <SectionHeader title="Enter 键行为" description="在输入框中按下 Enter 键的默认行为" />
          <div className="mt-widget-gap">
            <ChipGroup
              options={['send', 'newline']}
              value={enterBehavior}
              onChange={setEnterBehavior}
            />
          </div>
        </div>
      </div>
      <BottomActionBar>
        <Button variant="primary">保存更改</Button>
      </BottomActionBar>
    </div>
  );
}
