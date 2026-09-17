import type { ShowroomVisualKey } from "@/lib/showroom-visuals";

export function ShowroomIcon({ type }: { type: ShowroomVisualKey }) {
  const common = {
    width: 116,
    height: 96,
    viewBox: "0 0 116 96",
    role: "img" as const,
    "aria-hidden": true
  };

  if (type === "board-stack" || type === "nesting-stack") {
    const offset = type === "nesting-stack" ? 8 : 0;
    return (
      <svg {...common} className="showroomSvg">
        <defs>
          <linearGradient id={`${type}-wood`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#e8c28f" />
            <stop offset=".52" stopColor="#c88b4f" />
            <stop offset="1" stopColor="#8d552f" />
          </linearGradient>
          <filter id={`${type}-shadow`}><feDropShadow dx="0" dy="5" stdDeviation="4" floodOpacity=".23" /></filter>
        </defs>
        <g filter={`url(#${type}-shadow)`} transform={`translate(${offset} 0)`}>
          {[0, 1, 2, 3].map((i) => (
            <g key={i} transform={`translate(${i * (type === "nesting-stack" ? 3 : 0)} ${60 - i * 13})`}>
              <path d="M18 4 72 4 94 15 40 15Z" fill={`url(#${type}-wood)`} />
              <path d="M40 15 94 15 94 24 40 24Z" fill="#92552f" />
              <path d="M18 4 40 15 40 24 18 13Z" fill="#b8743e" />
              <path d="M26 8 72 8" stroke="#f7d9b3" strokeWidth="1.4" opacity=".7" />
            </g>
          ))}
        </g>
      </svg>
    );
  }

  if (type === "tools") {
    return (
      <svg {...common} className="showroomSvg">
        <defs><filter id="tool-shadow"><feDropShadow dx="0" dy="5" stdDeviation="4" floodOpacity=".25" /></filter></defs>
        <g filter="url(#tool-shadow)" transform="translate(6 5)">
          <path d="M24 18c10-9 20-7 26-1l-12 12 13 13 12-12c6 7 6 17-1 24-7 7-18 7-25 0L17 34c-6-6-6-11 7-16Z" fill="#b9bec4" stroke="#6a6f75" strokeWidth="2" />
          <path d="m50 45 29 29" stroke="#40464c" strokeWidth="12" strokeLinecap="round" />
          <path d="m50 45 29 29" stroke="#7f878d" strokeWidth="6" strokeLinecap="round" />
          <g transform="rotate(39 54 52)">
            <rect x="49" y="14" width="11" height="59" rx="5" fill="#75482d" />
            <rect x="51" y="19" width="7" height="39" rx="3" fill="#d28c4b" />
            <path d="M48 14h13l-2-9h-9Z" fill="#c8cdd1" stroke="#666" />
          </g>
        </g>
      </svg>
    );
  }

  if (type === "waste-bin") {
    return (
      <svg {...common} className="showroomSvg">
        <defs><filter id="bin-shadow"><feDropShadow dx="0" dy="5" stdDeviation="4" floodOpacity=".22" /></filter></defs>
        <g filter="url(#bin-shadow)">
          <path d="M31 29h55l-6 55H37Z" fill="#555b5d" stroke="#303638" strokeWidth="2" />
          <path d="M26 24h65v10H26Z" rx="3" fill="#3b4042" />
          <path d="M42 35v42M57 35v42M72 35v42" stroke="#858b8d" strokeWidth="3" opacity=".6" />
          <path d="m46 28-8-23 8-2 8 25M61 28 60 0l9 1 2 27M75 28l8-24 8 4-9 20" fill="#b57844" stroke="#7d4d2f" strokeWidth="2" />
          <path d="m39 16 9-6M62 13l8-5M80 17l8-6" stroke="#e5b987" strokeWidth="2" />
        </g>
      </svg>
    );
  }

  if (type === "clipboard") {
    return (
      <svg {...common} className="showroomSvg">
        <defs><filter id="clip-shadow"><feDropShadow dx="0" dy="5" stdDeviation="4" floodOpacity=".22" /></filter></defs>
        <g filter="url(#clip-shadow)">
          <rect x="27" y="13" width="62" height="73" rx="7" fill="#b77b42" stroke="#7c4f2c" strokeWidth="2" />
          <rect x="34" y="21" width="48" height="57" rx="3" fill="#fffdf7" />
          <rect x="44" y="5" width="29" height="15" rx="5" fill="#777" />
          <circle cx="58.5" cy="10" r="3" fill="#c8c8c8" />
          <path d="m44 50 9 9 20-25" fill="none" stroke="#4ca96d" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>
    );
  }

  if (type === "warning") {
    return (
      <svg {...common} className="showroomSvg warningSvg">
        <defs><linearGradient id="warn-red" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#ff6b68" /><stop offset="1" stopColor="#c82026" /></linearGradient><filter id="warn-shadow"><feDropShadow dx="0" dy="6" stdDeviation="4" floodOpacity=".28" /></filter></defs>
        <g filter="url(#warn-shadow)">
          <path d="M58 7 104 83H12Z" fill="url(#warn-red)" stroke="#9c151a" strokeWidth="4" strokeLinejoin="round" />
          <path d="M58 22 89 74H27Z" fill="#fff4ef" />
          <rect x="54" y="38" width="8" height="22" rx="4" fill="#c82026" />
          <circle cx="58" cy="67" r="5" fill="#c82026" />
        </g>
      </svg>
    );
  }

  if (type === "hardware") {
    return (
      <svg {...common} className="showroomSvg">
        <defs><linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f1f1ee" /><stop offset=".45" stopColor="#aaa9a3" /><stop offset="1" stopColor="#5e5f60" /></linearGradient><filter id="metal-shadow"><feDropShadow dx="0" dy="5" stdDeviation="4" floodOpacity=".25" /></filter></defs>
        <g filter="url(#metal-shadow)" transform="translate(10 8)">
          <path d="M5 52h39v24H5zM44 43h34v33H44zM77 52h25v24H77z" fill="url(#metal)" stroke="#696a69" strokeWidth="2" />
          <path d="M18 35h26v17H18zM56 26h21v17H56zM85 36h17v16H85z" fill="#c8c8c3" stroke="#737372" strokeWidth="2" />
          {[18,32,56,68,87,96].map((x, i) => <circle key={i} cx={x} cy={i < 2 ? 64 : i < 4 ? 58 : 64} r="4" fill="#414141" />)}
          <path d="M44 43v33M77 52v24" stroke="#f6f6f3" strokeWidth="2" opacity=".65" />
        </g>
      </svg>
    );
  }

  if (type === "edge-roll") {
    return (
      <svg {...common} className="showroomSvg">
        <defs><radialGradient id="roll" cx="40%" cy="35%"><stop stopColor="#efd1a2" /><stop offset=".55" stopColor="#c58449" /><stop offset="1" stopColor="#7a482a" /></radialGradient><filter id="roll-shadow"><feDropShadow dx="0" dy="5" stdDeviation="4" floodOpacity=".22" /></filter></defs>
        <g filter="url(#roll-shadow)">
          <ellipse cx="55" cy="49" rx="38" ry="27" fill="url(#roll)" />
          <ellipse cx="55" cy="49" rx="24" ry="16" fill="#b66f39" />
          <ellipse cx="55" cy="49" rx="12" ry="8" fill="#46301f" />
          <path d="M84 54c15 5 19 13 14 30H85c3-12 0-18-10-22Z" fill="#c5854e" stroke="#8b572f" strokeWidth="2" />
          <path d="M23 41c18-11 47-11 65 0M20 49c19-10 50-10 69 0M23 58c17-8 44-8 62-1" fill="none" stroke="#f3d8b2" strokeWidth="2" opacity=".65" />
        </g>
      </svg>
    );
  }

  return (
    <svg {...common} className="showroomSvg"><rect x="20" y="12" width="76" height="72" rx="18" fill="#ead7bf" /><path d="M39 48h38M58 29v38" stroke="#99663e" strokeWidth="8" strokeLinecap="round" /></svg>
  );
}
