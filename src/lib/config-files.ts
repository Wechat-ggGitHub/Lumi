import fs from 'fs';
import path from 'path';
import type { SkillConfig, McpServerConfig } from '@/types';

const CONFIG_DIR_NAME = 'config';

function getConfigDir(userDataDir: string): string {
  return path.join(userDataDir, CONFIG_DIR_NAME);
}

function ensureConfigDir(userDataDir: string): void {
  const dir = getConfigDir(userDataDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// --- Skills ---

const DEFAULT_SKILLS: SkillConfig[] = [
  { id: 'voice-input', name: '语音输入', description: '通过右 Command 键唤起语音快捷输入', enabled: true },
  { id: 'auto-memory', name: '自动记忆', description: '任务完成后自动提炼长期记忆', enabled: true },
];

export function loadSkills(userDataDir: string): SkillConfig[] {
  const filePath = path.join(getConfigDir(userDataDir), 'skills.json');
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch {}
  saveSkills(userDataDir, DEFAULT_SKILLS);
  return DEFAULT_SKILLS;
}

export function saveSkills(userDataDir: string, skills: SkillConfig[]): void {
  ensureConfigDir(userDataDir);
  const filePath = path.join(getConfigDir(userDataDir), 'skills.json');
  fs.writeFileSync(filePath, JSON.stringify(skills, null, 2));
}

export function toggleSkill(userDataDir: string, skillId: string, enabled: boolean): SkillConfig[] {
  const skills = loadSkills(userDataDir);
  const updated = skills.map(s => s.id === skillId ? { ...s, enabled } : s);
  saveSkills(userDataDir, updated);
  return updated;
}

export function configureSkill(userDataDir: string, skillId: string, params: Record<string, string>): SkillConfig[] {
  const skills = loadSkills(userDataDir);
  const updated = skills.map(s => s.id === skillId ? { ...s, params: { ...s.params, ...params } } : s);
  saveSkills(userDataDir, updated);
  return updated;
}

// --- MCP Servers ---

export function loadMcpServers(userDataDir: string): McpServerConfig[] {
  const filePath = path.join(getConfigDir(userDataDir), 'mcp-servers.json');
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch {}
  saveMcpServers(userDataDir, []);
  return [];
}

export function saveMcpServers(userDataDir: string, servers: McpServerConfig[]): void {
  ensureConfigDir(userDataDir);
  const filePath = path.join(getConfigDir(userDataDir), 'mcp-servers.json');
  fs.writeFileSync(filePath, JSON.stringify(servers, null, 2));
}

export function addMcpServer(userDataDir: string, config: Omit<McpServerConfig, 'id'>): McpServerConfig[] {
  const servers = loadMcpServers(userDataDir);
  const id = `mcp-${Date.now()}`;
  servers.push({ ...config, id });
  saveMcpServers(userDataDir, servers);
  return servers;
}

export function updateMcpServer(userDataDir: string, id: string, updates: Partial<Omit<McpServerConfig, 'id'>>): McpServerConfig[] {
  const servers = loadMcpServers(userDataDir);
  const updated = servers.map(s => s.id === id ? { ...s, ...updates } : s);
  saveMcpServers(userDataDir, updated);
  return updated;
}

export function removeMcpServer(userDataDir: string, id: string): McpServerConfig[] {
  const servers = loadMcpServers(userDataDir);
  const updated = servers.filter(s => s.id !== id);
  saveMcpServers(userDataDir, updated);
  return updated;
}
