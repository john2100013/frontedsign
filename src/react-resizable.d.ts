declare module 'react-resizable' {
  import { Component, CSSProperties, ReactNode } from 'react';

  export interface ResizableProps {
    width: number;
    height: number;
    minConstraints?: [number, number];
    maxConstraints?: [number, number];
    onResize?: (e: React.SyntheticEvent, data: { size: { width: number; height: number } }) => void;
    onResizeStop?: (e: React.SyntheticEvent, data: { size: { width: number; height: number } }) => void;
    onResizeStart?: (e: React.SyntheticEvent, data: { size: { width: number; height: number } }) => void;
    resizeHandles?: ('s' | 'w' | 'e' | 'n' | 'sw' | 'nw' | 'se' | 'ne')[];
    handle?: ReactNode | ((resizeHandle: ResizeHandleAxis) => ReactNode);
    handleSize?: [number, number];
    lockAspectRatio?: boolean;
    axis?: 'both' | 'x' | 'y' | 'none';
    className?: string;
    style?: CSSProperties;
    disabled?: boolean;
    children?: ReactNode;
  }

  export type ResizeHandleAxis = 's' | 'w' | 'e' | 'n' | 'sw' | 'nw' | 'se' | 'ne';

  export class Resizable extends Component<ResizableProps> {}
  
  export default Resizable;
}

