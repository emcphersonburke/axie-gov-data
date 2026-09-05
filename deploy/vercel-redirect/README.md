# axie-gov.vercel.app redirect

The dashboard was `https://axie-gov.vercel.app` when it won the July 2024 AxieGov Data Hackathon,
and [the winners announcement](https://blog.axieinfinity.com/p/congratulations-to-the-axiegov-hackathon)
still links there. That project has been deleted, so the URL now returns Vercel's
`DEPLOYMENT_NOT_FOUND`. These two files are the smallest thing that reclaims the name and forwards
every path, query string intact, to the real site.

The durable fix is to ask Sky Mavis to update the blog link. This is the insurance for if they
don't, and it also catches old bookmarks.

## Deploy

**Set the destination first.** One replacement covers both files:

```sh
cd deploy/vercel-redirect
sed -i '' 's/treasury\.example\.com/YOUR-DOMAIN/g' vercel.json index.html   # macOS
grep -r YOUR-DOMAIN .    # confirm both files changed
```

**Then deploy without a Git connection** (recommended: nothing auto-deploys, nothing to maintain):

```sh
npx vercel login
npx vercel --prod          # project name must be exactly: axie-gov
```

The project name is what claims `axie-gov.vercel.app`, so it has to match. Vercel will ask; answer
`axie-gov`, accept the directory as-is, and take the defaults for framework (Other) and build
(none).

Do **not** import the `axie-gov-data` monorepo into Vercel for this. It would re-arm push-to-deploy
on `main`, which is exactly what decommissioning Vercel removed. If you do connect a repo anyway,
make it a standalone one containing only these files.

## Verify

```sh
curl -sI https://axie-gov.vercel.app/ | head -3
curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' https://axie-gov.vercel.app/some/path
```

Expect a `308` whose `location` is your domain with `/some/path` preserved.

## Keep it working

- Keep the Vercel team on **Hobby**. This project is free there; it does not need Pro.
- Don't delete it. The `.vercel.app` name is first come, first served once a project is gone, so a
  second deletion could lose it permanently.
- If the dashboard's domain ever changes again, redo the `sed` and `npx vercel --prod`.
