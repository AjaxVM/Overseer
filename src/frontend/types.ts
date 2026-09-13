export interface FrontmatterItem {
  key: string;
  val: string;
}

export interface SchemaField {
  name: string;
  type: 'string' | 'number' | 'enum';
  options?: string[];
  optionsRaw?: string;
}