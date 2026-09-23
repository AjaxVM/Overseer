import { createEffect, createSignal, onCleanup, For, Index, Show } from 'solid-js';
import type { Accessor, Setter } from 'solid-js';
import { marked } from 'marked';
import Icon from './Icon';
import InlineEditText from './InlineEditText';
import { colors, deriveShorthand, font, getAssigneeBadgeStyle, getStatusBadgeStyle, getTypeBadgeStyle } from './theme';
import type { BadgeStyle } from './theme';
import type { FrontmatterItem, RepoTreeNode, SchemaField } from './types';

marked.setOptions({
  gfm: true,
  breaks: true
});

interface WorkspaceProps {
  tree: Accessor<RepoTreeNode[]>;
  activeRepoPath: Accessor<string | null>;
  activeFilePath: Accessor<string | null>;
  activeTicketId: Accessor<string | null>;
  activeTicketName: Accessor<string | null>;
  activeTab: Accessor<'preview' | 'edit'>;
  setActiveTab: Setter<'preview' | 'edit'>;
  attributes: Accessor<FrontmatterItem[]>;
  setAttributes: Setter<FrontmatterItem[]>;
  markdownBody: Accessor<string>;
  setMarkdownBody: Setter<string>;
  isSaving: Accessor<boolean>;
  saveStatus: Accessor<string>;
  onSave: () => void;
  canDeleteActive: Accessor<boolean>;
  onDeleteActive: () => void;
  onRenameActiveItem: (newName: string) => void;
  pendingSync: Accessor<boolean>;
  onSyncProject: () => void;
}

function TabButton(props: { active: boolean; icon: 'eye' | 'pencil'; label: string; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      style={{
        display: 'flex',
        'align-items': 'center',
        gap: '6px',
        padding: '9px 4px',
        border: 'none',
        'border-bottom': `2px solid ${props.active ? colors.blue : 'transparent'}`,
        background: 'transparent',
        color: props.active ? colors.blue : colors.inkSoft,
        'font-family': font.sans,
        'font-size': '0.86rem',
        'font-weight': props.active ? 600 : 500,
        cursor: 'pointer'
      }}
    >
      <Icon name={props.icon} size={14} />
      {props.label}
    </button>
  );
}

