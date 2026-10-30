# Training Log

A private fitness app for a small group: log food, training, steps and weight by chatting with an AI coach (text, voice-to-text or photos), with goal projections, trends, a group board and weekly/monthly coach reviews.

- **Frontend:** Vite, hosted on GitHub Pages
- **Backend:** Supabase (auth, Postgres with row-level security, storage, edge functions)
- **AI:** Anthropic API, called only from Supabase edge functions

## Setup (one time)

Add these **repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Where to get it |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | supabase.com → Account → Access Tokens → Generate |
| `SUPABASE_PROJECT_REF` | Your Supabase project URL: `https://<ref>.supabase.co` |
| `SUPABASE_DB_PASSWORD` | The database password chosen when creating the project |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |

Then Settings → Pages → Source: **GitHub Actions**, and run the **Deploy** workflow.

The first person to sign up becomes the owner and sees the invite code in the Group tab.

## Workflows

- `deploy.yml`: on every push to `main`, applies database migrations, pushes auth settings, deploys edge functions, then builds and publishes the site.
- `reviews.yml`: Sundays (weekly) and the 1st of each month (monthly), asks the coach to write reviews for everyone.
