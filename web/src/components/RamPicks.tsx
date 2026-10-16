const OPTIONS = [4, 6, 8, 12, 16, 24, 32];

export function RamPicks({
  valueMb,
  onChange,
  maxMb
}: {
  valueMb: number;
  onChange: (mb: number) => void;
  maxMb?: number;
}) {
  const gb = Math.round(valueMb / 1024);
  return (
    <div>
      <div className="ram-picks">
        {OPTIONS.filter((size) => !maxMb || size * 1024 <= maxMb).map((size) => (
          <button
            key={size}
            type="button"
            className={`ram-pick ${gb === size ? "active" : ""}`}
            onClick={() => onChange(size * 1024)}
          >
            {size} GB
          </button>
        ))}
      </div>
      <div className="note" style={{ marginTop: 6 }}>
        Server RAM: {gb} GB
      </div>
    </div>
  );
}
