// Import the Supabase client library for Deno
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Setup Supabase credentials using environment variables
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// List of materialized views to refresh
const viewsToRefresh = [
  "aggregated_transactions_all",
  "aggregated_transactions_1y",
  "aggregated_transactions_6m",
  "aggregated_transactions_30d",
  "aggregated_transactions_7d",
  "aggregated_transactions_24h",
  "aggregated_fees_all",
  "aggregated_fees_1y",
  "aggregated_fees_6m",
  "aggregated_fees_30d",
  "aggregated_fees_7d",
  "aggregated_fees_24h",
];

// Refresh Materialized Views
async function refreshViews() {
  try {
    for (const view of viewsToRefresh) {
      console.log(`Refreshing view: ${view}`);
      const { error } = await supabase.rpc("execute_sql", {
        query: `
          SET statement_timeout = 600000; -- Set timeout to 10 minutes
          REFRESH MATERIALIZED VIEW public.${view};
        `,
      });

      if (error) {
        console.error(`Failed to refresh ${view}:`, error);
        return new Response(
          JSON.stringify({
            error: `Failed to refresh ${view}: ${error.message || error}`,
          }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      console.log(`Successfully refreshed ${view}`);
    }
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: `Unexpected error: ${err.message || err}` }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ message: "Materialized views refreshed successfully" }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

// Serve the function
Deno.serve(async (req) => {
  if (req.method === "POST") {
    return await refreshViews();
  }

  return new Response(
    JSON.stringify({ error: "Method Not Allowed" }),
    { status: 405, headers: { "Content-Type": "application/json" } }
  );
});