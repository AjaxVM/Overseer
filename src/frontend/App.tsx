import { createSignal, createEffect } from 'solid-js';
import type {
  FrontmatterItem,
  SchemaField,
  ProjectDetailsResponse,
  RepoTreeNode
} from './types';
import Sidebar from './Sidebar';
import Workspace from './Workspace';
import { AddRepoModal, CreateItemModal, RepoConfigModal } from './Modals';

function findActiveTicketDetails(filePath: string, items: FrontmatterItem[], body: string): [string, string] {
  const [_id, ...nameParts] = (filePath.split(/[/\\]/).pop() || '').split('-');
  const configName = items.find(item => item.key === 'name')?.val;
  const configId = items.find(item => item.key === 'id')?.val ?? _id;
  if (configName) {
    return [configId, configName];
  }

  const header = body.split('\n').find(line => line.startsWith('# '))?.slice(2).trim();
  if (header) {
    return [configId, header];
  }

  return [configId, nameParts.join(' ')];
}

export default function App() {
  const [tree, setTree] = createSignal<RepoTreeNode[]>([]);
  const [isModalOpen, setIsModalOpen] = createSignal(false);
  const [selectedRepoPath, setSelectedRepoPath] = createSignal('');
  const [errorMsg, setErrorMsg] = createSignal('');
  const [isBrowsing, setIsBrowsing] = createSignal(false);

  // Active Project & Scoped Navigation (with localStorage persistence)
  const [activeRepoPath, setActiveRepoPath] = createSignal<string | null>(localStorage.getItem('overseer:activeRepo'));
  const [activeProjectPath, setActiveProjectPath] = createSignal<string | null>(localStorage.getItem('overseer:activeProject'));
  const [projectData, setProjectData] = createSignal<ProjectDetailsResponse | null>(null);

  // Active File & Workspace
  const [activeTab, setActiveTab] = createSignal<'preview' | 'edit'>('preview');
  const [activeFilePath, setActiveFilePath] = createSignal<string | null>(null);
  const [activeTicketName, setActiveTicketName] = createSignal<string | null>(null);
  const [activeTicketId, setActiveTicketId] = createSignal<string | null>(null);
  const [attributes, setAttributes] = createSignal<FrontmatterItem[]>([]);
  const [markdownBody, setMarkdownBody] = createSignal('');
  const [isSaving, setIsSaving] = createSignal(false);
  const [saveStatus, setSaveStatus] = createSignal('');

  // Repo Settings Modal
  const [isConfigModalOpen, setIsConfigModalOpen] = createSignal(false);
  const [configRepoPath, setConfigRepoPath] = createSignal('');
  const [configDocsDir, setConfigDocsDir] = createSignal('docs');
  const [configProjectsDir, setConfigProjectsDir] = createSignal('projects');
  const [configSchema, setConfigSchema] = createSignal<SchemaField[]>([]);

  // Item Creation Modal (Ticket or Sub-Project)
  const [isCreateModalOpen, setIsCreateModalOpen] = createSignal(false);
  const [createParentPath, setCreateParentPath] = createSignal('');
  const [createRepoPath, setCreateRepoPath] = createSignal('');
  const [createType, setCreateType] = createSignal<'file' | 'directory'>('file');
  const [createName, setCreateName] = createSignal('');
  const [createErrorMsg, setCreateErrorMsg] = createSignal('');

  const handleOpenProjectDescription = (overrideData?: ProjectDetailsResponse) => {
    const pData = overrideData || projectData();
    const pPath = overrideData?.path || activeProjectPath();
    if (!pPath || !pData) return;
    const descFilePath = `${pPath}/_project.md`;
    setActiveFilePath(descFilePath);
    setActiveTicketId('PROJECT');
    setActiveTicketName(`${pData.manifest.name} Overview`);
    setAttributes([]);
    setMarkdownBody(pData.description || `# ${pData.manifest.name}\n\nProject overview and goals...`);
    setActiveTab('preview');
    setSaveStatus('');
  };

  const loadProject = async (projectPath: string, repoPath?: string, autoOpenOverview = false) => {
    try {
      const res = await fetch(`/api/project?path=${encodeURIComponent(projectPath)}`);
      const data: ProjectDetailsResponse = await res.json();
      if (!res.ok) throw new Error((data as any).error || 'Failed to load project');

      setProjectData(data);
      setActiveProjectPath(projectPath);
      localStorage.setItem('overseer:activeProject', projectPath);

      const rPath = repoPath || data.repoPath;
      if (rPath) {
        setActiveRepoPath(rPath);
        localStorage.setItem('overseer:activeRepo', rPath);
      }

      if (autoOpenOverview) {
        handleOpenProjectDescription(data);
      }
    } catch (err: any) {
      console.error('Failed to load project:', err);
    }
  };

  const fetchTree = async () => {
    try {
      const res = await fetch('/api/projects');
      const data: RepoTreeNode[] = await res.json();
      setTree(data);

      const savedRepo = localStorage.getItem('overseer:activeRepo');
      const savedProject = localStorage.getItem('overseer:activeProject');

      // Prefer whichever repo actually contains the saved project path over the
      // separately-saved repo path - the two can drift apart (e.g. repo list order
      // changing between sessions), and trusting a stale repo match here was
      // force-overwriting the correct repo back into localStorage on every load.
      const targetRepo =
        (savedProject && data.find(r => savedProject.startsWith(r.repoPath))) ||
        data.find(r => r.repoPath === savedRepo) ||
        (data.length > 0 ? data[0] : null);

      if (targetRepo) {
        setActiveRepoPath(targetRepo.repoPath);
        const projectsCat = targetRepo.children?.find(c => c.categoryType === 'projects');
        const targetProjectPath =
          savedProject && savedProject.startsWith(targetRepo.repoPath) ? savedProject : projectsCat?.path;

        if (targetProjectPath) {
          loadProject(targetProjectPath, targetRepo.repoPath, !activeFilePath());
        }
      }
    } catch (e) {
      console.error('Failed to fetch tree:', e);
    }
  };

  createEffect(() => {
    fetchTree();
    if (import.meta.hot) {
      import.meta.hot.on('projects-update', () => {
        fetchTree();
      });
    }
  });

  // Selecting a repo always lands on its projects root, not a sub-project - tickets
  // can live directly at that root, so drilling into the first sub-project would hide them.
  const handleSelectRepo = (repoPath: string) => {
    setActiveRepoPath(repoPath);
    const repoNode = tree().find(r => r.repoPath === repoPath);
    const projCat = repoNode?.children?.find(c => c.categoryType === 'projects');
    if (projCat) {
      loadProject(projCat.path, repoPath, true);
    }
  };

  const handleNavigateProject = (path: string) => {
    loadProject(path, activeRepoPath() || undefined, true);
  };

  const handleOpenFile = async (filePath: string, repoPath: string) => {
    setActiveFilePath(filePath);
    setActiveRepoPath(repoPath);
    setActiveTab('preview');
    setSaveStatus('');
    try {
      const res = await fetch(`/api/file/read?path=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const items: FrontmatterItem[] = Object.entries(data.attributes || {}).map(([k, v]) => ({
        key: k,
        val: Array.isArray(v) ? v.join(', ') : String(v)
      }));

      setAttributes(items);
      setMarkdownBody(data.body || '');
      const [id, name] = findActiveTicketDetails(filePath, items, data.body || '');
      setActiveTicketId(id);
      setActiveTicketName(name);
    } catch (err: any) {
      console.error('Failed to load file:', err);
    }
  };

  const handleSaveFile = async () => {
    if (!activeFilePath()) return;
    setIsSaving(true);
    setSaveStatus('');

    const attrObj: Record<string, string> = {};
    attributes().forEach(item => {
      if (item.key.trim()) attrObj[item.key.trim()] = item.val;
    });

    try {
      const res = await fetch('/api/file/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: activeFilePath(),
          attributes: attrObj,
          body: markdownBody()
        })
      });
      if (!res.ok) throw new Error('Save failed');
      setSaveStatus('Saved successfully');

      if (activeProjectPath()) {
        loadProject(activeProjectPath()!, activeRepoPath() || undefined);
      }
    } catch (err: any) {
      setSaveStatus(`Error: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const openCreateModal = (parentPath: string, repoPath: string, defaultType: 'file' | 'directory' = 'file') => {
    setCreateParentPath(parentPath);
    setCreateRepoPath(repoPath);
    setCreateType(defaultType);
    setCreateName('');
    setCreateErrorMsg('');
    setIsCreateModalOpen(true);
  };

  const handleCreateItem = async (e: Event) => {
    e.preventDefault();
    setCreateErrorMsg('');
    try {
      const res = await fetch('/api/item/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentPath: createParentPath(),
          repoPath: createRepoPath(),
          type: createType(),
          name: createName()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create item');

      setIsCreateModalOpen(false);
      fetchTree();

      if (activeProjectPath()) {
        await loadProject(activeProjectPath()!, activeRepoPath() || undefined);
      }

      if (createType() === 'file') {
        handleOpenFile(data.createdPath, createRepoPath());
      } else if (createType() === 'directory') {
        loadProject(data.createdPath, createRepoPath(), true);
      }
    } catch (err: any) {
      setCreateErrorMsg(err.message);
    }
  };

  const openRepoConfigModal = (repoNode: RepoTreeNode) => {
    setConfigRepoPath(repoNode.repoPath);
    setConfigDocsDir(repoNode.config?.docsDir || 'docs');
    setConfigProjectsDir(repoNode.config?.projectsDir || 'projects');

    const schema = (repoNode.config?.frontmatterSchema || []).map(s => ({
      ...s,
      optionsRaw: (s.options || []).join(', ')
    }));
    setConfigSchema(schema);
    setIsConfigModalOpen(true);
  };

  const handleSaveRepoConfig = async (e: Event) => {
    e.preventDefault();
    const formattedSchema = configSchema()
      .map(field => ({
        name: field.name.trim(),
        type: field.type,
        options:
          field.type === 'enum'
            ? (field.optionsRaw || '')
                .split(',')
                .map(s => s.trim())
                .filter(Boolean)
            : undefined
      }))
      .filter(f => f.name.length > 0);

    try {
      const res = await fetch('/api/config/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoPath: configRepoPath(),
          docsDir: configDocsDir(),
          projectsDir: configProjectsDir(),
          frontmatterSchema: formattedSchema
        })
      });
      if (!res.ok) throw new Error('Failed to save config');
      setIsConfigModalOpen(false);
      fetchTree();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleBrowseNativeFolder = async () => {
    setIsBrowsing(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/dialog/pick-folder', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Folder selection cancelled');
      setSelectedRepoPath(data.folderPath);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsBrowsing(false);
    }
  };

  const handleAddProject = async (e: Event) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      const res = await fetch('/api/projects/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoPath: selectedRepoPath() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add project');

      setSelectedRepoPath('');
      setIsModalOpen(false);
      fetchTree();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', 'font-family': 'system-ui, -apple-system, sans-serif' }}>
      <Sidebar
        tree={tree}
        activeRepoPath={activeRepoPath}
        projectData={projectData}
        activeFilePath={activeFilePath}
        onSelectRepo={handleSelectRepo}
        onNavigateProject={handleNavigateProject}
        onOpenFile={handleOpenFile}
        onOpenProjectDescription={handleOpenProjectDescription}
        onOpenCreateModal={openCreateModal}
        onOpenRepoConfigModal={openRepoConfigModal}
        onAddRepoClick={() => setIsModalOpen(true)}
      />

      <Workspace
        tree={tree}
        activeRepoPath={activeRepoPath}
        activeFilePath={activeFilePath}
        activeTicketId={activeTicketId}
        activeTicketName={activeTicketName}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        attributes={attributes}
        setAttributes={setAttributes}
        markdownBody={markdownBody}
        setMarkdownBody={setMarkdownBody}
        isSaving={isSaving}
        saveStatus={saveStatus}
        onSave={handleSaveFile}
      />

      <AddRepoModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        selectedRepoPath={selectedRepoPath}
        setSelectedRepoPath={setSelectedRepoPath}
        isBrowsing={isBrowsing}
        onBrowse={handleBrowseNativeFolder}
        errorMsg={errorMsg}
        onSubmit={handleAddProject}
      />

      <CreateItemModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        createType={createType}
        setCreateType={setCreateType}
        createName={createName}
        setCreateName={setCreateName}
        createParentPath={createParentPath}
        createErrorMsg={createErrorMsg}
        onSubmit={handleCreateItem}
      />

      <RepoConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        configDocsDir={configDocsDir}
        setConfigDocsDir={setConfigDocsDir}
        configProjectsDir={configProjectsDir}
        setConfigProjectsDir={setConfigProjectsDir}
        configSchema={configSchema}
        setConfigSchema={setConfigSchema}
        onSubmit={handleSaveRepoConfig}
      />
    </div>
  );
}
