'use client'

import { useState } from 'react'

interface BookingCalendarProps {
  onDateSelect: (date: string) => void
  selectedDate: string | null
  bookingDates: string[]
}

export function BookingCalendar({ onDateSelect, selectedDate, bookingDates }: BookingCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]
  
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDayOfWeek = firstDay.getDay()
    
    const days = []
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null)
    }
    
    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day)
    }
    
    return days
  }
  
  const formatDate = (day: number) => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    return new Date(year, month, day).toISOString().split('T')[0]
  }
  
  const hasBookings = (day: number) => {
    const dateStr = formatDate(day)
    return bookingDates.includes(dateStr)
  }
  
  const isSelected = (day: number) => {
    const dateStr = formatDate(day)
    return selectedDate === dateStr
  }
  
  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))
  }
  
  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))
  }
  
  const days = getDaysInMonth(currentMonth)
  
  return (
    <div className="bg-cp-gray/20 border border-cp-cyan/20 rounded-lg p-6">
      <h3 className="text-cp-yellow font-bold text-xl mb-4">Station Booking Calendar</h3>
      
      {/* Calendar Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={goToPreviousMonth}
          className="text-cp-cyan hover:text-cp-yellow text-xl font-bold"
        >
          ←
        </button>
        <h4 className="text-white font-semibold">
          {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </h4>
        <button
          onClick={goToNextMonth}
          className="text-cp-cyan hover:text-cp-yellow text-xl font-bold"
        >
          →
        </button>
      </div>
      
      {/* Days of week header */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="text-center text-gray-400 text-sm py-2">
            {day}
          </div>
        ))}
      </div>
      
      {/* Calendar days */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, index) => (
          <div key={index} className="aspect-square">
            {day ? (
              <button
                onClick={() => onDateSelect(formatDate(day))}
                className={`w-full h-full rounded flex items-center justify-center text-sm transition-colors relative ${
                  isSelected(day)
                    ? 'bg-cp-cyan text-cp-black font-bold'
                    : hasBookings(day)
                    ? 'bg-cp-yellow/20 text-cp-yellow hover:bg-cp-yellow/30'
                    : 'text-gray-300 hover:bg-cp-gray/30'
                }`}
              >
                {day}
                {hasBookings(day) && (
                  <span className="absolute top-1 right-1 w-1 h-1 bg-cp-cyan rounded-full"></span>
                )}
              </button>
            ) : (
              <div></div>
            )}
          </div>
        ))}
      </div>
      
      <div className="mt-4 text-xs text-gray-400 text-center">
        <span className="inline-block w-2 h-2 bg-cp-yellow rounded-full mr-1"></span>
        Days with bookings
      </div>
    </div>
  )
} 