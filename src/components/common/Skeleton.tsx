interface Props {
  className?: string;
  rounded?: 'sm' | 'md' | 'lg' | 'full';
  variant?: 'block' | 'text' | 'circle';
}

const radiusMap = { sm: 'rounded', md: 'rounded-lg', lg: 'rounded-2xl', full: 'rounded-full' };

export default function Skeleton({ className = '', rounded = 'md', variant = 'block' }: Props) {
  const variantClass =
    variant === 'text' ? 'h-4 w-3/4' : variant === 'circle' ? 'h-10 w-10 rounded-full' : '';
  return (
    <span
      role="status"
      aria-hidden="true"
      className={`block animate-pulse-slow bg-space-700/50 motion-reduce:animate-none ${
        variant === 'circle' ? '' : radiusMap[rounded]
      } ${variantClass} ${className}`}
    />
  );
}

export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          className={i === lines - 1 ? 'w-1/2' : ''}
        />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="glass space-y-3 p-4">
      <Skeleton variant="text" className="w-1/3" />
      <SkeletonText lines={3} />
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    </div>
  );
}
