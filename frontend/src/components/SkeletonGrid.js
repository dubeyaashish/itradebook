import React from 'react';

const SkeletonGrid = ({ count = 6 }) => {
  const items = Array.from({ length: count });
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
      {items.map((_, i) => (
        <div key={i} className="skeleton-card"></div>
      ))}
    </div>
  );
};

export default SkeletonGrid;

