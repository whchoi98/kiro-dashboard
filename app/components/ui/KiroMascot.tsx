'use client';

import { useEffect, useState } from 'react';

interface KiroMascotProps {
  size?: number;
  mood?: 'happy' | 'excited' | 'thinking' | 'alert';
  message?: string;
  animate?: boolean;
}

export default function KiroMascot({
  size = 80,
  mood = 'happy',
  message,
  animate = true,
}: KiroMascotProps) {
  const [bounce, setBounce] = useState(false);
  const [blink, setBlink] = useState(false);

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

    return () => {
      clearInterval(blinkInterval);
      clearInterval(bounceInterval);
    };
  }, [animate]);

  const eyeScaleY = blink ? 0.1 : 1;

  const moodRotation =
    mood === 'excited' ? 'rotate(-5deg)' :
    mood === 'thinking' ? 'rotate(8deg)' :
    mood === 'alert' ? 'rotate(-3deg)' : 'rotate(0deg)';

  const glowColor =
    mood === 'happy' ? '#9046FF' :
    mood === 'excited' ? '#22d3ee' :
    mood === 'thinking' ? '#fbbf24' :
    '#ef4444';

  return (
    <div className="flex items-end gap-3">
      <div
        className="relative"
        style={{
          transform: `${moodRotation} ${bounce ? 'translateY(-4px)' : 'translateY(0)'}`,
          transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
          filter: `drop-shadow(0 0 ${mood === 'excited' ? '12px' : '6px'} ${glowColor}40)`,
        }}
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 1200 1200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect width="1200" height="1200" rx="260" fill="#9046FF" />
          <mask id={`mascot-mask-${size}`} style={{ maskType: 'luminance' }} maskUnits="userSpaceOnUse" x="272" y="202" width="655" height="796">
            <path d="M926.578 202.793H272.637V997.857H926.578V202.793Z" fill="white" />
          </mask>
          <g mask={`url(#mascot-mask-${size})`}>
            <path
              d="M398.554 818.914C316.315 1001.03 491.477 1046.74 620.672 940.156C658.687 1059.66 801.052 970.473 852.234 877.795C964.787 673.567 919.318 465.357 907.64 422.374C827.637 129.443 427.623 128.946 358.8 423.865C342.651 475.544 342.402 534.18 333.458 595.051C328.986 625.86 325.507 645.488 313.83 677.785C306.873 696.424 297.68 712.819 282.773 740.645C259.915 783.881 269.604 867.113 387.87 823.883L399.051 818.914H398.554Z"
              fill="white"
            >
              {animate && mood === 'excited' && (
                <animateTransform
                  attributeName="transform"
                  type="translate"
                  values="0,0; 0,-8; 0,0"
                  dur="0.8s"
                  repeatCount="indefinite"
                />
              )}
            </path>
            <g style={{ transform: `scaleY(${eyeScaleY})`, transformOrigin: '636px 486px', transition: 'transform 0.1s' }}>
              <path
                d="M636.123 549.353C603.328 549.353 598.359 510.097 598.359 486.742C598.359 465.623 602.086 448.977 609.293 438.293C615.504 428.852 624.697 424.131 636.123 424.131C647.555 424.131 657.492 428.852 664.447 438.541C672.398 449.474 676.623 466.12 676.623 486.742C676.623 525.998 661.471 549.353 636.375 549.353H636.123Z"
                fill="black"
              />
            </g>
            <g style={{ transform: `scaleY(${eyeScaleY})`, transformOrigin: '771px 486px', transition: 'transform 0.1s' }}>
              <path
                d="M771.24 549.353C738.445 549.353 733.477 510.097 733.477 486.742C733.477 465.623 737.203 448.977 744.41 438.293C750.621 428.852 759.814 424.131 771.24 424.131C782.672 424.131 792.609 428.852 799.564 438.541C807.516 449.474 811.74 466.12 811.74 486.742C811.74 525.998 796.588 549.353 771.492 549.353H771.24Z"
                fill="black"
              />
            </g>
          </g>
        </svg>

        {mood === 'excited' && (
          <>
            <span className="absolute -top-1 -right-1 text-[10px] animate-ping">✨</span>
            <span className="absolute -top-1 -left-1 text-[10px] animate-ping" style={{ animationDelay: '0.5s' }}>✨</span>
          </>
        )}
        {mood === 'alert' && (
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
        )}
      </div>

      {message && (
        <div className="relative bg-gray-800/80 border border-gray-700 rounded-xl rounded-bl-none px-3 py-2 max-w-[200px]">
          <p className="text-xs text-gray-300 leading-relaxed">{message}</p>
          <div className="absolute -bottom-0 -left-2 w-0 h-0 border-t-8 border-r-8 border-t-transparent border-r-gray-800/80" />
        </div>
      )}
    </div>
  );
}
