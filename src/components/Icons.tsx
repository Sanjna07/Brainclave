/**
 * Icons.tsx — Self-contained inline SVG icon set for Brainclave.
 * Replaces any external lucide-react / react-icons dependency entirely.
 * All icons accept size (px) and className props.
 */

import React from 'react';

interface IconProps {
  size?: number;
  className?: string;
  color?: string;
  style?: React.CSSProperties;
}

const icon = (path: string | string[], viewBox = '0 0 24 24') =>
  ({ size = 20, className, color = 'currentColor', style }: IconProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {Array.isArray(path) ? path.map((d, i) => <path key={i} d={d} />) : <path d={path} />}
    </svg>
  );

const iconCircle = (paths: string[], circles?: { cx: number; cy: number; r: number }[]) =>
  ({ size = 20, className, color = 'currentColor', style }: IconProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {paths.map((d, i) => <path key={i} d={d} />)}
      {circles?.map((c, i) => <circle key={i} cx={c.cx} cy={c.cy} r={c.r} />)}
    </svg>
  );

// ─── Navigation Icons ────────────────────────────────────────────────────────
export const History = icon('M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M12 7v5l4 2');
export const MessageSquare = icon('M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z');
export const Camera = iconCircle(['M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z'], [{ cx: 12, cy: 13, r: 3 }]);
export const Mic = iconCircle(['M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8'], []);
export const Wrench = icon('M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z');
export const FileText = icon(['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M16 13H8', 'M16 17H8', 'M10 9H8']);

// ─── Memory Panel Icons ───────────────────────────────────────────────────────
export const Book = icon(['M4 19.5A2.5 2.5 0 0 1 6.5 17H20', 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z']);
export const CheckCircle = iconCircle(['M22 11.08V12a10 10 0 1 1-5.93-9.14', 'M22 4 12 14.01l-3-3'], []);
export const AlertTriangle = icon('M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01');
export const Clock = iconCircle(['M12 8v4l3 3'], [{ cx: 12, cy: 12, r: 10 }]);

// ─── Notes Panel Icons ────────────────────────────────────────────────────────
export const LayoutTemplate = icon(['M21 3H3v7h18V3z', 'M21 14h-5v7h5v-7z', 'M12 14H3v7h9v-7z']);

// ─── Task/Deadline Icons ──────────────────────────────────────────────────────
export const Calendar = iconCircle(['M3 4h18v18H3z', 'M16 2v4', 'M8 2v4', 'M3 10h18'], []);

// ─── Voice / Media Icons ──────────────────────────────────────────────────────
export const Video = icon(['M15 10l4.553-2.069A1 1 0 0 1 21 8.82v6.36a1 1 0 0 1-1.447.89L15 14', 'M3 8a2 2 0 0 1 2-2h8a2 2 0 1 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z']);

// ─── Utility Icons ────────────────────────────────────────────────────────────
export const Wand2 = icon(['m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z', 'M14 7l3 3', 'M5 6v4', 'M19 14v4', 'M10 2v2', 'M7 8H3', 'M21 16h-4', 'M11 3H9']);
export const Loader2 = ({ size = 20, className, color = 'currentColor', style }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);
