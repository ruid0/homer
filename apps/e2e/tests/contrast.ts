import type { Locator } from "@playwright/test";

// WCAG contrast ratio between an element's text colour and the first solid background behind it.
export const contrastOf = (locator: Locator): Promise<number> =>
  locator.evaluate((element) => {
    const rgba = (css: string): [number, number, number, number] => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return [0, 0, 0, 0];
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = css;
      context.fillRect(0, 0, 1, 1);
      const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a];
    };
    const solidBackground = (start: Element | null): [number, number, number, number] => {
      if (!start) return [255, 255, 255, 255];
      const color = rgba(getComputedStyle(start).backgroundColor);
      return color[3] === 255 ? color : solidBackground(start.parentElement);
    };
    const luminance = ([r, g, b]: number[]) => {
      const [lr = 0, lg = 0, lb = 0] = [r, g, b].map((value) => {
        const channel = (value ?? 0) / 255;
        return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
    };
    const text = rgba(getComputedStyle(element).color);
    const [high, low] = [luminance(text), luminance(solidBackground(element))].sort((a, b) => b - a);
    return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
  });
