'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SingleLineInput } from '@/components/ui/SingleLineInput';
import { Button } from '@/components/ui/Button';
import { BottomActionBar } from '@/components/ui/BottomActionBar';

export default function PrivacySettingsPage() {
  const [retentionDays, setRetentionDays] = useState('30');

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader title="数据与隐私" subtitle="管理数据保留和清除" onBack={() => window.history.back()} />
      <div className="flex-1 px-page-x pt-page-top space-y-section-gap">
        <div>
          <SectionHeader title="执行历史" description="控制 Shrew 保留执行记录的时长" />
          <div className="mt-widget-gap">
            <SingleLineInput
              label="保留天数"
              type="number"
              value={retentionDays}
              onChange={(e) => setRetentionDays(e.target.value)}
              helperText="超过天数的历史记录将自动清除"
            />
          </div>
        </div>
        <div>
          <SectionHeader title="清除数据" description="立即清除所有执行历史" />
          <div className="mt-widget-gap">
            <Button variant="secondary" size="sm">清除执行历史</Button>
          </div>
        </div>
      </div>
      <BottomActionBar>
        <Button variant="primary">保存更改</Button>
      </BottomActionBar>
    </div>
  );
}
