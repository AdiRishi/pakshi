import { useInView, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useEffect, useRef } from "react";

import { useMotion } from "../../components.tsx";
import { cn } from "../cn.ts";

/** A figure as a site writes it, such as "£1.2m" or "3,400+": the number, and the text around it. */
const figureOf = (text: string) => {
  const match = /^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/s.exec(text);
  if (match === null) return null;
  const [, before = "", digits = "", after = ""] = match;
  const decimals = digits.split(".")[1]?.length ?? 0;
  return {
    before,
    after,
    value: Number(digits.replaceAll(",", "")),
    decimals,
    grouped: digits.includes(","),
  };
};

/**
 * Magic UI's number ticker: a figure that counts up from zero as it scrolls
 * into view. The server writes the figure itself, so search engines,
 * screen readers and visitors without motion read the real number. Text
 * that isn't a figure is written as it is.
 */
export const NumberTicker = (props: { readonly text: string; readonly className?: string }) => {
  const moving = useMotion();
  const reduced = useReducedMotion() === true;
  const figure = figureOf(props.text);
  const ref = useRef<HTMLSpanElement>(null);
  const counted = useMotionValue(figure?.value ?? 0);
  const spring = useSpring(counted, { damping: 60, stiffness: 100 });
  const inView = useInView(ref, { once: true });
  const counts = figure !== null && moving && !reduced;

  useEffect(() => {
    if (!counts || !inView) return;
    spring.jump(0);
    counted.jump(0);
    counted.set(figure.value);
  }, [counts, inView, counted, spring, figure?.value]);

  useEffect(() => {
    if (!counts) return;
    const format = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: figure.decimals,
      maximumFractionDigits: figure.decimals,
      useGrouping: figure.grouped,
    });
    return spring.on("change", (latest) => {
      if (ref.current !== null)
        ref.current.textContent = `${figure.before}${format.format(latest)}${figure.after}`;
    });
  }, [counts, spring, figure?.before, figure?.after, figure?.decimals, figure?.grouped]);

  return (
    <span ref={ref} className={cn("inline-block tabular-nums", props.className)}>
      {props.text}
    </span>
  );
};
