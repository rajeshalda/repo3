import { AuthOptions } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session extends DefaultSession {
    accessToken?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
  }
}

export const authOptions: AuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID,
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token }) {
      // Log session validation for debugging
      console.log('Session callback - validating:', {
        hasSub: !!token.sub,
        hasUser: !!session?.user,
        hasEmail: !!session?.user?.email,
        tokenEmail: token.email,
        sessionEmail: session?.user?.email
      });

      // Basic validation - only check if user exists
      if (!session?.user) {
        console.error('Session validation failed: no user in session');
        throw new Error('Invalid session: missing user data');
      }

      // Validate email mismatch only if both exist
      if (token.email && session.user.email && token.email !== session.user.email) {
        console.error('Session validation failed: email mismatch', {
          tokenEmail: token.email,
          sessionEmail: session.user.email
        });
        throw new Error('Session validation failed: user mismatch');
      }

      // Add access token and ensure proper structure
      return {
        ...session,
        accessToken: token.accessToken,
        userId: token.sub,
        user: {
          ...session.user,
          id: token.sub,
        }
      };
    },
  },
  // Cookie configuration - always applied for consistent session handling
  useSecureCookies: process.env.NODE_ENV === 'production',
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production'
        ? '__Secure-next-auth.session-token'
        : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
}; 