import { createEffect, createSignal, Index, on, onCleanup, Show } from 'solid-js';
import type { Accessor, JSX, Setter } from 'solid-js';
import Icon from './Icon';
import { colors, deriveBadgeStyle, font, isBuiltInEnumField } from './theme';
import type { SchemaField } from './types';

// Shared by all three modals below: closes on Escape while open. Each modal passes its
// own close handler, which may itself gate on unsaved changes before actually closing.
function useEscapeToClose(isOpen: Accessor<boolean>, onEscape: () => void) {
  createEffect(() => {
    if (!isOpen()) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', handler);
    onCleanup(() => window.removeEventListener('keydown', handler));
  });
}

const labelStyle: JSX.CSSProperties = {
  display: 'block',
  'font-family': font.sans,
  'font-size': '0.76rem',
  'font-weight': 600,
  color: colors.inkSoft,
  'margin-bottom': '6px'
};

const inputStyle: JSX.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  border: `1px solid ${colors.borderStrong}`,
  'border-radius': '7px',
  'font-family': font.sans,
  'font-size': '0.88rem',
  color: colors.ink,
  background: colors.paperCard,
  'box-sizing': 'border-box',
  outline: 'none'
};

// Same look as inputStyle but with no `width` - meant for inputs/selects that live
// inside a flex row, where `width: 100%` fights with `flex`/explicit sizing and
// leaves the element collapsed to near-zero instead of filling its share of the row.
const fieldInputStyle: JSX.CSSProperties = {
  padding: '7px 10px',
  border: `1px solid ${colors.borderStrong}`,
  'border-radius': '7px',
  'font-family': font.sans,
  'font-size': '0.88rem',
  color: colors.ink,
  background: colors.paperCard,
  'box-sizing': 'border-box',
  outline: 'none'
};

function primaryButtonStyle(disabled?: boolean): JSX.CSSProperties {
  return {
    background: disabled ? colors.borderStrong : colors.blue,
    color: colors.paperCard,
    border: 'none',
    padding: '9px 18px',
    'border-radius': '7px',
    'font-family': font.sans,
    'font-size': '0.85rem',
    'font-weight': 600,
    cursor: disabled ? 'default' : 'pointer'
  };
}

const secondaryButtonStyle: JSX.CSSProperties = {
  background: 'transparent',
  color: colors.inkSoft,
  border: `1px solid ${colors.border}`,
  padding: '9px 16px',
  'border-radius': '7px',
  'font-family': font.sans,
  'font-size': '0.85rem',
  'font-weight': 600,
  cursor: 'pointer'
};

const errorTextStyle: JSX.CSSProperties = {
  color: colors.rust,
  'font-family': font.sans,
  'font-size': '0.82rem',
  'margin-bottom': '12px'
};

function ModalOverlay(props: { width: string; maxHeight?: string; children: JSX.Element }) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: colors.overlay,
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center'
      }}
    >
      <div
        style={{
          background: colors.paperCard,
          padding: '26px',
          'border-radius': '12px',
          border: `1px solid ${colors.border}`,
          'box-shadow': '0 20px 48px rgba(30,42,56,.18)',
          width: props.width,
          ...(props.maxHeight ? { 'max-height': props.maxHeight, 'overflow-y': 'auto' } : {})
        }}
      >
        {props.children}
      </div>
    </div>
  );
}

function ModalTitle(props: { children: JSX.Element }) {
  return (
    <h3
      style={{
        margin: '0 0 18px 0',
        'font-family': font.sans,
        'font-size': '1.05rem',
        'font-weight': 600,
        color: colors.ink
      }}
    >
      {props.children}
    </h3>
  );
}

interface AddRepoModalProps {
  isOpen: Accessor<boolean>;
  onClose: () => void;
  selectedRepoPath: Accessor<string>;
  setSelectedRepoPath: Setter<string>;
  errorMsg: Accessor<string>;
  onSubmit: (e: Event) => void;
}

interface FsEntry {
  name: string;
  path: string;
}

