interface InfoCardProps {
  title: string
  description: string
  image?: string
  price?: string
  className?: string
}

export function InfoCard({ title, description, image, price, className = '' }: InfoCardProps) {
  return (
    <div className={`clip-angled bg-cp-gray border border-white/10 p-6 hover:border-cp-cyan/50 hover:-translate-y-1 transition-all duration-300 ${className}`}>
      {image && (
        <div className="aspect-video bg-cp-black/50 rounded mb-4 overflow-hidden">
          <img 
            src={image} 
            alt={title}
            className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
          />
        </div>
      )}
      
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-xl font-bold text-cp-yellow">{title}</h3>
        {price && (
          <span className="text-cp-cyan font-semibold">₹{price}/hr</span>
        )}
      </div>
      
      <p className="text-gray-300 text-sm leading-relaxed">{description}</p>
    </div>
  )
} 