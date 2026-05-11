import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';

const PERSONA_DIR = 'persona';
const PROFILE_FILE = 'profile.json';
const MARKDOWN_FILE = 'persona.md';
const AVATAR_FILENAME = 'avatar';

const DEFAULT_PROFILE = { name: 'Aiva', avatar: null as string | null };
const DEFAULT_MARKDOWN = '你是用户电脑里面的搭档，性格活泼能提供情绪价值，你一般通过语音和用户沟通，你回复尽量简洁，不啰嗦。';

// --- Path helpers ---

export function getPersonaDir(aivaDir: string): string {
  return path.join(aivaDir, PERSONA_DIR);
}

function profilePath(aivaDir: string): string {
  return path.join(getPersonaDir(aivaDir), PROFILE_FILE);
}

function markdownPath(aivaDir: string): string {
  return path.join(getPersonaDir(aivaDir), MARKDOWN_FILE);
}

export function getAvatarPath(aivaDir: string): string | null {
  const dir = getPersonaDir(aivaDir);
  const profile = readProfile(aivaDir);
  if (!profile.avatar) return null;
  return path.join(dir, profile.avatar);
}

// --- Ensure directory exists ---

export function ensurePersonaDir(aivaDir: string): void {
  const dir = getPersonaDir(aivaDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// --- Profile (profile.json) ---

interface PersonaProfile {
  name: string;
  avatar: string | null;
}

export function readProfile(aivaDir: string): PersonaProfile {
  const filePath = profilePath(aivaDir);
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

export function writeProfile(aivaDir: string, profile: Partial<PersonaProfile>): void {
  ensurePersonaDir(aivaDir);
  const current = readProfile(aivaDir);
  const merged = { ...current, ...profile };
  fs.writeFileSync(profilePath(aivaDir), JSON.stringify(merged, null, 2), 'utf-8');
}

// --- Markdown (persona.md) ---

export function readPersonaMarkdown(aivaDir: string): string {
  const filePath = markdownPath(aivaDir);
  if (!fs.existsSync(filePath)) {
    return DEFAULT_MARKDOWN;
  }
  return fs.readFileSync(filePath, 'utf-8');
}

export function writePersonaMarkdown(aivaDir: string, content: string): void {
  ensurePersonaDir(aivaDir);
  fs.writeFileSync(markdownPath(aivaDir), content, 'utf-8');
}

// --- Avatar file ---

const ALLOWED_AVATAR_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

export function saveAvatarFile(aivaDir: string, sourcePath: string): string {
  ensurePersonaDir(aivaDir);
  const ext = path.extname(sourcePath).toLowerCase();
  if (!ALLOWED_AVATAR_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported avatar format: ${ext}`);
  }
  const filename = `${AVATAR_FILENAME}${ext}`;
  const dest = path.join(getPersonaDir(aivaDir), filename);

  // Remove old avatar files
  const dir = getPersonaDir(aivaDir);
  for (const file of fs.readdirSync(dir)) {
    if (file.startsWith(AVATAR_FILENAME + '.')) {
      fs.unlinkSync(path.join(dir, file));
    }
  }

  fs.copyFileSync(sourcePath, dest);
  return filename;
}

export function removeAvatarFile(aivaDir: string): void {
  const dir = getPersonaDir(aivaDir);
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir)) {
    if (file.startsWith(AVATAR_FILENAME + '.')) {
      fs.unlinkSync(path.join(dir, file));
    }
  }
}

// --- Full context for Claude (used by executePrompt) ---

export function buildPersonaContext(aivaDir: string): string {
  const profile = readProfile(aivaDir);
  const markdown = readPersonaMarkdown(aivaDir);
  const parts: string[] = [];
  if (profile.name) parts.push(`你的名称是${profile.name}。`);
  if (markdown.trim()) parts.push(markdown.trim());

  const personaDir = getPersonaDir(aivaDir);
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

// --- Migration from old single-file and DB ---

export function migratePersona(aivaDir: string, db: Database.Database): void {
  const personaDir = getPersonaDir(aivaDir);
  if (fs.existsSync(personaDir)) return;

  fs.mkdirSync(personaDir, { recursive: true });

  // Migrate from old persona.md at ~/.aiva/persona.md
  const oldFile = path.join(aivaDir, 'persona.md');
  if (fs.existsSync(oldFile)) {
    const raw = fs.readFileSync(oldFile, 'utf-8');
    // Extract name from "你的名称是X。" line
    const nameMatch = raw.match(/你的名称是(.+?)。/);
    const name = nameMatch ? nameMatch[1] : 'Aiva';
    // Remove the name line, keep the rest
    const content = raw.replace(/你的名称是.+?\n?/, '').trim();
    writeProfile(aivaDir, { name, avatar: null });
    writePersonaMarkdown(aivaDir, content || DEFAULT_MARKDOWN);
    fs.unlinkSync(oldFile);
    return;
  }

  // Migrate from DB
  const row = db.prepare(`SELECT * FROM persona WHERE id = 1`).get() as Record<string, unknown> | undefined;
  if (!row) {
    writeProfile(aivaDir, DEFAULT_PROFILE);
    writePersonaMarkdown(aivaDir, DEFAULT_MARKDOWN);
    return;
  }

  const name = String(row.name || 'Aiva');
  const parts: string[] = [];
  if (row.bio) parts.push(String(row.bio));
  const styleParts: string[] = [];
  if (row.personality) styleParts.push(`- 性格：${row.personality}`);
  if (row.tone) styleParts.push(`- 语气：${row.tone}`);
  if (row.detail_level) styleParts.push(`- 详细程度：${row.detail_level}`);
  if (row.clarify_pref) styleParts.push(`- 澄清偏好：${row.clarify_pref}`);
  if (row.work_style) styleParts.push(`- 工作方式：${row.work_style}`);
  if (styleParts.length > 0) { parts.push(`## 性格与风格`); parts.push(...styleParts); }
  if (row.system_prompt) parts.push(String(row.system_prompt));

  writeProfile(aivaDir, { name, avatar: null });
  writePersonaMarkdown(aivaDir, parts.join('\n') || DEFAULT_MARKDOWN);
}
