import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const TEST_USERS = [
  { email: "convazant.admin@test.com", password: "Test1234!", full_name: "CONVAZANT Admin",    role: "CONVAZANT_SUPER_ADMIN" },
  { email: "deckarc.admin@test.com",   password: "Test1234!", full_name: "DECKARC Admin",      role: "DECKARC_ADMIN" },
  { email: "gc@test.com",              password: "Test1234!", full_name: "General Contractor",  role: "GENERAL_CONTRACTOR" },
  { email: "subcontractor@test.com",   password: "Test1234!", full_name: "Subcontractor",      role: "SUBCONTRACTOR" },
  { email: "client@test.com",          password: "Test1234!", full_name: "Client User",        role: "CLIENT" },
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const results: any[] = [];

    for (const u of TEST_USERS) {
      // Create user via Admin API (handles hashing + identities correctly)
      const { data, error } = await admin.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
        user_metadata: { full_name: u.full_name },
      });

      if (error) {
        results.push({ email: u.email, error: error.message });
        continue;
      }

      const userId = data.user.id;

      // Upsert profile with correct role
      const { error: profileError } = await admin
        .from("user_profiles")
        .upsert({
          id: userId,
          email: u.email,
          full_name: u.full_name,
          role: u.role,
          is_active: true,
        }, { onConflict: "id" });

      results.push({ email: u.email, id: userId, profileError: profileError?.message ?? null });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
