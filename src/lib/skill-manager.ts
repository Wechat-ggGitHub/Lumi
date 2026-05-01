import fs from 'fs';
import path from 'path';
import os from 'os';
import AdmZip from 'adm-zip';

function isValidSkillName(name: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(name) && name.length > 0 && name.length < 128;
}

export interface SkillInfo {
  name: string;
  description: string;
  enabled: boolean;
  skillDir: string;
}

export function parseSkillFrontmatter(content: string): { name: string; description: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return { name: '', description: '' };

  const frontmatter = match[1];
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  const descMatch = frontmatter.match(/^description:\s*(.+)$/m);

  return {
    name: nameMatch?.[1]?.trim() || '',
    description: descMatch?.[1]?.trim() || '',
  };
}

export function scanSkills(skillsDir: string, disabledSkills: string[]): SkillInfo[] {
  if (!fs.existsSync(skillsDir)) return [];

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  const skills: SkillInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillMdPath = path.join(skillsDir, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) continue;

    const content = fs.readFileSync(skillMdPath, 'utf-8');
    const { name, description } = parseSkillFrontmatter(content);
    if (!name || !isValidSkillName(name)) continue;

    skills.push({
      name,
      description,
      enabled: !disabledSkills.includes(name),
      skillDir: path.join(skillsDir, entry.name),
    });
  }

  return skills;
}

export function buildSkillCatalog(skillsDir: string, disabledSkills: string[]): string {
  const skills = scanSkills(skillsDir, disabledSkills);
  const enabled = skills.filter(s => s.enabled);
  if (enabled.length === 0) return '';

  const parts: string[] = [
    '# 可用技能\n',
    '以下是你可以使用的技能。当用户任务匹配某个技能时，按照该技能的指令执行。\n',
  ];

  for (const skill of enabled) {
    const skillMdPath = path.join(skill.skillDir, 'SKILL.md');
    const content = fs.readFileSync(skillMdPath, 'utf-8');
    parts.push('---');
    parts.push(content);
    parts.push('---\n');
  }

  return parts.join('\n');
}

export function importSkill(sourceDir: string, skillsDir: string): boolean {
  const skillMdPath = path.join(sourceDir, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) return false;

  const content = fs.readFileSync(skillMdPath, 'utf-8');
  const { name } = parseSkillFrontmatter(content);
  if (!name || !isValidSkillName(name)) return false;

  const targetDir = path.join(skillsDir, name);
  if (fs.existsSync(targetDir)) return false;

  fs.cpSync(sourceDir, targetDir, { recursive: true });
  return true;
}

export function importSkillFromMd(filePath: string, skillsDir: string): boolean {
  const content = fs.readFileSync(filePath, 'utf-8');
  const { name } = parseSkillFrontmatter(content);
  if (!name || !isValidSkillName(name)) return false;

  const targetDir = path.join(skillsDir, name);
  if (fs.existsSync(targetDir)) return false;

  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, 'SKILL.md'), content);
  return true;
}

function findSkillRootInZip(extractDir: string): string | null {
  if (fs.existsSync(path.join(extractDir, 'SKILL.md'))) return extractDir;

  const entries = fs.readdirSync(extractDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const resolved = path.resolve(extractDir, entry.name);
    if (!resolved.startsWith(extractDir + path.sep)) continue;
    if (fs.existsSync(path.join(resolved, 'SKILL.md'))) {
      return resolved;
    }
  }
  return null;
}

export function importSkillFromZip(filePath: string, skillsDir: string): boolean {
  let extractDir = '';
  try {
    extractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shrew-skill-'));
    const zip = new AdmZip(filePath);
    const zipEntries = zip.getEntries();
    for (const entry of zipEntries) {
      const resolved = path.resolve(extractDir, entry.entryName);
      if (!resolved.startsWith(extractDir + path.sep)) {
        return false;
      }
    }
    zip.extractAllTo(extractDir, true);

    const skillRoot = findSkillRootInZip(extractDir);
    if (!skillRoot) return false;

    const content = fs.readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf-8');
    const { name } = parseSkillFrontmatter(content);
    if (!name || !isValidSkillName(name)) return false;

    const targetDir = path.join(skillsDir, name);
    if (fs.existsSync(targetDir)) return false;

    fs.cpSync(skillRoot, targetDir, { recursive: true });
    return true;
  } finally {
    if (extractDir && fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
  }
}

export function deleteSkill(name: string, skillsDir: string): void {
  if (!isValidSkillName(name)) return;
  const targetDir = path.join(skillsDir, name);
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
}

export function readSkillContent(name: string, skillsDir: string): string | null {
  if (!isValidSkillName(name)) return null;
  const skillMdPath = path.join(skillsDir, name, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) return null;
  return fs.readFileSync(skillMdPath, 'utf-8');
}
