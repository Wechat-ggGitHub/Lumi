import fs from 'fs';
import path from 'path';
import type { McpServerConfig } from '@/types';

function getMcpDir(shrewDir: string): string {
  return path.join(shrewDir, 'mcp');
}

function ensureMcpDir(shrewDir: string): void {
  const dir = getMcpDir(shrewDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// --- MCP Servers ---

export function loadMcpServers(shrewDir: string): McpServerConfig[] {
  const filePath = path.join(getMcpDir(shrewDir), 'servers.json');
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch {}
  saveMcpServers(shrewDir, []);
  return [];
}

export function saveMcpServers(shrewDir: string, servers: McpServerConfig[]): void {
  ensureMcpDir(shrewDir);
  const filePath = path.join(getMcpDir(shrewDir), 'servers.json');
  fs.writeFileSync(filePath, JSON.stringify(servers, null, 2));
}

export function addMcpServer(shrewDir: string, config: Omit<McpServerConfig, 'id'>): McpServerConfig[] {
  const servers = loadMcpServers(shrewDir);
  const id = `mcp-${Date.now()}`;
  servers.push({ ...config, id });
  saveMcpServers(shrewDir, servers);
  return servers;
}

export function updateMcpServer(shrewDir: string, id: string, updates: Partial<Omit<McpServerConfig, 'id'>>): McpServerConfig[] {
  const servers = loadMcpServers(shrewDir);
  const updated = servers.map(s => s.id === id ? { ...s, ...updates } : s);
  saveMcpServers(shrewDir, updated);
  return updated;
}

export function removeMcpServer(shrewDir: string, id: string): McpServerConfig[] {
  const servers = loadMcpServers(shrewDir);
  const updated = servers.filter(s => s.id !== id);
  saveMcpServers(shrewDir, updated);
  return updated;
}
