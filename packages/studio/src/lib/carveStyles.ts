import type React from 'react';

/**
 * Shared card container style for Carve gallery cards.
 *
 * @param isDeleted - when true the card is dimmed (opacity 0.4)
 * @param borderColor - override the default border colour (#283040).
 *   Pass '#3d2b00' for the RawFragmentCard amber/warning variant.
 */
export function makeCardStyle(
  isDeleted: boolean,
  borderColor = '#283040',
): React.CSSProperties {
  return {
    padding: '1rem',
    border: `1px solid ${borderColor}`,
    borderRadius: '6px',
    background: '#0d1117',
    opacity: isDeleted ? 0.4 : 1,
  };
}

/**
 * Shared heading style for Carve gallery cards.
 *
 * @param isDeleted - when true the heading gets a line-through decoration.
 */
export function makeHeadingStyle(isDeleted: boolean): React.CSSProperties {
  return {
    margin: '0 0 0.25rem',
    fontSize: '1rem',
    textDecoration: isDeleted ? 'line-through' : 'none',
    color: '#e6edf3',
  };
}
