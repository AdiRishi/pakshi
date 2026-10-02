import { siteData } from "@repo/blocks";
import type { MediaId } from "@repo/contracts/ids";
import type { SiteView } from "@repo/contracts/studio";

/** What a view's blocks read beyond their props, with each image loading from `src`. */
export const viewData = (view: SiteView, src: (media: MediaId) => string) =>
  siteData({
    settings: view.settings,
    identity: view.brand.identity,
    menus: view.parts.menus,
    pages: view.pages,
    forms: view.forms,
    media: (id) => {
      const file = view.media[id];
      return file === undefined
        ? undefined
        : { src: src(id), width: file.width, height: file.height };
    },
  });
