import fs from 'fs';
import path from 'path';
import type { McpServerConfig } from '@/types';

function getMcpDir(lumiDir: string): string {
  return path.join(lumiDir, 'mcp');
}

function ensureMcpDir(lumiDir: string): void {
  const dir = getMcpDir(lumiDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// --- MCP Servers ---

export function loadMcpServers(lumiDir: string): McpServerConfig[] {
  const filePath = path.join(getMcpDir(lumiDir), 'servers.json');
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch {}
  saveMcpServers(lumiDir, []);
  return [];
}

function saveMcpServers(lumiDir: string, servers: McpServerConfig[]): void {
  ensureMcpDir(lumiDir);
  const filePath = path.join(getMcpDir(lumiDir), 'servers.json');
  fs.writeFileSync(filePath, JSON.stringify(servers, null, 2));
}

export function addMcpServer(lumiDir: string, config: Omit<McpServerConfig, 'id'>): McpServerConfig[] {
  const servers = loadMcpServers(lumiDir);
  const id = `mcp-${Date.now()}`;
  servers.push({ ...config, id });
  saveMcpServers(lumiDir, servers);
  return servers;
}

export function updateMcpServer(lumiDir: string, id: string, updates: Partial<Omit<McpServerConfig, 'id'>>): McpServerConfig[] {
  const servers = loadMcpServers(lumiDir);
  const updated = servers.map(s => s.id === id ? { ...s, ...updates } : s);
  saveMcpServers(lumiDir, updated);
  return updated;
}

export function removeMcpServer(lumiDir: string, id: string): McpServerConfig[] {
  const servers = loadMcpServers(lumiDir);
  const updated = servers.filter(s => s.id !== id);
  saveMcpServers(lumiDir, updated);
  return updated;
}
