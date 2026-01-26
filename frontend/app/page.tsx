import { NavBar } from '@/components/ui/navbar'
import { HeroBanner } from '@/components/ui/hero-banner'
import { SectionDivider } from '@/components/ui/section-divider'
import { StationsPreview } from '@/components/ui/stations-preview'
import { CentreSlider } from '@/components/ui/centre-slider'
import { FeaturesSection } from '@/components/ui/features-section'
import { Footer } from '@/components/ui/footer'

export default function Home() {
  return (
    <main className="min-h-screen">
      <NavBar />
      <HeroBanner />
      <SectionDivider angle="top" />
      <StationsPreview />
      <SectionDivider angle="bottom" />
      <CentreSlider />
      <SectionDivider angle="top" />
      <FeaturesSection />
      <SectionDivider angle="top" />
      
      {/* Location & Reviews Section */}
      <section className="py-20 px-6 bg-cp-black">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-4">
              LOCATION & <span className="text-cp-cyan">REVIEWS</span>
            </h2>
            <p className="text-gray-300 max-w-2xl mx-auto">
              Visit us at our gaming center and see what our customers say
            </p>
          </div>
          
          <div className="bg-cp-gray/20 border border-cp-cyan/30 rounded-lg p-6">
            <div className="aspect-video w-full">
              <iframe
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3456.123!2d31.1342!3d29.9792!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x14584587ac8f291b%3A0x810c2f3fa2a52424!2sGreat%20Pyramid%20of%20Giza!5e0!3m2!1sen!2sus!4v1234567890123!5m2!1sen!2sus"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen={true}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="rounded-lg border border-cp-cyan/20"
              />
            </div>
            
            <div className="mt-6 text-center">
              <p className="text-cp-yellow font-semibold">📍 Gaming Center Location</p>
              <p className="text-gray-300 text-sm mt-2">
                Click on the map to view customer reviews and directions
              </p>
            </div>
          </div>
        </div>
      </section>
      
      <Footer />
    </main>
  )
} 