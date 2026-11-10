type Visible = { height: number; offsetTop: number };

const GAP = 8;
const PHONE_MAX_WIDTH = 768;
// A visible area this much shorter than the window means the on-screen keyboard is up.
const KEYBOARD_MIN = 120;

export type SheetFit = { top: number; maxHeight: number };

// On a phone the on-screen keyboard covers the page without resizing it. Fit the sheet to what is visible above it, from the top,
// so the first fields stay on screen. Null means leave the sheet where its styles put it.
export const keyboardFit = (visible: Visible, windowHeight: number, windowWidth: number): SheetFit | null => {
  if (windowWidth >= PHONE_MAX_WIDTH) return null;
  if (windowHeight - visible.height < KEYBOARD_MIN) return null;
  return { top: visible.offsetTop + GAP, maxHeight: visible.height - 2 * GAP };
};
