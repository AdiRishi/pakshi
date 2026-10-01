import type { MediaId } from "@repo/contracts/ids";
import type { MediaSummary } from "@repo/contracts/studio";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@repo/ui/components/empty";

/** Images from a library to choose one from. */
export function LibraryPicker(props: {
  readonly title: string;
  /** Which library the images come from, such as "From the brand's library." */
  readonly description: string;
  readonly media: ReadonlyArray<MediaSummary>;
  readonly src: (media: MediaId) => string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onPick: (media: MediaSummary) => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>{props.description}</DialogDescription>
        </DialogHeader>
        {props.media.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>The library is empty</EmptyTitle>
              <EmptyDescription>Images uploaded to the library appear here.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="grid grid-cols-3 gap-3">
            {props.media.map((file) => (
              <li key={file.id}>
                <Button
                  variant="outline"
                  className="h-auto w-full flex-col gap-2 p-2"
                  onClick={() => props.onPick(file)}
                >
                  <img
                    src={props.src(file.id)}
                    alt=""
                    className="aspect-video w-full rounded-sm object-contain"
                  />
                  <span className="w-full truncate text-xs">{file.alt || file.id}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
