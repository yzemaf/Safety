import React from 'react';
import * as Flags from 'country-flag-icons/react/3x2';

interface CountryFlagProps {
  code?: string;
  size?: number;
  style?: React.CSSProperties;
  className?: string;
}

/**
 * High-definition Vector SVG Country Flag Component
 * Renders authentic national flags across all operating systems and browsers (including Windows)
 */
export const CountryFlag: React.FC<CountryFlagProps> = ({
  code,
  size = 14,
  style,
  className,
}) => {
  if (!code || code === 'ALL' || code === 'GLOBAL') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: `${size}px`,
          lineHeight: 1,
          verticalAlign: 'middle',
          ...style,
        }}
        className={className}
      >
        🌐
      </span>
    );
  }

  const upper = code.toUpperCase();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const FlagSvg = (Flags as any)[upper];

  const width = Math.round(size * 1.35);
  const height = size;

  if (FlagSvg) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          verticalAlign: 'middle',
          borderRadius: '2px',
          overflow: 'hidden',
          width: `${width}px`,
          height: `${height}px`,
          boxShadow: '0 0 1px rgba(15, 23, 42, 0.4)',
          flexShrink: 0,
          ...style,
        }}
        className={className}
        title={upper}
      >
        <FlagSvg style={{ width: '100%', height: '100%', display: 'block' }} />
      </span>
    );
  }

  // Graceful CDN fallback if country code is exotic/special
  return (
    <img
      src={`https://flagcdn.com/24x18/${code.toLowerCase()}.png`}
      alt={code}
      style={{
        display: 'inline-block',
        width: `${width}px`,
        height: `${height}px`,
        borderRadius: '2px',
        objectFit: 'cover',
        verticalAlign: 'middle',
        boxShadow: '0 0 1px rgba(15, 23, 42, 0.4)',
        flexShrink: 0,
        ...style,
      }}
      className={className}
    />
  );
};
