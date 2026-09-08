/** Presentation-only motion; article output is never animated or modified. */
export function initMotion() {
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  const running = new Set<Animation>();
  let observer: IntersectionObserver | undefined;
  const animate = (element: Element, delay = 0) => {
    if (preference.matches || typeof element.animate !== "function") return;
    const animation = element.animate(
      [
        { opacity: 0, translate: "0 18px" },
        { opacity: 1, translate: "0 0" },
      ],
      {
        duration: 600,
        delay,
        easing: "cubic-bezier(.2,.7,.2,1)",
        fill: "backwards",
      },
    );
    running.add(animation);
    animation.onfinish = () => running.delete(animation);
  };
  const stop = () => {
    observer?.disconnect();
    running.forEach((animation) => animation.cancel());
    running.clear();
    document.documentElement.classList.remove("motion-ready");
  };
  const onPreference = () => {
    if (preference.matches) stop();
  };
  const onVisibility = () => {
    if (document.hidden) stop();
  };
  if (!preference.matches) {
    document.documentElement.classList.add("motion-ready");
    document
      .querySelectorAll(".hero-copy > *")
      .forEach((item, i) => animate(item, i * 65));
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            // Content stays visible until observed, including keyboard/anchor navigation.
            if (!entry.target.contains(document.activeElement))
              animate(entry.target);
            observer?.unobserve(entry.target);
          });
        },
        { threshold: 0.12 },
      );
      document
        .querySelectorAll(".rule-card, .section-top")
        .forEach((item) => observer!.observe(item));
    }
  }
  preference.addEventListener("change", onPreference);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    stop();
    preference.removeEventListener("change", onPreference);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
