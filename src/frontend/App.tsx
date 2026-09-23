import { createSignal, createEffect } from 'solid-js';
import type {
  FrontmatterItem,
  SchemaField,
  ProjectDetailsResponse,
  RepoTreeNode,
  SubProjectSummary,
  TicketSummary
} from './types';
import Sidebar from './Sidebar';
import Workspace from './Workspace';
import { AddRepoModal, CreateItemModal, RepoConfigModal } from './Modals';
import { font } from './theme';

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

  // Snapshot of the last loaded/saved content, to detect unsaved edits (poc-3).
  const [originalAttributes, setOriginalAttributes] = createSignal<FrontmatterItem[]>([]);
  const [originalMarkdownBody, setOriginalMarkdownBody] = createSignal('');

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
  const [createFieldValues, setCreateFieldValues] = createSignal<Record<string, string>>({});

  const createSchema = () => tree().find(r => r.repoPath === createRepoPath())?.config?.frontmatterSchema || [];
  const setCreateFieldValue = (name: string, value: string) => setCreateFieldValues(prev => ({ ...prev, [name]: value }));

  // Compares current edit-buffer contents against the last loaded/saved snapshot.
  const isDirty = () =>
    markdownBody() !== originalMarkdownBody() || JSON.stringify(attributes()) !== JSON.stringify(originalAttributes());

  // Every navigation that would overwrite the edit buffer (opening a different
  // ticket/doc, or the project overview) goes through this first.
  const confirmDiscardIfDirty = () => {
    if (!activeFilePath() || !isDirty()) return true;
    return window.confirm('You have unsaved changes. Discard them and continue?');
  };

  // Path helpers for the URL (poc-12) - the frontend has no Node `path` module, so these
  // are plain string ops in the same style as the dirnameOf helper further down.
  const pathSep = (p: string) => (p.includes('\\') ? '\\' : '/');
  const toRelativePath = (root: string, abs: string) =>
    abs.startsWith(root) ? abs.slice(root.length).replace(/^[\\/]/, '') : abs;
  const toAbsolutePath = (root: string, rel: string) =>
    !rel ? root : `${root}${root.endsWith(pathSep(root)) ? '' : pathSep(root)}${rel}`;

  // Keeps the URL a shareable/refreshable pointer to what's currently open (poc-12) -
  // called after every navigation action, alongside the existing localStorage writes
  // (which remain the fallback for a bare visit with no URL params at all). Only one
  // path is encoded - whichever is most specific right now (the open file, else the
  // active project folder) - relative to the repo root, since the app is always
  // "viewing a file" one way or another and repeating the repo-root prefix three times
  // added nothing. The repo itself is identified by its short name rather than its
  // absolute root - that root is already known from the registered repo list (the
  // global config), so the absolute path doesn't need to leak into the URL at all.
  const buildNavUrl = () => {
    const repoPath = activeRepoPath();
    const repoName = repoPath ? tree().find(r => r.repoPath === repoPath)?.name : undefined;
    const target = activeFilePath() || activeProjectPath();
    const params = new URLSearchParams();
    if (repoPath && repoName) {
      params.set('repo', repoName);
      if (target) params.set('path', toRelativePath(repoPath, target));
    }
    const qs = params.toString();
    return qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  };

  const pushNavUrl = () => {
    const url = buildNavUrl();
    if (url !== window.location.pathname + window.location.search) {
      window.history.pushState(null, '', url);
    }
  };

  const isProjectOverviewFile = (filePath: string, projectPath: string) =>
    filePath.endsWith('_project.md') && dirnameOf(filePath) === projectPath;

  const handleOpenProjectDescription = (overrideData?: ProjectDetailsResponse) => {
    const pData = overrideData || projectData();
    const pPath = overrideData?.path || activeProjectPath();
    if (!pPath || !pData) return;
    if (!confirmDiscardIfDirty()) return;
    const descFilePath = `${pPath}/_project.md`;
    const description = pData.description || `# ${pData.manifest.name}\n\nProject overview and goals...`;
    setActiveFilePath(descFilePath);
    setActiveTicketId('PROJECT');
    setActiveTicketName(pData.manifest.name);
    setAttributes([]);
    setOriginalAttributes([]);
    setMarkdownBody(description);
    setOriginalMarkdownBody(description);
    setActiveTab('preview');
    setSaveStatus('');
    pushNavUrl();
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
      } else {
        pushNavUrl();
      }
    } catch (err: any) {
      console.error('Failed to load project:', err);
    }
  };

  // Shared by the initial load (fetchTree) and browser back/forward (handlePopState) -
  // the URL (poc-12) wins over localStorage when both are present, which is what makes a
  // link to a specific ticket/project/doc shareable and refresh-proof. localStorage
  // remains the fallback for a bare visit with no URL params at all.
  const applyLocationState = async (data: RepoTreeNode[]) => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlRepoName = urlParams.get('repo');
    const urlPath = urlParams.get('path');

    // Only consult localStorage when the URL didn't name a repo itself - an explicit
    // URL should never be muddied by a stale localStorage project from a different
    // repo/session.
    const savedRepo = urlRepoName ? null : localStorage.getItem('overseer:activeRepo');
    const savedProject = urlRepoName ? null : localStorage.getItem('overseer:activeProject');

    // Prefer whichever repo actually contains the saved project path over the
    // separately-saved repo path - the two can drift apart (e.g. repo list order
    // changing between sessions), and trusting a stale repo match here was
    // force-overwriting the correct repo back into localStorage on every load.
    const targetRepo =
      (urlRepoName && data.find(r => r.name === urlRepoName)) ||
      (savedProject && data.find(r => savedProject.startsWith(r.repoPath))) ||
      data.find(r => r.repoPath === savedRepo) ||
      (data.length > 0 ? data[0] : null);
    if (!targetRepo) return;

    setActiveRepoPath(targetRepo.repoPath);
    const projectsCat = targetRepo.children?.find(c => c.categoryType === 'projects');

    // No specific file/folder named - fall back to the saved/default project, same as
    // before, auto-opening its overview unless a file's already active in this session.
    if (!urlPath) {
      const targetProjectPath =
        savedProject && savedProject.startsWith(targetRepo.repoPath) ? savedProject : projectsCat?.path;
      if (targetProjectPath) {
        loadProject(targetProjectPath, targetRepo.repoPath, !activeFilePath());
      }
      return;
    }

    const absTarget = toAbsolutePath(targetRepo.repoPath, urlPath);

    if (absTarget.toLowerCase().endsWith('.md')) {
      if (projectsCat && absTarget.startsWith(projectsCat.path)) {
        // Ticket or the project's own _project.md - both live directly inside their
        // project folder, so its dirname is the project to load.
        const projectDir = dirnameOf(absTarget);
        await loadProject(projectDir, targetRepo.repoPath, false);
        if (isProjectOverviewFile(absTarget, projectDir)) {
          handleOpenProjectDescription();
        } else {
          handleOpenFile(absTarget, targetRepo.repoPath);
        }
      } else {
        // A doc - not inside a project folder, so there's nothing project-specific to
        // restore for it. Land on the default project (same as the no-path case) so the
        // Sidebar still shows something sensible, then open the doc on top - matching
        // today's behavior where opening a doc doesn't change the active project either.
        if (projectsCat?.path) {
          await loadProject(projectsCat.path, targetRepo.repoPath, false);
        }
        handleOpenFile(absTarget, targetRepo.repoPath);
      }
    } else {
      // A project (or sub-project) folder with no specific file open - same as clicking
      // it in the sidebar.
      loadProject(absTarget, targetRepo.repoPath, true);
    }
  };

  const fetchTree = async () => {
    try {
      const res = await fetch('/api/projects');
      const data: RepoTreeNode[] = await res.json();
      setTree(data);
      await applyLocationState(data);
    } catch (e) {
      console.error('Failed to fetch tree:', e);
    }
  };

  // Restores repo/project/file when the user navigates with the browser's back/forward
  // buttons - the pushNavUrl calls scattered through the navigation handlers above are
  // what put those entries on the history stack in the first place.
  const handlePopState = () => {
    applyLocationState(tree());
  };

  createEffect(() => {
    fetchTree();
    if (import.meta.hot) {
      import.meta.hot.on('projects-update', () => {
        fetchTree();
        // fetchTree only refreshes the sidebar tree - the open project's own manifest
        // (and its pendingSync flag, see handleSyncProject) needs its own refetch, or a
        // background true-up would never show up until the user navigates away and back.
        const openProjectPath = activeProjectPath();
        if (openProjectPath) loadProject(openProjectPath, activeRepoPath() || undefined);
      });
    }
  });

  // Warn on closing/reloading the tab with unsaved edits (poc-3). In-app navigation
  // between tickets/docs is covered separately by confirmDiscardIfDirty.
  window.addEventListener('beforeunload', e => {
    if (isDirty()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  window.addEventListener('popstate', handlePopState);

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
    if (!confirmDiscardIfDirty()) return;
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
      setOriginalAttributes(items);
      setMarkdownBody(data.body || '');
      setOriginalMarkdownBody(data.body || '');
      const [id, name] = findActiveTicketDetails(filePath, items, data.body || '');
      setActiveTicketId(id);
      setActiveTicketName(name);
      pushNavUrl();
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
      setOriginalAttributes(attributes());
      setOriginalMarkdownBody(markdownBody());

      if (activeProjectPath()) {
        loadProject(activeProjectPath()!, activeRepoPath() || undefined);
      }
    } catch (err: any) {
      setSaveStatus(`Error: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuickRenameTicket = (newName: string) => {
    setActiveTicketName(newName);
    setAttributes(prev => {
      const idx = prev.findIndex(a => a.key.trim().toLowerCase() === 'name');
      if (idx === -1) return [...prev, { key: 'name', val: newName }];
      return prev.map((a, i) => (i === idx ? { ...a, val: newName } : a));
    });
    handleSaveFile();
  };

  const clearWorkspace = () => {
    setActiveFilePath(null);
    setActiveTicketId(null);
    setActiveTicketName(null);
    setAttributes([]);
    setOriginalAttributes([]);
    setMarkdownBody('');
    setOriginalMarkdownBody('');
    setActiveTab('preview');
    setSaveStatus('');
  };

  // filePath === dirPath doesn't count as "under" it - only true containment
  // (a real child of the directory) should trigger a workspace reset.
  const isPathUnder = (filePath: string | null, dirPath: string) => {
    if (!filePath || filePath.length <= dirPath.length || !filePath.startsWith(dirPath)) return false;
    return filePath[dirPath.length] === '/' || filePath[dirPath.length] === '\\';
  };

  const dirnameOf = (filePath: string) => filePath.replace(/[\\/][^\\/]*$/, '');

  const deleteItem = async (itemPath: string, type: 'file' | 'directory', parentPath: string) => {
    const res = await fetch('/api/item/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemPath, type, parentPath, repoPath: activeRepoPath() })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete');
  };

  const handleDeleteTicket = async (ticket: TicketSummary) => {
    if (!window.confirm(`Delete ticket "${ticket.name}"? This can't be undone.`)) return;
    const parentPath = activeProjectPath();
    if (!parentPath) return;
    try {
      await deleteItem(ticket.filePath, 'file', parentPath);
      if (activeFilePath() === ticket.filePath) clearWorkspace();
      loadProject(parentPath, activeRepoPath() || undefined);
      fetchTree();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteSubproject = async (sub: SubProjectSummary) => {
    if (!window.confirm(`Delete project "${sub.name}" and everything inside it? This can't be undone.`)) return;
    const parentPath = activeProjectPath();
    if (!parentPath) return;
    try {
      await deleteItem(sub.path, 'directory', parentPath);
      if (activeFilePath() === sub.path || isPathUnder(activeFilePath(), sub.path)) clearWorkspace();

      if (activeProjectPath() === sub.path || isPathUnder(activeProjectPath(), sub.path)) {
        loadProject(parentPath, activeRepoPath() || undefined, true);
      } else {
        loadProject(parentPath, activeRepoPath() || undefined);
      }
      fetchTree();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Whether the item currently open in the workspace (a ticket, doc, or a project's own
  // overview page) can be deleted from there - the projects-root pseudo-project's own
  // overview has no parent and isn't a real deletable directory.
  const canDeleteActive = () => {
    const filePath = activeFilePath();
    if (!filePath) return false;
    if (filePath.endsWith('_project.md')) return !!projectData()?.parentPath;
    return true;
  };

  const handleDeleteActiveItem = async () => {
    const filePath = activeFilePath();
    if (!filePath) return;

    if (filePath.endsWith('_project.md')) {
      const projPath = activeProjectPath();
      const parentPath = projectData()?.parentPath;
      if (!projPath || !parentPath) return;
      if (!window.confirm(`Delete project "${projectData()?.manifest.name}" and everything inside it? This can't be undone.`)) return;
      try {
        await deleteItem(projPath, 'directory', parentPath);
        clearWorkspace();
        loadProject(parentPath, activeRepoPath() || undefined, true);
        fetchTree();
      } catch (err: any) {
        alert(err.message);
      }
    } else {
      if (!window.confirm(`Delete "${activeTicketName()}"? This can't be undone.`)) return;
      const parentPath = dirnameOf(filePath);
      try {
        await deleteItem(filePath, 'file', parentPath);
        clearWorkspace();
        if (activeProjectPath()) loadProject(activeProjectPath()!, activeRepoPath() || undefined);
        fetchTree();
      } catch (err: any) {
        alert(err.message);
      }
    }
  };

  const reorderProject = async (body: { ticketOrder?: string[]; subprojectOrder?: string[] }) => {
    const pPath = activeProjectPath();
    if (!pPath) return;
    try {
      await fetch('/api/project/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: pPath, ...body })
      });
      loadProject(pPath, activeRepoPath() || undefined);
    } catch (err: any) {
      console.error('Failed to reorder project:', err);
    }
  };

  const handleRenameProject = async (newName: string) => {
    const projectPath = activeProjectPath();
    if (!projectPath) return;
    setActiveTicketName(newName);
    try {
      const res = await fetch('/api/project/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath, name: newName })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to rename project');
      loadProject(projectPath, activeRepoPath() || undefined);
      fetchTree();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSyncProject = async () => {
    const projectPath = activeProjectPath();
    if (!projectPath) return;
    try {
      const res = await fetch('/api/project/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to sync project');
      loadProject(projectPath, activeRepoPath() || undefined);
      fetchTree();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRenameActiveItem = (newName: string) => {
    if (activeFilePath()?.endsWith('_project.md')) {
      handleRenameProject(newName);
    } else {
      handleQuickRenameTicket(newName);
    }
  };

  const openCreateModal = (parentPath: string, repoPath: string, defaultType: 'file' | 'directory' = 'file') => {
    setCreateParentPath(parentPath);
    setCreateRepoPath(repoPath);
    setCreateType(defaultType);
    setCreateName('');
    setCreateErrorMsg('');
    setCreateFieldValues({});
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
          name: createName(),
          attributes: createFieldValues()
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
            : undefined,
        optionColors: field.type === 'enum' ? field.optionColors : undefined,
        optionShorthands: field.type === 'enum' ? field.optionShorthands : undefined
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
    <div style={{ display: 'flex', height: '100vh', 'font-family': font.sans }}>
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
        onReorderTickets={order => reorderProject({ ticketOrder: order })}
        onReorderSubprojects={order => reorderProject({ subprojectOrder: order })}
        onDeleteTicket={handleDeleteTicket}
        onDeleteSubproject={handleDeleteSubproject}
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
        canDeleteActive={canDeleteActive}
        onDeleteActive={handleDeleteActiveItem}
        onRenameActiveItem={handleRenameActiveItem}
        pendingSync={() => projectData()?.pendingSync ?? false}
        onSyncProject={handleSyncProject}
      />

      <AddRepoModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        selectedRepoPath={selectedRepoPath}
        setSelectedRepoPath={setSelectedRepoPath}
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
        schema={createSchema}
        fieldValues={createFieldValues}
        setFieldValue={setCreateFieldValue}
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
