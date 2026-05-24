'use client'

import { useState, useEffect } from 'react'

export function useResponsive() {
  const [isMobile, setIsMobile] = useState(false)
  const [isTablet, setIsTablet] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    const checkResponsive = () => {
      const width = window.innerWidth
      setIsMobile(width < 768)
      setIsTablet(width >= 768 && width < 1024)
      setIsDesktop(width >= 1024)
    }

    // Initial check
    checkResponsive()

    // Add event listener
    window.addEventListener('resize', checkResponsive)

    // Cleanup
    return () => window.removeEventListener('resize', checkResponsive)
  }, [])

  return {
    isMobile,
    isTablet,
    isDesktop,
    isSmallScreen: isMobile || isTablet,
    isLargeScreen: isDesktop
  }
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(query)

    if (media.matches !== matches) {
      setMatches(media.matches)
    }

    const listener = () => setMatches(media.matches)
    media.addEventListener('change', listener)

    return () => media.removeEventListener('change', listener)
  }, [matches, query])

  return matches
}