'use client'

import { useState, useRef } from 'react'
import { Upload, X, User } from 'lucide-react'

interface ProfilePictureUploadProps {
  currentImageUrl?: string
  onImageUpload: (file: File) => Promise<void>
  onImageRemove?: () => void
  uploading?: boolean
  className?: string
}

export function ProfilePictureUpload({
  currentImageUrl,
  onImageUpload,
  onImageRemove,
  uploading = false,
  className = ''
}: ProfilePictureUploadProps) {
  const [preview, setPreview] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (file: File) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => {
        setPreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)
      onImageUpload(file)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const handleRemove = () => {
    setPreview(null)
    if (onImageRemove) onImageRemove()
  }

  const displayImage = preview || currentImageUrl

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-center">
        <div className="relative">
          {/* Profile Picture Display */}
          <div className="w-32 h-32 rounded-full overflow-hidden border-2 border-cp-cyan/30 bg-cp-black/50 flex items-center justify-center">
            {displayImage ? (
              <img
                src={displayImage}
                alt="Profile"
                className="w-full h-full object-cover"
              />
            ) : (
              <User className="w-16 h-16 text-cp-cyan/50" />
            )}
          </div>

          {/* Remove Button */}
          {displayImage && (
            <button
              onClick={handleRemove}
              className="absolute -top-2 -right-2 w-8 h-8 bg-cp-magenta hover:bg-cp-magenta/80 rounded-full flex items-center justify-center transition-colors duration-200"
              disabled={uploading}
              title="Remove profile picture"
              aria-label="Remove profile picture"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          )}

          {/* Upload Overlay */}
          {uploading && (
            <div className="absolute inset-0 bg-cp-black/70 rounded-full flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-cp-cyan border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
        </div>
      </div>

      {/* Upload Area */}
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-all duration-200 cursor-pointer ${
          dragOver
            ? 'border-cp-cyan bg-cp-cyan/10'
            : 'border-cp-cyan/30 hover:border-cp-cyan/50 hover:bg-cp-cyan/5'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
      >
        <Upload className="w-8 h-8 text-cp-cyan mx-auto mb-2" />
        <p className="text-sm text-cp-cyan/80 mb-1">
          {dragOver ? 'Drop image here' : 'Click to upload or drag and drop'}
        </p>
        <p className="text-xs text-cp-cyan/60">
          PNG, JPG, GIF up to 5MB
        </p>
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFileSelect(file)
        }}
        className="hidden"
        disabled={uploading}
        title="Upload profile picture"
        aria-label="Upload profile picture"
      />
    </div>
  )
} 