import { createEffect, createSignal, onCleanup, For, Show } from 'solid-js';
import type { Accessor, JSX } from 'solid-js';
import Icon from './Icon';
import { colors, font, getStatusBadgeStyle, getTypeBadgeStyle } from './theme';
import type { BadgeStyle } from './theme';
import type { DocTreeEntry, ProjectDetailsResponse, RepoTreeNode, TicketSummary } from './types';

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
  onReorderTickets: (fileNameOrder: string[]) => void;
  onReorderSubprojects: (slugOrder: string[]) => void;
}

function SectionHeader(props: { icon: 'folder' | 'ticket' | 'book'; label: string; count: number; open: boolean; onToggle: () => void }) {
  return (
    <div
      onClick={props.onToggle}
      style={{
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'space-between',
        padding: '5px 2px',
        cursor: 'pointer',
        'user-select': 'none'
      }}
    >
      <div style={{ display: 'flex', 'align-items': 'center', gap: '7px', color: colors.inkSoft, 'font-family': font.sans, 'font-size': '0.78rem', 'font-weight': 600 }}>
        <Icon name={props.icon} size={14} style={{ color: colors.bronze }} />
        {props.label}
        <span style={{ color: colors.inkFaint, 'font-weight': 500 }}>({props.count})</span>
      </div>
      <Icon name={props.open ? 'chevronDown' : 'chevronRight'} size={13} style={{ color: colors.inkFaint }} />
    </div>
  );
}

const rowHoverStyle = { background: colors.paperCard, borderLeftColor: colors.borderStrong };
const rowIdleStyle = { background: 'transparent', borderLeftColor: 'transparent' };

function ListRow(props: {
  icon: JSX.Element;
  label: string;
  selected?: boolean;
  trailing?: JSX.Element;
  onClick: () => void;
  title?: string;
  draggable?: boolean;
  dragging?: boolean;
  dragOver?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: DragEvent) => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
}) {
  return (
    <div
      onClick={props.onClick}
      title={props.title}
      draggable={props.draggable}
      onDragStart={() => props.onDragStart?.()}
      onDragOver={e => props.onDragOver?.(e)}
      onDrop={e => {
        e.preventDefault();
        props.onDrop?.();
      }}
      onDragEnd={() => props.onDragEnd?.()}
      style={{
        display: 'flex',
        'align-items': 'center',
        gap: '8px',
        padding: '7px 8px 7px 9px',
        'border-left': `3px solid ${props.selected ? colors.blue : 'transparent'}`,
        'border-top': `2px solid ${props.dragOver ? colors.blue : 'transparent'}`,
        background: props.selected ? colors.blueTint : 'transparent',
        'border-radius': '0 6px 6px 0',
        // Pointer by default - the click is the more important affordance. Only swaps to
        // a grab cursor for the row actively being dragged.
        cursor: props.dragging ? 'grabbing' : 'pointer',
        'font-family': font.sans,
        'font-size': '0.84rem',
        color: props.selected ? colors.blue : colors.ink,
        'font-weight': props.selected ? 600 : 400,
        'white-space': 'nowrap',
        overflow: 'hidden'
      }}
      onMouseEnter={e => {
        if (!props.selected) Object.assign(e.currentTarget.style, rowHoverStyle);
      }}
      onMouseLeave={e => {
        if (!props.selected) Object.assign(e.currentTarget.style, rowIdleStyle);
      }}
    >
      {props.icon}
      <span style={{ overflow: 'hidden', 'text-overflow': 'ellipsis', flex: 1 }}>{props.label}</span>
      {props.trailing}
    </div>
  );
}

