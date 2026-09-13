import fs from 'fs';
import os from 'os';
import path from 'path';

export const GLOBAL_CONFIG_PATH = path.join(os.homedir(), '.overseer.config.json');

export const DEFAULT_REPO_CONFIG = {
  docsDir: 'docs',
  projectsDir: 'projects',
  frontmatterSchema: [
    {
      name: 'status',
      type: 'enum',
      options: ['idea', 'designing', 'planning', 'ready', 'working', 'reviewing', 'done']
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