// A colored pill that looks like the read-only badges in Sidebar, clickable to
// pick a new value. A native <select> can't get all the way there - Windows
// Chrome/Edge ignore `cursor` on select elements entirely (always show the
// default arrow), and <option> rows in the native popup only honor
// background/color, not padding/margin/border-radius, so they can't read as
// pills. This is a small hand-rolled dropdown instead (same
// open/click-outside pattern as Sidebar's CheckboxFilterDropdown), which gives
// full control over both.
function QuickEditBadge(props: {
  value: string;
  options: string[];
  placeholder: string;
  badgeStyle: BadgeStyle | null;
  getOptionStyle: (value: string) => BadgeStyle;
  pillRadius: string;
  onChange: (value: string) => void;
  // 'circle' (assignee): the trigger is a small initials circle instead of a
  // value-bearing pill, and the popup lists full names as plain text (with a leading
  // color swatch) rather than solid-color-filled option rows - names should read as
  // text everywhere except the compact circle itself.
  variant?: 'pill' | 'circle';
  shorthand?: string;
  getOptionShorthand?: (value: string) => string;
}) {
  const [open, setOpen] = createSignal(false);
  let containerRef: HTMLDivElement | undefined;
  const isCircle = () => props.variant === 'circle';

  const handleClickOutside = (e: MouseEvent) => {
    if (containerRef && !containerRef.contains(e.target as Node)) setOpen(false);
  };

  createEffect(() => {
    if (open()) document.addEventListener('mousedown', handleClickOutside);
    else document.removeEventListener('mousedown', handleClickOutside);
  });
  onCleanup(() => document.removeEventListener('mousedown', handleClickOutside));

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        title={isCircle() ? props.value || props.placeholder : undefined}
        onClick={() => setOpen(o => !o)}
        style={
          isCircle()
            ? {
                display: 'flex',
                'align-items': 'center',
                'justify-content': 'center',
                width: '26px',
                height: '26px',
                background: props.badgeStyle ? props.badgeStyle.bg : colors.paperDim,
                color: props.badgeStyle ? props.badgeStyle.text : colors.inkFaint,
                border: props.badgeStyle ? 'none' : `1px dashed ${colors.borderStrong}`,
                'border-radius': '50%',
                'font-family': font.sans,
                'font-size': '0.72rem',
                'font-weight': 700,
                cursor: 'pointer',
                padding: 0
              }
            : {
                display: 'flex',
                'align-items': 'center',
                gap: '4px',
                background: props.badgeStyle ? props.badgeStyle.bg : colors.paperDim,
                color: props.badgeStyle ? props.badgeStyle.text : colors.inkFaint,
                border: props.badgeStyle ? 'none' : `1px dashed ${colors.borderStrong}`,
                padding: '4px 9px 4px 11px',
                'border-radius': props.pillRadius,
                'font-family': font.sans,
                'font-size': '0.78rem',
                'font-weight': 600,
                cursor: 'pointer'
              }
        }
      >
        {isCircle() ? props.shorthand || '?' : props.value || props.placeholder}
        {!isCircle() && <Icon name="chevronDown" size={10} />}
      </button>

      <Show when={open()}>
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 5px)',
            left: 0,
            'z-index': 20,
            background: colors.paperCard,
            border: `1px solid ${colors.border}`,
            'border-radius': '9px',
            padding: '6px',
            display: 'flex',
            'flex-direction': 'column',
            'align-items': 'stretch',
            gap: '4px',
            'white-space': 'nowrap',
            'box-shadow': '0 8px 20px rgba(30,42,56,.18)'
          }}
        >
          <For each={props.options}>
            {opt => {
              const style = props.getOptionStyle(opt);
              return (
                <Show
                  when={isCircle()}
                  fallback={
                    <button
                      type="button"
                      onClick={() => {
                        props.onChange(opt);
                        setOpen(false);
                      }}
                      style={{
                        background: style.bg,
                        color: style.text,
                        border: 'none',
                        outline: opt === props.value ? `2px solid ${colors.blue}` : 'none',
                        'outline-offset': '1px',
                        padding: '5px 12px',
                        'border-radius': props.pillRadius,
                        'font-family': font.sans,
                        'font-size': '0.78rem',
                        'font-weight': 600,
                        'text-align': 'left',
                        cursor: 'pointer'
                      }}
                    >
                      {opt}
                    </button>
                  }
                >
                  <button
                    type="button"
                    onClick={() => {
                      props.onChange(opt);
                      setOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      'align-items': 'center',
                      gap: '7px',
                      background: 'transparent',
                      color: colors.ink,
                      border: 'none',
                      outline: opt === props.value ? `2px solid ${colors.blue}` : 'none',
                      'outline-offset': '1px',
                      padding: '5px 10px',
                      'border-radius': '6px',
                      'font-family': font.sans,
                      'font-size': '0.78rem',
                      'font-weight': 600,
                      'text-align': 'left',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = colors.paperDim)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        'align-items': 'center',
                        'justify-content': 'center',
                        width: '18px',
                        height: '18px',
                        'flex-shrink': 0,
                        'border-radius': '50%',
                        background: style.bg,
                        color: style.text,
                        'font-size': '0.6rem',
                        'font-weight': 700
                      }}
                    >
                      {props.getOptionShorthand?.(opt) || ''}
                    </span>
                    {opt}
                  </button>
                </Show>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}

export default function Workspace(props: WorkspaceProps) {
  const getActiveRepoConfig = () => {
    if (!props.activeRepoPath()) return null;
    const repoNode = props.tree().find(r => r.repoPath === props.activeRepoPath());
    return repoNode?.config || null;
  };

  const handleAddFrontmatterField = (presetName?: string) => {
    props.setAttributes(prev => [...prev, { key: presetName || '', val: '' }]);
  };

  const handleRemoveFrontmatterField = (index: number) => {
    props.setAttributes(prev => prev.filter((_, idx) => idx !== index));
  };

  const updateAttrKey = (index: number, newKey: string) => {
    props.setAttributes(prev => prev.map((item, idx) => (idx === index ? { ...item, key: newKey } : item)));
  };

  const updateAttrVal = (index: number, newVal: string) => {
    props.setAttributes(prev => prev.map((item, idx) => (idx === index ? { ...item, val: newVal } : item)));
  };

  const getSchemaField = (key: string): SchemaField | undefined => {
    const schema = getActiveRepoConfig()?.frontmatterSchema || [];
    return schema.find((s: SchemaField) => s.name.trim().toLowerCase() === key);
  };

  const getAttrVal = (key: string) => props.attributes().find(a => a.key.trim().toLowerCase() === key)?.val || '';

  // Quick edit from Preview: unlike updateAttrVal, this also handles a field that
  // isn't on the ticket yet (status/type may be missing entirely), and saves
  // immediately rather than staging into the buffer - there's no Save button
  // visible from Preview.
  const quickSetField = (key: string, value: string) => {
    props.setAttributes(prev => {
      const idx = prev.findIndex(a => a.key.trim().toLowerCase() === key);
      if (idx === -1) return [...prev, { key, val: value }];
      return prev.map((a, i) => (i === idx ? { ...a, val: value } : a));
    });
    props.onSave();
  };

  const nonBuiltInAttributes = () =>
    props.attributes().filter(a => !['id', 'status', 'type', 'assignee'].includes(a.key.trim().toLowerCase()));

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        'flex-direction': 'column',
        padding: '28px 36px',
        background: colors.paper,
        'overflow-y': 'auto',
        'min-width': '0'
      }}
    >
      <Show when={props.pendingSync()}>
        <div
          style={{
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'space-between',
            gap: '14px',
            'margin-bottom': '18px',
            padding: '10px 16px',
            background: colors.bronzeTint,
            border: `1px solid ${colors.border}`,
            'border-radius': '7px'
          }}
        >
          <span style={{ 'font-size': '0.85rem', 'font-family': font.sans, color: colors.bronze }}>
            External changes detected outside the app - the list below reflects them, but they haven't been saved to
            disk yet.
          </span>
          <button
            onClick={props.onSyncProject}
            style={{
              background: colors.bronze,
              color: '#FFFFFF',
              border: 'none',
              padding: '7px 14px',
              'border-radius': '7px',
              cursor: 'pointer',
              'font-family': font.sans,
              'font-weight': 600,
              'font-size': '0.82rem',
              'flex-shrink': 0
            }}
          >
            Sync now
          </button>
        </div>
      </Show>

      <Show
        when={props.activeFilePath()}
        fallback={
          <div style={{ color: colors.inkFaint, margin: 'auto', 'text-align': 'center', 'max-width': '360px' }}>
            <div style={{ display: 'flex', 'justify-content': 'center', 'margin-bottom': '14px' }}>
              <Icon name="eye" size={40} style={{ color: colors.borderStrong }} />
            </div>
            <h3 style={{ margin: '0 0 8px 0', 'font-family': font.display, 'font-weight': 600, 'font-size': '1.15rem', color: colors.inkSoft }}>
              Nothing selected yet
            </h3>
            <p style={{ 'font-size': '0.88rem', color: colors.inkFaint, 'font-family': font.sans, 'line-height': '1.5' }}>
              Pick a ticket, sub-project, or the project overview from the sidebar to view and edit it here.
            </p>
          </div>
        }
      >
        {/* HEADER */}
        <div
          style={{
            display: 'flex',
            'justify-content': 'space-between',
            'align-items': 'flex-start',
            gap: '16px',
            'margin-bottom': '22px',
            'padding-bottom': '18px',
            'border-bottom': `1px solid ${colors.border}`
          }}
        >
          <div style={{ 'min-width': 0 }}>
            <div style={{ display: 'flex', 'align-items': 'center', gap: '9px' }}>
              <Show when={props.activeTicketId()}>
                <span
                  style={{
                    'font-size': '0.78rem',
                    'font-family': font.mono,
                    'font-weight': 500,
                    background: colors.paperDim,
                    color: colors.inkSoft,
                    padding: '2px 9px',
                    'border-radius': '999px',
                    'flex-shrink': 0
                  }}
                >
                  #{props.activeTicketId()}
                </span>
              </Show>
              <InlineEditText
                value={props.activeTicketName() || ''}
                onCommit={props.onRenameActiveItem}
                editTitle={props.activeFilePath()?.endsWith('_project.md') ? 'Rename project' : 'Rename ticket'}
                textStyle={{
                  margin: 0,
                  'font-family': font.display,
                  'font-weight': 600,
                  'font-size': '1.5rem',
                  color: colors.ink,
                  overflow: 'hidden',
                  'text-overflow': 'ellipsis',
                  'white-space': 'nowrap'
                }}
              />
            </div>
            <div
              style={{
                'font-size': '0.76rem',
                'font-family': font.mono,
                color: colors.inkFaint,
                'margin-top': '7px',
                'word-break': 'break-all'
              }}
            >
              {props.activeFilePath()}
            </div>
          </div>

          <Show when={props.saveStatus() || props.activeTab() === 'edit' || (props.activeTab() === 'preview' && props.canDeleteActive())}>
            <div style={{ display: 'flex', 'align-items': 'center', gap: '14px', 'flex-shrink': 0 }}>
              <Show when={props.saveStatus()}>
                <span
                  style={{
                    'font-size': '0.82rem',
                    'font-family': font.sans,
                    color: props.saveStatus().startsWith('Error') ? colors.rust : colors.patina
                  }}
                >
                  {props.saveStatus()}
                </span>
              </Show>
              <Show when={props.activeTab() === 'preview' && props.canDeleteActive()}>
                <button
                  onClick={props.onDeleteActive}
                  style={{
                    display: 'flex',
                    'align-items': 'center',
                    gap: '6px',
                    background: 'transparent',
                    color: colors.rust,
                    border: `1px solid ${colors.border}`,
                    padding: '8px 16px',
                    'border-radius': '7px',
                    cursor: 'pointer',
                    'font-family': font.sans,
                    'font-weight': 600,
                    'font-size': '0.85rem'
                  }}
                >
                  <Icon name="trash" size={14} /> Delete
                </button>
              </Show>
              <Show when={props.activeTab() === 'edit'}>
                <button
                  onClick={props.onSave}
                  disabled={props.isSaving()}
                  style={{
                    background: colors.blue,
                    color: colors.paperCard,
                    border: 'none',
                    padding: '9px 22px',
                    'border-radius': '7px',
                    cursor: props.isSaving() ? 'default' : 'pointer',
                    'font-family': font.sans,
                    'font-weight': 600,
                    'font-size': '0.85rem',
                    opacity: props.isSaving() ? 0.7 : 1
                  }}
                >
                  {props.isSaving() ? 'Saving…' : 'Save changes'}
                </button>
              </Show>
            </div>
          </Show>
        </div>

        {/* NAVIGATION TABS */}
        <div style={{ display: 'flex', gap: '18px', 'border-bottom': `1px solid ${colors.border}`, 'margin-bottom': '22px' }}>
          <TabButton active={props.activeTab() === 'preview'} icon="eye" label="Preview" onClick={() => props.setActiveTab('preview')} />
          <TabButton active={props.activeTab() === 'edit'} icon="pencil" label="Edit" onClick={() => props.setActiveTab('edit')} />
        </div>

        {/* TAB 1: PREVIEW */}
        <Show when={props.activeTab() === 'preview'}>
          <div style={{ flex: 1, display: 'flex', 'flex-direction': 'column' }}>
            <Show
              when={
                !props.activeFilePath()?.endsWith('_project.md') &&
                (getSchemaField('status') || getSchemaField('type') || getSchemaField('assignee') || nonBuiltInAttributes().length > 0)
              }
            >
              <div
                style={{
                  display: 'flex',
                  'flex-wrap': 'wrap',
                  gap: '8px',
                  'margin-bottom': '22px',
                  background: colors.paperDim,
                  padding: '12px 14px',
                  'border-radius': '9px'
                }}
              >
                <Show when={getSchemaField('status')}>
                  <QuickEditBadge
                    value={getAttrVal('status')}
                    options={getSchemaField('status')?.options || []}
                    placeholder="Set status…"
                    pillRadius="999px"
                    badgeStyle={
                      getAttrVal('status')
                        ? getStatusBadgeStyle(getAttrVal('status'), getSchemaField('status')?.optionColors)
                        : null
                    }
                    getOptionStyle={opt => getStatusBadgeStyle(opt, getSchemaField('status')?.optionColors)}
                    onChange={v => quickSetField('status', v)}
                  />
                </Show>

                <Show when={getSchemaField('type')}>
                  <QuickEditBadge
                    value={getAttrVal('type')}
                    options={getSchemaField('type')?.options || []}
                    placeholder="Set type…"
                    pillRadius="3px"
                    badgeStyle={
                      getAttrVal('type') ? getTypeBadgeStyle(getAttrVal('type'), getSchemaField('type')?.optionColors) : null
                    }
                    getOptionStyle={opt => getTypeBadgeStyle(opt, getSchemaField('type')?.optionColors)}
                    onChange={v => quickSetField('type', v)}
                  />
                </Show>

                <Show when={getSchemaField('assignee')}>
                  <QuickEditBadge
                    variant="circle"
                    value={getAttrVal('assignee')}
                    options={getSchemaField('assignee')?.options || []}
                    placeholder="Unassigned"
                    pillRadius="999px"
                    shorthand={
                      getAttrVal('assignee')
                        ? getSchemaField('assignee')?.optionShorthands?.[getAttrVal('assignee')] ||
                          deriveShorthand(getAttrVal('assignee'))
                        : undefined
                    }
                    getOptionShorthand={opt =>
                      getSchemaField('assignee')?.optionShorthands?.[opt] || deriveShorthand(opt)
                    }
                    badgeStyle={
                      getAttrVal('assignee')
                        ? getAssigneeBadgeStyle(getAttrVal('assignee'), getSchemaField('assignee')?.optionColors)
                        : null
                    }
                    getOptionStyle={opt => getAssigneeBadgeStyle(opt, getSchemaField('assignee')?.optionColors)}
                    onChange={v => quickSetField('assignee', v)}
                  />
                </Show>

                <For each={nonBuiltInAttributes()}>
                  {attr => (
                    <div
                      style={{
                        background: colors.paperCard,
                        border: `1px solid ${colors.border}`,
                        padding: '4px 11px',
                        'border-radius': '999px',
                        'font-family': font.sans,
                        'font-size': '0.78rem',
                        color: colors.ink
                      }}
                    >
                      <span style={{ color: colors.bronze, 'font-weight': 600 }}>{attr.key}</span>
                      <span style={{ color: colors.inkFaint }}> · </span>
                      {attr.val}
                    </div>
                  )}
                </For>
              </div>
            </Show>

            <div
              class="md-preview"
              innerHTML={marked.parse(props.markdownBody() || '') as string}
              style={{ flex: 1, 'line-height': '1.65', color: colors.ink, 'font-family': font.sans, 'font-size': '1rem' }}
            />
          </div>
        </Show>

        {/* TAB 2: EDIT */}
        <Show when={props.activeTab() === 'edit'}>
          <div style={{ flex: 1, display: 'flex', 'flex-direction': 'column' }}>
            <Show when={!props.activeFilePath()?.endsWith('_project.md')}>
              <div
                style={{
                  background: colors.paperDim,
                  'border-radius': '9px',
                  padding: '16px',
                  'margin-bottom': '22px'
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
                  <h4 style={{ margin: 0, 'font-family': font.sans, 'font-size': '0.86rem', 'font-weight': 600, color: colors.inkSoft }}>
                    Frontmatter metadata
                  </h4>
                  <button
                    onClick={() => handleAddFrontmatterField()}
                    style={{
                      display: 'flex',
                      'align-items': 'center',
                      gap: '5px',
                      background: colors.paperCard,
                      border: `1px solid ${colors.border}`,
                      color: colors.inkSoft,
                      padding: '5px 10px',
                      'border-radius': '6px',
                      cursor: 'pointer',
                      'font-family': font.sans,
                      'font-size': '0.78rem',
                      'font-weight': 600
                    }}
                  >
                    <Icon name="plus" size={12} /> Custom field
                  </button>
                </div>

                {/* Index (not For) keeps each row's DOM node stable across keystrokes,
                    since updateAttrKey/updateAttrVal replace item object references. */}
                <Index each={props.attributes()}>
                  {(attr, index) => {
                    const schema = getActiveRepoConfig()?.frontmatterSchema || [];
                    const fieldDef = schema.find((s: SchemaField) => s.name === attr().key.trim());

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
                          value={attr().key}
                          onInput={e => updateAttrKey(index, e.currentTarget.value)}
                          style={{
                            width: '150px',
                            padding: '7px 10px',
                            border: `1px solid ${colors.borderStrong}`,
                            'border-radius': '6px',
                            'font-family': font.sans,
                            'font-size': '0.85rem',
                            'font-weight': 600,
                            color: colors.ink,
                            background: colors.paperCard
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
                                  value={attr().val}
                                  onInput={e => updateAttrVal(index, e.currentTarget.value)}
                                  style={{
                                    flex: 1,
                                    padding: '7px 10px',
                                    border: `1px solid ${colors.border}`,
                                    'border-radius': '6px',
                                    'font-family': font.sans,
                                    'font-size': '0.85rem',
                                    color: colors.ink,
                                    background: colors.paperCard
                                  }}
                                />
                              }
                            >
                              <input
                                type="number"
                                placeholder="Numeric value"
                                value={attr().val}
                                onInput={e => updateAttrVal(index, e.currentTarget.value)}
                                style={{
                                  flex: 1,
                                  padding: '7px 10px',
                                  border: `1px solid ${colors.border}`,
                                  'border-radius': '6px',
                                  'font-family': font.sans,
                                  'font-size': '0.85rem',
                                  color: colors.ink,
                                  background: colors.paperCard
                                }}
                              />
                            </Show>
                          }
                        >
                          <select
                            value={attr().val}
                            onChange={e => updateAttrVal(index, e.currentTarget.value)}
                            style={{
                              flex: 1,
                              padding: '7px 10px',
                              border: `1px solid ${colors.border}`,
                              'border-radius': '6px',
                              'font-family': font.sans,
                              'font-size': '0.85rem',
                              color: colors.ink,
                              background: colors.paperCard
                            }}
                          >
                            <option value="">Select {fieldDef?.name}</option>
                            <For each={fieldDef?.options || []}>{opt => <option value={opt}>{opt}</option>}</For>
                          </select>
                        </Show>

                        <button
                          onClick={() => handleRemoveFrontmatterField(index)}
                          style={{
                            display: 'flex',
                            'align-items': 'center',
                            background: 'transparent',
                            color: colors.inkFaint,
                            border: 'none',
                            padding: '0 6px',
                            cursor: 'pointer'
                          }}
                          onMouseEnter={e => (e.currentTarget.style.color = colors.rust)}
                          onMouseLeave={e => (e.currentTarget.style.color = colors.inkFaint)}
                        >
                          <Icon name="x" size={15} />
                        </button>
                      </div>
                    );
                  }}
                </Index>

                <Show when={(getActiveRepoConfig()?.frontmatterSchema || []).length > 0}>
                  <div
                    style={{
                      'margin-top': '12px',
                      'padding-top': '12px',
                      'border-top': `1px dashed ${colors.border}`,
                      display: 'flex',
                      gap: '6px',
                      'align-items': 'center',
                      'flex-wrap': 'wrap'
                    }}
                  >
                    <span style={{ 'font-size': '0.74rem', color: colors.inkFaint, 'font-family': font.sans }}>Add field:</span>
                    <For each={getActiveRepoConfig()?.frontmatterSchema || []}>
                      {(schemaField: SchemaField) => (
                        <button
                          onClick={() => handleAddFrontmatterField(schemaField.name)}
                          style={{
                            background: colors.blueTint,
                            color: colors.blue,
                            border: `1px solid ${colors.borderStrong}`,
                            padding: '3px 10px',
                            'border-radius': '999px',
                            'font-family': font.sans,
                            'font-size': '0.74rem',
                            'font-weight': 600,
                            cursor: 'pointer'
                          }}
                        >
                          {schemaField.name}
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            </Show>

            <div style={{ flex: 1, display: 'flex', 'flex-direction': 'column' }}>
              <h4 style={{ margin: '0 0 8px 0', 'font-family': font.sans, 'font-size': '0.86rem', 'font-weight': 600, color: colors.inkSoft }}>
                Markdown content
              </h4>
              <textarea
                value={props.markdownBody()}
                onInput={e => props.setMarkdownBody(e.currentTarget.value)}
                style={{
                  flex: 1,
                  'min-height': '350px',
                  padding: '14px',
                  'font-family': font.mono,
                  border: `1px solid ${colors.border}`,
                  'border-radius': '9px',
                  'font-size': '0.9rem',
                  'line-height': '1.55',
                  color: colors.ink,
                  background: colors.paperCard,
                  outline: 'none'
                }}
              />
            </div>
          </div>
        </Show>
      </Show>
    </div>
  );
}
