import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

// Client with anon key (for authenticated requests)
export const supabase = createClient(
    config.supabase.url,
    config.supabase.anonKey
);

// Admin client with service role key (for server-side operations)
export const supabaseAdmin = createClient(
    config.supabase.url,
    config.supabase.serviceRoleKey,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

// Helper to get authenticated user from request
export const getUser = async (authHeader) => {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.substring(7);

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
        return null;
    }

    return user;
};
