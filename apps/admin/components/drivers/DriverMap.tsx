'use client';

import { useEffect, useRef, useState } from 'react';

export type DriverMapProps = {
  /** GeoJSON coordinates [longitude, latitude] */
  coordinates: [number, number] | null;
  driverName?: string;
  className?: string;
  height?: number;
};

export function DriverMap({ coordinates, driverName, className, height = 280 }: DriverMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [MapComponent, setMapComponent] = useState<React.ComponentType<{ coords: [number, number]; name?: string; height: number }> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import('./DriverMapLeaflet').then(({ DriverMapLeaflet }) => {
      if (!cancelled) setMapComponent(() => DriverMapLeaflet);
    }).catch((e) => {
      if (!cancelled) setError(e?.message ?? 'Failed to load map');
    });
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div className={className} style={{ height, background: 'var(--border-light)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
        {error}
      </div>
    );
  }

  if (!coordinates || coordinates.length < 2) {
    return (
      <div className={className} style={{ height, background: 'var(--border-light)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
        No location available
      </div>
    );
  }

  const [lng, lat] = coordinates;
  if (lng == null || lat == null) {
    return (
      <div className={className} style={{ height, background: 'var(--border-light)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
        No location available
      </div>
    );
  }

  return (
    <div ref={containerRef} className={className} style={{ height, borderRadius: 12, overflow: 'hidden' }}>
      {MapComponent ? <MapComponent coords={[lng, lat]} name={driverName} height={height} /> : (
        <div style={{ height: '100%', background: 'var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
          Loading map…
        </div>
      )}
    </div>
  );
}
