import { createSignal, Show } from 'solid-js';
import type { JSX } from 'solid-js';
import Icon from './Icon';
import { colors, font } from './theme';

// Shared by Workspace's ticket title and Sidebar's project title - click the pencil,
// the label becomes a text input, Enter/blur commits, Escape cancels. Blank input is
// treated as a cancel (never commits an empty name).
export default function InlineEditText(props: {
  value: string;
  onCommit: (value: string) => void;
  onDisplayClick?: () => void;
  textStyle: JSX.CSSProperties;
  title?: string;
  editTitle?: string;
}) {
  const [editing, setEditing] = createSignal(false);
  const [draft, setDraft] = createSignal('');

  const startEdit = () => {
    setDraft(props.value);
    setEditing(true);
  };

  const commit = () => {
    const trimmed = draft().trim();
    setEditing(false);
    if (trimmed && trimmed !== props.value) props.onCommit(trimmed);
  };

  return (
    <Show
      when={editing()}
      fallback={
        <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'min-width': 0 }}>
          <span
            title={props.title}
            onClick={props.onDisplayClick}
            style={{ ...props.textStyle, cursor: props.onDisplayClick ? 'pointer' : 'default', 'min-width': 0 }}
          >
            {props.value}
          </span>
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              startEdit();
            }}
            title={props.editTitle || 'Rename'}
            style={{
              display: 'flex',
              'align-items': 'center',
              background: 'transparent',
              color: colors.inkFaint,
              border: 'none',
              padding: '2px',
              cursor: 'pointer',
              'flex-shrink': 0
            }}
            onMouseEnter={e => (e.currentTarget.style.color = colors.blue)}
            onMouseLeave={e => (e.currentTarget.style.color = colors.inkFaint)}
          >
            <Icon name="pencil" size={14} />
          </button>
        </div>
      }
    >
      <input
        type="text"
        value={draft()}
        autofocus
        onInput={e => setDraft(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setEditing(false);
          }
        }}
        style={{
          ...props.textStyle,
          border: `1px solid ${colors.borderStrong}`,
          'border-radius': '6px',
          padding: '1px 6px',
          outline: 'none',
          background: colors.paperCard,
          'min-width': 0,
          'font-family': font.sans
        }}
      />
    </Show>
  );
}
