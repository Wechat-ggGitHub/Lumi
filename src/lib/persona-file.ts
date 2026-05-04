import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';

const PERSONA_DIR = 'persona';
const PROFILE_FILE = 'profile.json';
const MARKDOWN_FILE = 'persona.md';
const AVATAR_FILENAME = 'avatar';

const DEFAULT_PROFILE = { name: 'Shrew', avatar: null as string | null };
const DEFAULT_MARKDOWN = '你是一个专业、高效的编程助手。';

// --- Path helpers ---

export function getPersonaDir(shrewDir: string): string {
  return path.join(shrewDir, PERSONA_DIR);
}

function profilePath(shrewDir: string): string {
  return path.join(getPersonaDir(shrewDir), PROFILE_FILE);
}

function markdownPath(shrewDir: string): string {
  return path.join(getPersonaDir(shrewDir), MARKDOWN_FILE);
}

export function getAvatarPath(shrewDir: string): string | null {
  const dir = getPersonaDir(shrewDir);
  const profile = readProfile(shrewDir);
  if (!profile.avatar) return null;
  return path.join(dir, profile.avatar);
}

// --- Ensure directory exists ---

export function ensurePersonaDir(shrewDir: string): void {
  const dir = getPersonaDir(shrewDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// --- Profile (profile.json) ---

interface PersonaProfile {
  name: string;
  avatar: string | null;
}

export function readProfile(shrewDir: string): PersonaProfile {
  const filePath = profilePath(shrewDir);
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

export function writeProfile(shrewDir: string, profile: Partial<PersonaProfile>): void {
  ensurePersonaDir(shrewDir);
  const current = readProfile(shrewDir);
  const merged = { ...current, ...profile };
  fs.writeFileSync(profilePath(shrewDir), JSON.stringify(merged, null, 2), 'utf-8');
}

// --- Markdown (persona.md) ---

export function readPersonaMarkdown(shrewDir: string): string {
  const filePath = markdownPath(shrewDir);
  if (!fs.existsSync(filePath)) {
    return DEFAULT_MARKDOWN;
  }
  return fs.readFileSync(filePath, 'utf-8');
}

export function writePersonaMarkdown(shrewDir: string, content: string): void {
  ensurePersonaDir(shrewDir);
  fs.writeFileSync(markdownPath(shrewDir), content, 'utf-8');
}

// --- Avatar file ---

const ALLOWED_AVATAR_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

export function saveAvatarFile(shrewDir: string, sourcePath: string): string {
  ensurePersonaDir(shrewDir);
  const ext = path.extname(sourcePath).toLowerCase();
  if (!ALLOWED_AVATAR_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported avatar format: ${ext}`);
  }
  const filename = `${AVATAR_FILENAME}${ext}`;
  const dest = path.join(getPersonaDir(shrewDir), filename);

  // Remove old avatar files
  const dir = getPersonaDir(shrewDir);
  for (const file of fs.readdirSync(dir)) {
    if (file.startsWith(AVATAR_FILENAME + '.')) {
      fs.unlinkSync(path.join(dir, file));
    }
  }

  fs.copyFileSync(sourcePath, dest);
  return filename;
}

export function removeAvatarFile(shrewDir: string): void {
  const dir = getPersonaDir(shrewDir);
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir)) {
    if (file.startsWith(AVATAR_FILENAME + '.')) {
      fs.unlinkSync(path.join(dir, file));
    }
  }
}

// --- Name sync: keep persona.md name references consistent with profile.json ---

// 匹配 persona.md 中常见的名称引用模式
// 名称部分：1-20 个中文字符、英文字母、数字、下划线、短横线
const NAME_CHAR = '[\\u4e00-\\u9fff\\w-]{1,20}';
const NAME_PATTERNS = [
  new RegExp(`你的名字[叫是]${NAME_CHAR}`, 'g'),
  new RegExp(`我叫${NAME_CHAR}`, 'g'),
  new RegExp(`你的名称[叫是]${NAME_CHAR}`, 'g'),
  new RegExp(`名字[：:]\\s*${NAME_CHAR}`, 'g'),
];

export function syncNameToMarkdown(shrewDir: string): boolean {
  const profile = readProfile(shrewDir);
  if (!profile.name) return false;

  const mdPath = markdownPath(shrewDir);
  if (!fs.existsSync(mdPath)) return false;

  let content = fs.readFileSync(mdPath, 'utf-8');
  let changed = false;

  for (const pattern of NAME_PATTERNS) {
    const updated = content.replace(pattern, (match) => {
      // 提取前缀（如"你的名字叫"）和旧名称
      const prefixMatch = match.match(/^(.+?)[叫是：:]\s*/);
      if (!prefixMatch) return match;
      const prefix = prefixMatch[1];
      const sep = match.includes('：') ? '：' : match.includes(':') ? ':' : match.includes('叫') ? '叫' : '是';
      const newName = match.includes('：') || match.includes(':')
        ? `${prefix}${sep} ${profile.name}`
        : `${prefix}${sep}${profile.name}`;
      if (newName !== match) changed = true;
      return newName;
    });
    content = updated;
  }

  if (changed) {
    writePersonaMarkdown(shrewDir, content);
  }
  return changed;
}

// --- Full context for Claude (used by executePrompt) ---

export function buildPersonaContext(shrewDir: string): string {
  const profile = readProfile(shrewDir);
  const markdown = readPersonaMarkdown(shrewDir);
  const parts: string[] = [];
  if (profile.name) parts.push(`你的名称是${profile.name}。`);
  if (markdown.trim()) parts.push(markdown.trim());

  const personaDir = getPersonaDir(shrewDir);
  parts.push(`## 自我更新权限

你可以通过写入文件来更新自己的名称和性格设定。

更新规则：
- 仅在用户直接描述希望你的行为方式时更新（如语气、风格、态度等）
- 用户的技术偏好、编码习惯、个人信息 → 这些属于记忆，不要写入 persona
- 更新后简短告知用户你做了什么修改

操作方式：
- 更新名称：将完整 JSON 写入 ${path.join(personaDir, 'profile.json')}，格式 {"name":"新名称","avatar":"原值"}，必须保留 avatar 字段不变
- 更新性格/语气/态度/风格：将完整的 markdown 内容写入 ${path.join(personaDir, 'persona.md')}`);

  return parts.join('\n\n');
}

// --- Migration from old single-file and DB ---

export function migratePersona(shrewDir: string, db: Database.Database): void {
  const personaDir = getPersonaDir(shrewDir);
  if (fs.existsSync(personaDir)) return;

  fs.mkdirSync(personaDir, { recursive: true });

  // Migrate from old persona.md at ~/.shrew/persona.md
  const oldFile = path.join(shrewDir, 'persona.md');
  if (fs.existsSync(oldFile)) {
    const raw = fs.readFileSync(oldFile, 'utf-8');
    // Extract name from "你的名称是X。" line
    const nameMatch = raw.match(/你的名称是(.+?)。/);
    const name = nameMatch ? nameMatch[1] : 'Shrew';
    // Remove the name line, keep the rest
    const content = raw.replace(/你的名称是.+?\n?/, '').trim();
    writeProfile(shrewDir, { name, avatar: null });
    writePersonaMarkdown(shrewDir, content || DEFAULT_MARKDOWN);
    fs.unlinkSync(oldFile);
    return;
  }

  // Migrate from DB
  const row = db.prepare(`SELECT * FROM persona WHERE id = 1`).get() as Record<string, unknown> | undefined;
  if (!row) {
    writeProfile(shrewDir, DEFAULT_PROFILE);
    writePersonaMarkdown(shrewDir, DEFAULT_MARKDOWN);
    return;
  }

  const name = String(row.name || 'Shrew');
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

  writeProfile(shrewDir, { name, avatar: null });
  writePersonaMarkdown(shrewDir, parts.join('\n') || DEFAULT_MARKDOWN);
}
