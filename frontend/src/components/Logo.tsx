import { type FC } from 'react';
import logoImg from '@/assets/logo-filorag-bordered.png';

interface LogoProps {
  className?: string;
  collapsed?: boolean;
}

export const Logo: FC<LogoProps> = ({ className, collapsed = false }) => {
  return (
    <div className={`flex items-center ${className || ''}`}>
      {collapsed
        ? <img src={logoImg} alt="FiloRag" className="w-9 h-9 object-contain" />
        : <img src={logoImg} alt="FiloRag" className="h-9 w-auto object-contain" />
      }
    </div>
  );
};