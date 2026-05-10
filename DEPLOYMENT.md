# Deployment Guide (Vercel)

This application is built with a custom **Express + Vite** full-stack architecture. To deploy this to Vercel, you need to follow these steps.

## 1. Project Structure
Vercel's default "Vite" preset only handles frontend. Since you have a custom `server.ts`, you need to tell Vercel to treat it as a Serverless Function.

Recommended `vercel.json`:
```json
{
  "version": 2,
  "builds": [
    {
      "src": "server.ts",
      "use": "@vercel/node"
    },
    {
      "src": "package.json",
      "use": "@vercel/static-build",
      "config": { "distDir": "dist" }
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "server.ts"
    },
    {
      "src": "/(.*)",
      "dest": "/index.html"
    }
  ]
}
```

## 2. Environment Variables
You MUST set the following in the Vercel Dashboard (**Settings > Environment Variables**):

- `GEMINI_API_KEY`: Your Google Gemini API key from [AI Studio](https://aistudio.google.com/app/apikey).
- `DATABASE_URL`: Your Prisma database connection string (e.g., from Supabase or Railway).
- `NODE_ENV`: `production`

## 3. Security (Is my Key safe?)
**YES.** Your `GEMINI_API_KEY` is secure because:
1. It is stored exclusively on the server (`process.env.GEMINI_API_KEY`).
2. The frontend code is **NEVER** allowed to access this variable (it lacks the `VITE_` prefix).
3. All AI operations happen behind your Express API routes (`/api/research/*`).
4. We have implemented **Rate Limiting** in `server.ts` to prevent people from using your API key to drain your credits.

## 4. Google Search Tool Limitation
The `googleSearch` tool used in `extraction.ts` is special to the **AI Studio Preview Environment**.
When you move to Vercel, you will need to:
1. Change the model name from `gemini-3-flash-preview` to `gemini-1.5-flash` or `gemini-2.0-flash`.
2. Replace the `googleSearch: {}` tool with a public search API like **Serper.dev** or **SearchApi.io** and pass the results into the prompt as context.

## 5. Prisma
Before deploying, ensure you run `npx prisma generate` in your build step to generate the client for the production environment.
