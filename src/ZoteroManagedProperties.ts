export type AnnotationColor =
  | 'Yellow'
  | 'Red'
  | 'Green'
  | 'Blue'
  | 'Purple'
  | 'Magenta'
  | 'Orange'
  | 'Gray';

export const ZOTERO_ANNOTATION_COLORS: AnnotationColor[] = [
  'Yellow',
  'Red',
  'Green',
  'Blue',
  'Purple',
  'Magenta',
  'Orange',
  'Gray',
];

export const ZOTERO_ANNOTATION_COLOR_HEX: Record<AnnotationColor, string> = {
  Yellow: '#ffd400',
  Red: '#ff6666',
  Green: '#5fb236',
  Blue: '#2ea8e5',
  Purple: '#a28ae5',
  Magenta: '#e56eee',
  Orange: '#f19837',
  Gray: '#aaaaaa',
};
