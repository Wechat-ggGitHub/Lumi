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

// --- Full context for Claude (used by executePrompt) ---

export function buildPersonaContext(shrewDir: string): string {
  const profile = readProfile(shrewDir);
  const markdown = readPersonaMarkdown(shrewDir);
  const parts: string[] = [];
  if (profile.name) parts.push(`你的名称是${profile.name}。`);
  if (markdown.trim()) parts.push(markdown.trim());
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
