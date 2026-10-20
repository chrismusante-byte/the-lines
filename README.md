# The Lines

Weekly NFL line-guessing game. Each player guesses the spread and total for every game, locks it in, then reveals the Vegas line.

## Stack
- Next.js (App Router) on Vercel
- Supabase (auth + Postgres; all reads/writes go through RPC functions)
- The Odds API (consensus spread/total = median across US books; final scores)

## Environment variables (Vercel)
- `ODDS_API_KEY` — required, server only
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — optional (defaults are baked in)

## Rules enforced in the database
- Guesses can be changed until you reveal the game or it kicks off.
- The Vegas line is snapshotted every time you lock/update a guess.
- You can't see the line or other players' numbers until you reveal.
- Every line change we observe is stored in `line_snapshots` (for line-movement analysis).
