import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";

type RevealProps = {
  children: ReactNode;
  className?: string;
  /** Extra delay in ms, used to stagger siblings into a cascade. */
  delay?: number;
  /** Element to render. Defaults to a div; pass "section" to reveal a section in place. */
  as?: ElementType;
  /** How far up from the viewport bottom the trigger line sits, as a CSS length/percent. */
  margin?: string;
};

/**
 * Scroll-into-view reveal. Fades and lifts its children the first time they
 * cross into the viewport, then stops (once-only, never re-fires on scroll-up).
 * Transform + opacity only so it composites on the GPU; honors
 * prefers-reduced-motion by rendering visible with no motion.
 */
export const Reveal = ({
  children,
  className = "",
  delay = 0,
  as,
  margin = "-12%",
}: RevealProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    // Trigger as soon as any part of the element crosses a line `margin` up
    // from the viewport bottom. Height-independent, so tall sections fire on
    // entry instead of waiting until a fixed fraction is visible.
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          obs.disconnect();
        }
      },
      { threshold: 0, rootMargin: `0px 0px ${margin} 0px` },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [margin]);

  const Tag = (as ?? "div") as ElementType;
  return (
    <Tag
      ref={ref}
      data-reveal
      data-shown={shown ? "true" : "false"}
      style={{ transitionDelay: shown ? `${delay}ms` : "0ms" }}
      className={className}
    >
      {children}
    </Tag>
  );
};
