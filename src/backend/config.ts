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
      // The Okabe-Ito colorblind-safe palette (Okabe & Ito, 2008) - chosen over an
      // arbitrary vivid set because it separates by lightness as well as hue, which is
      // what actually keeps e.g. idea and working apart under red-green color vision
      // deficiency (two hues that only differ in their red content, like a violet and
      // a blue, collapse toward each other for deuteranopia/protanopia - varying
      // lightness too avoids that regardless of hue). Still punchier than the muted
      // app palette in src/frontend/theme.ts, so status keeps its visual pop.
      optionColors: {
        idea: '#CC79A7',
        designing: '#F0E442',
        planning: '#E69F00',
        ready: '#56B4E9',
        working: '#0072B2',
        reviewing: '#D55E00',
        done: '#009E73'
      }
    },
    {
      name: 'type',
      type: 'enum',
      options: ['bug', 'feature', 'design'],
      // Muted, theme-toned hues (same family as blue/bronze/rust in theme.ts) - the
      // deliberate opposite of status's punchy set, so the two badge fields read as
      // distinct layers rather than competing for attention.
      optionColors: {
        bug: '#7A2E1F',
        feature: '#2E4F6E',
        design: '#8A6D2E'
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