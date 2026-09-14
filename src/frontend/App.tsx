import { createSignal, createEffect, For, Show } from 'solid-js';
import { marked } from 'marked';
import type {
  FrontmatterItem,
  SchemaField,
  TicketSummary,
  ProjectDetailsResponse,
  BreadcrumbItem
} from './types';

marked.setOptions({
  gfm: true,
  breaks: true
});

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

function getStatusBadgeStyle(status: string): { bg: string; text: string } {
  switch (status.toLowerCase()) {
    case 'idea':
      return { bg: '#e0e7ff', text: '#4338ca' };
    case 'designing':
    case 'design':
      return { bg: '#ede9fe', text: '#6d28d9' };
    case 'planning':
      return { bg: '#fef3c7', text: '#b45309' };
    case 'ready':
      return { bg: '#e0f2fe', text: '#0369a1' };
    case 'working':
    case 'in-progress':
      return { bg: '#ffedd5', text: '#c2410c' };
    case 'reviewing':
    case 'in-review':
      return { bg: '#dbeafe', text: '#1d4ed8' };
    case 'done':
      return { bg: '#dcfce7', text: '#15803d' };
    default:
      return { bg: '#f1f5f9', text: '#475569' };
  }
}

function getTypeBadgeStyle(type?: string): { bg: string; text: string } {
  switch (type?.toLowerCase()) {
    case 'bug':
      return { bg: '#fee2e2', text: '#b91c1c' };
    case 'feature':
      return { bg: '#dbeafe', text: '#1d4ed8' };
    case 'design':
      return { bg: '#f3e8ff', text: '#7e22ce' };
    default:
      return { bg: '#f1f5f9', text: '#475569' };
  }
}

