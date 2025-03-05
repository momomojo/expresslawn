# Routing and Authentication Fix Plan

## Overview

This plan addresses the routing, authentication, and state management issues in the Express Lawn application, ensuring proper role-based access control and improved user experience.

## Core Issues

1. **Authentication Flow**
   - Inconsistent role handling between customer and provider flows
   - Missing proper session management
   - Lack of type safety in auth state
   - Duplicate auth checks across components

2. **Route Organization**
   - Provider registration in wrong location
   - Missing proper route guards
   - Inconsistent navigation patterns
   - No clear separation between public and protected routes

3. **State Management**
   - No centralized auth state
   - Missing proper loading states
   - Inconsistent error handling
   - No proper type definitions

## Implementation Plan

### Phase 1: Type System Enhancement

```typescript
// types/supabase.ts
import { Database } from '../lib/database.types'
import { SupabaseClient, User } from '@supabase/supabase-js'

export type Tables = Database['public']['Tables']
export type UserRole = 'customer' | 'provider'

export interface Profile extends Tables['profiles']['Row'] {
  role: UserRole
}

export interface AuthUser extends User {
  role: UserRole
  profile: Profile | null
}

export interface AuthState {
  user: AuthUser | null
  isLoading: boolean
  error: Error | null
  initialized: boolean
}

export interface AuthContextType extends AuthState {
  supabase: SupabaseClient<Database>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (data: SignUpData) => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (data: Partial<Profile>) => Promise<void>
}
```

### Phase 2: Auth Context Implementation

```typescript
// lib/auth/AuthContext.tsx
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    error: null,
    initialized: false
  });

  useEffect(() => {
    // Initial session check
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await handleAuthChange('SIGNED_IN', session);
      }
      setState(prev => ({ ...prev, isLoading: false, initialized: true }));
    });

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthChange);
    return () => subscription.unsubscribe();
  }, []);

  const handleAuthChange = async (event: string, session: Session | null) => {
    if (session?.user) {
      try {
        // Get profile safely using RPC
        const { data: profile, error: profileError } = await supabase
          .rpc('get_profile_safely', { user_id: session.user.id });

        if (profileError) throw profileError;

        setState({
          user: {
            ...session.user,
            role: profile.role as UserRole,
            profile
          },
          isLoading: false,
          error: null,
          initialized: true
        });
      } catch (error) {
        setState({
          user: null,
          isLoading: false,
          error: error as Error,
          initialized: true
        });
      }
    } else {
      setState({
        user: null,
        isLoading: false,
        error: null,
        initialized: true
      });
    }
  };

  // ... implement other auth methods
}
```

### Phase 3: Route Protection

```typescript
// components/guards/AuthGuard.tsx
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading, initialized } = useAuth();
  const segments = useSegments();
  const [isNavigating, setIsNavigating] = useState(false);

  useEffect(() => {
    if (!initialized || isLoading || isNavigating) return;

    setIsNavigating(true);
    const inAuthGroup = segments[0] === '(auth)';
    const inProviderAuthGroup = segments[0] === '(provider-auth)';
    const inPublicGroup = segments[0] === '(public)';

    if (!user && !inAuthGroup && !inProviderAuthGroup && !inPublicGroup) {
      router.replace('/login');
    } else if (user) {
      if (user.role === 'provider') {
        if (!segments[0].startsWith('(provider)')) {
          router.replace('/(provider)/(tabs)');
        }
      } else if (user.role === 'customer') {
        if (!segments[0].startsWith('(app)')) {
          router.replace('/(app)/(tabs)');
        }
      }
    }
    setIsNavigating(false);
  }, [user, isLoading, initialized, segments]);

  if (!initialized || isLoading) {
    return <LoadingScreen />;
  }

  return children;
}
```

### Phase 4: Database Schema Updates

