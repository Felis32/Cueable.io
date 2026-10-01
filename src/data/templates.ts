export type TemplateVariable = {
  id: string;
  name: string;
  kind: "text" | "media";
  expectedType: string;
  count: string;
  aspectRatio: string;
};

export type TemplateScene = {
  id: string;
  type: string;
  duration: string;
  layout: string;
  textVars: string;
  mediaVars: string;
};

export type TemplateSpec = {
  useCase: string;
  platforms: string[];
  scenes: TemplateScene[];
  variables: TemplateVariable[];
  basePrompt: string;
  sourceMapping: string;
  brandKit: string;
  transition: string;
  musicStyle: string;
};

export type Template = {
  id: string;
  title: string;
  category: string;
  duration: string;
  ratio: string;
  tint: "rose" | "sage" | "peach" | "sky";
  source?: "seed" | "custom" | "admin";
  spec?: TemplateSpec;
};

export const templateCategories = [
  "All",
  "Product",
  "UGC",
  "App",
  "Commerce",
  "SaaS",
  "Social",
  "Cinematic",
  "Minimal",
] as const;

export const templates: Template[] = [];