export default function App() {
  const [tree, setTree] = createSignal<any[]>([]);
  const [isModalOpen, setIsModalOpen] = createSignal(false);
  const [selectedRepoPath, setSelectedRepoPath] = createSignal('');
  const [errorMsg, setErrorMsg] = createSignal('');
  const [isBrowsing, setIsBrowsing] = createSignal(false);

  // Active Project & Scoped Navigation (with localStorage persistence)
  const [activeRepoPath, setActiveRepoPath] = createSignal<string | null>(localStorage.getItem('overseer:activeRepo'));
  const [activeProjectPath, setActiveProjectPath] = createSignal<string | null>(localStorage.getItem('overseer:activeProject'));
  const [projectData, setProjectData] = createSignal<ProjectDetailsResponse | null>(null);
  const [projectBreadcrumbs, setProjectBreadcrumbs] = createSignal<BreadcrumbItem[]>([]);
  const [ticketSearch, setTicketSearch] = createSignal('');
  const [sortOption, setSortOption] = createSignal<'manifest' | 'status' | 'name' | 'id'>(
    (localStorage.getItem('overseer:sortOption') as any) || 'manifest'
  );

  // Collapsible Panel States (with localStorage persistence)
  const [isSubprojectsOpen, setIsSubprojectsOpen] = createSignal(localStorage.getItem('overseer:panel:subprojects') !== 'false');
  const [isTicketsOpen, setIsTicketsOpen] = createSignal(localStorage.getItem('overseer:panel:tickets') !== 'false');
  const [isDocsOpen, setIsDocsOpen] = createSignal(localStorage.getItem('overseer:panel:docs') !== 'false');

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

  const togglePanel = (panel: 'subprojects' | 'tickets' | 'docs') => {
    if (panel === 'subprojects') {
      const next = !isSubprojectsOpen();
      setIsSubprojectsOpen(next);
      localStorage.setItem('overseer:panel:subprojects', String(next));
    } else if (panel === 'tickets') {
      const next = !isTicketsOpen();
      setIsTicketsOpen(next);
      localStorage.setItem('overseer:panel:tickets', String(next));
    } else if (panel === 'docs') {
      const next = !isDocsOpen();
      setIsDocsOpen(next);
      localStorage.setItem('overseer:panel:docs', String(next));
    }
  };

  const handleSortChange = (newSort: 'manifest' | 'status' | 'name' | 'id') => {
    setSortOption(newSort);
    localStorage.setItem('overseer:sortOption', newSort);
  };

  const getParentFolderName = () => {
    const pPath = projectData()?.parentPath;
    if (!pPath) return '';
    const parts = pPath.split(/[/\\]/).filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : 'Parent';
  };

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

  const loadProject = async (
    projectPath: string,
    repoPath?: string,
    updateHistory = true,
    autoOpenOverview = false
  ) => {
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

      if (updateHistory) {
        setProjectBreadcrumbs(prev => {
          const existingIdx = prev.findIndex(b => b.path === projectPath);
          if (existingIdx !== -1) {
            return prev.slice(0, existingIdx + 1);
          }
          return [...prev, { name: data.manifest.name, path: projectPath }];
        });
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
      const data = await res.json();
      setTree(data);

      const savedRepo = localStorage.getItem('overseer:activeRepo');
      const savedProject = localStorage.getItem('overseer:activeProject');

      let targetRepo = data.find((r: any) => r.repoPath === savedRepo) || (data.length > 0 ? data[0] : null);

      if (targetRepo) {
        setActiveRepoPath(targetRepo.repoPath);
        const projectsCat = targetRepo.children?.find((c: any) => c.categoryType === 'projects');
        const availableProjects = projectsCat?.children || [];

        let targetProjectPath = savedProject;
        if (!targetProjectPath && availableProjects.length > 0) {
          targetProjectPath = availableProjects[0].path;
        }

        if (targetProjectPath) {
          loadProject(targetProjectPath, targetRepo.repoPath, true, !activeFilePath());
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

  const getActiveRepoConfig = () => {
    if (!activeRepoPath()) return null;
    const repoNode = tree().find(r => r.repoPath === activeRepoPath());
    return repoNode?.config || null;
  };

  const getActiveRepoDocs = () => {
    if (!activeRepoPath()) return [];
    const repoNode = tree().find(r => r.repoPath === activeRepoPath());
    const docsCat = repoNode?.children?.find((c: any) => c.categoryType === 'docs');
    return docsCat?.children || [];
  };

  const getActiveRepoProjects = () => {
    if (!activeRepoPath()) return [];
    const repoNode = tree().find(r => r.repoPath === activeRepoPath());
    const projCat = repoNode?.children?.find((c: any) => c.categoryType === 'projects');
    return projCat?.children || [];
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
        loadProject(activeProjectPath()!, activeRepoPath() || undefined, false, false);
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
        await loadProject(activeProjectPath()!, activeRepoPath() || undefined, false, false);
      }

      if (createType() === 'file') {
        handleOpenFile(data.createdPath, createRepoPath());
      } else if (createType() === 'directory') {
        loadProject(data.createdPath, createRepoPath(), true, true);
      }
    } catch (err: any) {
      setCreateErrorMsg(err.message);
    }
  };

  const openRepoConfigModal = (repoNode: any) => {
    setConfigRepoPath(repoNode.repoPath);
    setConfigDocsDir(repoNode.config?.docsDir || 'docs');
    setConfigProjectsDir(repoNode.config?.projectsDir || 'projects');

    const schema = (repoNode.config?.frontmatterSchema || []).map((s: SchemaField) => ({
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

  const handleAddFrontmatterField = (presetName?: string) => {
    setAttributes(prev => [...prev, { key: presetName || '', val: '' }]);
  };

  const handleRemoveFrontmatterField = (index: number) => {
    setAttributes(prev => prev.filter((_, idx) => idx !== index));
  };

  const updateAttrKey = (index: number, newKey: string) => {
    setAttributes(prev => prev.map((item, idx) => (idx === index ? { ...item, key: newKey } : item)));
  };

  const updateAttrVal = (index: number, newVal: string) => {
    setAttributes(prev => prev.map((item, idx) => (idx === index ? { ...item, val: newVal } : item)));
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

  const filteredAndSortedTickets = () => {
    const rawTickets = projectData()?.manifest.projectmap.tickets || [];
    const query = ticketSearch().toLowerCase().trim();

    let filtered = rawTickets;
    if (query) {
      filtered = rawTickets.filter(
        t =>
          t.name.toLowerCase().includes(query) ||
          t.id.toLowerCase().includes(query) ||
          t.status.toLowerCase().includes(query) ||
          (t.type && t.type.toLowerCase().includes(query))
      );
    }

    const copy = [...filtered];
    switch (sortOption()) {
      case 'status':
        return copy.sort((a, b) => a.status.localeCompare(b.status));
      case 'name':
        return copy.sort((a, b) => a.name.localeCompare(b.name));
      case 'id':
        return copy.sort((a, b) => a.id.localeCompare(b.id));
      case 'manifest':
      default:
        return copy;
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', 'font-family': 'system-ui, -apple-system, sans-serif' }}>
      {/* SIDEBAR */}
      <div
        style={{
          width: '360px',
          'border-right': '1px solid #e2e8f0',
          background: '#f8fafc',
          display: 'flex',
          'flex-direction': 'column',
          height: '100vh',
          overflow: 'hidden'
        }}
      >
        {/* 1. TOP HEADER: Branding & Dropdowns */}
        <div style={{ padding: '10px 14px', 'border-bottom': '1px solid #e2e8f0', 'flex-shrink': 0, background: '#ffffff' }}>
          <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center' }}>
            <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
              <span style={{ 'font-size': '1.2rem' }}>👁️</span>
              <span style={{ 'font-weight': '800', 'font-size': '1.05rem', color: '#0f172a' }}>Overseer</span>
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={() => setIsModalOpen(true)}
                title="Register Repository"
                style={{
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  padding: '3px 8px',
                  'border-radius': '4px',
                  cursor: 'pointer',
                  'font-size': '0.75rem',
                  'font-weight': '600'
                }}
              >
                + Repo
              </button>
              <Show when={activeRepoPath()}>
                <button
                  onClick={() => {
                    const repoNode = tree().find(r => r.repoPath === activeRepoPath());
                    if (repoNode) openRepoConfigModal(repoNode);
                  }}
                  title="Configure Repo"
                  style={{
                    background: '#e2e8f0',
                    border: 'none',
                    padding: '3px 8px',
                    'border-radius': '4px',
                    cursor: 'pointer',
                    'font-size': '0.8rem'
                  }}
                >
                  ⚙️
                </button>
              </Show>
            </div>
          </div>

          {/* Repo & Root Project Selector Dropdowns */}
          <div style={{ display: 'flex', gap: '6px', 'margin-top': '8px' }}>
            <Show when={tree().length > 1}>
              <select
                value={activeRepoPath() || ''}
                onChange={e => {
                  const rPath = e.currentTarget.value;
                  setActiveRepoPath(rPath);
                  const repoNode = tree().find(r => r.repoPath === rPath);
                  const projCat = repoNode?.children?.find((c: any) => c.categoryType === 'projects');
                  if (projCat && projCat.children?.length > 0) {
                    loadProject(projCat.children[0].path, rPath, true, true);
                  }
                }}
                style={{
                  flex: 1,
                  padding: '4px 6px',
                  border: '1px solid #cbd5e1',
                  'border-radius': '4px',
                  'font-size': '0.75rem',
                  background: '#fff'
                }}
              >
                <For each={tree()}>{repo => <option value={repo.repoPath}>📦 {repo.name}</option>}</For>
              </select>
            </Show>

            <Show when={getActiveRepoProjects().length > 0}>
              <select
                value={activeProjectPath() || ''}
                onChange={e => {
                  const pPath = e.currentTarget.value;
                  if (pPath) {
                    loadProject(pPath, activeRepoPath() || undefined, true, true);
                  }
                }}
                style={{
                  flex: 1,
                  padding: '4px 6px',
                  border: '1px solid #cbd5e1',
                  'border-radius': '4px',
                  'font-size': '0.75rem',
                  background: '#fff',
                  'font-weight': '600'
                }}
              >
                <For each={getActiveRepoProjects()}>{proj => (
                  <option value={proj.path}>📁 {proj.name}</option>
                )}</For>
              </select>
            </Show>
          </div>
        </div>

        {/* 2. PROJECT HEADER & PARENT LINK */}
        <div style={{ padding: '8px 14px', 'border-bottom': '1px solid #e2e8f0', 'flex-shrink': 0, background: '#f8fafc' }}>
          {/* Parent Folder Link */}
          <Show when={projectData()?.parentPath}>
            <div
              onClick={() => loadProject(projectData()!.parentPath!, activeRepoPath() || undefined, true, true)}
              style={{
                display: 'flex',
                'align-items': 'center',
                gap: '6px',
                cursor: 'pointer',
                color: '#2563eb',
                'font-size': '0.8rem',
                'font-weight': '600',
                'margin-bottom': '4px'
              }}
              title={`Return to parent: ${getParentFolderName()}`}
            >
              <span>↰ ..</span>
              <span style={{ 'text-decoration': 'underline' }}>{getParentFolderName()}</span>
            </div>
          </Show>

          {/* Project Title (Clickable for Overview) + Single +Add Button */}
          <div style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', gap: '8px' }}>
            <h3
              onClick={() => handleOpenProjectDescription()}
              style={{
                margin: 0,
                color: activeFilePath()?.endsWith('_project.md') ? '#2563eb' : '#0f172a',
                'font-size': '1.05rem',
                overflow: 'hidden',
                'text-overflow': 'ellipsis',
                'white-space': 'nowrap',
                flex: 1,
                cursor: 'pointer',
                'text-decoration': activeFilePath()?.endsWith('_project.md') ? 'underline' : 'none'
              }}
              title={`Click to open project overview: ${projectData()?.manifest.name}`}
            >
              {projectData()?.manifest.name || 'Select Project'}
            </h3>
            <button
              onClick={() => openCreateModal(activeProjectPath()!, activeRepoPath()!)}
              title="Add Ticket or Sub-Project"
              style={{
                background: '#16a34a',
                color: '#fff',
                border: 'none',
                padding: '3px 10px',
                'border-radius': '4px',
                cursor: 'pointer',
                'font-size': '0.75rem',
                'font-weight': '600',
                'flex-shrink': 0
              }}
            >
              + Add
            </button>
          </div>
        </div>

        {/* 3. COLLAPSIBLE PANELS (Sub-Projects, Tickets, Docs) */}
        <div style={{ flex: 1, 'min-height': 0, 'overflow-y': 'auto', padding: '8px 10px', display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
          {/* PANEL 1: Sub-Projects */}
          <Show when={(projectData()?.manifest.projectmap.subprojects || []).length > 0}>
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', 'border-radius': '6px', overflow: 'hidden' }}>
              <div
                onClick={() => togglePanel('subprojects')}
                style={{
                  display: 'flex',
                  'align-items': 'center',
                  'justify-content': 'space-between',
                  padding: '6px 8px',
                  background: '#f8fafc',
                  cursor: 'pointer',
                  'user-select': 'none',
                  'border-bottom': isSubprojectsOpen() ? '1px solid #e2e8f0' : 'none'
                }}
              >
                <span style={{ 'font-size': '0.75rem', 'font-weight': '700', color: '#475569' }}>
                  📁 Sub-Projects ({projectData()?.manifest.projectmap.subprojects.length})
                </span>
                <span style={{ 'font-size': '0.7rem', color: '#64748b' }}>{isSubprojectsOpen() ? '▼' : '▶'}</span>
              </div>
              <Show when={isSubprojectsOpen()}>
                <div style={{ padding: '4px', display: 'flex', 'flex-direction': 'column', gap: '2px' }}>
                  <For each={projectData()?.manifest.projectmap.subprojects}>
                    {sub => (
                      <div
                        onClick={() => loadProject(sub.path, activeRepoPath() || undefined, true, true)}
                        style={{
                          display: 'flex',
                          'align-items': 'center',
                          gap: '6px',
                          padding: '4px 6px',
                          'border-radius': '4px',
                          cursor: 'pointer',
                          'font-size': '0.82rem',
                          color: '#1e293b',
                          'white-space': 'nowrap',
                          overflow: 'hidden',
                          'text-overflow': 'ellipsis'
                        }}
                        title={sub.name}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span>📁</span>
                        <span style={{ 'font-weight': '600', overflow: 'hidden', 'text-overflow': 'ellipsis' }}>
                          {sub.name}
                        </span>
                        <span style={{ 'margin-left': 'auto', color: '#94a3b8', 'font-size': '0.75rem' }}>→</span>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </Show>

          {/* PANEL 2: Tickets */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', 'border-radius': '6px', overflow: 'hidden' }}>
            <div
              onClick={() => togglePanel('tickets')}
              style={{
                display: 'flex',
                'align-items': 'center',
                'justify-content': 'space-between',
                padding: '6px 8px',
                background: '#f8fafc',
                cursor: 'pointer',
                'user-select': 'none',
                'border-bottom': isTicketsOpen() ? '1px solid #e2e8f0' : 'none'
              }}
            >
              <span style={{ 'font-size': '0.75rem', 'font-weight': '700', color: '#475569' }}>
                📋 Tickets ({filteredAndSortedTickets().length})
              </span>
              <span style={{ 'font-size': '0.7rem', color: '#64748b' }}>{isTicketsOpen() ? '▼' : '▶'}</span>
            </div>

            <Show when={isTicketsOpen()}>
              <div style={{ padding: '4px' }}>
                <Show when={(projectData()?.manifest.projectmap.tickets || []).length > 0}>
                  <div style={{ display: 'flex', gap: '4px', 'align-items': 'center', 'margin-bottom': '4px', padding: '2px' }}>
                    <input
                      type="text"
                      placeholder="Filter tickets..."
                      value={ticketSearch()}
                      onInput={e => setTicketSearch(e.currentTarget.value)}
                      style={{
                        flex: 1,
                        'min-width': '0',
                        padding: '3px 6px',
                        border: '1px solid #cbd5e1',
                        'border-radius': '4px',
                        'font-size': '0.75rem',
                        'box-sizing': 'border-box'
                      }}
                    />
                    <select
                      value={sortOption()}
                      onChange={e => handleSortChange(e.currentTarget.value as any)}
                      style={{
                        'font-size': '0.72rem',
                        border: '1px solid #cbd5e1',
                        'border-radius': '4px',
                        padding: '2px 4px',
                        background: '#fff',
                        color: '#475569',
                        'flex-shrink': 0,
                        cursor: 'pointer'
                      }}
                    >
                      <option value="manifest">Default</option>
                      <option value="status">Status</option>
                      <option value="name">Name</option>
                      <option value="id">ID</option>
                    </select>
                  </div>
                </Show>

                <Show
                  when={filteredAndSortedTickets().length > 0}
                  fallback={
                    <div style={{ color: '#94a3b8', 'font-size': '0.8rem', 'text-align': 'center', padding: '12px 0' }}>
                      No tickets yet.
                    </div>
                  }
                >
                  <div style={{ display: 'flex', 'flex-direction': 'column', gap: '2px' }}>
                    <For each={filteredAndSortedTickets()}>
                      {(ticket: TicketSummary) => {
                        const isSelected = activeFilePath() === ticket.filePath;
                        const statusStyle = getStatusBadgeStyle(ticket.status);
                        const typeStyle = getTypeBadgeStyle(ticket.type);

                        return (
                          <div
                            onClick={() => handleOpenFile(ticket.filePath, activeRepoPath()!)}
                            style={{
                              display: 'flex',
                              'align-items': 'center',
                              gap: '6px',
                              padding: '4px 6px',
                              'border-radius': '4px',
                              cursor: 'pointer',
                              background: isSelected ? '#eff6ff' : 'transparent',
                              color: isSelected ? '#1d4ed8' : '#334155',
                              'font-weight': isSelected ? '600' : 'normal',
                              'font-size': '0.82rem',
                              'white-space': 'nowrap',
                              overflow: 'hidden'
                            }}
                            title={`${ticket.id ? '#' + ticket.id + ': ' : ''}${ticket.name}`}
                            onMouseEnter={e => {
                              if (!isSelected) e.currentTarget.style.background = '#f1f5f9';
                            }}
                            onMouseLeave={e => {
                              if (!isSelected) e.currentTarget.style.background = 'transparent';
                            }}
                          >
                            {/* 1. ID */}
                            <span
                              style={{
                                'font-size': '0.7rem',
                                'font-family': 'monospace',
                                'font-weight': '700',
                                color: isSelected ? '#1d4ed8' : '#64748b',
                                'flex-shrink': 0
                              }}
                            >
                              #{ticket.id}
                            </span>

                            {/* 2. Status */}
                            <Show when={ticket.status}>
                              <span
                                style={{
                                  'font-size': '0.65rem',
                                  background: statusStyle.bg,
                                  color: statusStyle.text,
                                  padding: '0 4px',
                                  'border-radius': '3px',
                                  'font-weight': '600',
                                  'flex-shrink': 0
                                }}
                              >
                                {ticket.status}
                              </span>
                            </Show>

                            {/* 3. Name with ellipsis */}
                            <span
                              style={{
                                overflow: 'hidden',
                                'text-overflow': 'ellipsis',
                                'white-space': 'nowrap',
                                flex: 1
                              }}
                            >
                              {ticket.name}
                            </span>

                            {/* 4. Type on far right */}
                            <Show when={ticket.type}>
                              <span
                                style={{
                                  'font-size': '0.65rem',
                                  background: typeStyle.bg,
                                  color: typeStyle.text,
                                  padding: '0 4px',
                                  'border-radius': '3px',
                                  'font-weight': '600',
                                  'flex-shrink': 0,
                                  'margin-left': 'auto'
                                }}
                              >
                                {ticket.type}
                              </span>
                            </Show>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </Show>
              </div>
            </Show>
          </div>

          {/* PANEL 3: Documentation */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', 'border-radius': '6px', overflow: 'hidden' }}>
            <div
              onClick={() => togglePanel('docs')}
              style={{
                display: 'flex',
                'align-items': 'center',
                'justify-content': 'space-between',
                padding: '6px 8px',
                background: '#f8fafc',
                cursor: 'pointer',
                'user-select': 'none',
                'border-bottom': isDocsOpen() ? '1px solid #e2e8f0' : 'none'
              }}
            >
              <span style={{ 'font-size': '0.75rem', 'font-weight': '700', color: '#475569' }}>
                📚 Documentation ({getActiveRepoDocs().length})
              </span>
              <span style={{ 'font-size': '0.7rem', color: '#64748b' }}>{isDocsOpen() ? '▼' : '▶'}</span>
            </div>
            <Show when={isDocsOpen()}>
              <div style={{ padding: '4px', display: 'flex', 'flex-direction': 'column', gap: '2px' }}>
                <For each={getActiveRepoDocs()}>
                  {doc => (
                    <div
                      onClick={() => handleOpenFile(doc.path, activeRepoPath()!)}
                      style={{
                        padding: '4px 6px',
                        'border-radius': '4px',
                        background: activeFilePath() === doc.path ? '#eff6ff' : 'transparent',
                        color: activeFilePath() === doc.path ? '#2563eb' : '#475569',
                        'font-size': '0.8rem',
                        cursor: 'pointer',
                        'font-weight': activeFilePath() === doc.path ? '700' : 'normal',
                        'white-space': 'nowrap',
                        overflow: 'hidden',
                        'text-overflow': 'ellipsis',
                        display: 'flex',
                        'align-items': 'center',
                        gap: '6px'
                      }}
                      title={doc.name}
                      onMouseEnter={e => {
                        if (activeFilePath() !== doc.path) e.currentTarget.style.background = '#f8fafc';
                      }}
                      onMouseLeave={e => {
                        if (activeFilePath() !== doc.path) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <span style={{ 'flex-shrink': 0 }}>📄</span>
                      <span style={{ overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}>
                        {doc.name}
                      </span>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </div>

      {/* WORKSPACE AREA */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          'flex-direction': 'column',
          padding: '24px 32px',
          background: '#ffffff',
          'overflow-y': 'auto'
        }}
      >
        <Show
          when={activeFilePath()}
          fallback={
            <div style={{ color: '#94a3b8', 'margin-top': '120px', 'text-align': 'center' }}>
              <div style={{ 'font-size': '3rem', 'margin-bottom': '12px' }}>👁️</div>
              <h3 style={{ margin: '0 0 8px 0', color: '#64748b' }}>No Item Selected</h3>
              <p style={{ 'font-size': '0.9rem', color: '#94a3b8' }}>
                Select a ticket, subproject, or project overview from the sidebar to view and edit.
              </p>
            </div>
          }
        >
          {/* HEADER */}
          <div
            style={{
              display: 'flex',
              'justify-content': 'space-between',
              'align-items': 'center',
              'margin-bottom': '20px',
              'padding-bottom': '16px',
              'border-bottom': '1px solid #f1f5f9'
            }}
          >
            <div style={{ 'max-width': '70%' }}>
              <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
                <Show when={activeTicketId()}>
                  <span
                    style={{
                      'font-size': '0.85rem',
                      'font-family': 'monospace',
                      'font-weight': '700',
                      background: '#f1f5f9',
                      color: '#475569',
                      padding: '2px 8px',
                      'border-radius': '4px'
                    }}
                  >
                    #{activeTicketId()}
                  </span>
                </Show>
                <h2 style={{ margin: 0, color: '#0f172a' }}>{activeTicketName()}</h2>
              </div>
              <div style={{ 'font-size': '0.8rem', color: '#94a3b8', 'margin-top': '6px', 'word-break': 'break-all' }}>
                {activeFilePath()}
              </div>
            </div>

            <Show when={activeTab() === 'edit'}>
              <div style={{ display: 'flex', 'align-items': 'center', gap: '12px' }}>
                <Show when={saveStatus()}>
                  <span
                    style={{
                      'font-size': '0.85rem',
                      color: saveStatus().startsWith('Error') ? '#dc2626' : '#16a34a'
                    }}
                  >
                    {saveStatus()}
                  </span>
                </Show>
                <button
                  onClick={handleSaveFile}
                  disabled={isSaving()}
                  style={{
                    background: '#16a34a',
                    color: '#fff',
                    border: 'none',
                    padding: '8px 20px',
                    'border-radius': '6px',
                    cursor: 'pointer',
                    'font-weight': '600'
                  }}
                >
                  {isSaving() ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </Show>
          </div>

          {/* NAVIGATION TABS */}
          <div style={{ display: 'flex', gap: '8px', 'border-bottom': '1px solid #e2e8f0', 'margin-bottom': '20px' }}>
            <button
              onClick={() => setActiveTab('preview')}
              style={{
                padding: '8px 16px',
                border: 'none',
                'border-bottom': activeTab() === 'preview' ? '2px solid #2563eb' : '2px solid transparent',
                background: 'transparent',
                color: activeTab() === 'preview' ? '#2563eb' : '#64748b',
                'font-weight': activeTab() === 'preview' ? 'bold' : 'normal',
                cursor: 'pointer'
              }}
            >
              👁️ Preview
            </button>
            <button
              onClick={() => setActiveTab('edit')}
              style={{
                padding: '8px 16px',
                border: 'none',
                'border-bottom': activeTab() === 'edit' ? '2px solid #2563eb' : '2px solid transparent',
                background: 'transparent',
                color: activeTab() === 'edit' ? '#2563eb' : '#64748b',
                'font-weight': activeTab() === 'edit' ? 'bold' : 'normal',
                cursor: 'pointer'
              }}
            >
              ✏️ Edit
            </button>
          </div>

          {/* TAB 1: PREVIEW */}
          <Show when={activeTab() === 'preview'}>
            <div style={{ flex: 1, display: 'flex', 'flex-direction': 'column' }}>
              <Show when={attributes().length > 0}>
                <div
                  style={{
                    display: 'flex',
                    'flex-wrap': 'wrap',
                    gap: '8px',
                    'margin-bottom': '20px',
                    background: '#f8fafc',
                    padding: '12px',
                    'border-radius': '8px',
                    border: '1px solid #f1f5f9'
                  }}
                >
                  <For each={attributes()}>
                    {attr => (
                      <div
                        style={{
                          background: '#e2e8f0',
                          padding: '4px 10px',
                          'border-radius': '16px',
                          'font-size': '0.8rem',
                          color: '#334155'
                        }}
                      >
                        <strong style={{ color: '#0f172a' }}>{attr.key}:</strong> {attr.val}
                      </div>
                    )}
                  </For>
                </div>
              </Show>

              <div
                innerHTML={marked.parse(markdownBody() || '') as string}
                style={{ flex: 1, 'line-height': '1.6', color: '#1e293b', 'font-size': '1rem' }}
              />
            </div>
          </Show>

          {/* TAB 2: EDIT */}
          <Show when={activeTab() === 'edit'}>
            <div style={{ flex: 1, display: 'flex', 'flex-direction': 'column' }}>
              <Show when={!activeFilePath()?.endsWith('_project.md')}>
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    'border-radius': '8px',
                    padding: '16px',
                    'margin-bottom': '20px'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      'justify-content': 'space-between',
                      'align-items': 'center',
                      'margin-bottom': '12px'
                    }}
                  >
                    <h4 style={{ margin: 0, color: '#334155' }}>Frontmatter Metadata</h4>
                    <button
                      onClick={() => handleAddFrontmatterField()}
                      style={{
                        background: '#e2e8f0',
                        border: 'none',
                        padding: '4px 8px',
                        'border-radius': '4px',
                        cursor: 'pointer',
                        'font-size': '0.8rem'
                      }}
                    >
                      + Custom Field
                    </button>
                  </div>

                  <For each={attributes()}>
                    {(attr, index) => {
                      const schema = getActiveRepoConfig()?.frontmatterSchema || [];
                      const fieldDef = schema.find((s: SchemaField) => s.name === attr.key.trim());

                      return (
                        <div
                          style={{
                            display: 'flex',
                            gap: '8px',
                            'margin-bottom': '8px',
                            'align-items': 'center'
                          }}
                        >
                          <input
                            type="text"
                            placeholder="Key"
                            value={attr.key}
                            onInput={e => updateAttrKey(index(), e.currentTarget.value)}
                            style={{
                              width: '160px',
                              padding: '6px 8px',
                              border: '1px solid #cbd5e1',
                              'border-radius': '4px',
                              'font-weight': '600'
                            }}
                          />

                          <Show
                            when={fieldDef?.type === 'enum'}
                            fallback={
                              <Show
                                when={fieldDef?.type === 'number'}
                                fallback={
                                  <input
                                    type="text"
                                    placeholder="Value"
                                    value={attr.val}
                                    onInput={e => updateAttrVal(index(), e.currentTarget.value)}
                                    style={{
                                      flex: 1,
                                      padding: '6px 8px',
                                      border: '1px solid #cbd5e1',
                                      'border-radius': '4px'
                                    }}
                                  />
                                }
                              >
                                <input
                                  type="number"
                                  placeholder="Numeric value"
                                  value={attr.val}
                                  onInput={e => updateAttrVal(index(), e.currentTarget.value)}
                                  style={{
                                    flex: 1,
                                    padding: '6px 8px',
                                    border: '1px solid #cbd5e1',
                                    'border-radius': '4px'
                                  }}
                                />
                              </Show>
                            }
                          >
                            <select
                              value={attr.val}
                              onChange={e => updateAttrVal(index(), e.currentTarget.value)}
                              style={{
                                flex: 1,
                                padding: '6px 8px',
                                border: '1px solid #cbd5e1',
                                'border-radius': '4px',
                                background: '#fff'
                              }}
                            >
                              <option value="">-- Select {fieldDef?.name} --</option>
                              <For each={fieldDef?.options || []}>{opt => <option value={opt}>{opt}</option>}</For>
                            </select>
                          </Show>

                          <button
                            onClick={() => handleRemoveFrontmatterField(index())}
                            style={{
                              background: '#fee2e2',
                              color: '#dc2626',
                              border: 'none',
                              padding: '6px 10px',
                              'border-radius': '4px',
                              cursor: 'pointer'
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      );
                    }}
                  </For>

                  <Show when={(getActiveRepoConfig()?.frontmatterSchema || []).length > 0}>
                    <div
                      style={{
                        'margin-top': '12px',
                        'padding-top': '12px',
                        'border-top': '1px dashed #e2e8f0',
                        display: 'flex',
                        gap: '6px',
                        'align-items': 'center',
                        'flex-wrap': 'wrap'
                      }}
                    >
                      <span style={{ 'font-size': '0.75rem', color: '#64748b' }}>Add field:</span>
                      <For each={getActiveRepoConfig()?.frontmatterSchema || []}>
                        {(schemaField: SchemaField) => (
                          <button
                            onClick={() => handleAddFrontmatterField(schemaField.name)}
                            style={{
                              background: '#eff6ff',
                              color: '#2563eb',
                              border: '1px solid #bfdbfe',
                              padding: '2px 8px',
                              'border-radius': '12px',
                              'font-size': '0.75rem',
                              cursor: 'pointer'
                            }}
                          >
                            + {schemaField.name} ({schemaField.type})
                          </button>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              </Show>

              <div style={{ flex: 1, display: 'flex', 'flex-direction': 'column' }}>
                <h4 style={{ margin: '0 0 8px 0', color: '#334155' }}>Markdown Content</h4>
                <textarea
                  value={markdownBody()}
                  onInput={e => setMarkdownBody(e.currentTarget.value)}
                  style={{
                    flex: 1,
                    'min-height': '350px',
                    padding: '12px',
                    'font-family': 'monospace',
                    border: '1px solid #cbd5e1',
                    'border-radius': '8px',
                    'font-size': '0.95rem',
                    'line-height': '1.5'
                  }}
                />
              </div>
            </div>
          </Show>
        </Show>
      </div>

      {/* MODAL 1: Add Project Root */}
      <Show when={isModalOpen()}>
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'center'
          }}
        >
          <div style={{ background: '#fff', padding: '24px', 'border-radius': '8px', width: '480px' }}>
            <h3 style={{ 'margin-top': 0 }}>Register Repository Root</h3>
            <form onSubmit={handleAddProject}>
              <div style={{ display: 'flex', gap: '8px', 'margin-bottom': '12px' }}>
                <input
                  type="text"
                  placeholder="/Users/username/Dev/my-repo"
                  value={selectedRepoPath()}
                  onInput={e => setSelectedRepoPath(e.currentTarget.value)}
                  style={{ flex: 1, padding: '8px 12px', border: '1px solid #cbd5e1', 'border-radius': '6px' }}
                />
                <button
                  type="button"
                  onClick={handleBrowseNativeFolder}
                  disabled={isBrowsing()}
                  style={{
                    background: '#475569',
                    color: '#fff',
                    border: 'none',
                    padding: '8px 14px',
                    'border-radius': '6px'
                  }}
                >
                  {isBrowsing() ? 'Opening...' : 'Browse...'}
                </button>
              </div>
              <Show when={errorMsg()}>
                <div style={{ color: '#dc2626', 'font-size': '0.85rem', 'margin-bottom': '12px' }}>{errorMsg()}</div>
              </Show>
              <div style={{ display: 'flex', 'justify-content': 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{ background: '#e2e8f0', border: 'none', padding: '8px 16px', 'border-radius': '6px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 16px', 'border-radius': '6px' }}
                >
                  Index Repo
                </button>
              </div>
            </form>
          </div>
        </div>
      </Show>

      {/* MODAL 2: Create Item (Ticket or Folder) */}
      <Show when={isCreateModalOpen()}>
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'center'
          }}
        >
          <div style={{ background: '#fff', padding: '24px', 'border-radius': '8px', width: '480px' }}>
            <h3 style={{ 'margin-top': 0 }}>Create Ticket or Sub-Project</h3>
            <form onSubmit={handleCreateItem}>
              <div style={{ 'margin-bottom': '12px' }}>
                <label style={{ display: 'block', 'font-size': '0.85rem', 'font-weight': 'bold', 'margin-bottom': '4px' }}>
                  Item Type
                </label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <label style={{ cursor: 'pointer', 'font-size': '0.9rem' }}>
                    <input
                      type="radio"
                      name="createType"
                      value="file"
                      checked={createType() === 'file'}
                      onChange={() => setCreateType('file')}
                    />{' '}
                    📄 Ticket (.md)
                  </label>
                  <label style={{ cursor: 'pointer', 'font-size': '0.9rem' }}>
                    <input
                      type="radio"
                      name="createType"
                      value="directory"
                      checked={createType() === 'directory'}
                      onChange={() => setCreateType('directory')}
                    />{' '}
                    📁 Sub-Project (Folder)
                  </label>
                </div>
              </div>

              <div style={{ 'margin-bottom': '12px' }}>
                <label style={{ display: 'block', 'font-size': '0.85rem', 'font-weight': 'bold', 'margin-bottom': '4px' }}>
                  Name / Title
                </label>
                <input
                  type="text"
                  placeholder={createType() === 'file' ? 'e.g. Implement OAuth Flow' : 'e.g. Auth Refactor'}
                  value={createName()}
                  onInput={e => setCreateName(e.currentTarget.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #cbd5e1',
                    'border-radius': '6px',
                    'box-sizing': 'border-box'
                  }}
                />
              </div>

              <div
                style={{
                  'margin-bottom': '16px',
                  'font-size': '0.8rem',
                  color: '#64748b',
                  background: '#f8fafc',
                  padding: '8px 12px',
                  'border-radius': '6px'
                }}
              >
                Target Parent Path: <br />
                <code style={{ 'word-break': 'break-all' }}>{createParentPath()}</code>
              </div>

              <Show when={createErrorMsg()}>
                <div style={{ color: '#dc2626', 'font-size': '0.85rem', 'margin-bottom': '12px' }}>{createErrorMsg()}</div>
              </Show>

              <div style={{ display: 'flex', 'justify-content': 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  style={{ background: '#e2e8f0', border: 'none', padding: '8px 16px', 'border-radius': '6px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    background: '#16a34a',
                    color: '#fff',
                    border: 'none',
                    padding: '8px 16px',
                    'border-radius': '6px',
                    'font-weight': '600'
                  }}
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      </Show>

      {/* MODAL 3: Repository Settings (overseer.json) */}
      <Show when={isConfigModalOpen()}>
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'center'
          }}
        >
          <div
            style={{
              background: '#fff',
              padding: '24px',
              'border-radius': '8px',
              width: '560px',
              'max-height': '85vh',
              'overflow-y': 'auto'
            }}
          >
            <h3 style={{ 'margin-top': 0 }}>Configure Repo (`overseer.json`)</h3>
            <form onSubmit={handleSaveRepoConfig}>
              <div style={{ 'margin-bottom': '12px' }}>
                <label style={{ display: 'block', 'font-weight': 'bold', 'font-size': '0.85rem', 'margin-bottom': '4px' }}>
                  Docs Folder Directory
                </label>
                <input
                  type="text"
                  value={configDocsDir()}
                  onInput={e => setConfigDocsDir(e.currentTarget.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #cbd5e1',
                    'border-radius': '6px',
                    'box-sizing': 'border-box'
                  }}
                />
              </div>

              <div style={{ 'margin-bottom': '16px' }}>
                <label style={{ display: 'block', 'font-weight': 'bold', 'font-size': '0.85rem', 'margin-bottom': '4px' }}>
                  Projects Folder Directory
                </label>
                <input
                  type="text"
                  value={configProjectsDir()}
                  onInput={e => setConfigProjectsDir(e.currentTarget.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #cbd5e1',
                    'border-radius': '6px',
                    'box-sizing': 'border-box'
                  }}
                />
              </div>

              <hr style={{ border: 'none', 'border-top': '1px solid #e2e8f0', 'margin-bottom': '16px' }} />

              <div
                style={{
                  display: 'flex',
                  'justify-content': 'space-between',
                  'align-items': 'center',
                  'margin-bottom': '8px'
                }}
              >
                <h4 style={{ margin: 0 }}>Frontmatter Schema Fields</h4>
                <button
                  type="button"
                  onClick={() => setConfigSchema(prev => [...prev, { name: '', type: 'string', optionsRaw: '' }])}
                  style={{
                    background: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    padding: '4px 10px',
                    'border-radius': '4px',
                    'font-size': '0.8rem',
                    cursor: 'pointer'
                  }}
                >
                  + Add Schema Field
                </button>
              </div>

              <For each={configSchema()}>
                {(field, index) => (
                  <div
                    style={{
                      background: '#f8fafc',
                      padding: '10px',
                      'border-radius': '6px',
                      border: '1px solid #e2e8f0',
                      'margin-bottom': '8px'
                    }}
                  >
                    <div style={{ display: 'flex', gap: '8px', 'margin-bottom': '6px' }}>
                      <input
                        type="text"
                        placeholder="Field Name (e.g. status)"
                        value={field.name}
                        onInput={e =>
                          setConfigSchema(prev =>
                            prev.map((item, idx) => (idx === index() ? { ...item, name: e.currentTarget.value } : item))
                          )
                        }
                        style={{
                          flex: 1,
                          padding: '6px',
                          border: '1px solid #cbd5e1',
                          'border-radius': '4px'
                        }}
                      />
                      <select
                        value={field.type}
                        onChange={e =>
                          setConfigSchema(prev =>
                            prev.map((item, idx) =>
                              idx === index() ? { ...item, type: e.currentTarget.value as any } : item
                            )
                          )
                        }
                        style={{ width: '110px', padding: '6px', border: '1px solid #cbd5e1', 'border-radius': '4px' }}
                      >
                        <option value="string">String</option>
                        <option value="number">Number</option>
                        <option value="enum">Enum</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => setConfigSchema(prev => prev.filter((_, idx) => idx !== index()))}
                        style={{
                          background: '#fee2e2',
                          color: '#dc2626',
                          border: 'none',
                          padding: '0 10px',
                          'border-radius': '4px',
                          cursor: 'pointer'
                        }}
                      >
                        ✕
                      </button>
                    </div>

                    <Show when={field.type === 'enum'}>
                      <input
                        type="text"
                        placeholder="Options (comma-separated, e.g. backlog, active, done)"
                        value={field.optionsRaw || ''}
                        onInput={e =>
                          setConfigSchema(prev =>
                            prev.map((item, idx) =>
                              idx === index() ? { ...item, optionsRaw: e.currentTarget.value } : item
                            )
                          )
                        }
                        style={{
                          width: '100%',
                          padding: '6px',
                          border: '1px solid #cbd5e1',
                          'border-radius': '4px',
                          'box-sizing': 'border-box'
                        }}
                      />
                    </Show>
                  </div>
                )}
              </For>

              <div style={{ display: 'flex', 'justify-content': 'flex-end', gap: '8px', 'margin-top': '20px' }}>
                <button
                  type="button"
                  onClick={() => setIsConfigModalOpen(false)}
                  style={{ background: '#e2e8f0', border: 'none', padding: '8px 16px', 'border-radius': '6px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    background: '#16a34a',
                    color: '#fff',
                    border: 'none',
                    padding: '8px 16px',
                    'border-radius': '6px',
                    'font-weight': '600'
                  }}
                >
                  Save Config
                </button>
              </div>
            </form>
          </div>
        </div>
      </Show>
    </div>
  );
}