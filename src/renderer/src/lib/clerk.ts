export const clerkPublishableKey =
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim() ?? ''

export const clerkAppearance = {
  variables: {
    colorPrimary: '#d8d8d8',
    colorBackground: '#080808',
    colorInputBackground: '#000000',
    colorInputText: '#f4f4f5',
    colorText: '#f4f4f5',
    colorTextSecondary: '#a1a1aa',
    colorNeutral: '#18181b',
    borderRadius: '0.5rem',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  elements: {
    card: {
      backgroundColor: 'transparent',
      boxShadow: 'none',
      border: '0',
      padding: '0',
    },
    rootBox: {
      width: '100%',
    },
    headerTitle: {
      color: '#f4f4f5',
    },
    headerSubtitle: {
      color: '#a1a1aa',
    },
    socialButtonsBlockButton: {
      backgroundColor: '#000000',
      borderColor: 'rgba(255,255,255,0.12)',
      color: '#f4f4f5',
    },
    formFieldInput: {
      backgroundColor: '#000000',
      borderColor: 'rgba(255,255,255,0.12)',
      color: '#f4f4f5',
    },
    formButtonPrimary: {
      backgroundColor: '#d8d8d8',
      color: '#111111',
      boxShadow: 'none',
    },
    footerActionLink: {
      color: '#d8d8d8',
    },
  },
} as const
