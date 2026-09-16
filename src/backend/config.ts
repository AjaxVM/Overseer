import fs from 'fs';
import os from 'os';
import path from 'path';

export const GLOBAL_CONFIG_PATH = path.join(os.homedir(), '.overseer.config.json');

export interface FrontmatterFieldConfig {
  name: string;
  type: 'string' | 'number' | 'enum';
  options?: string[];
}

export interface RepoConfig {
  docsDir: string;
  projectsDir: string;
  frontmatterSchema: FrontmatterFieldConfig[];
  idFormat?: string;
}

export const DEFAULT_REPO_CONFIG: RepoConfig = {
  docsDir: 'docs',
  projectsDir: 'projects',
  frontmatterSchema: [
    {
      name: 'status',
      type: 'enum',
      options: ['idea', 'designing', 'planning', 'ready', 'working', 'reviewing', 'done']
    },
    {
      name: 'type',
      type: 'enum',
      options: ['bug', 'feature',  'design']
    },
    {
      name: 'estimate',
      type: 'enum',
      options: ['tiny', 'small', 'medium', 'large', 'extra-large', 'unknown']
    },
    {
      name: 'complexity',
      type: 'enum',
      options: ['simple', 'moderate', 'intense', 'extreme']
    },
    {
      name: 'priority',
      type: 'enum',
      options: ['must', 'should', 'could', 'maybe']
    }
  ]
};

export function getOrInitRepoConfig(repoRoot: string): RepoConfig {
  const repoConfigPath = path.join(repoRoot, 'overseer.json');

  if (!fs.existsSync(repoConfigPath)) {
    fs.writeFileSync(repoConfigPath, JSON.stringify(DEFAULT_REPO_CONFIG, null, 2) + '\n', 'utf-8');
    return DEFAULT_REPO_CONFIG;
  }

  try {
    const raw = fs.readFileSync(repoConfigPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      docsDir: parsed.docsDir || DEFAULT_REPO_CONFIG.docsDir,
      projectsDir: parsed.projectsDir || DEFAULT_REPO_CONFIG.projectsDir,
      frontmatterSchema: parsed.frontmatterSchema || DEFAULT_REPO_CONFIG.frontmatterSchema,
      idFormat: parsed.idFormat || DEFAULT_REPO_CONFIG.idFormat || 'short-uuid'
    };
  } catch (e) {
    return DEFAULT_REPO_CONFIG;
  }
}

export function getOrInitOverseerGlobalConfig() {
  if (!fs.existsSync(GLOBAL_CONFIG_PATH)) {
    const defaultConfig = { projectRoots: [process.cwd()] };
    fs.writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify(defaultConfig, null, 2), 'utf-8');
    return defaultConfig;
  }
  try {
    return JSON.parse(fs.readFileSync(GLOBAL_CONFIG_PATH, 'utf-8'));
  } catch (e) {
    return { projectRoots: [process.cwd()] };
  }
}