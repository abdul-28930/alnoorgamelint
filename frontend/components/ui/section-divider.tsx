interface SectionDividerProps {
  angle?: 'top' | 'bottom'
  className?: string
}

export function SectionDivider({ angle = 'top', className = '' }: SectionDividerProps) {
  const skewClass = angle === 'top' ? '-skew-y-1' : 'skew-y-1'
  
  return (
    <div className={`h-24 bg-gradient-to-r from-cp-yellow via-cp-cyan to-cp-magenta ${skewClass} ${className}`} />
  )
} 