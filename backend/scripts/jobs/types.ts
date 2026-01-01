export interface JobDefinition {
  name: string;
  description: string;
  examples: string[];
  run: () => Promise<void>;
}

export interface JobRegistry {
  [key: string]: JobDefinition;
}
