# 🎮 Noor Gaming Lab - Gaming Center Management System

A comprehensive gaming center booking and management platform built with modern web technologies.

## 🚀 Overview

Noor Gaming Lab is a full-stack gaming center management system that allows customers to book gaming stations (PS5 and PC) and provides administrators with powerful tools to manage bookings, users, analytics, and more.

## 🛠️ Tech Stack

### Frontend
- **Framework**: Next.js 14 with TypeScript
- **Styling**: Tailwind CSS with custom cyberpunk theme
- **UI Components**: Custom component library with neon styling
- **Authentication**: Supabase Auth
- **State Management**: React Hooks

### Backend
- **Framework**: Next.js Route Handlers (`frontend/app/api/v1/...`), the same app as the website, so there is one deploy
- **Database**: PostgreSQL with Supabase (business rules that must be atomic live in SQL functions)
- **Authentication**: Supabase JWTs, verified on every request, with role-based access (user / staff / admin)
- **Deployment**: Vercel (plus a free scheduler for reminder emails, see `documentation/reminders-cron.md`)

### Database
- **Primary**: Supabase (PostgreSQL)
- **Features**: Row Level Security (RLS), Real-time subscriptions, Cloud storage

## ✨ Features

### 🎯 User Features

#### Authentication & Profile Management
- **User Registration**: Email, username, full name, and phone number (required)
- **Login System**: Support for both email and username login
- **Profile Management**: Update personal info, upload profile pictures
- **Account Security**: Secure password handling and session management

#### Gaming Station Booking
- **Station Types**: PS5 and PC gaming rigs with different hourly rates
- **Real-time Availability**: Live station availability checking
- **Flexible Booking**: Choose date, time slots, and duration
- **Multiple Users**: Support for group bookings (multiple users per session)
- **Food Orders**: Add food items to bookings with integrated pricing

#### Booking Management
- **Booking Status Tracking**: 
  - 🟦 Upcoming - Future bookings
  - 🟢 Ongoing - Active gaming sessions
  - ⚫ Ended - Completed sessions
  - 🔴 Cancelled - Cancelled bookings
- **Auto Status Updates**: Automatic transition based on real-time clock
- **Cancellation System**: Cancel bookings with dynamic refund calculation
- **Refund Policy**: 1-hour grace period, then 5% cancellation fee

#### Payment & Pricing
- **Advance Payment**: Optional 30% advance payment system
- **Dynamic Pricing**: Hourly rates based on station type
- **Payment Tracking**: Full payment history and status monitoring
- **Remaining Balance**: Track pending payments for bookings

#### Rewards & Incentives
- **Points System**: Earn points for bookings and activities
- **Coupon System**: 
  - First-time user coupons (30% off)
  - Referral coupons (5% off for both parties)
  - Auto-generated promotional codes
- **Referral Program**: Share referral codes with friends for mutual benefits

### 🎛️ Admin Features

#### Dashboard & Analytics
- **Real-time Statistics**: 
  - Total bookings and revenue
  - Daily booking activity
  - Station utilization rates
  - Payment collection metrics
- **Visual Charts**: Interactive bar charts for booking trends
- **Date Filtering**: Today, 7 days, 30 days, or custom date ranges
- **Station Usage Analytics**: Track when slots are actually used

#### Booking Management
- **Comprehensive Booking View**: All bookings with user details
- **Search & Filter**: Search by username, station, amount, booking ID
- **Status Management**: Update booking statuses manually
- **Payment Tracking**: Update payment amounts and status
- **Cancellation Handling**: Process cancellations with automatic refunds

#### Station Management
- **Station CRUD Operations**: Create, edit, and delete gaming stations
- **Station Types**: Manage PS5 and PC stations separately
- **Pricing Control**: Set and update hourly rates
- **Availability Management**: Activate/deactivate stations
- **Search Functionality**: Find stations by name, description, or rate

#### User Management
- **User Directory**: Complete list of all registered users
- **User Analytics**: 
  - Total bookings per user
  - Lifetime spending analysis
  - Registration date tracking
- **User Details**: View full user profiles and booking history
- **Search Users**: Find users by username or full name

#### Advanced Calendar System
- **Monthly Calendar View**: Visual booking calendar with date selection
- **Date-specific Details**: Click any date to see all bookings
- **Station Timeline**: Organized view by station with time slots
- **Real-time Status**: Shows current booking status (ongoing/ended)
- **Revenue Insights**: Daily revenue breakdown by station

#### Content Management
- **Gaming Center Gallery**: Image slider showcasing the gaming center
- **Station Previews**: Visual representations of available gaming setups
- **Dynamic Content**: Easy-to-update promotional content

### 🎨 User Experience

#### Design System
- **Cyberpunk Theme**: Neon cyan and yellow color scheme
- **Responsive Design**: Works perfectly on all device sizes
- **Dark Mode**: Eye-friendly dark interface
- **Smooth Animations**: Hover effects and transitions
- **Loading States**: Professional loading indicators

#### Navigation
- **Intuitive Menus**: Easy-to-use navigation structure
- **Admin Panel**: Dedicated admin interface with role-based access
- **Search Functionality**: Global search across admin sections
- **Quick Actions**: One-click operations for common tasks

### 🔐 Security & Access Control

