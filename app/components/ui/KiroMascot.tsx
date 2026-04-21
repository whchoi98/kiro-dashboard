'use client';

import { useEffect, useState, useId } from 'react';

type KiroTheme = 'dashboard' | 'users' | 'trends' | 'credits' | 'productivity' | 'engagement';

interface KiroMascotProps {
  size?: number;
  mood?: 'happy' | 'excited' | 'thinking' | 'alert';
  theme?: KiroTheme;
  message?: string;
  animate?: boolean;
}

export default function KiroMascot({
  size = 80,
  mood = 'happy',
  theme = 'dashboard',
  message,
  animate = true,
}: KiroMascotProps) {
  const [bounce, setBounce] = useState(false);
  const [blink, setBlink] = useState(false);
  const [wave, setWave] = useState(0);
  const maskId = useId();

  useEffect(() => {
    if (!animate) return;
    const blinkInterval = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 150);
    }, 3000 + Math.random() * 2000);

    const bounceInterval = setInterval(() => {
      setBounce(true);
      setTimeout(() => setBounce(false), 600);
    }, 5000 + Math.random() * 3000);

    const waveInterval = setInterval(() => {
      setWave((prev) => (prev + 1) % 360);
    }, 50);

    return () => {
      clearInterval(blinkInterval);
      clearInterval(bounceInterval);
      clearInterval(waveInterval);
    };
  }, [animate]);

  const eyeScaleY = blink ? 0.1 : 1;
  const glowColor =
    theme === 'dashboard' ? '#9046FF' :
    theme === 'users' ? '#6366f1' :
    theme === 'trends' ? '#0ea5e9' :
    theme === 'credits' ? '#22d3ee' :
    theme === 'productivity' ? '#22c55e' :
    '#ec4899';

  const floatY = Math.sin(wave * 0.05) * 2;
  const accessoryBob = Math.sin(wave * 0.08) * 3;
  const sparkle = Math.sin(wave * 0.1) > 0.7;

  return (
    <div className="flex items-end gap-3">
      <div
        className="relative"
        style={{
          transform: `translateY(${bounce ? -4 : floatY}px)`,
          transition: bounce ? 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' : 'none',
          filter: `drop-shadow(0 0 8px ${glowColor}50)`,
        }}
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 200 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Background circle glow */}
          <circle cx="100" cy="105" r="70" fill={`${glowColor}08`} />

          {/* Kiro body */}
          <g transform="translate(50, 30) scale(0.105)">
            <mask id={maskId} style={{ maskType: 'luminance' }} maskUnits="userSpaceOnUse" x="272" y="202" width="655" height="796">
              <path d="M926.578 202.793H272.637V997.857H926.578V202.793Z" fill="white" />
            </mask>
            <g mask={`url(#${maskId})`}>
              <path
                d="M398.554 818.914C316.315 1001.03 491.477 1046.74 620.672 940.156C658.687 1059.66 801.052 970.473 852.234 877.795C964.787 673.567 919.318 465.357 907.64 422.374C827.637 129.443 427.623 128.946 358.8 423.865C342.651 475.544 342.402 534.18 333.458 595.051C328.986 625.86 325.507 645.488 313.83 677.785C306.873 696.424 297.68 712.819 282.773 740.645C259.915 783.881 269.604 867.113 387.87 823.883L399.051 818.914H398.554Z"
                fill="white"
              />
              {/* Left eye */}
              <g style={{ transform: `scaleY(${eyeScaleY})`, transformOrigin: '636px 486px', transition: 'transform 0.1s' }}>
                <path d="M636.123 549.353C603.328 549.353 598.359 510.097 598.359 486.742C598.359 465.623 602.086 448.977 609.293 438.293C615.504 428.852 624.697 424.131 636.123 424.131C647.555 424.131 657.492 428.852 664.447 438.541C672.398 449.474 676.623 466.12 676.623 486.742C676.623 525.998 661.471 549.353 636.375 549.353H636.123Z" fill="black" />
              </g>
              {/* Right eye */}
              <g style={{ transform: `scaleY(${eyeScaleY})`, transformOrigin: '771px 486px', transition: 'transform 0.1s' }}>
                <path d="M771.24 549.353C738.445 549.353 733.477 510.097 733.477 486.742C733.477 465.623 737.203 448.977 744.41 438.293C750.621 428.852 759.814 424.131 771.24 424.131C782.672 424.131 792.609 428.852 799.564 438.541C807.516 449.474 811.74 466.12 811.74 486.742C811.74 525.998 796.588 549.353 771.492 549.353H771.24Z" fill="black" />
              </g>
            </g>
          </g>

          {/* Theme-specific accessories */}
          {theme === 'dashboard' && (
            <g transform={`translate(0, ${accessoryBob})`}>
              {/* Mini dashboard grid Kiro is holding */}
              <rect x="130" y="55" width="42" height="32" rx="4" fill={glowColor} opacity="0.9" />
              <rect x="134" y="59" width="16" height="11" rx="2" fill="white" opacity="0.8" />
              <rect x="152" y="59" width="16" height="11" rx="2" fill="white" opacity="0.5" />
              <rect x="134" y="72" width="16" height="11" rx="2" fill="white" opacity="0.5" />
              <rect x="152" y="72" width="16" height="11" rx="2" fill="white" opacity="0.8" />
              {/* Holding arm line */}
              <line x1="118" y1="78" x2="130" y2="71" stroke="white" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
            </g>
          )}

          {theme === 'users' && (
            <g transform={`translate(0, ${accessoryBob})`}>
              {/* User icons / leaderboard */}
              <circle cx="148" cy="48" r="8" fill={glowColor} opacity="0.9" />
              <circle cx="148" cy="48" r="5" fill="white" opacity="0.8" />
              <circle cx="165" cy="55" r="6" fill={glowColor} opacity="0.7" />
              <circle cx="165" cy="55" r="4" fill="white" opacity="0.6" />
              <circle cx="155" cy="68" r="5" fill={glowColor} opacity="0.5" />
              <circle cx="155" cy="68" r="3" fill="white" opacity="0.5" />
              {/* Trophy / medal */}
              <path d="M140 82 L146 76 L152 82 L146 88Z" fill="#fbbf24" opacity="0.9" />
              {sparkle && <circle cx="146" cy="76" r="2" fill="#fbbf24" opacity="0.8" />}
            </g>
          )}

          {theme === 'trends' && (
            <g transform={`translate(0, ${accessoryBob})`}>
              {/* Upward trend chart */}
              <polyline
                points="128,85 138,75 148,78 158,62 168,55"
                stroke={glowColor}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                opacity="0.9"
              />
              {/* Arrow tip */}
              <polygon points="168,55 162,55 168,49" fill={glowColor} opacity="0.9" />
              {/* Dot on chart */}
              <circle cx="158" cy="62" r="3" fill="white" opacity="0.8" />
              {sparkle && <circle cx="168" cy="52" r="2" fill={glowColor} />}
            </g>
          )}

          {theme === 'credits' && (
            <g transform={`translate(0, ${accessoryBob})`}>
              {/* Coins / credit symbol */}
              <circle cx="150" cy="55" r="14" fill={glowColor} opacity="0.9" />
              <circle cx="150" cy="55" r="10" fill="none" stroke="white" strokeWidth="2" opacity="0.8" />
              <text x="150" y="60" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold" opacity="0.9">C</text>
              {/* Smaller coin behind */}
              <circle cx="162" cy="70" r="9" fill={glowColor} opacity="0.5" />
              <text x="162" y="74" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold" opacity="0.6">C</text>
              {sparkle && (
                <>
                  <circle cx="140" cy="45" r="2" fill="#fbbf24" opacity="0.7" />
                  <circle cx="170" cy="60" r="1.5" fill="#fbbf24" opacity="0.5" />
                </>
              )}
            </g>
          )}

          {theme === 'productivity' && (
            <g transform={`translate(0, ${accessoryBob})`}>
              {/* Code brackets / terminal */}
              <rect x="130" y="48" width="46" height="34" rx="4" fill="#1e293b" stroke={glowColor} strokeWidth="2" opacity="0.9" />
              {/* Code lines */}
              <line x1="136" y1="57" x2="148" y2="57" stroke={glowColor} strokeWidth="2" strokeLinecap="round" opacity="0.8" />
              <line x1="140" y1="63" x2="160" y2="63" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
              <line x1="136" y1="69" x2="153" y2="69" stroke={glowColor} strokeWidth="2" strokeLinecap="round" opacity="0.6" />
              <line x1="140" y1="75" x2="170" y2="75" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
              {/* Cursor blink */}
              {sparkle && <rect x="154" y="55" width="2" height="10" fill={glowColor} opacity="0.9" />}
            </g>
          )}

          {theme === 'engagement' && (
            <g transform={`translate(0, ${accessoryBob})`}>
              {/* Chat bubbles */}
              <rect x="132" y="48" width="30" height="20" rx="8" fill={glowColor} opacity="0.9" />
              <polygon points="140,68 144,68 136,74" fill={glowColor} opacity="0.9" />
              <circle cx="141" cy="58" r="2" fill="white" opacity="0.8" />
              <circle cx="147" cy="58" r="2" fill="white" opacity="0.8" />
              <circle cx="153" cy="58" r="2" fill="white" opacity="0.8" />
              {/* Second bubble */}
              <rect x="150" y="72" width="24" height="16" rx="6" fill="white" opacity="0.5" />
              <circle cx="158" cy="80" r="1.5" fill={glowColor} opacity="0.6" />
              <circle cx="163" cy="80" r="1.5" fill={glowColor} opacity="0.6" />
              {sparkle && <circle cx="170" cy="70" r="2" fill={glowColor} opacity="0.7" />}
            </g>
          )}
        </svg>

        {/* Sparkle effects */}
        {animate && (
          <>
            <span
              className="absolute -top-1 right-0 text-[8px] transition-opacity duration-300"
              style={{ opacity: sparkle ? 1 : 0 }}
            >
              ✨
            </span>
            {mood === 'alert' && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            )}
          </>
        )}
      </div>

      {message && (
        <div className="relative bg-gray-800/80 border border-gray-700 rounded-xl rounded-bl-none px-3 py-2 max-w-[200px]">
          <p className="text-xs text-gray-300 leading-relaxed">{message}</p>
        </div>
      )}
    </div>
  );
}
