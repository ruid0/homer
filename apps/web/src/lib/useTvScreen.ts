import { useEffect } from "react";

// 1.1vw is 21px on a 1920px screen and 10.5px on a 960px one, so the page looks the same on either. Everything is in rem,
// so the whole page scales with it.
const ROOT_FONT = "1.1vw";

// Puts the page in the TV look (the dark palette, the scaled type) and puts the app back when it leaves.
export const useTvScreen = () => {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("tv");
    root.style.fontSize = ROOT_FONT;
    return () => {
      root.classList.remove("tv");
      root.style.fontSize = "";
    };
  }, []);
};
