import { createSignal, createEffect, For, Show } from 'solid-js';
import { marked } from 'marked';

import type { FrontmatterItem, SchemaField } from './types'

marked.setOptions({
  gfm: true,
  breaks: true
});

function findActiveTicketDetails(filePath: string, items: FrontmatterItem[], body: string): [string, string] {
  const [_id, ...nameParts] = (filePath.split(/[/\\]/).pop() || '').split('-')
  const configName = items.find(item => item.key === 'name')?.val
  const configId = items.find(item => item.key === 'id')?.val ?? _id
  if (configName) {
    return [configId, configName]
  }

  // try to read header
  const header = body.split('\n').find(line => line.startsWith('# '))?.slice(2).trim()
  if (header) {
    return [configId, header]
  }

  // found nothing, just try to desluggify the filename
  return [configId, nameParts.join(' ')]
}

export default function App() {
  const [tree, setTree] = createSignal<any[]>([]);
  const [isModalOpen, setIsModalOpen] = createSignal(false);
  const [selectedRepoPath, setSelectedRepoPath] = createSignal('');
  const [errorMsg, setErrorMsg] = createSignal('');
  const [isBrowsing, setIsBrowsing] = createSignal(false);

  // Active File & Workspace
  const [activeTab, setActiveTab] = createSignal<'preview' | 'edit'>('preview');
  const [activeFilePath, setActiveFilePath] = createSignal<string | null>(null);
  const [activeTicketName, setActiveTicketName] = createSignal<string | null>(null);
  const [activeTicketId, setActiveTicketId] = createSignal<string | null>(null);
  const [activeRepoPath, setActiveRepoPath] = createSignal<string | null>(null);
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

  const fetchTree = async () => {
    const res = await fetch('/api/projects');
    const data = await res.json();
    setTree(data);
  };

  createEffect(() => {
    fetchTree();
    if (import.meta.hot) {
      import.meta.hot.on('projects-update', () => fetchTree());
    }
  });

  const getActiveRepoConfig = () => {
    if (!activeRepoPath()) return null;
    const repoNode = tree().find(r => r.repoPath === activeRepoPath());
    return repoNode?.config || null;
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
      const [id, name] = findActiveTicketDetails(filePath, items, data.body || '')
      console.log(id, name)
      setActiveTicketId(id)
      setActiveTicketName(name)
    } catch (err: any) {
      console.error("Failed to load file:", err);
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
      if (!res.ok) throw new Error("Save failed");
      setSaveStatus('Saved successfully');
    } catch (err: any) {
      setSaveStatus(`Error: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const openCreateModal = (parentPath: string, repoPath: string) => {
    setCreateParentPath(parentPath);
    setCreateRepoPath(repoPath);
    setCreateType('file');
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

      if (createType() === 'file') {
        handleOpenFile(data.createdPath, createRepoPath());
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
    const formattedSchema = configSchema().map(field => ({
      name: field.name.trim(),
      type: field.type,
      options: field.type === 'enum' ? (field.optionsRaw || '').split(',').map(s => s.trim()).filter(Boolean) : undefined
    })).filter(f => f.name.length > 0);

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
      if (!res.ok) throw new Error("Failed to save config");
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
    setAttributes(prev => prev.map((item, idx) => idx === index ? { ...item, key: newKey } : item));
  };

  const updateAttrVal = (index: number, newVal: string) => {
    setAttributes(prev => prev.map((item, idx) => idx === index ? { ...item, val: newVal } : item));
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

  const TreeNode = (props: { node: any; repoPath?: string }) => {
    const currentRepoPath = props.node.type === 'repository' ? props.node.repoPath : props.repoPath;

    return (
      <div style={{ "margin-left": "16px", "padding-top": "4px" }}>
        {/* Repository Level */}
        <Show when={props.node.type === 'repository'}>
          <details open>
            <summary style={{ cursor: "pointer", "font-weight": "800", color: "#0f172a", "margin-bottom": "6px", display: "flex", "align-items": "center", "justify-content": "space-between" }}>
              <span>📦 {props.node.name}</span>
              <button 
                onClick={(e) => { e.preventDefault(); openRepoConfigModal(props.node); }} 
                title="Configure Project (overseer.json)"
                style={{ background: "transparent", border: "none", cursor: "pointer", "font-size": "0.9rem" }}
              >
                ⚙️
              </button>
            </summary>
            <div style={{ "border-left": "2px solid #e2e8f0", "margin-left": "8px", "padding-left": "4px" }}>
              <For each={props.node.children}>{(child) => <TreeNode node={child} repoPath={currentRepoPath} />}</For>
            </div>
          </details>
        </Show>

        {/* Category Folders */}
        <Show when={props.node.type === 'category'}>
          <details open>
            <summary style={{ cursor: "pointer", "font-weight": "700", color: props.node.categoryType === 'docs' ? "#0284c7" : "#16a34a", display: "flex", "align-items": "center", "justify-content": "space-between" }}>
              <span>{props.node.categoryType === 'docs' ? '📚' : '📋'} {props.node.name}</span>
              <button
                onClick={(e) => { e.preventDefault(); openCreateModal(props.node.path, currentRepoPath!); }}
                title="Create ticket or folder"
                style={{ background: "#e2e8f0", border: "none", "border-radius": "4px", padding: "0 6px", cursor: "pointer", "font-size": "0.75rem", color: "#334155" }}
              >
                +
              </button>
            </summary>
            <div style={{ "border-left": "2px dashed #cbd5e1", "margin-left": "8px", "padding-left": "4px" }}>
              <For each={props.node.children}>{(child) => <TreeNode node={child} repoPath={currentRepoPath} />}</For>
            </div>
          </details>
        </Show>

        {/* Standard Directories */}
        <Show when={props.node.type === 'directory'}>
          <details open>
            <summary style={{ cursor: "pointer", "font-weight": "600", color: "#2563eb", display: "flex", "align-items": "center", "justify-content": "space-between" }}>
              <span>
                📁 {props.node.name}
                <Show when={props.node.projectData?.id}>
                  <span style={{ "font-size": "0.7rem", "margin-left": "8px", background: "#f1f5f9", padding: "2px 6px", "border-radius": "4px", color: "#64748b" }}>
                    #{props.node.projectData.id}
                  </span>
                </Show>
              </span>
              <button
                onClick={(e) => { e.preventDefault(); openCreateModal(props.node.path, currentRepoPath!); }}
                title="Create ticket or folder inside directory"
                style={{ background: "#e2e8f0", border: "none", "border-radius": "4px", padding: "0 6px", cursor: "pointer", "font-size": "0.75rem", color: "#334155" }}
              >
                +
              </button>
            </summary>
            <For each={props.node.children}>{(child) => <TreeNode node={child} repoPath={currentRepoPath} />}</For>
          </details>
        </Show>
        
        {/* Markdown Files */}
        <Show when={props.node.type === 'file'}>
          <div 
            onClick={() => handleOpenFile(props.node.path, currentRepoPath!)}
            style={{ 
              color: activeFilePath() === props.node.path ? "#2563eb" : "#4b5563", 
              "font-weight": activeFilePath() === props.node.path ? "bold" : "normal",
              "font-size": "0.9rem",
              cursor: "pointer", "border-radius": "4px",
              background: activeFilePath() === props.node.path ? "#eff6ff" : "transparent"
            }}
          >
            📄 {props.node.name}
          </div>
        </Show>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* Sidebar */}
      <div style={{ width: "360px", "border-right": "1px solid #e5e7eb", padding: "16px", background: "#f8fafc", "overflow-y": "auto" }}>
        <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center" }}>
          <h2 style={{ margin: 0 }}>Overseer 👁️</h2>
          <button 
            onClick={() => setIsModalOpen(true)}
            style={{ background: "#2563eb", color: "#fff", border: "none", padding: "6px 12px", "border-radius": "6px", cursor: "pointer", "font-weight": "600" }}
          >
            + Add Project
          </button>
        </div>

        <hr style={{ "border": "none", "border-top": "1px solid #e5e7eb", margin: "16px 0" }} />
        <For each={tree()}>{(node) => <TreeNode node={node} />}</For>
      </div>

      {/* Workspace Area */}
      <div style={{ flex: 1, display: "flex", "flex-direction": "column", padding: "24px", background: "#ffffff", "overflow-y": "auto" }}>
        <Show when={activeFilePath()} fallback={
          <div style={{ color: "#94a3b8", "margin-top": "40px", "text-align": "center" }}>
            Select a document or ticket from the sidebar to view and edit.
          </div>
        }>
          <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "margin-bottom": "16px" }}>
            <div>
              {/* <h2 style={{ margin: 0 }}>{activeFilePath()?.split('/').pop()}</h2> */}
              <h2 style={{ margin: 0 }}>{activeTicketId()}: {activeTicketName()}</h2>
              <div style={{ "font-size": "0.8rem", color: "#94a3b8", "margin-top": "4px" }}>{activeFilePath()}</div>
            </div>

            <Show when={activeTab() === 'edit'}>
              <div style={{ display: "flex", "align-items": "center", gap: "12px" }}>
                <Show when={saveStatus()}>
                  <span style={{ "font-size": "0.85rem", color: saveStatus().startsWith('Error') ? "#dc2626" : "#16a34a" }}>
                    {saveStatus()}
                  </span>
                </Show>
                <button
                  onClick={handleSaveFile}
                  disabled={isSaving()}
                  style={{ background: "#16a34a", color: "#fff", border: "none", padding: "8px 20px", "border-radius": "6px", cursor: "pointer", "font-weight": "600" }}
                >
                  {isSaving() ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </Show>
          </div>

          {/* Navigation Tabs */}
          <div style={{ display: "flex", gap: "8px", "border-bottom": "1px solid #e2e8f0", "margin-bottom": "20px" }}>
            <button
              onClick={() => setActiveTab('preview')}
              style={{
                padding: "8px 16px", border: "none",
                "border-bottom": activeTab() === 'preview' ? "2px solid #2563eb" : "2px solid transparent",
                background: "transparent", color: activeTab() === 'preview' ? "#2563eb" : "#64748b",
                "font-weight": activeTab() === 'preview' ? "bold" : "normal", cursor: "pointer"
              }}
            >
              👁️ Preview
            </button>
            <button
              onClick={() => setActiveTab('edit')}
              style={{
                padding: "8px 16px", border: "none",
                "border-bottom": activeTab() === 'edit' ? "2px solid #2563eb" : "2px solid transparent",
                background: "transparent", color: activeTab() === 'edit' ? "#2563eb" : "#64748b",
                "font-weight": activeTab() === 'edit' ? "bold" : "normal", cursor: "pointer"
              }}
            >
              ✏️ Edit
            </button>
          </div>

          {/* TAB 1: PREVIEW */}
          <Show when={activeTab() === 'preview'}>
            <div style={{ flex: 1, display: "flex", "flex-direction": "column" }}>
              <Show when={attributes().length > 0}>
                <div style={{ display: "flex", "flex-wrap": "wrap", gap: "8px", "margin-bottom": "20px", background: "#f8fafc", padding: "12px", "border-radius": "8px", border: "1px solid #f1f5f9" }}>
                  <For each={attributes()}>{(attr) => (
                    <div style={{ background: "#e2e8f0", padding: "4px 10px", "border-radius": "16px", "font-size": "0.8rem", color: "#334155" }}>
                      <strong style={{ color: "#0f172a" }}>{attr.key}:</strong> {attr.val}
                    </div>
                  )}</For>
                </div>
              </Show>

              <div 
                innerHTML={marked.parse(markdownBody() || '') as string} 
                style={{ flex: 1, "line-height": "1.6", color: "#1e293b", "font-size": "1rem" }}
              />
            </div>
          </Show>

          {/* TAB 2: EDIT */}
          <Show when={activeTab() === 'edit'}>
            <div style={{ flex: 1, display: "flex", "flex-direction": "column" }}>
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", "border-radius": "8px", padding: "16px", "margin-bottom": "20px" }}>
                <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "margin-bottom": "12px" }}>
                  <h4 style={{ margin: 0, color: "#334155" }}>Frontmatter Metadata</h4>
                  <button 
                    onClick={() => handleAddFrontmatterField()}
                    style={{ background: "#e2e8f0", border: "none", padding: "4px 8px", "border-radius": "4px", cursor: "pointer", "font-size": "0.8rem" }}
                  >
                    + Custom Field
                  </button>
                </div>

                <For each={attributes()}>{(attr, index) => {
                  const schema = getActiveRepoConfig()?.frontmatterSchema || [];
                  const fieldDef = schema.find((s: SchemaField) => s.name === attr.key.trim());

                  return (
                    <div style={{ display: "flex", gap: "8px", "margin-bottom": "8px", "align-items": "center" }}>
                      <input 
                        type="text" 
                        placeholder="Key"
                        value={attr.key}
                        onInput={(e) => updateAttrKey(index(), e.currentTarget.value)}
                        style={{ width: "160px", padding: "6px 8px", border: "1px solid #cbd5e1", "border-radius": "4px", "font-weight": "600" }}
                      />

                      <Show when={fieldDef?.type === 'enum'} fallback={
                        <Show when={fieldDef?.type === 'number'} fallback={
                          <input 
                            type="text" 
                            placeholder="Value"
                            value={attr.val}
                            onInput={(e) => updateAttrVal(index(), e.currentTarget.value)}
                            style={{ flex: 1, padding: "6px 8px", border: "1px solid #cbd5e1", "border-radius": "4px" }}
                          />
                        }>
                          <input 
                            type="number" 
                            placeholder="Numeric value"
                            value={attr.val}
                            onInput={(e) => updateAttrVal(index(), e.currentTarget.value)}
                            style={{ flex: 1, padding: "6px 8px", border: "1px solid #cbd5e1", "border-radius": "4px" }}
                          />
                        </Show>
                      }>
                        <select
                          value={attr.val}
                          onChange={(e) => updateAttrVal(index(), e.currentTarget.value)}
                          style={{ flex: 1, padding: "6px 8px", border: "1px solid #cbd5e1", "border-radius": "4px", background: "#fff" }}
                        >
                          <option value="">-- Select {fieldDef?.name} --</option>
                          <For each={fieldDef?.options || []}>{(opt) => (
                            <option value={opt}>{opt}</option>
                          )}</For>
                        </select>
                      </Show>

                      <button 
                        onClick={() => handleRemoveFrontmatterField(index())}
                        style={{ background: "#fee2e2", color: "#dc2626", border: "none", padding: "6px 10px", "border-radius": "4px", cursor: "pointer" }}
                      >
                        ✕
                      </button>
                    </div>
                  );
                }}</For>

                <Show when={(getActiveRepoConfig()?.frontmatterSchema || []).length > 0}>
                  <div style={{ "margin-top": "12px", "padding-top": "12px", "border-top": "1px dashed #e2e8f0", display: "flex", gap: "6px", "align-items": "center", "flex-wrap": "wrap" }}>
                    <span style={{ "font-size": "0.75rem", color: "#64748b" }}>Add field:</span>
                    <For each={getActiveRepoConfig()?.frontmatterSchema || []}>{(schemaField: SchemaField) => (
                      <button
                        onClick={() => handleAddFrontmatterField(schemaField.name)}
                        style={{ background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", padding: "2px 8px", "border-radius": "12px", "font-size": "0.75rem", cursor: "pointer" }}
                      >
                        + {schemaField.name} ({schemaField.type})
                      </button>
                    )}</For>
                  </div>
                </Show>
              </div>

              <div style={{ flex: 1, display: "flex", "flex-direction": "column" }}>
                <h4 style={{ margin: "0 0 8px 0", color: "#334155" }}>Markdown Content</h4>
                <textarea
                  value={markdownBody()}
                  onInput={(e) => setMarkdownBody(e.currentTarget.value)}
                  style={{
                    flex: 1, "min-height": "350px", padding: "12px", "font-family": "monospace",
                    border: "1px solid #cbd5e1", "border-radius": "8px", "font-size": "0.95rem", "line-height": "1.5"
                  }}
                />
              </div>
            </div>
          </Show>
        </Show>
      </div>

      {/* MODAL 1: Add Project Root */}
      <Show when={isModalOpen()}>
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.4)", display: "flex", "align-items": "center", "justify-content": "center" }}>
          <div style={{ background: "#fff", padding: "24px", "border-radius": "8px", width: "480px" }}>
            <h3 style={{ "margin-top": 0 }}>Register Repository Root</h3>
            <form onSubmit={handleAddProject}>
              <div style={{ display: "flex", gap: "8px", "margin-bottom": "12px" }}>
                <input 
                  type="text" 
                  placeholder="/Users/username/Dev/my-repo"
                  value={selectedRepoPath()}
                  onInput={(e) => setSelectedRepoPath(e.currentTarget.value)}
                  style={{ flex: 1, padding: "8px 12px", border: "1px solid #cbd5e1", "border-radius": "6px" }}
                />
                <button type="button" onClick={handleBrowseNativeFolder} disabled={isBrowsing()} style={{ background: "#475569", color: "#fff", border: "none", padding: "8px 14px", "border-radius": "6px" }}>
                  {isBrowsing() ? 'Opening...' : 'Browse...'}
                </button>
              </div>
              <Show when={errorMsg()}><div style={{ color: "#dc2626", "font-size": "0.85rem", "margin-bottom": "12px" }}>{errorMsg()}</div></Show>
              <div style={{ display: "flex", "justify-content": "flex-end", gap: "8px" }}>
                <button type="button" onClick={() => setIsModalOpen(false)} style={{ background: "#e2e8f0", border: "none", padding: "8px 16px", "border-radius": "6px" }}>Cancel</button>
                <button type="submit" style={{ background: "#2563eb", color: "#fff", border: "none", padding: "8px 16px", "border-radius": "6px" }}>Index Repo</button>
              </div>
            </form>
          </div>
        </div>
      </Show>

      {/* MODAL 2: Create Item (Ticket or Folder) */}
      <Show when={isCreateModalOpen()}>
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.4)", display: "flex", "align-items": "center", "justify-content": "center" }}>
          <div style={{ background: "#fff", padding: "24px", "border-radius": "8px", width: "480px" }}>
            <h3 style={{ "margin-top": 0 }}>Create Ticket or Sub-Project</h3>
            <form onSubmit={handleCreateItem}>
              <div style={{ "margin-bottom": "12px" }}>
                <label style={{ display: "block", "font-size": "0.85rem", "font-weight": "bold", "margin-bottom": "4px" }}>Item Type</label>
                <div style={{ display: "flex", gap: "12px" }}>
                  <label style={{ cursor: "pointer", "font-size": "0.9rem" }}>
                    <input type="radio" name="createType" value="file" checked={createType() === 'file'} onChange={() => setCreateType('file')} /> 📄 Ticket (.md)
                  </label>
                  <label style={{ cursor: "pointer", "font-size": "0.9rem" }}>
                    <input type="radio" name="createType" value="directory" checked={createType() === 'directory'} onChange={() => setCreateType('directory')} /> 📁 Sub-Project (Folder)
                  </label>
                </div>
              </div>

              <div style={{ "margin-bottom": "12px" }}>
                <label style={{ display: "block", "font-size": "0.85rem", "font-weight": "bold", "margin-bottom": "4px" }}>Name / Title</label>
                <input 
                  type="text" 
                  placeholder={createType() === 'file' ? "e.g. Implement OAuth Flow" : "e.g. Auth Refactor"}
                  value={createName()}
                  onInput={(e) => setCreateName(e.currentTarget.value)}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", "border-radius": "6px", "box-sizing": "border-box" }}
                />
              </div>

              <div style={{ "margin-bottom": "16px", "font-size": "0.8rem", color: "#64748b", background: "#f8fafc", padding: "8px 12px", "border-radius": "6px" }}>
                Target Parent Path: <br />
                <code style={{ "word-break": "break-all" }}>{createParentPath()}</code>
              </div>

              <Show when={createErrorMsg()}><div style={{ color: "#dc2626", "font-size": "0.85rem", "margin-bottom": "12px" }}>{createErrorMsg()}</div></Show>

              <div style={{ display: "flex", "justify-content": "flex-end", gap: "8px" }}>
                <button type="button" onClick={() => setIsCreateModalOpen(false)} style={{ background: "#e2e8f0", border: "none", padding: "8px 16px", "border-radius": "6px" }}>Cancel</button>
                <button type="submit" style={{ background: "#16a34a", color: "#fff", border: "none", padding: "8px 16px", "border-radius": "6px", "font-weight": "600" }}>Create</button>
              </div>
            </form>
          </div>
        </div>
      </Show>

      {/* MODAL 3: Repository Settings (overseer.json) */}
      <Show when={isConfigModalOpen()}>
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.4)", display: "flex", "align-items": "center", "justify-content": "center" }}>
          <div style={{ background: "#fff", padding: "24px", "border-radius": "8px", width: "560px", "max-height": "85vh", "overflow-y": "auto" }}>
            <h3 style={{ "margin-top": 0 }}>Configure Repo (`overseer.json`)</h3>
            <form onSubmit={handleSaveRepoConfig}>
              <div style={{ "margin-bottom": "12px" }}>
                <label style={{ display: "block", "font-weight": "bold", "font-size": "0.85rem", "margin-bottom": "4px" }}>Docs Folder Directory</label>
                <input 
                  type="text" 
                  value={configDocsDir()} 
                  onInput={(e) => setConfigDocsDir(e.currentTarget.value)} 
                  style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", "border-radius": "6px", "box-sizing": "border-box" }}
                />
              </div>

              <div style={{ "margin-bottom": "16px" }}>
                <label style={{ display: "block", "font-weight": "bold", "font-size": "0.85rem", "margin-bottom": "4px" }}>Projects Folder Directory</label>
                <input 
                  type="text" 
                  value={configProjectsDir()} 
                  onInput={(e) => setConfigProjectsDir(e.currentTarget.value)} 
                  style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", "border-radius": "6px", "box-sizing": "border-box" }}
                />
              </div>

              <hr style={{ "border": "none", "border-top": "1px solid #e2e8f0", "margin-bottom": "16px" }} />

              <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "margin-bottom": "8px" }}>
                <h4 style={{ margin: 0 }}>Frontmatter Schema Fields</h4>
                <button 
                  type="button"
                  onClick={() => setConfigSchema(prev => [...prev, { name: '', type: 'string', optionsRaw: '' }])}
                  style={{ background: "#2563eb", color: "#fff", border: "none", padding: "4px 10px", "border-radius": "4px", "font-size": "0.8rem", cursor: "pointer" }}
                >
                  + Add Schema Field
                </button>
              </div>

              <For each={configSchema()}>{(field, index) => (
                <div style={{ background: "#f8fafc", padding: "10px", "border-radius": "6px", border: "1px solid #e2e8f0", "margin-bottom": "8px" }}>
                  <div style={{ display: "flex", gap: "8px", "margin-bottom": "6px" }}>
                    <input 
                      type="text" 
                      placeholder="Field Name (e.g. status)" 
                      value={field.name}
                      onInput={(e) => setConfigSchema(prev => prev.map((item, idx) => idx === index() ? { ...item, name: e.currentTarget.value } : item))}
                      style={{ flex: 1, padding: "6px", border: "1px solid #cbd5e1", "border-radius": "4px" }}
                    />
                    <select
                      value={field.type}
                      onChange={(e) => setConfigSchema(prev => prev.map((item, idx) => idx === index() ? { ...item, type: e.currentTarget.value as any } : item))}
                      style={{ width: "110px", padding: "6px", border: "1px solid #cbd5e1", "border-radius": "4px" }}
                    >
                      <option value="string">String</option>
                      <option value="number">Number</option>
                      <option value="enum">Enum</option>
                    </select>
                    <button 
                      type="button"
                      onClick={() => setConfigSchema(prev => prev.filter((_, idx) => idx !== index()))}
                      style={{ background: "#fee2e2", color: "#dc2626", border: "none", padding: "0 10px", "border-radius": "4px", cursor: "pointer" }}
                    >
                      ✕
                    </button>
                  </div>

                  <Show when={field.type === 'enum'}>
                    <input 
                      type="text" 
                      placeholder="Options (comma-separated, e.g. backlog, active, done)" 
                      value={field.optionsRaw || ''}
                      onInput={(e) => setConfigSchema(prev => prev.map((item, idx) => idx === index() ? { ...item, optionsRaw: e.currentTarget.value } : item))}
                      style={{ width: "100%", padding: "6px", border: "1px solid #cbd5e1", "border-radius": "4px", "box-sizing": "border-box" }}
                    />
                  </Show>
                </div>
              )}</For>

              <div style={{ display: "flex", "justify-content": "flex-end", gap: "8px", "margin-top": "20px" }}>
                <button type="button" onClick={() => setIsConfigModalOpen(false)} style={{ background: "#e2e8f0", border: "none", padding: "8px 16px", "border-radius": "6px" }}>Cancel</button>
                <button type="submit" style={{ background: "#16a34a", color: "#fff", border: "none", padding: "8px 16px", "border-radius": "6px", "font-weight": "600" }}>Save Config</button>
              </div>
            </form>
          </div>
        </div>
      </Show>
    </div>
  );
}