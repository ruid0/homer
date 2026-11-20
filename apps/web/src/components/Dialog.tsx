import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { keyboardFit } from "../lib/keyboardFit";

type Props = { title: string; onClose: () => void; children: ReactNode };

// The page behind a modal must not scroll. Hiding overflow is not enough on iOS Safari, so the body is pinned where it is and put back
// afterwards. The counter is for two dialogs mounted at once; a dialog that replaces another releases the page for an instant and locks it again.
let locks = 0;
let lockedAt = 0;

const lockPage = () => {
  if (locks++ > 0) return;
  lockedAt = window.scrollY;
  Object.assign(document.body.style, { position: "fixed", top: `-${lockedAt}px`, left: "0", right: "0" });
};

const unlockPage = () => {
  if (--locks > 0) return;
  Object.assign(document.body.style, { position: "", top: "", left: "", right: "" });
  window.scrollTo({ top: lockedAt, behavior: "instant" });
};

// On a phone or tablet a field that takes focus on its own raises the on-screen keyboard, which covers the sheet before anyone has read its
// title. So a touch screen starts on the title (which a screen reader reads out); a mouse and keyboard still land on the first field.
const hasTouchScreen = () => window.matchMedia("(pointer: coarse)").matches;

export const Dialog = ({ title, onClose, children }: Props) => {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // On a phone the dialog is a sheet that slides up from the bottom edge; from md up it is a centred card.
  // Taken while rendering, before this dialog or any dialog it replaces has touched focus.
  const [opener] = useState(() => document.activeElement);

  useEffect(() => {
    lockPage();
    if (ref.current && !ref.current.open) {
      if (hasTouchScreen() && heading.current) {
        heading.current.tabIndex = -1;
        heading.current.setAttribute("autofocus", "");
      }
      ref.current.showModal();
      // Some phones focus the first field whatever the autofocus attribute says, which raises the keyboard over the sheet.
      if (hasTouchScreen() && heading.current && document.activeElement !== heading.current) heading.current.focus({ preventScroll: true });
    }
    // Closing removes the dialog, so focus goes back to the control that opened it instead of the top of the page.
    // It waits a tick: while the dialog is still open, everything behind it cannot take focus.
    // If that control is gone (its row was removed), focus goes to the page content.
    return () => {
      unlockPage();
      window.setTimeout(() => {
        const target = opener instanceof HTMLElement && opener.isConnected ? opener : document.querySelector<HTMLElement>("main");
        target?.focus();
      }, 0);
    };
  }, [opener]);

  // A click on the dimmed page behind closes the dialog, like Escape. The press must start there too, so selecting text in a field and
  // letting go outside does not close it. The dialog's own padding is also "the dialog" to the browser, so the position decides.
  // A click made with the keyboard (Enter or Space on a button) has no position, and no pointer press behind it: it never closes the dialog.
  const pressedOutside = useRef(false);
  const isOutside = (event: MouseEvent<HTMLDialogElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
  };

  // With the keyboard up, the sheet is fitted to the visible area so the first fields stay on screen.
  useEffect(() => {
    const visual = window.visualViewport;
    const dialog = ref.current;
    if (!visual || !dialog) return;
    const fit = () => {
      const size = keyboardFit(visual, window.innerHeight, window.innerWidth);
      dialog.style.top = size ? `${size.top}px` : "";
      dialog.style.bottom = size ? "auto" : "";
      dialog.style.marginBlock = size ? "0" : "";
      dialog.style.maxHeight = size ? `${size.maxHeight}px` : "";
    };
    visual.addEventListener("resize", fit);
    visual.addEventListener("scroll", fit);
    fit();
    return () => {
      visual.removeEventListener("resize", fit);
      visual.removeEventListener("scroll", fit);
    };
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onMouseDown={(event) => {
        pressedOutside.current = isOutside(event);
      }}
      onClick={(event) => {
        // close() fires the dialog's own close event, which calls onClose, the same path as Escape.
        if (event.detail > 0 && pressedOutside.current && isOutside(event)) event.currentTarget.close();
        pressedOutside.current = false;
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(28rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-xl bg-card p-5 text-inherit backdrop:animate-backdrop-in backdrop:bg-scrim max-md:mb-0 max-md:w-full max-md:max-w-none max-md:animate-sheet-up max-md:rounded-b-none max-md:rounded-t-2xl max-md:pb-[max(1.25rem,env(safe-area-inset-bottom))] md:animate-dialog-in"
    >
      <h2 ref={heading} className="mb-4 text-section font-semibold outline-none">{title}</h2>
      {children}
    </dialog>
  );
};
