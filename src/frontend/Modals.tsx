import { Index, Show } from 'solid-js';
import type { Accessor, JSX, Setter } from 'solid-js';
import type { SchemaField } from './types';

function ModalOverlay(props: { width: string; maxHeight?: string; children: JSX.Element }) {
  return (
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
          width: props.width,
          ...(props.maxHeight ? { 'max-height': props.maxHeight, 'overflow-y': 'auto' } : {})
        }}
      >
        {props.children}
      </div>
    </div>
  );
}

interface AddRepoModalProps {
  isOpen: Accessor<boolean>;
  onClose: () => void;
  selectedRepoPath: Accessor<string>;
  setSelectedRepoPath: Setter<string>;
  isBrowsing: Accessor<boolean>;
  onBrowse: () => void;
  errorMsg: Accessor<string>;
  onSubmit: (e: Event) => void;
}

export function AddRepoModal(props: AddRepoModalProps) {
  return (
    <Show when={props.isOpen()}>
      <ModalOverlay width="480px">
        <h3 style={{ 'margin-top': 0 }}>Register Repository Root</h3>
        <form onSubmit={props.onSubmit}>
          <div style={{ display: 'flex', gap: '8px', 'margin-bottom': '12px' }}>
            <input
              type="text"
              placeholder="/Users/username/Dev/my-repo"
              value={props.selectedRepoPath()}
              onInput={e => props.setSelectedRepoPath(e.currentTarget.value)}
              style={{ flex: 1, padding: '8px 12px', border: '1px solid #cbd5e1', 'border-radius': '6px' }}
            />
            <button
              type="button"
              onClick={props.onBrowse}
              disabled={props.isBrowsing()}
              style={{
                background: '#475569',
                color: '#fff',
                border: 'none',
                padding: '8px 14px',
                'border-radius': '6px'
              }}
            >
              {props.isBrowsing() ? 'Opening...' : 'Browse...'}
            </button>
          </div>
          <Show when={props.errorMsg()}>
            <div style={{ color: '#dc2626', 'font-size': '0.85rem', 'margin-bottom': '12px' }}>{props.errorMsg()}</div>
          </Show>
          <div style={{ display: 'flex', 'justify-content': 'flex-end', gap: '8px' }}>
            <button
              type="button"
              onClick={props.onClose}
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

export function CreateItemModal(props: CreateItemModalProps) {
  return (
    <Show when={props.isOpen()}>
      <ModalOverlay width="480px">
        <h3 style={{ 'margin-top': 0 }}>Create Ticket or Sub-Project</h3>
        <form onSubmit={props.onSubmit}>
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
                  checked={props.createType() === 'file'}
                  onChange={() => props.setCreateType('file')}
                />{' '}
                📄 Ticket (.md)
              </label>
              <label style={{ cursor: 'pointer', 'font-size': '0.9rem' }}>
                <input
                  type="radio"
                  name="createType"
                  value="directory"
                  checked={props.createType() === 'directory'}
                  onChange={() => props.setCreateType('directory')}
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
              placeholder={props.createType() === 'file' ? 'e.g. Implement OAuth Flow' : 'e.g. Auth Refactor'}
              value={props.createName()}
              onInput={e => props.setCreateName(e.currentTarget.value)}
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
            <code style={{ 'word-break': 'break-all' }}>{props.createParentPath()}</code>
          </div>

          <Show when={props.createErrorMsg()}>
            <div style={{ color: '#dc2626', 'font-size': '0.85rem', 'margin-bottom': '12px' }}>{props.createErrorMsg()}</div>
          </Show>

          <div style={{ display: 'flex', 'justify-content': 'flex-end', gap: '8px' }}>
            <button
              type="button"
              onClick={props.onClose}
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
      </ModalOverlay>
    </Show>
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
  return (
    <Show when={props.isOpen()}>
      <ModalOverlay width="560px" maxHeight="85vh">
        <h3 style={{ 'margin-top': 0 }}>Configure Repo (`overseer.json`)</h3>
        <form onSubmit={props.onSubmit}>
          <div style={{ 'margin-bottom': '12px' }}>
            <label style={{ display: 'block', 'font-weight': 'bold', 'font-size': '0.85rem', 'margin-bottom': '4px' }}>
              Docs Folder Directory
            </label>
            <input
              type="text"
              value={props.configDocsDir()}
              onInput={e => props.setConfigDocsDir(e.currentTarget.value)}
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
              value={props.configProjectsDir()}
              onInput={e => props.setConfigProjectsDir(e.currentTarget.value)}
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
              onClick={() => props.setConfigSchema(prev => [...prev, { name: '', type: 'string', optionsRaw: '' }])}
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

          {/* Index (not For) keeps each row's DOM node stable across keystrokes,
              since these setters replace item object references. */}
          <Index each={props.configSchema()}>
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
                    value={field().name}
                    onInput={e =>
                      props.setConfigSchema(prev =>
                        prev.map((item, idx) => (idx === index ? { ...item, name: e.currentTarget.value } : item))
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
                    value={field().type}
                    onChange={e =>
                      props.setConfigSchema(prev =>
                        prev.map((item, idx) =>
                          idx === index ? { ...item, type: e.currentTarget.value as any } : item
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
                    onClick={() => props.setConfigSchema(prev => prev.filter((_, idx) => idx !== index))}
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
          </Index>

          <div style={{ display: 'flex', 'justify-content': 'flex-end', gap: '8px', 'margin-top': '20px' }}>
            <button
              type="button"
              onClick={props.onClose}
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
      </ModalOverlay>
    </Show>
  );
}
