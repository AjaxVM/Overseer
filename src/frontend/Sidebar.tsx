import { createSignal, For, Show } from 'solid-js';
import type { Accessor } from 'solid-js';
import type { DocTreeEntry, ProjectDetailsResponse, RepoTreeNode, TicketSummary } from './types';

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

interface SidebarProps {
  tree: Accessor<RepoTreeNode[]>;
  activeRepoPath: Accessor<string | null>;
  projectData: Accessor<ProjectDetailsResponse | null>;
  activeFilePath: Accessor<string | null>;
  onSelectRepo: (repoPath: string) => void;
  onNavigateProject: (path: string) => void;
  onOpenFile: (filePath: string, repoPath: string) => void;
  onOpenProjectDescription: () => void;
  onOpenCreateModal: (parentPath: string, repoPath: string) => void;
  onOpenRepoConfigModal: (repoNode: RepoTreeNode) => void;
  onAddRepoClick: () => void;
}

export default function Sidebar(props: SidebarProps) {
  const [isSubprojectsOpen, setIsSubprojectsOpen] = createSignal(localStorage.getItem('overseer:panel:subprojects') !== 'false');
  const [isTicketsOpen, setIsTicketsOpen] = createSignal(localStorage.getItem('overseer:panel:tickets') !== 'false');
  const [isDocsOpen, setIsDocsOpen] = createSignal(localStorage.getItem('overseer:panel:docs') !== 'false');
  const [ticketSearch, setTicketSearch] = createSignal('');
  const [sortOption, setSortOption] = createSignal<'manifest' | 'status' | 'name' | 'id'>(
    (localStorage.getItem('overseer:sortOption') as any) || 'manifest'
  );

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
    const pPath = props.projectData()?.parentPath;
    if (!pPath) return '';
    const parts = pPath.split(/[/\\]/).filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : 'Parent';
  };

  const getActiveRepoDocs = (): DocTreeEntry[] => {
    if (!props.activeRepoPath()) return [];
    const repoNode = props.tree().find(r => r.repoPath === props.activeRepoPath());
    const docsCat = repoNode?.children?.find(c => c.categoryType === 'docs');
    return (docsCat?.children as DocTreeEntry[]) || [];
  };

  const filteredAndSortedTickets = (): TicketSummary[] => {
    const rawTickets = props.projectData()?.manifest.projectmap.tickets || [];
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
              onClick={props.onAddRepoClick}
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
            <Show when={props.activeRepoPath()}>
              <button
                onClick={() => {
                  const repoNode = props.tree().find(r => r.repoPath === props.activeRepoPath());
                  if (repoNode) props.onOpenRepoConfigModal(repoNode);
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

        {/* Repo Selector */}
        <div style={{ display: 'flex', gap: '6px', 'margin-top': '8px' }}>
          <Show when={props.tree().length > 1}>
            <select
              value={props.activeRepoPath() || ''}
              onChange={e => props.onSelectRepo(e.currentTarget.value)}
              style={{
                flex: 1,
                padding: '4px 6px',
                border: '1px solid #cbd5e1',
                'border-radius': '4px',
                'font-size': '0.75rem',
                background: '#fff'
              }}
            >
              <For each={props.tree()}>{repo => <option value={repo.repoPath}>📦 {repo.name}</option>}</For>
            </select>
          </Show>
        </div>
      </div>

      {/* 2. PROJECT HEADER & PARENT LINK */}
      <div style={{ padding: '8px 14px', 'border-bottom': '1px solid #e2e8f0', 'flex-shrink': 0, background: '#f8fafc' }}>
        {/* Parent Folder Link */}
        <Show when={props.projectData()?.parentPath}>
          <div
            onClick={() => props.onNavigateProject(props.projectData()!.parentPath!)}
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
            onClick={() => props.onOpenProjectDescription()}
            style={{
              margin: 0,
              color: props.activeFilePath()?.endsWith('_project.md') ? '#2563eb' : '#0f172a',
              'font-size': '1.05rem',
              overflow: 'hidden',
              'text-overflow': 'ellipsis',
              'white-space': 'nowrap',
              flex: 1,
              cursor: 'pointer',
              'text-decoration': props.activeFilePath()?.endsWith('_project.md') ? 'underline' : 'none'
            }}
            title={`Click to open project overview: ${props.projectData()?.manifest.name}`}
          >
            {props.projectData()?.manifest.name || 'Select Project'}
          </h3>
          <button
            onClick={() => {
              const projectPath = props.projectData()?.path;
              const repoPath = props.activeRepoPath();
              if (projectPath && repoPath) props.onOpenCreateModal(projectPath, repoPath);
            }}
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
        <Show when={(props.projectData()?.manifest.projectmap.subprojects || []).length > 0}>
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
                📁 Sub-Projects ({props.projectData()?.manifest.projectmap.subprojects.length})
              </span>
              <span style={{ 'font-size': '0.7rem', color: '#64748b' }}>{isSubprojectsOpen() ? '▼' : '▶'}</span>
            </div>
            <Show when={isSubprojectsOpen()}>
              <div style={{ padding: '4px', display: 'flex', 'flex-direction': 'column', gap: '2px' }}>
                <For each={props.projectData()?.manifest.projectmap.subprojects}>
                  {sub => (
                    <div
                      onClick={() => props.onNavigateProject(sub.path)}
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
              <Show when={(props.projectData()?.manifest.projectmap.tickets || []).length > 0}>
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
                      const isSelected = props.activeFilePath() === ticket.filePath;
                      const statusStyle = getStatusBadgeStyle(ticket.status);
                      const typeStyle = getTypeBadgeStyle(ticket.type);

                      return (
                        <div
                          onClick={() => props.onOpenFile(ticket.filePath, props.activeRepoPath()!)}
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
                    onClick={() => props.onOpenFile(doc.path, props.activeRepoPath()!)}
                    style={{
                      padding: '4px 6px',
                      'border-radius': '4px',
                      background: props.activeFilePath() === doc.path ? '#eff6ff' : 'transparent',
                      color: props.activeFilePath() === doc.path ? '#2563eb' : '#475569',
                      'font-size': '0.8rem',
                      cursor: 'pointer',
                      'font-weight': props.activeFilePath() === doc.path ? '700' : 'normal',
                      'white-space': 'nowrap',
                      overflow: 'hidden',
                      'text-overflow': 'ellipsis',
                      display: 'flex',
                      'align-items': 'center',
                      gap: '6px'
                    }}
                    title={doc.name}
                    onMouseEnter={e => {
                      if (props.activeFilePath() !== doc.path) e.currentTarget.style.background = '#f8fafc';
                    }}
                    onMouseLeave={e => {
                      if (props.activeFilePath() !== doc.path) e.currentTarget.style.background = 'transparent';
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
  );
}
