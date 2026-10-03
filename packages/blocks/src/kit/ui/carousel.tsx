import useEmblaCarousel, { type UseEmblaCarouselType } from "embla-carousel-react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import {
  type ComponentProps,
  createContext,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { useEditing } from "../../components.tsx";
import { cn } from "../cn.ts";

/*
 * shadcn/ui's carousel on Embla: a row of slides that drags, snaps, and
 * moves a slide at a time with its buttons or the arrow keys. In the editor
 * it's a plain row that scrolls, so every slide's fields can be reached and
 * dragging selects text instead of moving slides.
 */

type CarouselApi = UseEmblaCarouselType[1];
type CarouselOptions = Parameters<typeof useEmblaCarousel>[0];

interface CarouselState {
  readonly viewport: UseEmblaCarouselType[0] | null;
  readonly scrollPrev: () => void;
  readonly scrollNext: () => void;
  readonly canScrollPrev: boolean;
  readonly canScrollNext: boolean;
}

const CarouselContext = createContext<CarouselState | null>(null);

const useCarousel = () => {
  const state = useContext(CarouselContext);
  if (state === null) throw new Error("Carousel parts render only inside a Carousel.");
  return state;
};

const LiveCarousel = (props: {
  readonly opts: CarouselOptions | undefined;
  readonly label: string;
  readonly className: string | undefined;
  readonly children: ReactNode;
}) => {
  const [viewport, api] = useEmblaCarousel({ align: "start", ...props.opts });
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const scrollPrev = useCallback(() => api?.scrollPrev(), [api]);
  const scrollNext = useCallback(() => api?.scrollNext(), [api]);
  useEffect(() => {
    if (api === undefined) return;
    const update = (current: NonNullable<CarouselApi>) => {
      setCanScrollPrev(current.canScrollPrev());
      setCanScrollNext(current.canScrollNext());
    };
    update(api);
    api.on("reInit", update).on("select", update);
    return () => {
      api.off("reInit", update).off("select", update);
    };
  }, [api]);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      scrollPrev();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      scrollNext();
    }
  };
  return (
    <CarouselContext.Provider
      value={{ viewport, scrollPrev, scrollNext, canScrollPrev, canScrollNext }}
    >
      <section
        aria-roledescription="carousel"
        aria-label={props.label}
        onKeyDownCapture={onKeyDown}
        data-slot="carousel"
        className={cn("relative", props.className)}
      >
        {props.children}
      </section>
    </CarouselContext.Provider>
  );
};

/**
 * A carousel of slides. `CarouselViewport` holds the row, whose element's
 * children are the slides, so a block's slot can be the row.
 */
export const Carousel = (props: {
  readonly opts?: CarouselOptions;
  /** What the carousel shows, for screen readers, such as "Photos". */
  readonly label: string;
  readonly className?: string;
  readonly children: ReactNode;
}) => {
  const editing = useEditing();
  if (editing)
    return (
      <CarouselContext.Provider
        value={{
          viewport: null,
          scrollPrev: () => undefined,
          scrollNext: () => undefined,
          canScrollPrev: false,
          canScrollNext: false,
        }}
      >
        <div data-slot="carousel" className={cn("relative", props.className)}>
          {props.children}
        </div>
      </CarouselContext.Provider>
    );
  return (
    <LiveCarousel opts={props.opts} label={props.label} className={props.className}>
      {props.children}
    </LiveCarousel>
  );
};

/** The carousel's window onto its row. Its one child is the row, whose children are the slides. */
export const CarouselViewport = ({ className, ...props }: ComponentProps<"div">) => {
  const { viewport } = useCarousel();
  return (
    <div
      ref={viewport ?? undefined}
      data-slot="carousel-viewport"
      className={cn(viewport === null ? "overflow-x-auto" : "overflow-hidden", className)}
      {...props}
    />
  );
};

/** The classes a slide takes: it doesn't shrink, and `basis` sets how many show at once. */
export const carouselSlide = "min-w-0 shrink-0 grow-0";

const arrow =
  "inline-flex size-11 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-card transition-[opacity,background-color] hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40";

export const CarouselPrevious = ({
  className,
  label = "Previous",
}: {
  readonly className?: string;
  readonly label?: string;
}) => {
  const { scrollPrev, canScrollPrev, viewport } = useCarousel();
  if (viewport === null) return null;
  return (
    <button
      type="button"
      data-slot="carousel-previous"
      className={cn(arrow, className)}
      disabled={!canScrollPrev}
      onClick={scrollPrev}
    >
      <ChevronLeftIcon aria-hidden className="size-5" />
      <span className="sr-only">{label}</span>
    </button>
  );
};

export const CarouselNext = ({
  className,
  label = "Next",
}: {
  readonly className?: string;
  readonly label?: string;
}) => {
  const { scrollNext, canScrollNext, viewport } = useCarousel();
  if (viewport === null) return null;
  return (
    <button
      type="button"
      data-slot="carousel-next"
      className={cn(arrow, className)}
      disabled={!canScrollNext}
      onClick={scrollNext}
    >
      <ChevronRightIcon aria-hidden className="size-5" />
      <span className="sr-only">{label}</span>
    </button>
  );
};
