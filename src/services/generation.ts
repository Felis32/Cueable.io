export type GenerationInput = {
  mode: "prompt" | "url" | "assets";
  prompt: string;
  url: string;
  ratio: string;
  duration: string;
};

/** Frontend stand-in. Replace with POST /api/generate when the render API exists. */
export async function requestGeneration(input: GenerationInput) {
  return {
    projectId: "titanium-watch",
    preview: true,
    echo: input.prompt || input.url || "Uploaded assets",
  };
}
