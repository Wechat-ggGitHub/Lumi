import fs from 'fs';
import path from 'path';
import type { McpServerConfig } from '@/types';

function getMcpDir(aivaDir: string): string {
  return path.join(aivaDir, 'mcp');
}

function ensureMcpDir(aivaDir: string): void {
  const dir = getMcpDir(aivaDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// --- MCP Servers ---

export function loadMcpServers(aivaDir: string): McpServerConfig[] {
  const filePath = path.join(getMcpDir(aivaDir), 'servers.json');
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch {}
  saveMcpServers(aivaDir, []);
  return [];
}

function saveMcpServers(aivaDir: string, servers: McpServerConfig[]): void {
  ensureMcpDir(aivaDir);
  const filePath = path.join(getMcpDir(aivaDir), 'servers.json');
  fs.writeFileSync(filePath, JSON.stringify(servers, null, 2));
}

export function addMcpServer(aivaDir: string, config: Omit<McpServerConfig, 'id'>): McpServerConfig[] {
  const servers = loadMcpServers(aivaDir);
  const id = `mcp-${Date.now()}`;
  servers.push({ ...config, id });
  saveMcpServers(aivaDir, servers);
  return servers;
}

export function updateMcpServer(aivaDir: string, id: string, updates: Partial<Omit<McpServerConfig, 'id'>>): McpServerConfig[] {
  const servers = loadMcpServers(aivaDir);
  const updated = servers.map(s => s.id === id ? { ...s, ...updates } : s);
  saveMcpServers(aivaDir, updated);
  return updated;
}

export function removeMcpServer(aivaDir: string, id: string): McpServerConfig[] {
  const servers = loadMcpServers(aivaDir);
  const updated = servers.filter(s => s.id !== id);
  saveMcpServers(aivaDir, updated);
  return updated;
}
