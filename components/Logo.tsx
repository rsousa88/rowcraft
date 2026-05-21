interface Props {
  size?: number;
  showWordmark?: boolean;
}

export function Logo({ size = 24, showWordmark = true }: Props) {
  return (
    <span className="flex items-center gap-2 select-none">
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect width="100" height="100" rx="22" fill="#059669" />
        <rect width="100" height="52" rx="22" fill="white" fillOpacity="0.07" />
        <rect x="12" y="11" width="76" height="17" rx="3.5" fill="white" fillOpacity="0.22" />
        <rect x="37" y="12" width="1" height="15" fill="#059669" fillOpacity="0.6" />
        <rect x="61" y="12" width="1" height="15" fill="#059669" fillOpacity="0.6" />
        <rect x="12" y="34" width="54" height="15" rx="3" fill="white" fillOpacity="0.92" />
        <rect x="12" y="54" width="68" height="15" rx="3" fill="white" fillOpacity="0.68" />
        <rect x="12" y="74" width="40" height="15" rx="3" fill="white" fillOpacity="0.42" />
      </svg>
      {showWordmark && (
        <span className="font-semibold tracking-tight">Rowcraft</span>
      )}
    </span>
  );
}
