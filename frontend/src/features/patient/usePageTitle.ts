import { useEffect } from "react";

/** Keep the browser tab / screen-reader page title in step with the page. */
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · Memory Assistant`;
  }, [title]);
}
