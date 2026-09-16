import {
  ArrowRightIcon, ArrowSquareOutIcon, CaretDownIcon, CheckIcon, CodeIcon,
  CopyIcon, CornersOutIcon, DownloadSimpleIcon, FileTextIcon, FolderSimpleIcon,
  GithubLogoIcon, InfoIcon, KeyIcon, LinkIcon, LockSimpleIcon, MagnifyingGlassIcon,
  MinusIcon, MoonIcon, NoteIcon, PencilSimpleIcon, PlusIcon, SidebarSimpleIcon,
  SquaresFourIcon, SunIcon, TableIcon, TrashIcon, TreeStructureIcon,
  UploadSimpleIcon, XIcon, type IconProps,
} from '@phosphor-icons/react';

const icons = {
  search: MagnifyingGlassIcon,
  chevron: CaretDownIcon,
  arrow: ArrowRightIcon,
  external: ArrowSquareOutIcon,
  plus: PlusIcon,
  minus: MinusIcon,
  close: XIcon,
  file: FileTextIcon,
  folder: FolderSimpleIcon,
  table: TableIcon,
  code: CodeIcon,
  download: DownloadSimpleIcon,
  upload: UploadSimpleIcon,
  layout: TreeStructureIcon,
  panel: SidebarSimpleIcon,
  sun: SunIcon,
  moon: MoonIcon,
  lock: LockSimpleIcon,
  check: CheckIcon,
  copy: CopyIcon,
  edit: PencilSimpleIcon,
  trash: TrashIcon,
  key: KeyIcon,
  link: LinkIcon,
  note: NoteIcon,
  grid: SquaresFourIcon,
  fit: CornersOutIcon,
  info: InfoIcon,
  github: GithubLogoIcon,
};

export type IconName = keyof typeof icons;

/** Phosphor regular weight is shared by every application control. */
export function Icon({ name, size = 16, ...props }: IconProps & { name: IconName }) {
  const Glyph = icons[name];
  return <Glyph size={size} weight="regular" aria-hidden="true" focusable="false" {...props} />;
}