```sql
-- Update profiles table safely
DO $$ BEGIN
  -- Create temp column
  ALTER TABLE profiles 
    ADD COLUMN role_new text;

  -- Copy and validate existing data
  UPDATE profiles 
  SET role_new = CASE 
    WHEN role = 'provider' THEN 'provider'
    ELSE 'customer'
  END;

  -- Add constraint
  ALTER TABLE profiles
    ADD CONSTRAINT valid_role 
    CHECK (role_new IN ('customer', 'provider'));

  -- Replace old column
  ALTER TABLE profiles 
    DROP COLUMN role,
    RENAME COLUMN role_new TO role;

  -- Add indexes
  CREATE INDEX IF NOT EXISTS idx_profiles_role 
    ON profiles(role);
  
  CREATE INDEX IF NOT EXISTS idx_profiles_auth 
    ON profiles(id, role);

END $$;

-- Update RPC for safe profile access
CREATE OR REPLACE FUNCTION get_profile_safely(user_id uuid)
RETURNS TABLE (
  id uuid,
  email text,
  role text,
  first_name text,
  last_name text,
  phone text,
  address text
) SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.email,
    p.role,
    p.first_name,
    p.last_name,
    p.phone,
    p.address
  FROM profiles p
  WHERE p.id = user_id;
END;
$$ LANGUAGE plpgsql;
```

### Phase 5: Error Handling

```typescript
// lib/errors.ts
export class AuthError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

// components/ErrorBoundary.tsx
export function AppErrorBoundary({ children }: { children: React.ReactNode }) {
  const handleError = (error: Error) => {
    if (error instanceof AuthError) {
      // Handle auth errors
      return <AuthErrorScreen error={error} />;
    }
    if (error instanceof NetworkError) {
      // Handle network errors
      return <NetworkErrorScreen error={error} />;
    }
    // Handle other errors
    return <GeneralErrorScreen error={error} />;
  };

  return (
    <ErrorBoundary
      onError={(error) => {
        console.error('Application Error:', error);
        // Log to monitoring service
      }}
      fallback={handleError}
    >
      {children}
    </ErrorBoundary>
  );
}
```

## Implementation Steps

1. **Setup Types and Context** (Week 1)
   - Create type definitions
   - Implement auth context
   - Add auth hooks
   - Test with existing components

2. **Database Migration** (Week 1)
   - Create and test migration locally
   - Update RPC functions
   - Verify data integrity
   - Deploy to staging

3. **Route Protection** (Week 2)
   - Implement auth guard
   - Add role guard
   - Create loading screens
   - Test navigation flows

4. **Route Reorganization** (Week 2)
   - Update folder structure
   - Move provider registration
   - Add route guards
   - Test deep linking

5. **Error Handling** (Week 3)
   - Add error types
   - Implement error boundary
   - Create error screens
   - Add error logging

6. **Testing & Cleanup** (Week 3)
   - End-to-end testing
   - Performance testing
   - Code cleanup
   - Documentation

## Testing Strategy

1. **Unit Tests**
   - Auth context functions
   - Guard components
   - Error handling
   - Type safety

2. **Integration Tests**
   - Auth flows
   - Navigation paths
   - Role-based access
   - Error recovery

3. **E2E Tests**
   - Complete user journeys
   - Deep linking
   - Offline behavior
   - Error scenarios

## Success Criteria

1. **Functionality**
   - All auth flows working
   - Correct role-based routing
   - Proper error handling
   - Type safety throughout

2. **Performance**
   - < 100ms route changes
   - < 200ms auth operations
   - < 50ms guard checks
   - Zero type errors

3. **Quality**
   - 100% test coverage
   - Zero auth bypasses
   - Clear error messages
   - Proper documentation

## Monitoring

1. **Metrics**
   - Auth success rate
   - Navigation timing
   - Error frequency
   - API performance

2. **Alerts**
   - Auth failures
   - Navigation errors
   - API timeouts
   - Type violations

3. **Logging**
   - Auth events
   - Route changes
   - Error details
   - Performance data