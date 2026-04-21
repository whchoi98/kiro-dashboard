interface KiroIconProps {
  size?: number;
  className?: string;
}

export default function KiroIcon({ size = 24, className }: KiroIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect rx="16" width="100" height="100" fill="#f97316" />
      <path
        d="M30 70V30h10v16l16-16h13L51 48l20 22H57L42 54v16H30z"
        fill="white"
      />
    </svg>
  );
}
