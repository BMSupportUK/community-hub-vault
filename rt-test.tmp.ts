import { createClient } from "@supabase/supabase-js";
const supabase = createClient(
  "https://vzrbdawlqyealnlrtwgj.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6cmJkYXdscXllYWxubHJ0d2dqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2OTA5NDIsImV4cCI6MjA5NDI2Njk0Mn0.uZD07rXDfXt-g3mEMlhS-m_784yaID0-cabPobpMIoE"
);
let got = false;
supabase
  .channel("wc-rt-test")
  .on("postgres_changes", { event: "*", schema: "public", table: "wc_fixtures" }, (p) => {
    got = true;
    console.log("EVENT RECEIVED:", p.eventType, (p.new as any)?.home_team, (p.new as any)?.status);
  })
  .subscribe((status) => console.log("SUBSCRIBE STATUS:", status));
setTimeout(() => { console.log(got ? "RESULT: PASS" : "RESULT: FAIL (no event in 75s)"); process.exit(got ? 0 : 1); }, 75000);
