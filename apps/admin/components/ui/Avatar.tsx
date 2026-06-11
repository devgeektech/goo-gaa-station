'use client';

function initialsFromName(name?: string | null): string {
  if (!name?.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
  return parts[0]!.slice(0, 2).toUpperCase();
}

export function Avatar({
  src,
  name,
  size = 72,
  radius = 12,
}: {
  src?: string | null;
  name?: string | null;
  size?: number;
  radius?: number;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: 'var(--primary)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: Math.round(size * 0.35),
        flexShrink: 0,
      }}
      aria-hidden
    >
      {initialsFromName(name)}
    </div>
  );
}
