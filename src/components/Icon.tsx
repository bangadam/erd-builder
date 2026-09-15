import type { SVGProps } from 'react';

const paths = {
  search: 'm21 21-4.4-4.4 M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0',
  chevron: 'm8 10 4 4 4-4',
  arrow: 'M4 12h16 m-6-6 6 6-6 6',
  external: 'M14 3h7v7 M21 3l-9 9 M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5',
  plus: 'M12 5v14 M5 12h14',
  minus: 'M5 12h14',
  close: 'm6 6 12 12 M6 18 18 6',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h5',
  folder: 'M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z',
  table: 'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M3 9h18 M9 9v12 M3 15h18',
  code: 'm8 7-5 5 5 5 m8-10 5 5-5 5 M14 4l-4 16',
  download: 'M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5',
  upload: 'M12 16V4 m-5 5 5-5 5 5 M4 16v5h16v-5',
  layout: 'M3 3h6v6H3z M15 3h6v6h-6z M9 15h6v6H9z M6 9v3h12V9 M12 12v3',
  panel: 'M3 3h18v18H3z M9 3v18 m7-12-3 3 3 3',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.4 1.4 M17.6 17.6 1.4 1.4 M5 19l1.4-1.4 M17.6 6.4 1.4-1.4',
  moon: 'M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13z',
  lock: 'M5 10h14v11H5z M8 10V6a4 4 0 0 1 8 0v4 M12 14v3',
  check: 'm5 12 4 4L19 6',
  copy: 'M8 8h13v13H8z M16 8V3H3v13h5',
  edit: 'm16 3 5 5-12 12-6 1 1-6z M13 6l5 5',
  trash: 'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
  key: 'M9 14a5 5 0 1 1 1-8 5 5 0 0 1-1 8z M9 14l-6 7 M3 17l3 3',
  link: 'M9 15l6-6 M7 17l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0 M17 7l1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0',
  note: 'M4 3h16v12l-6 6H4z M14 21v-6h6 M8 8h8 M8 12h5',
  grid: 'M3 3h6v6H3z M15 3h6v6h-6z M3 15h6v6H3z M15 15h6v6h-6z',
  fit: 'M9 3H3v6 M15 3h6v6 M3 15v6h6 M21 15v6h-6',
  info: 'M12 11v6 M12 7h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  github: 'M9 19c-4.3 1.3-4.3-2-6-2 m12 5v-3.4a3 3 0 0 0-.8-2.3c2.7-.3 5.5-1.3 5.5-6A4.7 4.7 0 0 0 18.4 7a4.4 4.4 0 0 0-.1-3.3S17.3 3.4 15 5a11.4 11.4 0 0 0-6 0C6.7 3.4 5.7 3.7 5.7 3.7A4.4 4.4 0 0 0 5.6 7a4.7 4.7 0 0 0-1.3 3.3c0 4.7 2.8 5.7 5.5 6A3 3 0 0 0 9 18.6V22',
} satisfies Record<string, string>;

export type IconName = keyof typeof paths;

/** One stroke vocabulary for functional controls; illustration lives in separate assets. */
export function Icon({ name, size = 16, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
      <path d={paths[name]} />
    </svg>
  );
}
