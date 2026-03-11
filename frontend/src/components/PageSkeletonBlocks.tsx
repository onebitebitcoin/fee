type PageSkeletonBlocksProps = {
  blocks?: number;
  className?: string;
  containerClassName?: string;
};

export function PageSkeletonBlocks({
  blocks = 1,
  className = 'h-64 bg-dark-300',
  containerClassName = 'space-y-4',
}: PageSkeletonBlocksProps) {
  return (
    <div className={containerClassName}>
      {Array.from({ length: blocks }, (_, index) => (
        <div key={index} className={`animate-pulse ${className}`} />
      ))}
    </div>
  );
}
