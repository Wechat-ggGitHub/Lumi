import fs from 'fs';
import path from 'path';
import os from 'os';
import { buildPersonaContext, writeProfile, writePersonaMarkdown, ensurePersonaDir, getPersonaDir } from '@/lib/persona-file';

describe('buildPersonaContext', () => {
  const tmpDir = path.join(os.tmpdir(), `shrew-test-persona-${Date.now()}`);

  beforeAll(() => {
    ensurePersonaDir(tmpDir);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns persona content with self-update instructions', () => {
    writeProfile(tmpDir, { name: 'TestBot', avatar: null });
    writePersonaMarkdown(tmpDir, '你是一个测试助手。');

    const result = buildPersonaContext(tmpDir);

    // Should contain the name
    expect(result).toContain('你的名称是TestBot。');
    // Should contain the persona markdown
    expect(result).toContain('你是一个测试助手。');
    // Should contain self-update instructions
    expect(result).toContain('自我更新权限');
    // Should contain the absolute file paths (inside persona/ subdirectory)
    const personaDir = getPersonaDir(tmpDir);
    expect(result).toContain(path.join(personaDir, 'profile.json'));
    expect(result).toContain(path.join(personaDir, 'persona.md'));
  });

  it('includes persona vs memory boundary rule', () => {
    writeProfile(tmpDir, { name: 'Shrew', avatar: null });
    writePersonaMarkdown(tmpDir, '你好。');

    const result = buildPersonaContext(tmpDir);

    expect(result).toContain('属于记忆');
    expect(result).toContain('不要写入 persona');
  });

  it('instructs AI to keep name only in profile.json', () => {
    writeProfile(tmpDir, { name: 'Shrew', avatar: null });
    writePersonaMarkdown(tmpDir, '你好。');

    const result = buildPersonaContext(tmpDir);

    expect(result).toContain('名称只存在这个文件中');
    expect(result).toContain('不要在 persona.md 中写名称相关内容');
  });
});
