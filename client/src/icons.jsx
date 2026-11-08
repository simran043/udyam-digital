// Small inline stroke icons, so the UI needs no icon library.
const PATHS = {
  home: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  chat: "M4 5h16v11H8l-4 4zM8 10h.01M12 10h.01M16 10h.01",
  tag: "M3 12V4h8l10 10-8 8zM7.5 7.5h.01",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4",
  truck: "M3 6h11v10H3zM14 10h4l3 3v3h-7zM7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1-4 4-6 8-6s7 2 8 6",
  send: "M4 12l16-8-6 16-2-7z",
  check: "M5 12l5 5 9-10",
  lock: "M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3",
  upload: "M12 16V4M7 9l5-5 5 5M4 16v4h16v-4",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z",
  message: "M4 5h16v11H8l-4 4zM8 10h8",
  wifi: "M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01",
  box: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9",
  cloud: "M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1 0 9z",
  camera: "M3 8h4l2-3h6l2 3h4v11H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
  arrow: "M5 12h14M13 6l6 6-6 6",
};

export default function Icon({ name, size = 20, className = "", strokeWidth = 1.8 }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

// Product category -> icon, used on quote cards and bundle lists.
export const CATEGORY_ICON = {
  Connectivity: "wifi",
  Communication: "phone",
  "Cloud & Productivity": "cloud",
  Security: "shield",
  "IoT & Physical": "camera",
};

// airtel mark: a solid dome on top, with a ribbon that runs down the right
// side and curls back up on the left, leaving an open centre.
const DOME = "M6 23.6C1.8 22.6 1.4 15 6.4 9.4 10.9 4.2 17.4 1.5 23.4 1.5c8.9 0 14.9 5.6 14.4 13.4l-6.4 1.3c.1-3.5-2.7-5.1-6.5-3.1C19.8 15.4 13.2 20.6 8.8 22.7c-1 .5-1.9.8-2.8.9z";
const RIBBON = "M34.6 15.2C34.6 23.5 28.5 31 19 35.8c-4.4 2.2-7.6 1-7.6-3.2 0-3 1-5.6 2.8-8.4";

function Swirl(props) {
  return (
    <g {...props}>
      <path d={DOME} fill="#e40000" />
      <path d={RIBBON} fill="none" stroke="#e40000" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

export function BrandMark({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <Swirl />
    </svg>
  );
}

// Full logo: swirl above the lowercase "airtel" wordmark.
export function BrandLogo() {
  return (
    <svg className="brand-logo" viewBox="0 0 80 70" role="img" aria-label="airtel">
      <Swirl transform="translate(22 0) scale(0.95)" />
      <text
        x="40"
        y="64"
        textAnchor="middle"
        fill="#e40000"
        fontFamily="Inter, Arial, sans-serif"
        fontWeight="600"
        fontSize="23"
        letterSpacing="-0.4"
      >
        airtel
      </text>
    </svg>
  );
}
