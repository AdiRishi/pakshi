import { personOnly } from "@repo/agent/issues";
import type { DraftId, SiteId } from "@repo/contracts/ids";
import type { CheckIssue } from "@repo/contracts/publishing";
import type { BlockContracts } from "@repo/domain/document";
import {
  useAccessEnded,
  useConfirmedRevision,
  useDeselect,
  useDraftClosure,
  useDraftView,
  useOutdated,
  usePage,
  useShowBlock,
} from "@repo/editor";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { type Conversation, isWorking } from "@/features/agent/conversation";

import { ChecksPopover, type PakshiReadiness } from "./checks-popover";
import { fixPlaceOf } from "./issues";
import { checkQuery } from "./queries";

/** How long the checks wait after the last confirmed change before they check the draft again. */
const settle = 800;

/** The draft's revision, once it has stopped changing for a moment. */
const useSettledRevision = () => {
  const revision = useConfirmedRevision();
  const [settled, setSettled] = useState(revision);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(revision), settle);
    return () => clearTimeout(timer);
  }, [revision]);
  return settled;
};

const notOpened = () => toast.error("That page couldn't be opened.");

/**
 * Where going to an issue takes the person: its block or field on this page,
 * or on the page it's on; a page's own settings, which show beside it when
 * nothing on it is selected; Pages and menus; or the site's forms settings.
 */
const useGoTo = (site: SiteId, draft: DraftId) => {
  const view = useDraftView();
  const page = usePage();
  const showBlock = useShowBlock();
  const deselect = useDeselect();
  const navigate = useNavigate();
  return (issue: CheckIssue) => {
    const place = fixPlaceOf(issue, view);
    if (place === null) return null;
    const params = { siteId: site, draftId: draft };
    switch (place.kind) {
      case "canvas": {
        const { target, block, path } = place;
        if (place.page === null || place.page === page)
          return () => showBlock(target, block, path ?? undefined);
        const pageId = place.page;
        return () =>
          navigate({
            to: "/sites/$siteId/drafts/$draftId/pages/$pageId",
            params: { ...params, pageId },
            search: { show: path === null ? { block } : { block, path } },
          }).catch(notOpened);
      }
      case "page": {
        if (place.page === page) return deselect;
        const pageId = place.page;
        return () =>
          navigate({
            to: "/sites/$siteId/drafts/$draftId/pages/$pageId",
            params: { ...params, pageId },
          }).catch(notOpened);
      }
      case "pages":
        return () => navigate({ to: "/sites/$siteId/drafts/$draftId", params }).catch(notOpened);
      case "forms":
        return () =>
          navigate({ to: "/sites/$siteId/settings/forms", params: { siteId: site } }).catch(
            notOpened,
          );
    }
  };
};

/**
 * What the checks find in the draft, in the editor's top bar, checked again
 * as people change it. Fixing them all goes to Pakshi in the chat panel.
 */
export function ChecksButton(props: {
  readonly site: SiteId;
  readonly draft: DraftId;
  readonly contracts: BlockContracts;
  readonly conversation: Conversation;
  /** Shows the chat with Pakshi, so the person sees it work. */
  readonly onShowPakshi: () => void;
}) {
  const checks = useQuery({
    ...checkQuery(props.site, props.draft, useSettledRevision()),
    placeholderData: keepPreviousData,
  });
  const view = useDraftView();
  const page = usePage();
  const goTo = useGoTo(props.site, props.draft);
  const chat = useSyncExternalStore(props.conversation.subscribe, props.conversation.getState);
  const closure = useDraftClosure();
  const accessEnded = useAccessEnded();
  const outdated = useOutdated();
  if (checks.data === undefined) return null;
  const closed = closure !== null || accessEnded || outdated;
  const pakshi: PakshiReadiness = closed
    ? "closed"
    : chat.status === "connecting"
      ? "connecting"
      : chat.status === "closed"
        ? "offline"
        : isWorking(chat)
          ? "working"
          : "ready";
  return (
    <ChecksPopover
      issues={checks.data.issues}
      personOnly={(issue) => personOnly(issue, view, props.contracts)}
      goTo={goTo}
      pakshi={pakshi}
      onFixAll={(message) => {
        props.onShowPakshi();
        props.conversation.send({ _tag: "Send", text: message, sources: [], page, selected: null });
      }}
    />
  );
}
