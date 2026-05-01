import fs from 'fs';
import path from 'path';
import os from 'os';
import { scanSkills, importSkill, deleteSkill, buildSkillCatalog, parseSkillFrontmatter } from '../lib/skill-manager';

describe('skill-manager', () => {
  let skillsDir: string;

  beforeEach(() => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shrew-test-'));
    skillsDir = path.join(tmp, 'skills');
    fs.mkdirSync(skillsDir);
  });

  afterEach(() => {
    const tmp = path.dirname(skillsDir);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  describe('parseSkillFrontmatter', () => {
    it('解析 SKILL.md frontmatter', () => {
      const content = '---\nname: tdd\ndescription: 测试驱动开发\n---\n# 指令正文';
      const result = parseSkillFrontmatter(content);
      expect(result.name).toBe('tdd');
      expect(result.description).toBe('测试驱动开发');
    });
  });

  describe('scanSkills', () => {
    it('返回空数组当目录为空', () => {
      const skills = scanSkills(skillsDir, []);
      expect(skills).toEqual([]);
    });

    it('扫描到包含 SKILL.md 的目录', () => {
      const skillDir = path.join(skillsDir, 'tdd');
      fs.mkdirSync(skillDir);
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: tdd\ndescription: 测试驱动开发\n---\n# 指令');
      const skills = scanSkills(skillsDir, []);
      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe('tdd');
      expect(skills[0].enabled).toBe(true);
    });

    it('过滤 disabledSkills 中的技能', () => {
      const skillDir = path.join(skillsDir, 'tdd');
      fs.mkdirSync(skillDir);
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: tdd\ndescription: 测试\n---\n# 指令');
      const skills = scanSkills(skillsDir, ['tdd']);
      expect(skills[0].enabled).toBe(false);
    });

    it('跳过没有 SKILL.md 的目录', () => {
      fs.mkdirSync(path.join(skillsDir, 'not-a-skill'));
      const skills = scanSkills(skillsDir, []);
      expect(skills).toEqual([]);
    });

    it('跳过含路径遍历字符的技能名', () => {
      const skillDir = path.join(skillsDir, 'evil');
      fs.mkdirSync(skillDir);
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: ../evil\ndescription: hack\n---\n# 指令');
      const skills = scanSkills(skillsDir, []);
      expect(skills).toEqual([]);
    });
  });

  describe('buildSkillCatalog', () => {
    it('为已启用 skill 构建 catalog 文本', () => {
      const skillDir = path.join(skillsDir, 'tdd');
      fs.mkdirSync(skillDir);
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: tdd\ndescription: 测试驱动\n---\n# 先写测试');

      const catalog = buildSkillCatalog(skillsDir, []);
      expect(catalog).toContain('可用技能');
      expect(catalog).toContain('先写测试');
    });

    it('不包含已禁用 skill 的正文', () => {
      const skillDir = path.join(skillsDir, 'tdd');
      fs.mkdirSync(skillDir);
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: tdd\ndescription: 测试驱动\n---\n# 先写测试');

      const catalog = buildSkillCatalog(skillsDir, ['tdd']);
      expect(catalog).not.toContain('先写测试');
    });

    it('无技能时返回空字符串', () => {
      const catalog = buildSkillCatalog(skillsDir, []);
      expect(catalog).toBe('');
    });
  });

  describe('importSkill', () => {
    it('将源文件夹复制到 skills 目录', () => {
      const srcTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shrew-src-'));
      fs.writeFileSync(path.join(srcTmp, 'SKILL.md'), '---\nname: my-skill\ndescription: desc\n---\n# 指令');
      const result = importSkill(srcTmp, skillsDir);
      expect(result).toBe(true);
      expect(fs.existsSync(path.join(skillsDir, 'my-skill', 'SKILL.md'))).toBe(true);
      fs.rmSync(srcTmp, { recursive: true, force: true });
    });

    it('目录名取自 SKILL.md 的 name 字段', () => {
      const srcTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shrew-src-'));
      fs.writeFileSync(path.join(srcTmp, 'SKILL.md'), '---\nname: my-skill\ndescription: desc\n---\n# 指令');
      importSkill(srcTmp, skillsDir);
      expect(fs.existsSync(path.join(skillsDir, 'my-skill'))).toBe(true);
      fs.rmSync(srcTmp, { recursive: true, force: true });
    });

    it('导入失败当源目录没有 SKILL.md', () => {
      const srcTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shrew-src-'));
      const result = importSkill(srcTmp, skillsDir);
      expect(result).toBe(false);
      fs.rmSync(srcTmp, { recursive: true, force: true });
    });

    it('导入失败当目标已存在同名 skill', () => {
      const srcTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shrew-src-'));
      fs.writeFileSync(path.join(srcTmp, 'SKILL.md'), '---\nname: my-skill\ndescription: desc\n---\n# 指令');
      importSkill(srcTmp, skillsDir);
      const result = importSkill(srcTmp, skillsDir);
      expect(result).toBe(false);
      fs.rmSync(srcTmp, { recursive: true, force: true });
    });
  });

  describe('deleteSkill', () => {
    it('删除技能目录', () => {
      const skillDir = path.join(skillsDir, 'tdd');
      fs.mkdirSync(skillDir);
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: tdd\ndescription: 测试\n---\n');
      deleteSkill('tdd', skillsDir);
      expect(fs.existsSync(skillDir)).toBe(false);
    });

    it('无异常当技能不存在', () => {
      expect(() => deleteSkill('nonexist', skillsDir)).not.toThrow();
    });
  });
});