#### Authentication
- **JWT Token System**: Secure token-based authentication
- **Role-based Access**: User, Staff, and Admin role hierarchy
- **Session Management**: Automatic session handling and renewal
- **Protected Routes**: Route-level protection for admin areas

#### Data Security
- **Row Level Security (RLS)**: Database-level security policies
- **Input Validation**: Comprehensive input sanitization
- **Error Handling**: Secure error messages without data exposure
- **Audit Logging**: Track important user actions

### 📊 Business Intelligence

#### Revenue Tracking
- **Daily Revenue**: Track income by date
- **Station Performance**: Revenue per gaming station
- **Payment Analytics**: Advance vs full payment analysis
- **Booking Trends**: Identify peak booking times

#### Operational Metrics
- **Occupancy Rates**: Station utilization percentages
- **Customer Analytics**: User behavior and booking patterns
- **Performance Insights**: Identify popular stations and time slots
- **Growth Metrics**: Track business growth over time

## 🏗️ Project Structure

### Frontend (`/frontend`)
```
app/
├── admin/           # Admin dashboard pages
├── auth/            # Authentication pages
├── book/            # Booking flow
├── bookings/        # User booking management
├── profile/         # User profile management
├── rewards/         # Points and rewards
├── stations/        # Station browsing
└── tournaments/     # Tournament features

components/
└── ui/              # Reusable UI components

├── api.ts           # apiFetch: calls our API with the signed-in user's token
└── supabase.ts      # Database and auth helpers

app/api/v1/          # The backend: one folder per endpoint (route.ts)
app/api/cron/        # Scheduled job (reminders + booking status refresh)

server/              # Backend code (server-only)
├── auth.ts          # JWT verification and roles
├── http.ts          # Error handling and validation helpers
├── pricing.ts       # Prices, discounts, refunds, prepaid billing
├── time.ts          # IST time helpers
├── receipt.ts       # PDF receipts
├── mailer.ts        # Email
└── services/        # Business logic used by the routes
```

### Database (`/sql/setup`)
Run these in the Supabase SQL editor, in order, each in its own new query tab:
```
├── 01_tables.sql            # Tables, keys, indexes
├── 02_functions.sql         # Functions and triggers
├── 03_security_storage.sql  # Row level security and the profile-picture bucket
├── 04_seed.sql              # Admin email, stations, rewards (run once)
├── 05_backend_rpcs.sql      # Atomic booking / cancel / check-in / timer functions
├── 06_admin_rpcs.sql        # Extend booking, confirm prepaid card
└── 07_reminders_rpcs.sql    # Reminder and status refresh functions
```
(`sql/00_full_setup.sql` is the older single-file version of `01`-`04`.)

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm
- A Supabase project

### Database Setup
1. Create a new Supabase project
2. Run `sql/setup/01_tables.sql` to `07_reminders_rpcs.sql` in order (see above)
3. Put your admin email in `04_seed.sql` before running it (or later: `UPDATE admin_settings SET admin_emails='["you@example.com"]' WHERE id=1;`)

### App Setup (website and API together)
```bash
cd frontend
npm install
cp env.example .env.local
# Fill in the Supabase keys (see env.example)
npm run dev        # http://localhost:3000, API at /api/v1
npm test           # unit tests
```

### Reminder emails
A scheduler must call `/api/cron/reminders` every 5 minutes. Setup steps: `documentation/reminders-cron.md`.

## 🌟 Key Differentiators

### Real-time Features
- **Live Booking Status**: Automatic status updates based on actual time
- **Real-time Availability**: Instant station availability updates
- **Live Analytics**: Real-time dashboard metrics

### Advanced Booking Logic
- **Smart Status Management**: Automatic progression from upcoming → ongoing → ended
- **Timezone Handling**: Proper IST timezone support for accurate timing
- **Conflict Prevention**: Prevents double-booking of stations

### Professional Admin Tools
- **Comprehensive Search**: Multi-field search across all admin sections
- **Data Export Ready**: Structured data for easy reporting
- **Audit Trail**: Track all administrative actions

### Customer-Centric Design
- **Intuitive Booking Flow**: Simple 3-step booking process
- **Transparent Pricing**: Clear pricing breakdown with no hidden fees
- **Flexible Cancellation**: Fair refund policy with clear terms

## 📈 Business Model

### Revenue Streams
- **Hourly Station Rentals**: Primary revenue from gaming station bookings
- **Food & Beverage**: Integrated food ordering system
- **Advance Payments**: Improved cash flow through advance booking system

### Customer Retention
- **Points System**: Loyalty program to encourage repeat visits
- **Referral Program**: Organic growth through customer referrals
- **Flexible Booking**: Easy-to-use system encourages regular bookings

## 🎮 Future Enhancements

### Planned Features
- **Tournament System**: Organize and manage gaming tournaments
- **Mobile App**: Native mobile applications for iOS and Android
- **Live Streaming**: Integration with streaming platforms
- **Esports Integration**: Connect with esports leagues and competitions
- **Social Features**: User profiles, friend systems, and social sharing

### Technical Improvements
- **Push Notifications**: Real-time notifications for booking updates
- **Advanced Analytics**: Machine learning for demand prediction
- **API Expansion**: Third-party integrations and webhook support
- **Performance Optimization**: Enhanced caching and speed improvements

---

*Built with ❤️ for the gaming community. Noor Gaming Lab - Where Gamers Unite!*
