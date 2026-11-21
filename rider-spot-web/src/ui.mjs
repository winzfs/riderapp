// Shared presentation primitives. No persistence or network calls.
export const icons = {
  map: "M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3zm0-15v15m6-12v15",
  route:
    "M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm12 12a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM9 6h7a4 4 0 0 1 0 8H8a4 4 0 0 0 0 8",
  work: "M8 6V4h8v2M3 7h18v13H3V7zm0 6h18m-11 0v3h4v-3",
  community: "M21 11a8 8 0 0 1-8 8H7l-4 3V11a9 9 0 0 1 18 0zM7 10h10m-10 4h6",
  user: "M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21v-2a8 8 0 0 1 16 0v2",
  riders:
    "M4 16a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm16 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM4 19l5-8h6l5 8M9 11l3 8h8M8 7h4m3-4h3l2 9",
  shelters: "M4 3h16v18H4zM8 8h8m-8 4h8m-8 4h8",
  shops:
    "M14 3a6 6 0 0 0-7 8L2 16a3 3 0 0 0 4 4l6-6a6 6 0 0 0 8-7l-4 4-4-4 4-4z",
  roads: "M12 3L2 21h20L12 3zm0 6v5m0 3v1",
  places:
    "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0zM12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  earnings: "M4 5h16v15H4zM4 9h16m-6 4h6m-6 3h6",
  fuel: "M4 3h9v18H4zM4 9h9m0 3h2v6a2 2 0 0 0 4 0V8l-3-3",
  analysis: "M3 3v18h18M7 16v-4m5 4V7m5 9v-7",
  sos: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 5v5m0 3v1",
  report: "M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11zm0-15a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 2v4m0 2h.01",
  lifebuoy: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM5.6 5.6l3.6 3.6m5.6 5.6 3.6 3.6M18.4 5.6l-3.6 3.6m-5.6 5.6-3.6 3.6",
  "status-none": "M5 12h14",
  "status-chat": "M4 5h16v12H8l-4 3V5zm4 5h8m-8 4h5",
  "status-working": "M5 17a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm14 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM5 20l5-9h6l3 9M9 11h5",
  "status-break": "M4 7h13v8a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V7zm13 2h2a3 3 0 0 1 0 6h-2M7 3h8",
  "status-help": "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-15v2m0 8v2M6 12h2m8 0h2m-6-1v4",
  shortcuts: "M5 12h14m-6-6 6 6-6 6",
  play: "M7 4l14 8-14 8V4z",
  pause: "M8 4v16M16 4v16",
  reset: "M3 10a9 9 0 1 1 1 8M3 4v6h6",
  lock: "M6 10h12v11H6zM8 10V6a4 4 0 0 1 8 0v4",
  gauge: "M4 18a9 9 0 1 1 16 0M12 14l4-5M7 18h10M12 18h.01",
  oil: "M5 8l5-4h6l4 6v8H4V9l5-1m6-3v5m-7 5h8m1-10h3",
  tire: "M12 2a8 8 0 0 1 8 8v4a8 8 0 0 1-16 0v-4a8 8 0 0 1 8-8zm0 4v12m-5-9h10M7 15h10",
  brake: "M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm0 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM12 3v2m0 14v2",
  battery: "M3 7h16v12H3V7zm16 4h2v4h-2M7 5h3m4 0h3M7 13h5m-2-2v4m4-2h3",
  belt: "M8 4a4 4 0 0 0 0 16m8-16a4 4 0 0 1 0 16M8 4h8m-8 16h8m-8-12v8m8-8v8",
  history: "M3 11a9 9 0 1 1 2 6M3 5v6h6m3-5v6l4 2",
  edit: "M4 20l5-.5L20 8l-4-4L5 15l-1 5zm9-13 4 4",
  settings: "M4 7h16M4 17h16M9 4v6m6 4v6",
  check: "M4 12l5 5L20 6",
  chevron: "M9 5l7 7-7 7",
  calendar: "M4 6h16v15H4V6zm4-3v6m8-6v6M4 11h16",

};
export function iconMarkup(name, size = 22) {
  return `<svg class="rs-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[name] || icons.work}"/></svg>`;
}
export function createUI(React) {
  const h = React.createElement;
  function Icon({ name, size = 22 }) {
    return h(
      "svg",
      {
        className: "rs-icon",
        width: size,
        height: size,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.7,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": true,
      },
      h("path", { d: icons[name] || icons.work }),
    );
  }
  function Metrics({ items, label }) {
    return h(
      "dl",
      { className: "rs-metrics", "aria-label": label },
      ...items.map(([name, value, unit]) =>
        h(
          "div",
          { key: name },
          h("dt", null, name),
          h("dd", null, value, unit ? h("small", null, " " + unit) : null),
        ),
      ),
    );
  }
  function Skeleton({ label = "불러오는 중" }) {
    return h(
      "div",
      { className: "rs-skeleton", role: "status", "aria-label": label },
      h("span", { className: "sr-only" }, label),
      ...Array.from({ length: 3 }, (_, i) =>
        h("div", { key: i, "aria-hidden": true }, h("i"), h("i"), h("i")),
      ),
    );
  }
  function DialogSurface({ children, onClose }) {
    const ref = React.useRef(null),
      close = React.useRef(onClose);
    close.current = onClose;
    React.useEffect(() => {
      const node = ref.current,
        previous = document.activeElement,
        overflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const focusable = () =>
        [
          ...node.querySelectorAll(
            'button:not(:disabled),a[href],input:not(:disabled),select,textarea,[tabindex="0"]',
          ),
        ].filter((el) => el.getClientRects().length);
      (focusable()[0] || node).focus();
      const key = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          close.current?.();
        }
        if (e.key === "Tab") {
          const items = focusable(),
            first = items[0],
            last = items.at(-1);
          if (!first) {
            e.preventDefault();
            return;
          }
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };
      node.addEventListener("keydown", key);
      const unregister = window.__rsNavigation?.registerLayer("app-modal", () => close.current?.());
      return () => {
        unregister?.();
        node.removeEventListener("keydown", key);
        document.body.style.overflow = overflow;
        if (previous?.isConnected) previous.focus();
      };
    }, []);
    return h(
      "div",
      {
        className: "modal-backdrop",
        ref,
        onClick: (e) => {
          if (e.target === e.currentTarget) close.current?.();
        },
      },
      children,
    );
  }
  return { Icon, Metrics, Skeleton, DialogSurface };
}
