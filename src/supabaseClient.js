// src/supabaseClient.js

import { createClient } from '@supabase/supabase-js';

// Replace with your Supabase project URL and public anon key
const supabaseUrl = 'https://plckepfusmuujdhcgvfd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsY2tlcGZ1c211dWpkaGNndmZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQzOTczNTMsImV4cCI6MjA1OTk3MzM1M30.b0uJtDls5wdbD0JQj_k4sc1B2F0JqnLsElOBy-ihNYI';
const supabase = createClient(supabaseUrl, supabaseKey);

export default supabase;
