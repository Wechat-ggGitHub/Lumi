import fs from 'fs';
import path from 'path';
import os from 'os';
import { buildPersonaContext, writeProfile, writePersonaMarkdown, ensurePersonaDir, getPersonaDir, readPersonaMarkdown, syncNameToMarkdown } from '@/lib/persona-file';

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
});

describe('syncNameToMarkdown', () => {
  const tmpDir = path.join(os.tmpdir(), `shrew-test-sync-${Date.now()}`);

  beforeAll(() => {
    ensurePersonaDir(tmpDir);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('syncs "你的名字叫X" to new name', () => {
    writeProfile(tmpDir, { name: '钱钱', avatar: null });
    writePersonaMarkdown(tmpDir, '你的名字叫多多，你是一个有趣的助手。');

    const changed = syncNameToMarkdown(tmpDir);

    expect(changed).toBe(true);
    expect(readPersonaMarkdown(tmpDir)).toBe('你的名字叫钱钱，你是一个有趣的助手。');
  });

  it('syncs "我叫X" to new name', () => {
    writeProfile(tmpDir, { name: '小助手', avatar: null });
    writePersonaMarkdown(tmpDir, '我叫老王，喜欢写代码。');

    const changed = syncNameToMarkdown(tmpDir);

    expect(changed).toBe(true);
    expect(readPersonaMarkdown(tmpDir)).toBe('我叫小助手，喜欢写代码。');
  });

  it('returns false when no name references found', () => {
    writeProfile(tmpDir, { name: 'Shrew', avatar: null });
    writePersonaMarkdown(tmpDir, '你是一个专业、高效的编程助手。');

    const changed = syncNameToMarkdown(tmpDir);

    expect(changed).toBe(false);
    expect(readPersonaMarkdown(tmpDir)).toBe('你是一个专业、高效的编程助手。');
  });

  it('handles multiple name patterns in one file', () => {
    writeProfile(tmpDir, { name: '钱钱', avatar: null });
    writePersonaMarkdown(tmpDir, '你的名字叫多多。我叫多多。');

    const changed = syncNameToMarkdown(tmpDir);

    expect(changed).toBe(true);
    expect(readPersonaMarkdown(tmpDir)).toBe('你的名字叫钱钱。我叫钱钱。');
  });
});
