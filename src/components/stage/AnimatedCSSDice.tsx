import React from 'react';
import './dice.css';

interface Props {
  isRolling: boolean;
  result?: number | null;
  faces?: number;
  isCriticalSuccess?: boolean;
  isCriticalFailure?: boolean;
}

export const AnimatedCSSDice: React.FC<Props> = ({ 
  isRolling, 
  result, 
  isCriticalSuccess, 
  isCriticalFailure 
}) => {
  let containerClasses = `dice-container ${isRolling ? 'rolling' : 'landed'}`;
  if (!isRolling && isCriticalSuccess) containerClasses += ' critical-success';
  if (!isRolling && isCriticalFailure) containerClasses += ' critical-failure';

  return (
    <div className={containerClasses}>
      <div className="dice-shadow"></div>
      <div className={`dice3d face-${result || 1}`}>
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
