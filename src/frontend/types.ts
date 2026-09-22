export interface FrontmatterItem {
  key: string;
  val: string;
}

export interface SchemaField {
  name: string;
  type: 'string' | 'number' | 'enum';
  options?: string[];
  optionsRaw?: string;
  // Maps an enum option value to a theme.ts SwatchName - only surfaced in the UI for
  // the built-in `status` field for now (see Modals.tsx's RepoConfigModal).
  optionColors?: Record<string, string>;
}

export interface TicketSummary {
  id: string;
  name: string;
  status: string;
  type?: string;
  fileName: string;
  filePath: string;
}

export interface SubProjectSummary {
  name: string;
  slug: string;
  path: string;
}

export interface ProjectManifest {
  name: string;
  id?: string;
  descriptionFile?: string;
  projectmap: {
    tickets: TicketSummary[];
    subprojects: SubProjectSummary[];
  };
}

export interface ProjectDetailsResponse {
  path: string;
  repoPath: string;
  parentPath: string | null;
  manifest: ProjectManifest;
  description?: string;
}

export interface RepoConfig {
  docsDir: string;
  projectsDir: string;
  frontmatterSchema: SchemaField[];
  idFormat?: string;
}

export interface ProjectTreeEntry {
  name: string;
  slug: string;
  type: 'directory';
  path: string;
  projectData: ProjectManifest | null;
  hasManifest: boolean;
  children: [];
}

export interface DocTreeEntry {
  name: string;
  type: 'directory' | 'file';
  path: string;
  children?: DocTreeEntry[];
}

export interface RepoTreeCategory {
  name: string;
  type: 'category';
  categoryType: 'docs' | 'projects';
  path: string;
  children: (ProjectTreeEntry | DocTreeEntry)[];
}

export interface RepoTreeNode {
  name: string;
  type: 'repository';
  repoPath: string;
  config: RepoConfig;
  children: RepoTreeCategory[];
}