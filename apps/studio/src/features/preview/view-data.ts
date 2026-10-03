import { siteData } from "@repo/blocks";
import type { MediaId } from "@repo/contracts/ids";
import type { SiteView } from "@repo/contracts/studio";

/**
 * What a view's blocks read beyond their props, showing the view's page, at
 * `number` among a blog's pages of posts, with each image loading from `src`
 * and each link to the site opening at `address`.
 */
export const viewData = (
  view: SiteView,
  options: {
    readonly number: number;
    readonly src: (media: MediaId) => string;
    readonly address?: (path: string) => string;
  },
) => ({
  ...siteData({
    settings: view.settings,
    identity: view.brand.identity,
    menus: view.parts.menus,
    pages: view.pages,
    forms: view.forms,
    media: (id) => {
      const file = view.media[id];
      return file === undefined
        ? undefined
        : { src: options.src(id), width: file.width, height: file.height };
    },
    ...(options.address !== undefined && { address: options.address }),
  }),
  current: view.page === null ? null : { page: view.page.id, number: options.number },
  motion: view.brand.theme.motion,
});
