// data/scenes.tsv: one scene per line — id, Chinese caption, English caption,
// picture prompt — separated by tabs. Lines starting with # are comments.

export function parseScenes(text) {
  const scenes = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim() || line.startsWith('#')) return;
    const [id, zh, en, prompt, ...rest] = line.split('\t');
    if (!prompt || rest.length) {
      throw new Error(
        `data/scenes.tsv line ${index + 1}: expected id, Chinese caption, English caption and prompt separated by tabs`,
      );
    }
    scenes.push({ id: id.trim(), zh: zh.trim(), en: en.trim(), prompt: prompt.trim() });
  });
  return scenes;
}
