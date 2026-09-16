import { For, Index, Show } from 'solid-js';
import type { Accessor, Setter } from 'solid-js';
import { marked } from 'marked';
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

  return (
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
        when={props.activeFilePath()}
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
              <Show when={props.activeTicketId()}>
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
                  #{props.activeTicketId()}
                </span>
              </Show>
              <h2 style={{ margin: 0, color: '#0f172a' }}>{props.activeTicketName()}</h2>
            </div>
            <div style={{ 'font-size': '0.8rem', color: '#94a3b8', 'margin-top': '6px', 'word-break': 'break-all' }}>
              {props.activeFilePath()}
            </div>
          </div>

          <Show when={props.activeTab() === 'edit'}>
            <div style={{ display: 'flex', 'align-items': 'center', gap: '12px' }}>
              <Show when={props.saveStatus()}>
                <span
                  style={{
                    'font-size': '0.85rem',
                    color: props.saveStatus().startsWith('Error') ? '#dc2626' : '#16a34a'
                  }}
                >
                  {props.saveStatus()}
                </span>
              </Show>
              <button
                onClick={props.onSave}
                disabled={props.isSaving()}
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
                {props.isSaving() ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </Show>
        </div>

        {/* NAVIGATION TABS */}
        <div style={{ display: 'flex', gap: '8px', 'border-bottom': '1px solid #e2e8f0', 'margin-bottom': '20px' }}>
          <button
            onClick={() => props.setActiveTab('preview')}
            style={{
              padding: '8px 16px',
              border: 'none',
              'border-bottom': props.activeTab() === 'preview' ? '2px solid #2563eb' : '2px solid transparent',
              background: 'transparent',
              color: props.activeTab() === 'preview' ? '#2563eb' : '#64748b',
              'font-weight': props.activeTab() === 'preview' ? 'bold' : 'normal',
              cursor: 'pointer'
            }}
          >
            👁️ Preview
          </button>
          <button
            onClick={() => props.setActiveTab('edit')}
            style={{
              padding: '8px 16px',
              border: 'none',
              'border-bottom': props.activeTab() === 'edit' ? '2px solid #2563eb' : '2px solid transparent',
              background: 'transparent',
              color: props.activeTab() === 'edit' ? '#2563eb' : '#64748b',
              'font-weight': props.activeTab() === 'edit' ? 'bold' : 'normal',
              cursor: 'pointer'
            }}
          >
            ✏️ Edit
          </button>
        </div>

        {/* TAB 1: PREVIEW */}
        <Show when={props.activeTab() === 'preview'}>
          <div style={{ flex: 1, display: 'flex', 'flex-direction': 'column' }}>
            <Show when={props.attributes().length > 0}>
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
                <For each={props.attributes()}>
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
              innerHTML={marked.parse(props.markdownBody() || '') as string}
              style={{ flex: 1, 'line-height': '1.6', color: '#1e293b', 'font-size': '1rem' }}
            />
          </div>
        </Show>

        {/* TAB 2: EDIT */}
        <Show when={props.activeTab() === 'edit'}>
          <div style={{ flex: 1, display: 'flex', 'flex-direction': 'column' }}>
            <Show when={!props.activeFilePath()?.endsWith('_project.md')}>
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
                                  value={attr().val}
                                  onInput={e => updateAttrVal(index, e.currentTarget.value)}
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
                                value={attr().val}
                                onInput={e => updateAttrVal(index, e.currentTarget.value)}
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
                            value={attr().val}
                            onChange={e => updateAttrVal(index, e.currentTarget.value)}
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
                          onClick={() => handleRemoveFrontmatterField(index)}
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
                </Index>

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
                value={props.markdownBody()}
                onInput={e => props.setMarkdownBody(e.currentTarget.value)}
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
  );
}
