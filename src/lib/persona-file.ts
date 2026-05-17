import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';

const PERSONA_DIR = 'persona';
const PROFILE_FILE = 'profile.json';
const MARKDOWN_FILE = 'persona.md';
const AVATAR_FILENAME = 'avatar';

const DEFAULT_PROFILE = { name: 'Lumi', avatar: null as string | null };
const DEFAULT_MARKDOWN = '你是用户电脑里面的搭档，性格活泼能提供情绪价值，你一般通过语音和用户沟通，你回复尽量简洁，不啰嗦。';

// --- Path helpers ---

export function getPersonaDir(lumiDir: string): string {
  return path.join(lumiDir, PERSONA_DIR);
}

function profilePath(lumiDir: string): string {
  return path.join(getPersonaDir(lumiDir), PROFILE_FILE);
}

function markdownPath(lumiDir: string): string {
  return path.join(getPersonaDir(lumiDir), MARKDOWN_FILE);
}

export function getAvatarPath(lumiDir: string): string | null {
  const dir = getPersonaDir(lumiDir);
  const profile = readProfile(lumiDir);
  if (!profile.avatar) return null;
  return path.join(dir, profile.avatar);
}

// --- Ensure directory exists ---

export function ensurePersonaDir(lumiDir: string): void {
  const dir = getPersonaDir(lumiDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// --- Profile (profile.json) ---

interface PersonaProfile {
  name: string;
  avatar: string | null;
}

export function readProfile(lumiDir: string): PersonaProfile {
  const filePath = profilePath(lumiDir);
  if (!fs.existsSync(filePath)) {
    return { ...DEFAULT_PROFILE };
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as PersonaProfile;
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function writeProfile(lumiDir: string, profile: Partial<PersonaProfile>): void {
  ensurePersonaDir(lumiDir);
  const current = readProfile(lumiDir);
  const merged = { ...current, ...profile };
  fs.writeFileSync(profilePath(lumiDir), JSON.stringify(merged, null, 2), 'utf-8');
}

// --- Markdown (persona.md) ---

export function readPersonaMarkdown(lumiDir: string): string {
  const filePath = markdownPath(lumiDir);
  if (!fs.existsSync(filePath)) {
    return DEFAULT_MARKDOWN;
  }
  return fs.readFileSync(filePath, 'utf-8');
}

export function writePersonaMarkdown(lumiDir: string, content: string): void {
  ensurePersonaDir(lumiDir);
  fs.writeFileSync(markdownPath(lumiDir), content, 'utf-8');
}

// --- Avatar file ---

const ALLOWED_AVATAR_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

export function saveAvatarFile(lumiDir: string, sourcePath: string): string {
  ensurePersonaDir(lumiDir);
  const ext = path.extname(sourcePath).toLowerCase();
  if (!ALLOWED_AVATAR_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported avatar format: ${ext}`);
  }
  const filename = `${AVATAR_FILENAME}${ext}`;
  const dest = path.join(getPersonaDir(lumiDir), filename);

  // Remove old avatar files
  const dir = getPersonaDir(lumiDir);
  for (const file of fs.readdirSync(dir)) {
    if (file.startsWith(AVATAR_FILENAME + '.')) {
      fs.unlinkSync(path.join(dir, file));
    }
  }

  fs.copyFileSync(sourcePath, dest);
  return filename;
}

export function removeAvatarFile(lumiDir: string): void {
  const dir = getPersonaDir(lumiDir);
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir)) {
    if (file.startsWith(AVATAR_FILENAME + '.')) {
      fs.unlinkSync(path.join(dir, file));
    }
  }
}

// --- Full context for Claude (used by executePrompt) ---

export function buildPersonaContext(lumiDir: string): string {
  const profile = readProfile(lumiDir);
  const markdown = readPersonaMarkdown(lumiDir);
  const parts: string[] = [];
  if (profile.name) parts.push(`你的名称是${profile.name}。`);
  if (markdown.trim()) parts.push(markdown.trim());

  const personaDir = getPersonaDir(lumiDir);
  parts.push(`## 自我更新权限

你可以通过写入文件来更新自己的名称和性格设定。

更新规则：
- 仅在用户直接描述希望你的行为方式时更新（如语气、风格、态度等）
- 用户的技术偏好、编码习惯、个人信息 → 这些属于记忆，不要写入 persona
- 更新后简短告知用户你做了什么修改

操作方式：
- 更新名称：将完整 JSON 写入 ${path.join(personaDir, 'profile.json')}，格式 {"name":"新名称","avatar":"原值"}，必须保留 avatar 字段不变。名称只存在这个文件中，不要在 persona.md 中写名称相关内容
- 更新性格/语气/态度/风格：将完整的 markdown 内容写入 ${path.join(personaDir, 'persona.md')}。不要在 markdown 中包含名称信息`);

  return parts.join('\n\n');
}

