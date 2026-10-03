import React from 'react';
import './dice.css';

interface Props {
  isRolling: boolean;
  result?: number | null;
  faces?: number;
}

export const AnimatedCSSDice: React.FC<Props> = ({ isRolling, result }) => {
  return (
    <div className={`dice-container ${isRolling ? 'rolling' : 'landed'}`}>
      <div className={`dice3d face-${result || 1}`}>
        {/* We can just draw a cube for simplicity, even if it's a D20. Or an Icosahedron if we have the CSS for it. Let's do a simple 3D cube with text. */}
        <div className="dice-face front">{result !== null && !isRolling ? result : '?'}</div>
        <div className="dice-face back"></div>
        <div className="dice-face right"></div>
        <div className="dice-face left"></div>
        <div className="dice-face top"></div>
        <div className="dice-face bottom"></div>
      </div>
    </div>
  );
};
