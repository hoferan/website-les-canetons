import type { Preview } from "@storybook/react-vite";

// The app's stylesheet: Tailwind, the palette, the semantic tokens and the
// fonts. It is the only app file a story may load, because it is the tokens.
import "../web/src/styles.css";

const preview: Preview = {
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    controls: { expanded: true },
    backgrounds: {
      options: {
        page: { name: "page (cream)", value: "#fff7ec" },
        stage: { name: "stage (black)", value: "#0b0a12" },
      },
    },
    // Run axe on every story; a violation fails the story in the test runner and
    // shows in the panel. Contrast is checked here, in a real browser.
    a11y: { test: "error" },
  },
  initialGlobals: { backgrounds: { value: "page" } },
};

export default preview;
