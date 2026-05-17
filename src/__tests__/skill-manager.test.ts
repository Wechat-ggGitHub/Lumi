import fs from 'fs';
import path from 'path';
import os from 'os';
import AdmZip from 'adm-zip';
import { scanSkills, importSkill, importSkillFromMd, importSkillFromZip, deleteSkill, buildSkillCatalog, parseSkillFrontmatter } from '../lib/skill-manager';

describe('skill-manager', () => {
  let skillsDir: string;

  beforeEach(() => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumi-test-'));
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
      const srcTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumi-src-'));
      fs.writeFileSync(path.join(srcTmp, 'SKILL.md'), '---\nname: my-skill\ndescription: desc\n---\n# 指令');
      const result = importSkill(srcTmp, skillsDir);
      expect(result).toBe(true);
      expect(fs.existsSync(path.join(skillsDir, 'my-skill', 'SKILL.md'))).toBe(true);
      fs.rmSync(srcTmp, { recursive: true, force: true });
    });

    it('目录名取自 SKILL.md 的 name 字段', () => {
      const srcTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumi-src-'));
      fs.writeFileSync(path.join(srcTmp, 'SKILL.md'), '---\nname: my-skill\ndescription: desc\n---\n# 指令');
      importSkill(srcTmp, skillsDir);
      expect(fs.existsSync(path.join(skillsDir, 'my-skill'))).toBe(true);
      fs.rmSync(srcTmp, { recursive: true, force: true });
    });

    it('导入失败当源目录没有 SKILL.md', () => {
      const srcTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumi-src-'));
      const result = importSkill(srcTmp, skillsDir);
      expect(result).toBe(false);
      fs.rmSync(srcTmp, { recursive: true, force: true });
    });

    it('导入失败当目标已存在同名 skill', () => {
      const srcTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumi-src-'));
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

  describe('importSkillFromMd', () => {
    it('将 .md 文件导入为技能目录', () => {
      const srcFile = path.join(skillsDir, '..', 'test-skill.md');
      fs.writeFileSync(srcFile, '---\nname: my-md-skill\ndescription: from md\n---\n# 指令正文');
      const result = importSkillFromMd(srcFile, skillsDir);
      expect(result).toBe(true);
      expect(fs.existsSync(path.join(skillsDir, 'my-md-skill', 'SKILL.md'))).toBe(true);
      const content = fs.readFileSync(path.join(skillsDir, 'my-md-skill', 'SKILL.md'), 'utf-8');
      expect(content).toContain('指令正文');
    });

    it('导入失败当 .md 没有 frontmatter name', () => {
      const srcFile = path.join(skillsDir, '..', 'no-name.md');
      fs.writeFileSync(srcFile, '# 没有frontmatter的文件');
      const result = importSkillFromMd(srcFile, skillsDir);
      expect(result).toBe(false);
    });

    it('导入失败当 name 无效（含特殊字符）', () => {
      const srcFile = path.join(skillsDir, '..', 'bad-name.md');
      fs.writeFileSync(srcFile, '---\nname: ../evil\ndescription: hack\n---\n# 指令');
      const result = importSkillFromMd(srcFile, skillsDir);
      expect(result).toBe(false);
    });

    it('导入失败当同名技能已存在', () => {
      const existing = path.join(skillsDir, 'existing-skill');
      fs.mkdirSync(existing);
      fs.writeFileSync(path.join(existing, 'SKILL.md'), '---\nname: existing-skill\ndescription: old\n---\n');

      const srcFile = path.join(skillsDir, '..', 'dup.md');
      fs.writeFileSync(srcFile, '---\nname: existing-skill\ndescription: new\n---\n# 指令');
      const result = importSkillFromMd(srcFile, skillsDir);
      expect(result).toBe(false);
    });
  });

  describe('importSkillFromZip', () => {
    const makeZip = (entries: { path: string; content: string }[]): string => {
      const zip = new AdmZip();
      for (const entry of entries) {
        zip.addFile(entry.path, Buffer.from(entry.content, 'utf-8'));
      }
      const zipPath = path.join(skillsDir, '..', `test-${Date.now()}.zip`);
      zip.writeZip(zipPath);
      return zipPath;
    };

    it('导入扁平 zip（根目录含 SKILL.md）', () => {
      const zipPath = makeZip([
        { path: 'SKILL.md', content: '---\nname: zip-flat\ndescription: flat zip\n---\n# 指令' },
      ]);
      const result = importSkillFromZip(zipPath, skillsDir);
      expect(result).toBe(true);
      expect(fs.existsSync(path.join(skillsDir, 'zip-flat', 'SKILL.md'))).toBe(true);
      expect(fs.readFileSync(path.join(skillsDir, 'zip-flat', 'SKILL.md'), 'utf-8')).toContain('指令');
    });

    it('导入嵌套 zip（子文件夹含 SKILL.md）', () => {
      const zipPath = makeZip([
        { path: 'my-skill/SKILL.md', content: '---\nname: nested-skill\ndescription: nested\n---\n# 指令' },
      ]);
      const result = importSkillFromZip(zipPath, skillsDir);
      expect(result).toBe(true);
      expect(fs.existsSync(path.join(skillsDir, 'nested-skill', 'SKILL.md'))).toBe(true);
    });

    it('导入包含 references 文件夹的 zip', () => {
      const zipPath = makeZip([
        { path: 'SKILL.md', content: '---\nname: with-refs\ndescription: has refs\n---\n# 指令' },
        { path: 'references/guide.md', content: '# 参考文档' },
      ]);
      const result = importSkillFromZip(zipPath, skillsDir);
      expect(result).toBe(true);
      expect(fs.existsSync(path.join(skillsDir, 'with-refs', 'references', 'guide.md'))).toBe(true);
    });

    it('导入失败当 zip 没有 SKILL.md', () => {
      const zipPath = makeZip([
        { path: 'README.md', content: '# 没有SKILL.md' },
      ]);
      const result = importSkillFromZip(zipPath, skillsDir);
      expect(result).toBe(false);
    });

    it('导入失败当 SKILL.md 的 name 无效', () => {
      const zipPath = makeZip([
        { path: 'SKILL.md', content: '---\nname: ../evil\ndescription: hack\n---\n# 指令' },
      ]);
      const result = importSkillFromZip(zipPath, skillsDir);
      expect(result).toBe(false);
    });

    it('导入失败当同名技能已存在', () => {
      const existing = path.join(skillsDir, 'dup-skill');
      fs.mkdirSync(existing);
      fs.writeFileSync(path.join(existing, 'SKILL.md'), '---\nname: dup-skill\ndescription: old\n---\n');

      const zipPath = makeZip([
        { path: 'SKILL.md', content: '---\nname: dup-skill\ndescription: new\n---\n# 指令' },
      ]);
      const result = importSkillFromZip(zipPath, skillsDir);
      expect(result).toBe(false);
    });
  });
});