// Checkbox popover for the sidebar's status/type filters. Checked = included, so
// excluding a single value (the common case, e.g. "hide done") is one click instead
// of checking every other option in an inclusive multi-select.
function CheckboxFilterDropdown(props: {
  label: string;
  options: string[];
  excluded: Set<string>;
  onChange: (next: Set<string>) => void;
  getBadgeStyle: (value: string) => BadgeStyle;
}) {
  const [open, setOpen] = createSignal(false);
  let containerRef: HTMLDivElement | undefined;

  const handleClickOutside = (e: MouseEvent) => {
    if (containerRef && !containerRef.contains(e.target as Node)) setOpen(false);
  };

  createEffect(() => {
    if (open()) document.addEventListener('mousedown', handleClickOutside);
    else document.removeEventListener('mousedown', handleClickOutside);
  });
  onCleanup(() => document.removeEventListener('mousedown', handleClickOutside));

  const summary = () => {
    const includedCount = props.options.length - props.excluded.size;
    if (props.excluded.size === 0) return `All ${props.label}`;
    if (includedCount === 0) return `No ${props.label}`;
    return `${includedCount}/${props.options.length} ${props.label}`;
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: 1, 'min-width': 0 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          'box-sizing': 'border-box',
          height: '28px',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'space-between',
          gap: '4px',
          'font-family': font.sans,
          'font-size': '0.74rem',
          border: `1px solid ${colors.border}`,
          'border-radius': '7px',
          padding: '0 6px',
          background: colors.paperCard,
          color: colors.inkSoft,
          cursor: 'pointer'
        }}
      >
        <span style={{ overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}>{summary()}</span>
        <Icon name="chevronDown" size={11} style={{ color: colors.inkFaint }} />
      </button>
      <Show when={open()}>
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            'z-index': 20,
            background: colors.paperCard,
            border: `1px solid ${colors.border}`,
            'border-radius': '7px',
            'box-shadow': '0 4px 14px rgba(30,42,56,.18)',
            padding: '4px',
            'max-height': '220px',
            'overflow-y': 'auto'
          }}
        >
          <div
            style={{
              display: 'flex',
              'align-items': 'center',
              gap: '6px',
              padding: '2px 6px 6px',
              'margin-bottom': '2px',
              'border-bottom': `1px solid ${colors.border}`
            }}
          >
            <button
              type="button"
              onClick={() => props.onChange(new Set())}
              style={{
                border: 'none',
                background: 'transparent',
                padding: 0,
                'font-family': font.sans,
                'font-size': '0.72rem',
                'font-weight': 600,
                color: colors.blue,
                cursor: 'pointer'
              }}
            >
              All
            </button>
            <span style={{ color: colors.inkFaint, 'font-size': '0.72rem' }}>|</span>
            <button
              type="button"
              onClick={() => props.onChange(new Set(props.options))}
              style={{
                border: 'none',
                background: 'transparent',
                padding: 0,
                'font-family': font.sans,
                'font-size': '0.72rem',
                'font-weight': 600,
                color: colors.blue,
                cursor: 'pointer'
              }}
            >
              None
            </button>
          </div>
          <For each={props.options}>
            {opt => {
              const badgeStyle = props.getBadgeStyle(opt);
              return (
                <label
                  style={{
                    display: 'flex',
                    'align-items': 'center',
                    gap: '6px',
                    padding: '4px 6px',
                    'border-radius': '5px',
                    cursor: 'pointer',
                    'font-family': font.sans,
                    'font-size': '0.78rem',
                    color: colors.ink
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!props.excluded.has(opt)}
                    onChange={() => {
                      const next = new Set(props.excluded);
                      if (next.has(opt)) next.delete(opt);
                      else next.add(opt);
                      props.onChange(next);
                    }}
                    style={{ cursor: 'pointer', margin: 0 }}
                  />
                  <span
                    style={{
                      background: badgeStyle.bg,
                      color: badgeStyle.text,
                      padding: '1px 6px',
                      'border-radius': '3px',
                      'font-weight': 600,
                      'font-size': '0.64rem'
                    }}
                  >
                    {opt}
                  </span>
                </label>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}

export default function Sidebar(props: SidebarProps) {
  const [isSubprojectsOpen, setIsSubprojectsOpen] = createSignal(localStorage.getItem('overseer:panel:subprojects') !== 'false');
  const [isTicketsOpen, setIsTicketsOpen] = createSignal(localStorage.getItem('overseer:panel:tickets') !== 'false');
  const [isDocsOpen, setIsDocsOpen] = createSignal(localStorage.getItem('overseer:panel:docs') !== 'false');
  const [ticketSearch, setTicketSearch] = createSignal('');
  const [sortOption, setSortOption] = createSignal<'manifest' | 'status' | 'name' | 'id'>(
    (localStorage.getItem('overseer:sortOption') as any) || 'manifest'
  );
  const loadExcludedSet = (key: string): Set<string> => {
    try {
      return new Set(JSON.parse(localStorage.getItem(key) || '[]'));
    } catch {
      return new Set();
    }
  };
  const [statusExcluded, setStatusExcluded] = createSignal<Set<string>>(loadExcludedSet('overseer:filter:status:excluded'));
  const [typeExcluded, setTypeExcluded] = createSignal<Set<string>>(loadExcludedSet('overseer:filter:type:excluded'));

  // Drag-and-drop reordering (poc/mxskv). Tickets can only be reordered while showing
  // the manifest's own order, unfiltered - dragging within a status/name/id sort or a
  // search result wouldn't have a sensible order to persist.
  const [draggedTicket, setDraggedTicket] = createSignal<string | null>(null);
  const [dragOverTicket, setDragOverTicket] = createSignal<string | null>(null);
  const canReorderTickets = () =>
    sortOption() === 'manifest' && !ticketSearch().trim() && statusExcluded().size === 0 && typeExcluded().size === 0;

  const handleTicketDrop = (targetFileName: string) => {
    const draggedFileName = draggedTicket();
    setDraggedTicket(null);
    setDragOverTicket(null);
    if (!draggedFileName || draggedFileName === targetFileName || !canReorderTickets()) return;
    const order = filteredAndSortedTickets().map(t => t.fileName);
    const fromIdx = order.indexOf(draggedFileName);
    const toIdx = order.indexOf(targetFileName);
    if (fromIdx === -1 || toIdx === -1) return;
    order.splice(fromIdx, 1);
    order.splice(toIdx, 0, draggedFileName);
    props.onReorderTickets(order);
  };

  const [draggedSubproject, setDraggedSubproject] = createSignal<string | null>(null);
  const [dragOverSubproject, setDragOverSubproject] = createSignal<string | null>(null);

  const handleSubprojectDrop = (targetSlug: string) => {
    const draggedSlug = draggedSubproject();
    setDraggedSubproject(null);
    setDragOverSubproject(null);
    if (!draggedSlug || draggedSlug === targetSlug) return;
    const order = (props.projectData()?.manifest.projectmap.subprojects || []).map(s => s.slug);
    const fromIdx = order.indexOf(draggedSlug);
    const toIdx = order.indexOf(targetSlug);
    if (fromIdx === -1 || toIdx === -1) return;
    order.splice(fromIdx, 1);
    order.splice(toIdx, 0, draggedSlug);
    props.onReorderSubprojects(order);
  };

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

  const setExcludedPersist = (setSet: (s: Set<string>) => void, key: string, next: Set<string>) => {
    setSet(next);
    localStorage.setItem(key, JSON.stringify([...next]));
  };

  const setStatusExcludedPersist = (next: Set<string>) =>
    setExcludedPersist(setStatusExcluded, 'overseer:filter:status:excluded', next);
  const setTypeExcludedPersist = (next: Set<string>) =>
    setExcludedPersist(setTypeExcluded, 'overseer:filter:type:excluded', next);

  const getParentFolderName = () => {
    const pPath = props.projectData()?.parentPath;
    if (!pPath) return '';
    const parts = pPath.split(/[/\\]/).filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : 'parent';
  };

  const getActiveRepoDocs = (): DocTreeEntry[] => {
    if (!props.activeRepoPath()) return [];
    const repoNode = props.tree().find(r => r.repoPath === props.activeRepoPath());
    const docsCat = repoNode?.children?.find(c => c.categoryType === 'docs');
    return (docsCat?.children as DocTreeEntry[]) || [];
  };

  const getFieldOptionColors = (fieldName: string): Record<string, string> | undefined => {
    const repoNode = props.tree().find(r => r.repoPath === props.activeRepoPath());
    const field = repoNode?.config?.frontmatterSchema?.find(f => f.name.trim().toLowerCase() === fieldName);
    return field?.optionColors;
  };

  // Schema options first (stable even with zero matching tickets), plus any stray
  // values actually present on tickets but missing from the schema, so nothing
  // becomes an unreachable filter target.
  const getFieldOptions = (fieldName: 'status' | 'type'): string[] => {
    const repoNode = props.tree().find(r => r.repoPath === props.activeRepoPath());
    const field = repoNode?.config?.frontmatterSchema?.find(f => f.name.trim().toLowerCase() === fieldName);
    const schemaOptions = field?.options || [];
    const rawTickets = props.projectData()?.manifest.projectmap.tickets || [];
    const values = new Set(rawTickets.map(t => t[fieldName]).filter((v): v is string => Boolean(v)));
    const strayValues = [...values].filter(v => !schemaOptions.includes(v));
    return [...schemaOptions, ...strayValues];
  };

  // Drop any excluded value that no longer exists for the active project/repo (e.g.
  // after switching to one with a different schema), so a stale exclusion doesn't
  // silently keep hiding nothing - or, once reused, hide the wrong thing.
  const pruneExcluded = (
    excluded: Accessor<Set<string>>,
    setExcluded: (s: Set<string>) => void,
    key: string,
    fieldName: 'status' | 'type'
  ) => {
    const options = new Set(getFieldOptions(fieldName));
    const pruned = new Set([...excluded()].filter(v => options.has(v)));
    if (pruned.size !== excluded().size) {
      setExcluded(pruned);
      localStorage.setItem(key, JSON.stringify([...pruned]));
    }
  };

  createEffect(() => {
    pruneExcluded(statusExcluded, setStatusExcluded, 'overseer:filter:status:excluded', 'status');
    pruneExcluded(typeExcluded, setTypeExcluded, 'overseer:filter:type:excluded', 'type');
  });

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
    if (statusExcluded().size > 0) filtered = filtered.filter(t => !statusExcluded().has(t.status));
    if (typeExcluded().size > 0) filtered = filtered.filter(t => !t.type || !typeExcluded().has(t.type));

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
        width: '340px',
        'border-right': `1px solid ${colors.border}`,
        background: colors.paperDim,
        display: 'flex',
        'flex-direction': 'column',
        height: '100vh',
        'min-width': '280px',
        overflow: 'hidden'
      }}
    >
      {/* HEADER: brand + repo switcher */}
      <div style={{ padding: '16px 16px 14px', 'flex-shrink': 0 }}>
        <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'margin-bottom': '14px' }}>
          <div style={{ display: 'flex', 'align-items': 'center', gap: '9px' }}>
            <div
              style={{
                width: '22px',
                height: '22px',
                // 'border-radius': '50%',
                // border: `1.5px solid ${colors.bronze}`,
                // display: 'flex',
                // 'align-items': 'center',
                // 'justify-content': 'center',
                // color: colors.blue,
                // 'flex-shrink': 0
              }}
            >
              {/* <Icon name="eye" size={13} /> */}
              <img src="/base_icon.png" style={{width:"100%", height:"100%"}} />
            </div>
            <span style={{ 'font-family': font.display, 'font-weight': 600, 'font-size': '1.18rem', color: colors.ink }}>Overseer</span>
          </div>
          <button
            onClick={props.onAddRepoClick}
            title="Register a new repository"
            style={{
              display: 'flex',
              'align-items': 'center',
              gap: '5px',
              background: colors.bronzeTint,
              color: colors.bronze,
              border: `1px solid ${colors.borderStrong}`,
              padding: '6px 10px',
              'border-radius': '7px',
              'font-family': font.sans,
              'font-size': '0.76rem',
              'font-weight': 600,
              cursor: 'pointer',
              'flex-shrink': 0
            }}
          >
            <Icon name="plus" size={12} /> Repo
          </button>
        </div>

        <Show when={props.activeRepoPath()}>
          <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
            <div
              style={{
                flex: 1,
                'min-width': 0,
                display: 'flex',
                'align-items': 'center',
                gap: '7px',
                border: `1px solid ${colors.borderStrong}`,
                'border-radius': '8px',
                padding: '6px 10px',
                background: colors.paperCard
              }}
            >
              <Icon name="box" size={13} style={{ color: colors.bronze }} />
              <Show
                when={props.tree().length > 1}
                fallback={
                  <span
                    style={{
                      flex: 1,
                      'font-family': font.sans,
                      'font-size': '0.84rem',
                      'font-weight': 600,
                      color: colors.ink,
                      overflow: 'hidden',
                      'text-overflow': 'ellipsis',
                      'white-space': 'nowrap'
                    }}
                  >
                    {props.tree().find(r => r.repoPath === props.activeRepoPath())?.name}
                  </span>
                }
              >
                <select
                  value={props.activeRepoPath() || ''}
                  onChange={e => props.onSelectRepo(e.currentTarget.value)}
                  style={{
                    flex: 1,
                    'min-width': 0,
                    border: 'none',
                    background: 'transparent',
                    appearance: 'none',
                    'font-family': font.sans,
                    'font-size': '0.84rem',
                    'font-weight': 600,
                    color: colors.ink,
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <For each={props.tree()}>
                    {repo => (
                      <option value={repo.repoPath} selected={repo.repoPath === props.activeRepoPath()}>
                        {repo.name}
                      </option>
                    )}
                  </For>
                </select>
                <Icon name="chevronDown" size={12} style={{ color: colors.inkFaint }} />
              </Show>
            </div>
            <button
              onClick={() => {
                const repoNode = props.tree().find(r => r.repoPath === props.activeRepoPath());
                if (repoNode) props.onOpenRepoConfigModal(repoNode);
              }}
              title="Repository settings"
              style={{
                display: 'flex',
                'align-items': 'center',
                'justify-content': 'center',
                background: colors.paperCard,
                color: colors.inkSoft,
                border: `1px solid ${colors.borderStrong}`,
                width: '32px',
                height: '32px',
                'border-radius': '8px',
                cursor: 'pointer',
                'flex-shrink': 0
              }}
            >
              <Icon name="gear" size={14} />
            </button>
          </div>
        </Show>
      </div>

      {/* PROJECT HEADER */}
      <div style={{ padding: '0 16px 12px', 'flex-shrink': 0 }}>
        <Show when={props.projectData()?.parentPath}>
          <div
            onClick={() => props.onNavigateProject(props.projectData()!.parentPath!)}
            title={`Return to parent: ${getParentFolderName()}`}
            style={{
              display: 'inline-flex',
              'align-items': 'center',
              gap: '6px',
              cursor: 'pointer',
              color: colors.inkSoft,
              'font-family': font.sans,
              'font-size': '0.76rem',
              'font-weight': 600,
              padding: '4px 10px',
              'border-radius': '999px',
              border: `1px solid ${colors.border}`,
              'margin-bottom': '10px'
            }}
          >
            <Icon name="cornerUpLeft" size={12} />
            Up to {getParentFolderName()}
          </div>
        </Show>

        <div style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', gap: '8px' }}>
          <h3
            onClick={() => props.onOpenProjectDescription()}
            title={`Open project overview: ${props.projectData()?.manifest.name || ''}`}
            style={{
              margin: 0,
              'font-family': font.display,
              'font-weight': 600,
              'font-size': '1.15rem',
              color: props.activeFilePath()?.endsWith('_project.md') ? colors.blue : colors.ink,
              overflow: 'hidden',
              'text-overflow': 'ellipsis',
              'white-space': 'nowrap',
              flex: 1,
              cursor: 'pointer'
            }}
          >
            {props.projectData()?.manifest.name || 'Select a project'}
          </h3>
          <button
            onClick={() => {
              const projectPath = props.projectData()?.path;
              const repoPath = props.activeRepoPath();
              if (projectPath && repoPath) props.onOpenCreateModal(projectPath, repoPath);
            }}
            title="Add ticket or sub-project"
            style={{
              display: 'flex',
              'align-items': 'center',
              gap: '5px',
              background: colors.blue,
              color: colors.paperCard,
              border: 'none',
              padding: '6px 12px',
              'border-radius': '7px',
              'font-family': font.sans,
              'font-size': '0.76rem',
              'font-weight': 600,
              cursor: 'pointer',
              'flex-shrink': 0
            }}
          >
            <Icon name="plus" size={12} /> Add
          </button>
        </div>
      </div>

      {/* SECTIONS */}
      <div style={{ flex: 1, 'min-height': 0, 'overflow-y': 'auto', padding: '2px 14px 16px', display: 'flex', 'flex-direction': 'column' }}>
        {/* Sub-Projects */}
        <Show when={(props.projectData()?.manifest.projectmap.subprojects || []).length > 0}>
          <SectionHeader
            icon="folder"
            label="Sub-projects"
            count={props.projectData()?.manifest.projectmap.subprojects.length || 0}
            open={isSubprojectsOpen()}
            onToggle={() => togglePanel('subprojects')}
          />
          <Show when={isSubprojectsOpen()}>
            <div style={{ display: 'flex', 'flex-direction': 'column', gap: '1px', 'margin-bottom': '6px' }}>
              <For each={props.projectData()?.manifest.projectmap.subprojects}>
                {sub => (
                  <ListRow
                    icon={<Icon name="folder" size={14} style={{ color: colors.bronze }} />}
                    label={sub.name}
                    title={sub.name}
                    onClick={() => props.onNavigateProject(sub.path)}
                    trailing={<Icon name="chevronRight" size={13} style={{ color: colors.inkFaint }} />}
                    draggable={true}
                    dragging={draggedSubproject() === sub.slug}
                    dragOver={dragOverSubproject() === sub.slug}
                    onDragStart={() => setDraggedSubproject(sub.slug)}
                    onDragOver={e => {
                      e.preventDefault();
                      setDragOverSubproject(sub.slug);
                    }}
                    onDrop={() => handleSubprojectDrop(sub.slug)}
                    onDragEnd={() => {
                      setDraggedSubproject(null);
                      setDragOverSubproject(null);
                    }}
                  />
                )}
              </For>
            </div>
          </Show>
          <div style={{ height: '1px', background: colors.border, margin: '8px 2px 12px' }} />
        </Show>

        {/* Tickets */}
        <SectionHeader
          icon="ticket"
          label="Tickets"
          count={filteredAndSortedTickets().length}
          open={isTicketsOpen()}
          onToggle={() => togglePanel('tickets')}
        />
        <Show when={isTicketsOpen()}>
          <div style={{ padding: '6px 2px 2px' }}>
            <Show when={(props.projectData()?.manifest.projectmap.tickets || []).length > 0}>
              <div style={{ display: 'flex', gap: '6px', 'align-items': 'center', 'margin-bottom': '8px' }}>
                <div
                  style={{
                    flex: 1,
                    'min-width': 0,
                    'box-sizing': 'border-box',
                    height: '28px',
                    display: 'flex',
                    'align-items': 'center',
                    gap: '6px',
                    padding: '0 9px',
                    border: `1px solid ${colors.border}`,
                    'border-radius': '7px',
                    background: colors.paperCard
                  }}
                >
                  <Icon name="search" size={12} style={{ color: colors.inkFaint }} />
                  <input
                    type="text"
                    placeholder="Filter tickets"
                    value={ticketSearch()}
                    onInput={e => setTicketSearch(e.currentTarget.value)}
                    style={{
                      flex: 1,
                      'min-width': 0,
                      border: 'none',
                      background: 'transparent',
                      outline: 'none',
                      'font-family': font.sans,
                      'font-size': '0.78rem',
                      color: colors.ink
                    }}
                  />
                </div>
                <select
                  value={sortOption()}
                  onChange={e => handleSortChange(e.currentTarget.value as any)}
                  style={{
                    'box-sizing': 'border-box',
                    height: '28px',
                    'font-family': font.sans,
                    'font-size': '0.74rem',
                    border: `1px solid ${colors.border}`,
                    'border-radius': '7px',
                    padding: '0 6px',
                    background: colors.paperCard,
                    color: colors.inkSoft,
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

              <div style={{ display: 'flex', gap: '6px', 'align-items': 'center', 'margin-bottom': '8px' }}>
                <CheckboxFilterDropdown
                  label="statuses"
                  options={getFieldOptions('status')}
                  excluded={statusExcluded()}
                  onChange={setStatusExcludedPersist}
                  getBadgeStyle={v => getStatusBadgeStyle(v, getFieldOptionColors('status'))}
                />
                <CheckboxFilterDropdown
                  label="types"
                  options={getFieldOptions('type')}
                  excluded={typeExcluded()}
                  onChange={setTypeExcludedPersist}
                  getBadgeStyle={v => getTypeBadgeStyle(v, getFieldOptionColors('type'))}
                />
              </div>
            </Show>

            <Show
              when={filteredAndSortedTickets().length > 0}
              fallback={
                <div style={{ color: colors.inkFaint, 'font-family': font.sans, 'font-size': '0.8rem', 'text-align': 'center', padding: '14px 0' }}>
                  No tickets yet.
                </div>
              }
            >
              <div style={{ display: 'flex', 'flex-direction': 'column', gap: '1px' }}>
                <For each={filteredAndSortedTickets()}>
                  {(ticket: TicketSummary) => {
                    const statusStyle = getStatusBadgeStyle(ticket.status, getFieldOptionColors('status'));
                    const typeStyle = getTypeBadgeStyle(ticket.type, getFieldOptionColors('type'));

                    return (
                      <ListRow
                        selected={props.activeFilePath() === ticket.filePath}
                        onClick={() => props.onOpenFile(ticket.filePath, props.activeRepoPath()!)}
                        title={`#${ticket.id}: ${ticket.name}`}
                        draggable={canReorderTickets()}
                        dragging={draggedTicket() === ticket.fileName}
                        dragOver={dragOverTicket() === ticket.fileName}
                        onDragStart={() => setDraggedTicket(ticket.fileName)}
                        onDragOver={e => {
                          if (!canReorderTickets()) return;
                          e.preventDefault();
                          setDragOverTicket(ticket.fileName);
                        }}
                        onDrop={() => handleTicketDrop(ticket.fileName)}
                        onDragEnd={() => {
                          setDraggedTicket(null);
                          setDragOverTicket(null);
                        }}
                        icon={
                          <span
                            style={{
                              'font-size': '0.68rem',
                              'font-family': font.mono,
                              'font-weight': 500,
                              color: props.activeFilePath() === ticket.filePath ? colors.blue : colors.inkFaint,
                              'flex-shrink': 0
                            }}
                          >
                            #{ticket.id}
                          </span>
                        }
                        label={ticket.name}
                        trailing={
                          <div style={{ display: 'flex', gap: '5px', 'align-items': 'center', 'flex-shrink': 0 }}>
                            <Show when={ticket.type}>
                              <span
                                style={{
                                  'font-size': '0.64rem',
                                  background: typeStyle.bg,
                                  color: typeStyle.text,
                                  padding: '1px 6px',
                                  'border-radius': '3px',
                                  'font-weight': 600
                                }}
                              >
                                {ticket.type}
                              </span>
                            </Show>
                            <Show when={ticket.status}>
                              <span
                                style={{
                                  'font-size': '0.64rem',
                                  background: statusStyle.bg,
                                  color: statusStyle.text,
                                  padding: '1px 6px',
                                  'border-radius': '999px',
                                  'font-weight': 600
                                }}
                              >
                                {ticket.status}
                              </span>
                            </Show>
                          </div>
                        }
                      />
                    );
                  }}
                </For>
              </div>
            </Show>
          </div>
        </Show>

        <div style={{ height: '1px', background: colors.border, margin: '12px 2px' }} />

        {/* Documentation */}
        <SectionHeader icon="book" label="Documentation" count={getActiveRepoDocs().length} open={isDocsOpen()} onToggle={() => togglePanel('docs')} />
        <Show when={isDocsOpen()}>
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '1px', 'margin-top': '6px' }}>
            <For each={getActiveRepoDocs()}>
              {doc => (
                <ListRow
                  icon={<Icon name="file" size={14} style={{ color: colors.inkSoft }} />}
                  label={doc.name}
                  title={doc.name}
                  selected={props.activeFilePath() === doc.path}
                  onClick={() => props.onOpenFile(doc.path, props.activeRepoPath()!)}
                />
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}
