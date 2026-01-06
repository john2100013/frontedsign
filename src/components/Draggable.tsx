import { useRef, useEffect, useState, ReactNode, CSSProperties } from 'react';

interface DraggableProps {
  children: ReactNode;
  disabled?: boolean;
  position: { x: number; y: number };
  onStop: (e: MouseEvent, data: { x: number; y: number }) => void;
  defaultPosition?: { x: number; y: number };
}

export function Draggable({ children, disabled = false, position, onStop }: DraggableProps) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(position);
  const dragStateRef = useRef({ startX: 0, startY: 0, initialX: 0, initialY: 0 });

  useEffect(() => {
    setCurrentPosition(position);
  }, [position]);

  useEffect(() => {
    if (disabled || !nodeRef.current) return;

    const node = nodeRef.current;

    const handleMouseDown = (e: MouseEvent) => {
      if (disabled) return;
      
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
      
      dragStateRef.current.startX = e.clientX;
      dragStateRef.current.startY = e.clientY;
      dragStateRef.current.initialX = currentPosition.x;
      dragStateRef.current.initialY = currentPosition.y;

      const handleMouseMove = (e: MouseEvent) => {
        const deltaX = e.clientX - dragStateRef.current.startX;
        const deltaY = e.clientY - dragStateRef.current.startY;
        
        const newX = dragStateRef.current.initialX + deltaX;
        const newY = dragStateRef.current.initialY + deltaY;
        
        setCurrentPosition({ x: newX, y: newY });
      };

      const handleMouseUp = (e: MouseEvent) => {
        setIsDragging(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        
        const finalX = dragStateRef.current.initialX + (e.clientX - dragStateRef.current.startX);
        const finalY = dragStateRef.current.initialY + (e.clientY - dragStateRef.current.startY);
        
        if (onStop) {
          onStop(e, { x: finalX, y: finalY });
        }
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    };

    node.addEventListener('mousedown', handleMouseDown);

    return () => {
      node.removeEventListener('mousedown', handleMouseDown);
    };
  }, [disabled, currentPosition, onStop]);

  const style: CSSProperties = {
    position: 'absolute',
    left: `${currentPosition.x}px`,
    top: `${currentPosition.y}px`,
    cursor: disabled ? 'default' : isDragging ? 'grabbing' : 'grab',
    userSelect: 'none',
    zIndex: isDragging ? 1000 : 'auto',
  };

  return (
    <div ref={nodeRef} style={style}>
      {children}
    </div>
  );
}

