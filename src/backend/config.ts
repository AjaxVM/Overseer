import fs from 'fs';
import os from 'os';
import path from 'path';

export const GLOBAL_CONFIG_PATH = path.join(os.homedir(), '.overseer.config.json');

export interface FrontmatterFieldConfig {
  name: string;
  type: 'string' | 'number' | 'enum';
  options?: string[];
  // Maps an enum option value to a user-picked hex color - currently only read by
  // the frontend for the built-in `status` field's badge coloring (see
  // src/frontend/theme.ts's deriveBadgeStyle). Passed through as opaque data here.
  optionColors?: Record<string, string>;
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
      options: ['idea', 'designing', 'planning', 'ready', 'working', 'reviewing', 'done'],
      // Loosely follows the idea -> done lifecycle: cool/uncommitted colors early,
      // warm/active colors in the middle, settling on green at done.
      optionColors: {
        idea: '#8B5CF6',
        designing: '#EAB308',
        planning: '#F97316',
        ready: '#EC4899',
        working: '#3B82F6',
        reviewing: '#14B8A6',
        done: '#22C55E'
      }
    },
    {
      name: 'type',
      type: 'enum',
      options: ['bug', 'feature', 'design'],
      optionColors: {
        bug: '#EF4444',
        feature: '#6366F1',
        design: '#B45309'
      }
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