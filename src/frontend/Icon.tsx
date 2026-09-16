import type { JSX } from 'solid-js';

export type IconName =
  | 'eye'
  | 'gear'
  | 'folder'
  | 'ticket'
  | 'book'
  | 'file'
  | 'cornerUpLeft'
  | 'pencil'
  | 'x'
  | 'plus'
  | 'chevronDown'
  | 'chevronRight'
  | 'search'
  | 'box';

function Gear() {
  const spokes = Array.from({ length: 8 }, (_, i) => {
    const angle = (i * Math.PI) / 4;
    return {
      x1: 12 + Math.cos(angle) * 7.5,
      y1: 12 + Math.sin(angle) * 7.5,
      x2: 12 + Math.cos(angle) * 9.5,
      y2: 12 + Math.sin(angle) * 9.5
    };
  });
  return (
    <>
      <circle cx="12" cy="12" r="3.5" />
      {spokes.map(s => (
        <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />
      ))}
    </>
  );
}

const paths: Record<IconName, () => JSX.Element> = {
  eye: () => (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  gear: () => <Gear />,
  folder: () => <path d="M3 6.5a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />,
  ticket: () => (
    <>
      <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a1.5 1.5 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a1.5 1.5 0 0 0 0-4Z" />
      <line x1="14" y1="7" x2="14" y2="17" stroke-dasharray="2 2" />
    </>
  ),
  book: () => (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h6v18H6a2 2 0 0 0-2 2Z" />
      <path d="M12 3h6a2 2 0 0 1 2 2v16a2 2 0 0 0-2-2h-6Z" />
    </>
  ),
  file: () => (
    <>
      <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v5h5" />
    </>
  ),
  cornerUpLeft: () => (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h9a6 6 0 0 1 6 6v5" />
    </>
  ),
  pencil: () => (
    <>
      <path d="m4 20 1-4L16 5l3 3L8 19l-4 1Z" />
      <path d="m13.5 6.5 3 3" />
    </>
  ),
  x: () => (
    <>
      <line x1="5" y1="5" x2="19" y2="19" />
      <line x1="19" y1="5" x2="5" y2="19" />
    </>
  ),
  plus: () => (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
  chevronDown: () => <path d="m6 9 6 6 6-6" />,
  chevronRight: () => <path d="m9 6 6 6-6 6" />,
  search: () => (
    <>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.2" y2="16.2" />
    </>
  ),
  box: () => (
    <>
      <path d="M21 8 12 3 3 8v8l9 5 9-5Z" />
      <path d="M3 8l9 5 9-5" />
      <path d="M12 13v8" />
    </>
  )
};

interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  style?: JSX.CSSProperties;
}

export default function Icon(props: IconProps) {
  return (
    <svg
      width={props.size || 16}
      height={props.size || 16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={props.strokeWidth || 1.75}
      stroke-linecap="round"
      stroke-linejoin="round"
      style={{ 'flex-shrink': 0, ...props.style }}
    >
      {paths[props.name]()}
    </svg>
  );
}
