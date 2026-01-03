declare module 'react-file-icon' {
  import { FC } from 'react';

  export interface FileIconProps {
    extension?: string;
    type?: string;
    labelColor?: string;
    glyphColor?: string;
    color?: string;
    size?: number | string;
    radius?: number;
    fold?: boolean;
    labelTextColor?: string;
    labelUppercase?: boolean;
    [key: string]: any;
  }

  export const FileIcon: FC<FileIconProps>;
  export const defaultStyles: Record<string, any>;
}

