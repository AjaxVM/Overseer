export interface FrontmatterItem {
  key: string;
  val: string;
}

export interface SchemaField {
  name: string;
  type: 'string' | 'number' | 'enum';
  options?: string[];
  optionsRaw?: string;
}

export interface TicketSummary {
  id: string;
  name: string;
  status: string;
  type?: string;
  fileName: string;
  filePath: string;
  mtime?: number;
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
  childOrder?: string[];
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

export interface BreadcrumbItem {
  name: string;
  path: string;
}