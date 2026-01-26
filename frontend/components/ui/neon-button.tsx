interface NeonButtonProps {
  children: React.ReactNode
  variant?: 'primary' | 'secondary'
  onClick?: () => void
  disabled?: boolean
  className?: string
}

export function NeonButton({ 
  children, 
  variant = 'primary', 
  onClick, 
  disabled = false,
  className = ''
}: NeonButtonProps) {
  const baseClasses = 'clip-angled px-6 py-3 font-bold uppercase tracking-wide transition-all duration-200 hover:scale-105'
  
  const variantClasses = {
    primary: 'bg-cp-yellow text-cp-black border-2 border-cp-yellow hover:shadow-neon',
    secondary: 'bg-transparent text-cp-yellow border-2 border-cp-yellow hover:bg-cp-yellow hover:text-cp-black'
  }

  const disabledClasses = disabled ? 'opacity-40 cursor-not-allowed hover:scale-100 hover:shadow-none' : ''

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses[variant]} ${disabledClasses} ${className}`}
    >
      {children}
    </button>
  )
} 