export function AddRepoModal(props: AddRepoModalProps) {
  const [browsePath, setBrowsePath] = createSignal('');
  const [browseEntries, setBrowseEntries] = createSignal<FsEntry[]>([]);
  const [browseParent, setBrowseParent] = createSignal<string | null>(null);
  const [browseError, setBrowseError] = createSignal('');
  const [browseLoading, setBrowseLoading] = createSignal(false);

  const fetchBrowse = async (targetPath: string) => {
    setBrowseLoading(true);
    setBrowseError('');
    try {
      const res = await fetch(`/api/fs/browse?path=${encodeURIComponent(targetPath)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to browse folder');
      setBrowsePath(data.path);
      setBrowseEntries(data.directories || []);
      setBrowseParent(data.parent);
    } catch (err: any) {
      setBrowseError(err.message);
    } finally {
      setBrowseLoading(false);
    }
  };

  // Only re-browse when the modal opens, not on every keystroke in the path input.
  createEffect(
    on(props.isOpen, open => {
      if (open) fetchBrowse(props.selectedRepoPath() || '');
    })
  );

  // No unsaved-changes gate here - browsing to a folder isn't data entry the way a
  // typed ticket name or edited schema is, so Escape just closes.
  useEscapeToClose(props.isOpen, props.onClose);

  const navigateTo = (targetPath: string) => {
    props.setSelectedRepoPath(targetPath);
    fetchBrowse(targetPath);
  };

  return (
    <Show when={props.isOpen()}>
      <ModalOverlay width="520px">
        <ModalTitle>Register repository root</ModalTitle>
        <form onSubmit={props.onSubmit}>
          <div style={{ display: 'flex', gap: '8px', 'margin-bottom': '14px' }}>
            <input
              type="text"
              placeholder="Type a path, or browse below"
              value={props.selectedRepoPath()}
              onInput={e => props.setSelectedRepoPath(e.currentTarget.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  fetchBrowse(props.selectedRepoPath());
                }
              }}
              style={{ ...inputStyle, 'font-family': font.mono, 'font-size': '0.82rem' }}
            />
            <button
              type="button"
              onClick={() => fetchBrowse(props.selectedRepoPath())}
              style={secondaryButtonStyle}
            >
              Go
            </button>
          </div>

          <div
            style={{
              border: `1px solid ${colors.border}`,
              'border-radius': '8px',
              overflow: 'hidden',
              'margin-bottom': '14px'
            }}
          >
            <div
              style={{
                padding: '8px 12px',
                background: colors.paperDim,
                'border-bottom': `1px solid ${colors.border}`,
                'font-family': font.mono,
                'font-size': '0.78rem',
                color: colors.inkSoft,
                'white-space': 'nowrap',
                overflow: 'hidden',
                'text-overflow': 'ellipsis'
              }}
              title={browsePath()}
            >
              {browsePath()}
            </div>
            <div style={{ 'max-height': '220px', 'overflow-y': 'auto' }}>
              <Show when={browseLoading()}>
                <div style={{ padding: '16px', 'text-align': 'center', color: colors.inkFaint, 'font-family': font.sans, 'font-size': '0.82rem' }}>
                  Loading…
                </div>
              </Show>
              <Show when={!browseLoading()}>
                <Show when={browseParent() !== null}>
                  <div
                    onClick={() => navigateTo(browseParent()!)}
                    style={{
                      display: 'flex',
                      'align-items': 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      color: colors.inkSoft,
                      'font-family': font.sans,
                      'font-size': '0.85rem'
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = colors.paperDim)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <Icon name="cornerUpLeft" size={14} />
                    Up one level
                  </div>
                </Show>
                <Show
                  when={browseEntries().length > 0}
                  fallback={
                    <div style={{ padding: '16px', 'text-align': 'center', color: colors.inkFaint, 'font-family': font.sans, 'font-size': '0.82rem' }}>
                      No sub-folders here.
                    </div>
                  }
                >
                  <Index each={browseEntries()}>
                    {entry => (
                      <div
                        onClick={() => navigateTo(entry().path)}
                        style={{
                          display: 'flex',
                          'align-items': 'center',
                          gap: '8px',
                          padding: '8px 12px',
                          cursor: 'pointer',
                          color: colors.ink,
                          'font-family': font.sans,
                          'font-size': '0.85rem'
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = colors.paperDim)}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <Icon name="folder" size={14} style={{ color: colors.bronze }} />
                        {entry().name}
                      </div>
                    )}
                  </Index>
                </Show>
              </Show>
            </div>
          </div>

          <Show when={browseError()}>
            <div style={errorTextStyle}>{browseError()}</div>
          </Show>
          <Show when={props.errorMsg()}>
            <div style={errorTextStyle}>{props.errorMsg()}</div>
          </Show>

          <div style={{ display: 'flex', 'justify-content': 'flex-end', gap: '8px' }}>
            <button type="button" onClick={props.onClose} style={secondaryButtonStyle}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={!props.selectedRepoPath().trim()}
              style={primaryButtonStyle(!props.selectedRepoPath().trim())}
            >
              Register repository
            </button>
          </div>
        </form>
      </ModalOverlay>
    </Show>
  );
}

interface CreateItemModalProps {
  isOpen: Accessor<boolean>;
  onClose: () => void;
  createType: Accessor<'file' | 'directory'>;
  setCreateType: Setter<'file' | 'directory'>;
  createName: Accessor<string>;
  setCreateName: Setter<string>;
  createParentPath: Accessor<string>;
  createErrorMsg: Accessor<string>;
  onSubmit: (e: Event) => void;
}

function TypeChoice(props: { active: boolean; icon: 'file' | 'folder'; label: string; onClick: () => void }) {
  return (
    <div
      onClick={props.onClick}
      style={{
        display: 'flex',
        'align-items': 'center',
        gap: '8px',
        padding: '9px 14px',
        'border-radius': '7px',
        border: `1px solid ${props.active ? colors.blue : colors.border}`,
        background: props.active ? colors.blueTint : 'transparent',
        color: props.active ? colors.blue : colors.inkSoft,
        cursor: 'pointer',
        'font-family': font.sans,
        'font-size': '0.85rem',
        'font-weight': props.active ? 600 : 500
      }}
    >
      <Icon name={props.icon} size={15} />
      {props.label}
    </div>
  );
}

export function CreateItemModal(props: CreateItemModalProps) {
  const isDirty = () => props.createName().trim().length > 0;
  const confirmClose = () => {
    if (!isDirty() || window.confirm('Discard this unsaved ticket/sub-project?')) props.onClose();
  };
  useEscapeToClose(props.isOpen, confirmClose);

  return (
    <Show when={props.isOpen()}>
      <ModalOverlay width="480px">
        <ModalTitle>Create ticket or sub-project</ModalTitle>
        <form onSubmit={props.onSubmit}>
          <div style={{ 'margin-bottom': '14px' }}>
            <label style={labelStyle}>Item type</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <TypeChoice active={props.createType() === 'file'} icon="file" label="Ticket" onClick={() => props.setCreateType('file')} />
              <TypeChoice
                active={props.createType() === 'directory'}
                icon="folder"
                label="Sub-project"
                onClick={() => props.setCreateType('directory')}
              />
            </div>
          </div>

          <div style={{ 'margin-bottom': '14px' }}>
            <label style={labelStyle}>Name / title</label>
            <input
              type="text"
              placeholder={props.createType() === 'file' ? 'e.g. Implement OAuth flow' : 'e.g. Auth refactor'}
              value={props.createName()}
              onInput={e => props.setCreateName(e.currentTarget.value)}
              style={inputStyle}
            />
          </div>

          <div
            style={{
              'margin-bottom': '16px',
              'font-family': font.sans,
              'font-size': '0.78rem',
              color: colors.inkSoft,
              background: colors.paperDim,
              padding: '9px 12px',
              'border-radius': '7px'
            }}
          >
            Will be created inside
            <div style={{ 'font-family': font.mono, color: colors.ink, 'margin-top': '2px', 'word-break': 'break-all' }}>
              {props.createParentPath()}
            </div>
          </div>

          <Show when={props.createErrorMsg()}>
            <div style={errorTextStyle}>{props.createErrorMsg()}</div>
          </Show>

          <div style={{ display: 'flex', 'justify-content': 'flex-end', gap: '8px' }}>
            <button type="button" onClick={confirmClose} style={secondaryButtonStyle}>
              Cancel
            </button>
            <button type="submit" style={primaryButtonStyle()}>
              Create
            </button>
          </div>
        </form>
      </ModalOverlay>
    </Show>
  );
}

interface EnumColorEditorProps {
  label: string;
  noun: string;
  shape: 'pill' | 'square';
  optionsRaw: string;
  optionColors: Record<string, string> | undefined;
  onChange: (optionsRaw: string, optionColors: Record<string, string>) => void;
}

// A list of name + color-swatch rows, editable and addable, instead of the generic
// enum fields' single comma-separated text input - status and type are the two fields
// always rendered as colored badges in the sidebar, so seeing the name and color
// together as one row (and an explicit "Add" affordance) is what makes it discoverable.
function EnumColorEditor(props: EnumColorEditorProps) {
  const radius = () => (props.shape === 'pill' ? '999px' : '3px');
  const rows = () => (props.optionsRaw.length === 0 ? [] : props.optionsRaw.split(',').map(s => s.trim()));

  const commit = (newRows: string[], newColors: Record<string, string>) => {
    props.onChange(newRows.join(', '), newColors);
  };

  const renameRow = (i: number, newName: string) => {
    const current = rows();
    const oldName = current[i];
    const newRows = [...current];
    newRows[i] = newName;
    const newColors = { ...(props.optionColors || {}) };
    if (oldName && oldName in newColors) {
      newColors[newName] = newColors[oldName];
      delete newColors[oldName];
    }
    commit(newRows, newColors);
  };

  const removeRow = (i: number) => {
    const current = rows();
    const oldName = current[i];
    const newColors = { ...(props.optionColors || {}) };
    if (oldName) delete newColors[oldName];
    commit(
      current.filter((_, idx) => idx !== i),
      newColors
    );
  };

  const addRow = () => commit([...rows(), ''], props.optionColors || {});

  const setColor = (i: number, hex: string) => {
    const name = rows()[i];
    if (!name) return;
    commit(rows(), { ...(props.optionColors || {}), [name]: hex });
  };

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
      <span style={{ 'font-size': '0.76rem', 'font-weight': 600, color: colors.inkSoft, 'font-family': font.sans }}>
        {props.label}
      </span>
      <Index each={rows()}>
        {(row, i) => (
          <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
            <input
              type="text"
              placeholder={`${props.noun} name`}
              value={row()}
              onInput={e => renameRow(i, e.currentTarget.value)}
              style={{ ...fieldInputStyle, flex: 1, 'min-width': 0 }}
            />
            <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'flex-shrink': 0 }}>
              <input
                type="color"
                title="Pick a color"
                value={/^#[0-9A-Fa-f]{6}$/.test(props.optionColors?.[row()] || '') ? props.optionColors![row()] : '#9CA3AF'}
                onInput={e => setColor(i, e.currentTarget.value)}
                style={{
                  width: '28px',
                  height: '28px',
                  padding: '2px',
                  border: `1px solid ${colors.borderStrong}`,
                  'border-radius': '6px',
                  background: colors.paperCard,
                  cursor: 'pointer'
                }}
              />
              <input
                type="text"
                placeholder="#RRGGBB"
                value={props.optionColors?.[row()] || ''}
                onInput={e => setColor(i, e.currentTarget.value)}
                style={{ ...fieldInputStyle, width: '84px', 'font-family': font.mono, 'font-size': '0.76rem' }}
              />
              <Show when={/^#[0-9A-Fa-f]{6}$/.test(props.optionColors?.[row()] || '')}>
                {(() => {
                  const preview = () => deriveBadgeStyle(props.optionColors![row()]);
                  return (
                    <span
                      style={{
                        'font-size': '0.7rem',
                        'font-weight': 600,
                        padding: '2px 9px',
                        'border-radius': radius(),
                        background: preview().bg,
                        color: preview().text,
                        'white-space': 'nowrap'
                      }}
                    >
                      {row() || 'preview'}
                    </span>
                  );
                })()}
              </Show>
            </div>
            <button
              type="button"
              onClick={() => removeRow(i)}
              style={{
                display: 'flex',
                'align-items': 'center',
                background: 'transparent',
                color: colors.inkFaint,
                border: 'none',
                padding: '0 4px',
                cursor: 'pointer',
                'flex-shrink': 0
              }}
              onMouseEnter={e => (e.currentTarget.style.color = colors.rust)}
              onMouseLeave={e => (e.currentTarget.style.color = colors.inkFaint)}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        )}
      </Index>
      <button
        type="button"
        onClick={addRow}
        style={{
          display: 'flex',
          'align-items': 'center',
          gap: '5px',
          'align-self': 'flex-start',
          background: colors.blueTint,
          color: colors.blue,
          border: `1px solid ${colors.borderStrong}`,
          padding: '4px 10px',
          'border-radius': '999px',
          'font-family': font.sans,
          'font-size': '0.76rem',
          'font-weight': 600,
          cursor: 'pointer'
        }}
      >
        <Icon name="plus" size={12} /> Add {props.noun}
      </button>
    </div>
  );
}

interface RepoConfigModalProps {
  isOpen: Accessor<boolean>;
  onClose: () => void;
  configDocsDir: Accessor<string>;
  setConfigDocsDir: Setter<string>;
  configProjectsDir: Accessor<string>;
  setConfigProjectsDir: Setter<string>;
  configSchema: Accessor<SchemaField[]>;
  setConfigSchema: Setter<SchemaField[]>;
  onSubmit: (e: Event) => void;
}

export function RepoConfigModal(props: RepoConfigModalProps) {
  // Unlike CreateItemModal, these fields start pre-populated from the repo's actual
  // settings, so "dirty" means "differs from what was loaded," not "non-empty" -
  // snapshot the loaded state whenever the modal opens, and compare against it.
  const [openSnapshot, setOpenSnapshot] = createSignal('');
  const snapshot = () =>
    JSON.stringify({
      docsDir: props.configDocsDir(),
      projectsDir: props.configProjectsDir(),
      schema: props.configSchema()
    });
  createEffect(
    on(props.isOpen, open => {
      if (open) setOpenSnapshot(snapshot());
    })
  );
  const isDirty = () => snapshot() !== openSnapshot();
  const confirmClose = () => {
    if (!isDirty() || window.confirm('Discard these unsaved settings?')) props.onClose();
  };
  useEscapeToClose(props.isOpen, confirmClose);

  return (
    <Show when={props.isOpen()}>
      <ModalOverlay width="580px" maxHeight="85vh">
        <ModalTitle>Repository settings</ModalTitle>
        <form onSubmit={props.onSubmit}>
          <div style={{ display: 'flex', gap: '12px', 'margin-bottom': '18px' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Docs folder</label>
              <input
                type="text"
                value={props.configDocsDir()}
                onInput={e => props.setConfigDocsDir(e.currentTarget.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Projects folder</label>
              <input
                type="text"
                value={props.configProjectsDir()}
                onInput={e => props.setConfigProjectsDir(e.currentTarget.value)}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ height: '1px', background: colors.border, margin: '0 0 18px 0' }} />

          <div
            style={{
              display: 'flex',
              'justify-content': 'space-between',
              'align-items': 'center',
              'margin-bottom': '10px'
            }}
          >
            <h4 style={{ margin: 0, 'font-family': font.sans, 'font-size': '0.9rem', 'font-weight': 600, color: colors.ink }}>
              Frontmatter schema fields
            </h4>
            <button
              type="button"
              onClick={() => props.setConfigSchema(prev => [...prev, { name: '', type: 'string', optionsRaw: '' }])}
              style={{
                display: 'flex',
                'align-items': 'center',
                gap: '5px',
                background: colors.bronzeTint,
                color: colors.bronze,
                border: `1px solid ${colors.borderStrong}`,
                padding: '5px 10px',
                'border-radius': '6px',
                'font-family': font.sans,
                'font-size': '0.78rem',
                'font-weight': 600,
                cursor: 'pointer'
              }}
            >
              <Icon name="plus" size={13} />
              Add field
            </button>
          </div>

          {/* Index (not For) keeps each row's DOM node stable across keystrokes,
              since these setters replace item object references. */}
          <Index each={props.configSchema()}>
            {(field, index) => {
              const isLocked = () => isBuiltInEnumField(field().name);
              return (
              <div
                style={{
                  background: colors.paperDim,
                  padding: '10px',
                  'border-radius': '7px',
                  border: `1px solid ${colors.border}`,
                  'margin-bottom': '8px'
                }}
              >
                <div style={{ display: 'flex', gap: '8px', 'margin-bottom': '6px' }}>
                  <input
                    type="text"
                    placeholder="Field name (e.g. status)"
                    value={field().name}
                    disabled={isLocked()}
                    title={isLocked() ? `${field().name} is a built-in field and can’t be renamed` : undefined}
                    onInput={e =>
                      props.setConfigSchema(prev =>
                        prev.map((item, idx) => (idx === index ? { ...item, name: e.currentTarget.value } : item))
                      )
                    }
                    style={{
                      ...fieldInputStyle,
                      flex: 1,
                      'min-width': 0,
                      ...(isLocked() ? { background: colors.paperDim, color: colors.inkSoft, cursor: 'not-allowed' } : {})
                    }}
                  />
                  <select
                    value={field().type}
                    disabled={isLocked()}
                    title={isLocked() ? `${field().name} is a built-in field and is always an enum` : undefined}
                    onChange={e =>
                      props.setConfigSchema(prev =>
                        prev.map((item, idx) =>
                          idx === index ? { ...item, type: e.currentTarget.value as any } : item
                        )
                      )
                    }
                    style={{
                      ...fieldInputStyle,
                      width: '120px',
                      'flex-shrink': 0,
                      ...(isLocked() ? { background: colors.paperDim, color: colors.inkSoft, cursor: 'not-allowed' } : {})
                    }}
                  >
                    <option value="string">String</option>
                    <option value="number">Number</option>
                    <option value="enum">Enum</option>
                  </select>
                  <Show
                    when={!isLocked()}
                    fallback={
                      <span
                        title={`${field().name} is a built-in field and can’t be removed`}
                        style={{
                          display: 'flex',
                          'align-items': 'center',
                          color: colors.inkFaint,
                          padding: '0 8px',
                          opacity: 0.5
                        }}
                      >
                        <Icon name="x" size={15} />
                      </span>
                    }
                  >
                    <button
                      type="button"
                      onClick={() => props.setConfigSchema(prev => prev.filter((_, idx) => idx !== index))}
                      style={{
                        display: 'flex',
                        'align-items': 'center',
                        background: 'transparent',
                        color: colors.inkFaint,
                        border: 'none',
                        padding: '0 8px',
                        'border-radius': '6px',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={e => (e.currentTarget.style.color = colors.rust)}
                      onMouseLeave={e => (e.currentTarget.style.color = colors.inkFaint)}
                    >
                      <Icon name="x" size={15} />
                    </button>
                  </Show>
                </div>

                {/* status and type are built-in fields (always present, unlike arbitrary
                    custom fields) and the only two rendered as colored badges in the
                    sidebar, so they get a dedicated list-with-colors editor instead of
                    the plain comma-separated text every other enum field uses. Status
                    renders as a rounded pill, type as a square, so the editor mirrors
                    that shape for an accurate preview. */}
                <Show
                  when={field().type === 'enum' && isLocked()}
                  fallback={
                    <Show when={field().type === 'enum'}>
                      <input
                        type="text"
                        placeholder="Options (comma-separated, e.g. backlog, active, done)"
                        value={field().optionsRaw || ''}
                        onInput={e =>
                          props.setConfigSchema(prev =>
                            prev.map((item, idx) =>
                              idx === index ? { ...item, optionsRaw: e.currentTarget.value } : item
                            )
                          )
                        }
                        style={{ ...inputStyle, padding: '7px 10px' }}
                      />
                    </Show>
                  }
                >
                  <EnumColorEditor
                    label={field().name.trim().toLowerCase() === 'status' ? 'Status values' : 'Type values'}
                    noun={field().name.trim().toLowerCase() === 'status' ? 'status' : 'type'}
                    shape={field().name.trim().toLowerCase() === 'status' ? 'pill' : 'square'}
                    optionsRaw={field().optionsRaw || ''}
                    optionColors={field().optionColors}
                    onChange={(optionsRaw, optionColors) =>
                      props.setConfigSchema(prev =>
                        prev.map((item, idx) => (idx === index ? { ...item, optionsRaw, optionColors } : item))
                      )
                    }
                  />
                </Show>
              </div>
              );
            }}
          </Index>

          <div style={{ display: 'flex', 'justify-content': 'flex-end', gap: '8px', 'margin-top': '20px' }}>
            <button type="button" onClick={confirmClose} style={secondaryButtonStyle}>
              Cancel
            </button>
            <button type="submit" style={primaryButtonStyle()}>
              Save settings
            </button>
          </div>
        </form>
      </ModalOverlay>
    </Show>
  );
}
